"""
guia_parser.py
==============
Classificação e extração de guias de arrecadação.

Camada 1, determinística: assinatura textual do emissor + regex por layout.
O que não bater aqui vai para a fila de revisão — nunca para o cliente.

Layouts cobertos:
    DARF   — Sicalc/SENDA (federal)
    DAS    — Simples Nacional (SENDA)
    DARJ   — SEFAZ-RJ (ICMS, FECP, DIFAL)
    DARM   — Prefeitura do Rio (ISS)  [exige OCR: PDF sem texto]
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field, asdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import pdfplumber

MESES = {"JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4, "MAIO": 5, "JUNHO": 6,
         "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11,
         "DEZEMBRO": 12}


def sem_acento(s): return "".join(c for c in unicodedata.normalize("NFD", s)
                                  if unicodedata.category(c) != "Mn")
def chave(s): return re.sub(r"\s+", " ", sem_acento(s)).strip().upper()


def valor_br(s):
    if not s: return None
    s = re.sub(r"[^\d.,]", "", s)
    try: return Decimal(s.replace(".", "").replace(",", "."))
    except InvalidOperation: return None


def data_br(s):
    try: return datetime.strptime(s.strip(), "%d/%m/%Y").date()
    except (ValueError, AttributeError): return None


RE_CNPJ = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
RE_DATA = re.compile(r"\b\d{2}/\d{2}/\d{4}\b")
RE_MOEDA = re.compile(r"\d{1,3}(?:\.\d{3})*,\d{2}")
# Linha digitável de arrecadação: 4 blocos de 11 dígitos + DV
RE_LINHA = re.compile(r"\b(\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d)\b")


@dataclass
class Guia:
    arquivo: str
    tipo: Optional[str] = None            # DARF | DAS | DARJ | DARM | ?
    subtipo: Optional[str] = None         # PIS, COFINS, ICMS, ISS, DIFAL...
    orgao: Optional[str] = None           # RFB | SEFAZ-RJ | PMRJ
    cnpj: Optional[str] = None
    razao_social: Optional[str] = None
    competencia: Optional[str] = None      # MM/AAAA — "Diversos" nos parcelamentos, fica None
    vencimento: Optional[date] = None
    valor: Optional[Decimal] = None        # sempre o total do documento (principal + multa + juros)
    linha_digitavel: Optional[str] = None
    codigo_receita: Optional[str] = None
    composicao: list[dict] = field(default_factory=list)
    arquivo_hash: str = ""
    confianca: float = 0.0
    layout: Optional[str] = None
    alertas: list[str] = field(default_factory=list)

    # DAS de parcelamento (PERT, PARCSN etc.) — cobre várias competências
    # de uma vez, por isso não tem uma "competencia" única.
    eh_parcelamento: bool = False
    parcelamento_sigla: Optional[str] = None     # "PARCSN", "PERT"...
    parcelamento_numero: Optional[str] = None
    parcela_atual: Optional[int] = None
    parcela_total: Optional[int] = None
    valor_principal: Optional[Decimal] = None
    valor_multa: Optional[Decimal] = None
    valor_juros: Optional[Decimal] = None
    nota: Optional[str] = None

    @property
    def publicavel(self) -> bool:
        """Só sobe para o cliente com os quatro campos que ele precisa.
        Parcelamento sempre passa por revisão humana — não tem competência
        única pra validar automaticamente."""
        if self.eh_parcelamento:
            return False
        return (not self.alertas and self.cnpj and self.vencimento
                and self.valor is not None and self.competencia is not None)

    def to_dict(self):
        d = asdict(self)
        d["vencimento"] = self.vencimento.isoformat() if self.vencimento else None
        for campo in ("valor", "valor_principal", "valor_multa", "valor_juros"):
            v = getattr(self, campo)
            d[campo] = str(v) if v is not None else None
        d["publicavel"] = self.publicavel
        return d


# --------------------------------------------------------------------------

def _hash(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def _competencia_de(txt: str) -> Optional[str]:
    m = re.search(r"PA\s+(\d{2})/(\d{4})", txt)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    m = re.search(r"Per[íi]odo de Refer[êe]ncia:?\s*(\d{1,2})/(\d{4})", txt)
    if m:
        return f"{int(m.group(1)):02d}/{m.group(2)}"
    m = re.search(r"([A-Za-zç]+)/(\d{4})", txt)
    if m and chave(m.group(1)) in MESES:
        return f"{MESES[chave(m.group(1))]:02d}/{m.group(2)}"
    m = re.search(r"COMPET[ÊE]NCIA\s*(\d{2})\s*/\s*(\d{4})", chave(txt))
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    return None


# --------------------------------------------------------------------------
# layouts
# --------------------------------------------------------------------------

def _darf_ou_das(txt: str, g: Guia) -> None:
    """SENDA — DARF do Sicalc e DAS do Simples Nacional."""
    simples = "ARRECADACAO DO SIMPLES NACIONAL" in chave(txt)
    g.tipo = "DAS" if simples else "DARF"
    g.orgao = "RFB"
    g.layout = "senda"

    m = re.search(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\s+(.+)", txt)
    if m:
        g.cnpj = re.sub(r"\D", "", m.group(1))
        g.razao_social = m.group(2).strip()

    # bloco: PA | vencimento | nº documento na mesma linha
    m = re.search(r"^(.+?)\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}\.\d{2}\.\d{5}\.\d{7}-\d)\s*$",
                  txt, re.M)
    if m:
        g.vencimento = data_br(m.group(2))
        pa = m.group(1).strip()
        g.competencia = _competencia_de(pa) or _competencia_de(txt)
        if not g.competencia:
            d = data_br(pa)
            if d:
                g.competencia = f"{d.month:02d}/{d.year}"

    # Em alguns layouts (parcelamentos "Diversos" e variações do emissor) a
    # caixa "Observações" fica extraída entre o rótulo e o valor/data acima,
    # quebrando o casamento numa linha só. O bloco de autenticação no
    # rodapé (perto do código de barras) é mais estável — usa como reforço.
    if not g.vencimento:
        m = re.search(r"Pagar\s+at[ée]:?\s*\n?\s*(\d{2}/\d{2}/\d{4})", txt)
        if m:
            g.vencimento = data_br(m.group(1))
    if not g.competencia:
        g.competencia = _competencia_de(txt)

    m = re.search(r"Valor Total do Documento\s*\n?\s*([\d.,]+)", txt)
    if m:
        g.valor = valor_br(m.group(1))
    if g.valor is None:
        m = re.search(r"\bValor:\s*\n?\s*([\d.,]+)", txt)
        if m:
            g.valor = valor_br(m.group(1))
    if g.valor is None:
        m = re.search(r"Totais\s+(.+)", txt)
        if m:
            valores = RE_MOEDA.findall(m.group(1))
            if valores:
                g.valor = valor_br(valores[-1])  # última coluna da linha "Totais" é o Total

    # DAS de parcelamento (PARCSN, PERT...): cobre várias competências de
    # uma vez, então "competencia" fica None de propósito — não é falha de
    # extração, é a natureza do documento.
    m = re.search(r"N[úu]mero do Parcelamento:\s*(\d+)", txt)
    if m:
        g.eh_parcelamento = True
        g.competencia = None
        g.parcelamento_numero = m.group(1)

        m_sigla = re.search(r"DAS de (\w+)", txt)
        if m_sigla:
            g.parcelamento_sigla = m_sigla.group(1)

        m_parcela = re.search(r"Parcela:\s*(\d+)\s*/\s*(\d+)", txt)
        if m_parcela:
            g.parcela_atual = int(m_parcela.group(1))
            g.parcela_total = int(m_parcela.group(2))

        m_totais = re.search(r"Totais\s+(.+)", txt)
        if m_totais:
            valores = RE_MOEDA.findall(m_totais.group(1))
            if len(valores) >= 4:
                g.valor_principal = valor_br(valores[0])
                g.valor_multa = valor_br(valores[1])
                g.valor_juros = valor_br(valores[2])

        g.nota = (
            f"Parcelamento {g.parcelamento_sigla or ''} nº {g.parcelamento_numero}"
            f" — parcela {g.parcela_atual}/{g.parcela_total}, competências diversas."
        ).replace("  ", " ").strip()

    # composição: código, denominação, principal
    for m in re.finditer(r"^(\d{4})\s+([A-ZÀ-Ú][^\n]{3,60}?)\s+([\d.]*\d,\d{2})", txt, re.M):
        g.composicao.append({
            "codigo": m.group(1),
            "denominacao": re.sub(r"\s+", " ", m.group(2)).strip(),
            "valor": str(valor_br(m.group(3))),
        })
    if g.composicao:
        g.codigo_receita = g.composicao[0]["codigo"]
        if not simples:
            g.subtipo = g.composicao[0]["denominacao"].split("-")[0].strip()
    if simples:
        g.subtipo = "Simples Nacional"

    m = RE_LINHA.search(txt)
    if m:
        g.linha_digitavel = re.sub(r"\s+", " ", m.group(1)).strip()

    g.confianca = 0.97


def _darj(txt: str, g: Guia) -> None:
    """SEFAZ-RJ — DARJ. O DIP (2ª página) tem os campos mais confiáveis."""
    g.tipo, g.orgao, g.layout = "DARJ", "SEFAZ-RJ", "darj"

    m = re.search(r"^(.+?)\s+(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\s*$", txt, re.M)
    if m:
        g.razao_social = m.group(1).strip()
        g.cnpj = re.sub(r"\D", "", m.group(2))

    m = re.search(r"Natureza da receita:\s*(.+)", txt)
    if m:
        g.subtipo = m.group(1).strip()
    else:
        m = re.search(r"ICMS/FECP\s+(.+?)\s+[\d.,]+", txt)
        if m:
            g.subtipo = m.group(1).strip()

    g.competencia = _competencia_de(txt)

    m = re.search(r"Data Vencimento:\s*(\d{2}/\d{2}/\d{4})", txt)
    if m:
        g.vencimento = data_br(m.group(1))
    else:
        m = re.search(r"N[ÃA]O RECEBER AP[ÓO]S\s*(\d{2}/\d{2}/\d{4})", txt)
        if m:
            g.vencimento = data_br(m.group(1))

    # (17) TOTAL A PAGAR é o valor efetivo do documento
    m = re.search(r"ICMS/FECP\s+.+?\s+([\d.]*\d,\d{2})", txt)
    if m:
        g.valor = valor_br(m.group(1))

    m = RE_LINHA.search(txt)
    if m:
        g.linha_digitavel = re.sub(r"\s+", " ", m.group(1)).strip()

    # conferência cruzada com o demonstrativo
    icms = re.search(r"ICMS Atualizado:\s*([\d.,]+)", txt)
    fecp = re.search(r"FECP Atualizado:\s*([\d.,]+)", txt)
    if icms and fecp and g.valor is not None:
        soma = (valor_br(icms.group(1)) or 0) + (valor_br(fecp.group(1)) or 0)
        if abs(soma - g.valor) > Decimal("0.02"):
            g.alertas.append(f"ICMS+FECP ({soma}) diverge do total ({g.valor}).")
        else:
            g.composicao = [
                {"denominacao": "ICMS", "valor": str(valor_br(icms.group(1)))},
                {"denominacao": "FECP", "valor": str(valor_br(fecp.group(1)))},
            ]
    g.confianca = 0.93


def _darm(txt: str, g: Guia) -> None:
    g.tipo, g.orgao, g.subtipo, g.layout = "DARM", "PMRJ", "ISS", "darm_rio"
    g.competencia = _competencia_de(txt)
    m = RE_CNPJ.search(txt)
    if m:
        g.cnpj = re.sub(r"\D", "", m.group(0))
    m = re.search(r"VENCIMENTO\s*(\d{2}/\d{2}/\d{4})", chave(txt))
    if m:
        g.vencimento = data_br(m.group(1))
    m = re.search(r"Valor Total R\$\s*([\d.,]+)", txt)
    if m:
        g.valor = valor_br(m.group(1))
    g.confianca = 0.85


ASSINATURAS = [
    ("ARRECADACAO DE RECEITAS FEDERAIS", _darf_ou_das),
    ("ARRECADACAO DO SIMPLES NACIONAL", _darf_ou_das),
    ("DOCUMENTO DE ARRECADACAO DO RIO DE JANEIRO", _darj),
    ("ARRECADACAO DE RECEITAS MUNICIPAIS", _darm),
]


def parse_guia(caminho: str | Path) -> Guia:
    caminho = Path(caminho)
    g = Guia(arquivo=caminho.name, arquivo_hash=_hash(caminho))

    with pdfplumber.open(caminho) as pdf:
        txt = "\n".join((p.extract_text() or "") for p in pdf.pages)

    if len(txt.strip()) < 40:
        g.alertas.append("PDF sem camada de texto — precisa de OCR.")
        g.tipo = "?"
        return g

    k = chave(txt)
    for marca, fn in ASSINATURAS:
        if marca in k:
            fn(txt, g)
            break
    else:
        g.tipo = "?"
        g.alertas.append("Layout não reconhecido.")
        return g

    if not g.cnpj:
        g.alertas.append("CNPJ não localizado.")
    if not g.vencimento:
        g.alertas.append("Vencimento não localizado.")
    if g.valor is None:
        g.alertas.append("Valor não localizado.")
    if not g.competencia and not g.eh_parcelamento:
        g.alertas.append("Competência não localizada.")
    if g.valor is not None and g.valor <= 0:
        g.alertas.append("Valor zerado ou negativo.")
    if g.eh_parcelamento:
        g.alertas.append("Guia de parcelamento — confirmar manualmente antes de publicar.")
    return g


# --------------------------------------------------------------------------
# FGTS Digital (GFD) — layout próprio, sem linha digitável de barras;
# usa PIX Copia e Cola.
# --------------------------------------------------------------------------

def _gfd(txt: str, g: Guia) -> None:
    g.tipo, g.orgao, g.subtipo, g.layout = "GFD", "FGTS Digital", "FGTS", "gfd"

    m = re.search(r"CPF/CNPJ do Empregador.*?\n?\s*([\d./-]+)\s+(.+?)\s*(?:\n|20\d{2})", txt)
    # a raiz do CNPJ (8 dígitos) vem sem a filial — registrar como está,
    # a conferência de identidade cruza com a guia irmã (DARF/DAS) da mesma competência
    m2 = re.search(r"(\d{2}\.?\d{3}\.?\d{3})\s+([A-ZÀ-Ú][A-ZÀ-Ú0-9 .&'-]{3,})", txt)
    if m2:
        raiz = re.sub(r"\D", "", m2.group(1))
        g.cnpj = raiz if len(raiz) == 8 else raiz[:8]
        g.razao_social = m2.group(2).strip()
        # Não gera alerta aqui: quem decide se raiz+nome é confiança
        # suficiente pra publicar direto é identificador_empresa.py,
        # que tem o cadastro completo pra cruzar. Um alerta fixo aqui
        # forçaria revisão mesmo quando a identificação está certa.

    m = re.search(r"(\d{2}/\d{4})\s+\d+\s+([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)", txt)
    if m:
        g.competencia = m.group(1)

    m = re.search(r"(\d{2}/\d{2}/\d{4})\s*\n\s*[\d.]+\s+[A-ZÀ-Ú].+?\n\s*[àa]s\s+\d{2}:\d{2}:\d{2}", txt)
    if m:
        g.vencimento = data_br(m.group(1))
    if not g.vencimento:
        m = re.search(r"(\d{2}/\d{2}/\d{4})\s*\n[^\n]*[àa]s\s+\d{2}:\d{2}:\d{2}", txt)
        if m:
            g.vencimento = data_br(m.group(1))

    m = re.search(r"Valor a recolher\s*\n?.*?([\d.]+,\d{2})", txt, re.S)
    if m:
        g.valor = valor_br(m.group(1))
    if g.valor is None:
        m = re.search(r"Total da Guia:\s*([\d.,]+)", txt)
        if m:
            g.valor = valor_br(m.group(1))

    m = re.search(r"PIX Copia e Cola:\s*\n?\s*(\S+)", txt)
    if m:
        g.linha_digitavel = m.group(1).strip()  # aqui é o payload Pix, não linha de barras

    g.confianca = 0.9


ASSINATURAS.append(("GFD - GUIA DO FGTS DIGITAL", _gfd))
