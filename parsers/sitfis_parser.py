"""
sitfis_parser.py  ·  v2
=======================
Parser do Relatório de Situação Fiscal (RFB/PGFN) — "Informações de Apoio
para Emissão de Certidão", emitido pelo Portal de Serviços da Receita.

v2: reescrito sobre o layout real. A detecção de bloco agora é estrutural
(o SITFIS sublinha todo título com uma régua de underscores), não uma lista
fixa de nomes. Bloco novo continua sendo capturado; só o enquadramento em
categoria é que pode ficar em aberto — e aí o relatório vai para revisão.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, asdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import pdfplumber


# --------------------------------------------------------------------------
# utilitários
# --------------------------------------------------------------------------

def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def chave(s: str) -> str:
    return re.sub(r"\s+", " ", sem_acento(s)).strip().upper()


def valor_br(s: str) -> Optional[Decimal]:
    if not s:
        return None
    s = re.sub(r"[^\d.,\-]", "", s.replace("R$", ""))
    if not s:
        return None
    try:
        return Decimal(s.replace(".", "").replace(",", "."))
    except InvalidOperation:
        return None


def data_br(s: str) -> Optional[date]:
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    return None


# --------------------------------------------------------------------------
# modelo
# --------------------------------------------------------------------------

@dataclass
class Socio:
    cpf_cnpj: str
    nome: str
    qualificacao: Optional[str] = None
    situacao: Optional[str] = None
    capital: Optional[str] = None


@dataclass
class Pendencia:
    bloco: str
    orgao: str                      # RFB | PGFN
    categoria: str                  # debito | omissao | parcelamento | divida_ativa | outro
    exigibilidade_suspensa: bool = False
    receita_codigo: Optional[str] = None
    receita_nome: Optional[str] = None
    periodo_apuracao: Optional[str] = None
    vencimento: Optional[date] = None
    valor_original: Optional[Decimal] = None
    saldo_devedor: Optional[Decimal] = None
    situacao: Optional[str] = None
    linha_bruta: str = ""

    @property
    def impede_cnd(self) -> bool:
        """Débito com exigibilidade suspensa não impede certidão."""
        if self.exigibilidade_suspensa:
            return False
        return "SUSPENS" not in chave(self.situacao or "")


@dataclass
class Cadastro:
    cnpj: Optional[str] = None
    razao_social: Optional[str] = None
    situacao: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    cnae: Optional[str] = None
    porte: Optional[str] = None
    natureza_juridica: Optional[str] = None
    data_abertura: Optional[str] = None
    unidade_rfb: Optional[str] = None
    simples_inclusao: Optional[str] = None
    simples_exclusao: Optional[str] = None
    socios: list[Socio] = field(default_factory=list)


@dataclass
class RelatorioSitfis:
    cadastro: Cadastro = field(default_factory=Cadastro)
    emitido_em: Optional[datetime] = None
    pendencias: list[Pendencia] = field(default_factory=list)
    blocos: list[str] = field(default_factory=list)
    blocos_sem_categoria: list[str] = field(default_factory=list)
    avisos_receita: list[str] = field(default_factory=list)
    alertas: list[str] = field(default_factory=list)

    @property
    def cnpj(self) -> Optional[str]:
        return self.cadastro.cnpj

    @property
    def total_devido(self) -> Decimal:
        return sum((p.saldo_devedor or p.valor_original or Decimal(0))
                   for p in self.pendencias) or Decimal(0)

    @property
    def total_impeditivo(self) -> Decimal:
        return sum((p.saldo_devedor or p.valor_original or Decimal(0))
                   for p in self.pendencias if p.impede_cnd) or Decimal(0)

    @property
    def pode_cnd(self) -> bool:
        return not any(p.impede_cnd for p in self.pendencias)

    @property
    def precisa_revisao(self) -> bool:
        return bool(self.alertas) or bool(self.blocos_sem_categoria)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["emitido_em"] = self.emitido_em.isoformat() if self.emitido_em else None
        for pd_, orig in zip(d["pendencias"], self.pendencias):
            pd_["vencimento"] = orig.vencimento.isoformat() if orig.vencimento else None
            pd_["valor_original"] = str(orig.valor_original) if orig.valor_original is not None else None
            pd_["saldo_devedor"] = str(orig.saldo_devedor) if orig.saldo_devedor is not None else None
            pd_["impede_cnd"] = orig.impede_cnd
            pd_.pop("linha_bruta", None)
        d["total_devido"] = str(self.total_devido)
        d["total_impeditivo"] = str(self.total_impeditivo)
        d["pode_cnd"] = self.pode_cnd
        d["precisa_revisao"] = self.precisa_revisao
        return d


# --------------------------------------------------------------------------
# reconhecimento de estrutura
# --------------------------------------------------------------------------

# Linhas de cabeçalho/rodapé de página, descartadas antes de tudo
LIXO = (
    "MINISTERIO DA FAZENDA",
    "SECRETARIA ESPECIAL DA RECEITA FEDERAL",
    "PROCURADORIA-GERAL DA FAZENDA NACIONAL",
    "INFORMACOES DE APOIO PARA EMISSAO",
    "CPF DO CERTIFICADO",
    "PAGINA:",
    "FINAL DO RELATORIO",
    "POR MEIO DO PORTAL DE SERVICOS",
)

# Títulos de bloco que são cadastro, não pendência
BLOCOS_CADASTRO = ("DADOS CADASTRAIS", "SOCIOS E ADMINISTRADORES")

# Marcadores de seção (definem o órgão dos blocos seguintes)
SECAO_RFB = "DIAGNOSTICO FISCAL NA RECEITA FEDERAL"
SECAO_PGFN = "DIAGNOSTICO FISCAL NA PROCURADORIA"

# Enquadramento do título do bloco em categoria
CATEGORIAS = [
    (("OMISSAO", "DECLARACAO NAO ENTREGUE", "DCTF NAO"), "omissao"),
    (("PARCELAMENTO",), "parcelamento"),
    (("INSCRICAO", "DIVIDA ATIVA"), "divida_ativa"),
    (("DEBITO", "SIEF", "SICOB", "SIDA", "PENDENCIA"), "debito"),
]

RE_REGUA = re.compile(r"_{5,}")
RE_CNPJ = re.compile(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})")
RE_CPF = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
RE_EMISSAO = re.compile(r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}:\d{2})")
RE_MOEDA = re.compile(r"\d{1,3}(?:\.\d{3})*,\d{2}")
RE_DATA = re.compile(r"\b\d{2}/\d{2}/\d{4}\b")
RE_PA = re.compile(r"\b(\d{2}/\d{4}|\d{1,2}º\s?TRIM/\d{4}|\d{4})\b")
RE_MES_ANO = re.compile(r"\b(\d{2}/\d{4})\b")
RE_RECEITA = re.compile(r"^(\d{4}(?:-\d{2})?)\s*-\s*(.+?)\s{2,}|^(\d{4}(?:-\d{2})?)\s*-\s*(\S+)")

# Cabeçalhos de coluna — nunca são itens
RE_COLUNAS = re.compile(
    r"RECEITA|PA/EXERC|DT\.?\s?VCTO|VL\.?ORIGINAL|SDO\.?DEVEDOR|SITUACAO|"
    r"CPF/CNPJ\s+NOME|QUALIFICACAO|INSCRICAO\s+"
)

RE_CAPITAL = re.compile(r"(\d{1,3},\d{2}\s*%)")
RE_SIT_SOCIO = re.compile(r"\b(REGULAR|IRREGULAR|SUSPENSA|TITULAR FALECIDO|NULA|INAPTA|BAIXADA)\b")
RE_QUALIF = re.compile(
    r"\b(SÓCIO-ADMINISTRADOR|SOCIO-ADMINISTRADOR|SÓCIO|SOCIO|ADMINISTRADOR|"
    r"PRESIDENTE|DIRETOR[A-Z-]*|TITULAR[A-Z ]*|PROCURADOR)\b")

SEM_PENDENCIA = ("NAO FORAM DETECTADAS", "NAO EXISTEM PENDENCIAS",
                 "NAO CONSTAM PENDENCIAS", "NAO HA PENDENCIAS")


def _categoria(titulo: str) -> Optional[str]:
    k = chave(titulo)
    for termos, cat in CATEGORIAS:
        if any(t in k for t in termos):
            return cat
    return None


def _e_lixo(linha: str) -> bool:
    k = chave(linha)
    return any(k.startswith(x) or x in k for x in LIXO)


# --------------------------------------------------------------------------
# extração de item
# --------------------------------------------------------------------------

def _extrair_item(linha: str, bloco: str, orgao: str, categoria: str,
                  suspensa: bool) -> Optional[Pendencia]:
    if RE_COLUNAS.search(chave(linha)):
        return None
    if RE_CNPJ.fullmatch(linha.strip().replace("CNPJ:", "").strip()):
        return None
    if chave(linha).startswith("CNPJ:"):
        return None

    moedas = RE_MOEDA.findall(linha)
    datas = RE_DATA.findall(linha)
    # o código de receita no início da linha não é período de apuração
    linha_pa = re.sub(r"^\s*\d{4}(?:-\d{2})?\s*-\s*", "", linha)
    m_pa = RE_MES_ANO.search(linha_pa) or RE_PA.search(linha_pa)

    # Item precisa de valor, ou de período + data (caso das omissões)
    if not moedas and not (m_pa and datas):
        return None

    p = Pendencia(bloco=bloco, orgao=orgao, categoria=categoria,
                  exigibilidade_suspensa=suspensa, linha_bruta=linha.strip())

    m = re.match(r"^\s*(\d{4}(?:-\d{2})?)\s*-\s*([^\d]{2,40}?)\s{2,}", linha)
    if m:
        p.receita_codigo, p.receita_nome = m.group(1), m.group(2).strip()
    else:
        m = re.match(r"^\s*(\d{4}(?:-\d{2})?)\s*-\s*(\S[^\s]{1,30})", linha)
        if m:
            p.receita_codigo, p.receita_nome = m.group(1), m.group(2).strip()

    if m_pa:
        p.periodo_apuracao = m_pa.group(1)
    if datas:
        p.vencimento = data_br(datas[-1])

    if len(moedas) >= 2:
        p.valor_original = valor_br(moedas[-2])
        p.saldo_devedor = valor_br(moedas[-1])
    elif moedas:
        p.saldo_devedor = valor_br(moedas[0])

    if moedas:
        cauda = linha.rsplit(moedas[-1], 1)[-1].strip(" .-|")
        if 2 < len(cauda) < 60:
            p.situacao = re.sub(r"\s+", " ", cauda)
    return p


# --------------------------------------------------------------------------
# cadastro
# --------------------------------------------------------------------------

def _campo(linhas: list[str], rotulo: str) -> Optional[str]:
    alvo = chave(rotulo)
    for l in linhas:
        k = chave(l)
        if k.startswith(alvo):
            v = l.split(":", 1)[1] if ":" in l else ""
            # corta um segundo rótulo na mesma linha (ex.: "... UF: RJ")
            v = re.split(r"\s{2,}[A-ZÀ-Ú][^:]{2,30}:|\s(?=(?:Data de Abertura|Código da UA|UF|Município|CEP)\s*:)", v)[0]
            return re.sub(r"\s+", " ", v).strip() or None
    return None


def _parse_cadastro(linhas: list[str], rel: RelatorioSitfis) -> None:
    c = rel.cadastro
    for l in linhas:
        m = re.match(r"\s*CNPJ:\s*[\d./-]+\s*-\s*([A-ZÀ-Ú][A-ZÀ-Ú0-9 .,&'/-]{3,})\s*$", l.strip())
        if m:
            c.razao_social = re.sub(r"\s+", " ", m.group(1)).strip()
            break

    for l in linhas:
        m = RE_CNPJ.search(l)
        if m:
            c.cnpj = re.sub(r"\D", "", m.group(1))
            break

    c.situacao = _campo(linhas, "Situação")
    c.municipio = None
    for l in linhas:
        m = re.search(r"Munic[íi]pio:\s*([A-ZÀ-Ú \-']+?)(?:\s{2,}|\s*UF:|$)", l)
        if m:
            c.municipio = m.group(1).strip()
        m = re.search(r"\bUF:\s*([A-Z]{2})\b", l)
        if m:
            c.uf = m.group(1)
    c.cnae = _campo(linhas, "CNAE")
    c.porte = _campo(linhas, "Porte da Empresa")
    c.natureza_juridica = _campo(linhas, "Natureza Jurídica")
    c.data_abertura = None
    for l in linhas:
        m = re.search(r"Data de Abertura:\s*(\d{2}/\d{2}/\d{4})", l)
        if m:
            c.data_abertura = m.group(1)
    c.unidade_rfb = _campo(linhas, "UA de Domicílio")

    # Simples: linha "Inclusão Exclusão" seguida das datas
    for i, l in enumerate(linhas):
        if chave(l).startswith("INCLUSAO") and "EXCLUSAO" in chave(l):
            if i + 1 < len(linhas):
                datas = RE_DATA.findall(linhas[i + 1])
                if datas:
                    c.simples_inclusao = datas[0]
                if len(datas) > 1:
                    c.simples_exclusao = datas[1]
            break


def _parse_socios(linhas: list[str], rel: RelatorioSitfis) -> None:
    for l in linhas:
        m = re.match(r"\s*(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\s+(.+)", l)
        if not m:
            continue
        resto = m.group(2).strip()
        s = Socio(cpf_cnpj=re.sub(r"\D", "", m.group(1)), nome=resto)

        mc = RE_CAPITAL.search(resto)
        if mc:
            s.capital = mc.group(1)
            resto = resto[:mc.start()].strip()

        ms = RE_SIT_SOCIO.search(resto)
        if ms:
            s.situacao = ms.group(1).title()
            resto = resto[:ms.start()].strip()

        mq = RE_QUALIF.search(resto)
        if mq:
            s.qualificacao = mq.group(1).title()
            resto = resto[:mq.start()].strip()

        s.nome = re.sub(r"\s+", " ", resto).strip()
        rel.cadastro.socios.append(s)


# --------------------------------------------------------------------------
# entrada
# --------------------------------------------------------------------------

def parse_sitfis(caminho: str | Path) -> RelatorioSitfis:
    with pdfplumber.open(Path(caminho)) as pdf:
        bruto = "\n".join((pg.extract_text() or "") for pg in pdf.pages)

    rel = RelatorioSitfis()
    if not bruto.strip():
        rel.alertas.append("PDF sem camada de texto — requer OCR.")
        return rel

    m = RE_EMISSAO.search(bruto)
    if m:
        try:
            rel.emitido_em = datetime.strptime(f"{m.group(1)} {m.group(2)}",
                                               "%d/%m/%Y %H:%M:%S")
        except ValueError:
            pass

    todas = [l for l in bruto.splitlines() if l.strip()]
    linhas = [l for l in todas if not _e_lixo(l)]

    orgao = "RFB"
    bloco = titulo = None
    categoria = None
    suspensa = False
    modo_cadastro = modo_socios = False
    buf_cadastro: list[str] = []
    buf_socios: list[str] = []

    for l in linhas:
        k = chave(l)

        if SECAO_RFB in k:
            orgao, bloco, modo_cadastro, modo_socios = "RFB", None, False, False
            continue
        if SECAO_PGFN in k:
            orgao, bloco, modo_cadastro, modo_socios = "PGFN", None, False, False
            continue

        if RE_REGUA.search(l):
            titulo = re.sub(r"\s*_{2,}.*$", "", l).strip()
            if not titulo:
                continue
            kt = chave(titulo)
            modo_cadastro = kt.startswith("DADOS CADASTRAIS")
            modo_socios = kt.startswith("SOCIOS")
            if any(kt.startswith(b) for b in BLOCOS_CADASTRO):
                bloco = None
                continue
            bloco = titulo
            if titulo not in rel.blocos:
                rel.blocos.append(titulo)
            categoria = _categoria(titulo)
            suspensa = "SUSPENS" in kt
            if categoria is None:
                categoria = "outro"
                if titulo not in rel.blocos_sem_categoria:
                    rel.blocos_sem_categoria.append(titulo)
            continue

        if modo_cadastro:
            buf_cadastro.append(l)
            continue
        if modo_socios:
            buf_socios.append(l)
            continue

        if any(x in k for x in SEM_PENDENCIA):
            continue

        if bloco:
            p = _extrair_item(l, bloco, orgao, categoria, suspensa)
            if p:
                rel.pendencias.append(p)
        elif k.startswith("RECEBEU O TERMO") or "FIQUE ATENTO" in k:
            rel.avisos_receita.append(re.sub(r"\s+", " ", l).strip())

    _parse_cadastro(buf_cadastro + linhas, rel)
    _parse_socios(buf_socios, rel)
    _validar(rel)
    return rel


def _validar(rel: RelatorioSitfis) -> None:
    if not rel.cadastro.cnpj:
        rel.alertas.append("CNPJ não localizado.")
    if rel.blocos_sem_categoria:
        rel.alertas.append("Bloco sem categoria: " + "; ".join(rel.blocos_sem_categoria))
    sem_valor = [p for p in rel.pendencias
                 if p.saldo_devedor is None and p.categoria != "omissao"]
    if sem_valor:
        rel.alertas.append(f"{len(sem_valor)} pendência(s) sem valor.")
    for p in rel.pendencias:
        if p.valor_original and p.saldo_devedor and p.saldo_devedor > p.valor_original * 100:
            rel.alertas.append(f"Saldo desproporcional em {p.receita_nome}.")
        if (p.saldo_devedor or 0) > Decimal("50000000"):
            rel.alertas.append(f"Valor atípico: {p.saldo_devedor}")


if __name__ == "__main__":
    import json, sys
    rel = parse_sitfis(sys.argv[1])
    print(json.dumps(rel.to_dict(), ensure_ascii=False, indent=2, default=str))
