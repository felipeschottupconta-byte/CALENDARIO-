"""
extrato_simples_parser.py
==========================
Extração do Extrato/Memória de Cálculo do Simples Nacional (Domínio).

Alimenta o "Entenda seu imposto": alíquota efetiva total e a repartição
por tributo (IRPJ, CSLL, COFINS, PIS, INSS/CPP, ICMS/ISS), por competência.

Este documento não tem linha digitável — é o extrato que explica o DAS,
não o boleto em si. As duas coisas são publicadas juntas: a guia (com o
código de barras) e o extrato (com a explicação do cálculo).

Uma empresa pode ser apurada em MAIS DE UM ANEXO na mesma competência —
por exemplo, quem revende e também industrializa é tributada em Anexo I
e Anexo II ao mesmo tempo, cada um com receita, alíquota e subtotal
próprios. O DAS soma os dois. Ignorar isso e ler só o primeiro anexo
foi o bug que motivou a reestruturação deste arquivo: o total reportado
ficava muito menor que o real, sem nenhum alerta.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, asdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import pdfplumber


def sem_acento(s): return "".join(c for c in unicodedata.normalize("NFD", s)
                                  if unicodedata.category(c) != "Mn")
def chave(s): return re.sub(r"\s+", " ", sem_acento(s)).strip().upper()


def valor_br(s):
    if not s: return None
    s = re.sub(r"[^\d.,\-]", "", s)
    try: return Decimal(s.replace(".", "").replace(",", "."))
    except InvalidOperation: return None


TRIBUTOS = ["IRPJ", "CSLL", "COFINS", "PIS", "INSS/CPP", "ICMS", "ISS", "IPI"]

TOLERANCIA = Decimal("0.05")  # arredondamento normal do sistema — não gera alerta


@dataclass
class TributoApurado:
    nome: str
    situacao: Optional[str] = None      # Tributado | Redução | Isento | Não incidência
    base_calculo: Optional[Decimal] = None
    aliquota: Optional[Decimal] = None  # % efetivo daquele tributo
    valor: Optional[Decimal] = None


@dataclass
class AnexoApurado:
    anexo: str                              # "Anexo I - Comércio"
    secao: Optional[str] = None
    tabela: Optional[str] = None
    receita_tributada: Optional[Decimal] = None
    aliquota_nominal: Optional[Decimal] = None      # vem da memória de cálculo
    aliquota_efetiva: Optional[Decimal] = None
    parcela_deduzir: Optional[Decimal] = None       # vem da memória de cálculo
    percentual_reducao_icms: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None      # "Simples Nacional Total" daquele anexo
    tributos: list[TributoApurado] = field(default_factory=list)


@dataclass
class ExtratoSimples:
    cnpj: Optional[str] = None
    razao_social: Optional[str] = None
    competencia: Optional[str] = None
    rpa: Optional[Decimal] = None            # receita do período
    rbt12: Optional[Decimal] = None          # receita bruta últimos 12 meses
    faixa_de: Optional[Decimal] = None
    faixa_ate: Optional[Decimal] = None
    total_a_recolher: Optional[Decimal] = None
    anexos: list[AnexoApurado] = field(default_factory=list)
    historico_rbt12: list[dict] = field(default_factory=list)  # 12 meses de receita
    alertas: list[str] = field(default_factory=list)

    @property
    def precisa_revisao(self) -> bool:
        return bool(self.alertas)

    @property
    def multiplos_anexos(self) -> bool:
        return len(self.anexos) > 1

    @property
    def aliquota_efetiva_media(self) -> Optional[Decimal]:
        """Alíquota efetiva ponderada pela receita tributada de cada anexo —
        o que o card resumo mostra quando há mais de um anexo."""
        total_receita = sum((a.receita_tributada or Decimal(0)) for a in self.anexos)
        if not total_receita:
            return None
        soma_ponderada = sum(
            (a.aliquota_efetiva or Decimal(0)) * (a.receita_tributada or Decimal(0))
            for a in self.anexos
        )
        return soma_ponderada / total_receita

    @property
    def tributos_consolidados(self) -> list[TributoApurado]:
        """Soma os valores por nome de tributo entre todos os anexos — é o
        que alimenta o gráfico de repartição no app. Anexos podem ter
        conjuntos de tributos diferentes (IPI só existe no Anexo II)."""
        consolidado: dict[str, TributoApurado] = {}
        for anexo in self.anexos:
            for t in anexo.tributos:
                acumulado = consolidado.get(t.nome)
                if acumulado is None:
                    consolidado[t.nome] = TributoApurado(nome=t.nome, situacao=t.situacao, valor=(t.valor or Decimal(0)))
                else:
                    acumulado.valor = (acumulado.valor or Decimal(0)) + (t.valor or Decimal(0))
        return list(consolidado.values())

    def to_dict(self) -> dict:
        d = asdict(self)
        for campo in ("rpa", "rbt12", "faixa_de", "faixa_ate", "total_a_recolher"):
            v = getattr(self, campo)
            d[campo] = str(v) if v is not None else None

        campos_decimal_anexo = ("receita_tributada", "aliquota_nominal", "aliquota_efetiva",
                                 "parcela_deduzir", "percentual_reducao_icms", "subtotal")
        for i, anexo in enumerate(self.anexos):
            for campo in campos_decimal_anexo:
                v = getattr(anexo, campo)
                d["anexos"][i][campo] = str(v) if v is not None else None
            for j, t in enumerate(anexo.tributos):
                for campo in ("base_calculo", "aliquota", "valor"):
                    v = getattr(t, campo)
                    d["anexos"][i]["tributos"][j][campo] = str(v) if v is not None else None

        media = self.aliquota_efetiva_media
        d["aliquota_efetiva_media"] = str(media) if media is not None else None
        d["multiplos_anexos"] = self.multiplos_anexos
        d["tributos_consolidados"] = [
            {"nome": t.nome, "situacao": t.situacao, "valor": str(t.valor) if t.valor is not None else None}
            for t in self.tributos_consolidados
        ]
        d["precisa_revisao"] = self.precisa_revisao
        return d


RE_CNPJ = re.compile(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})")
RE_PCT = re.compile(r"(-?\d+,\d+)\s*%?")
RE_MOEDA = re.compile(r"-?\d{1,3}(?:\.\d{3})*,\d{2}")


def _parse_bloco_anexo(nome_anexo: str, bloco: str) -> Optional[AnexoApurado]:
    """Extrai os campos de UM anexo a partir do trecho de texto que vai do
    'Anexo:' dele até o próximo 'Anexo:' (ou fim da seção de apuração)."""
    anexo = AnexoApurado(anexo=nome_anexo)

    m = re.search(r"Se[çc][ãa]o:\s*(.+?)\nTabela:", bloco, re.S)
    if m:
        anexo.secao = re.sub(r"\s+", " ", m.group(1)).strip()

    m = re.search(r"Tabela:\s*(.+)", bloco)
    if m:
        anexo.tabela = m.group(1).strip()

    m = re.search(
        r"Receita Tributada Total:\s*([\d.,]+)\s*Al[íi]quota:\s*([\d.,]+)\s*Simples Nacional Total:\s*([\d.,]+)",
        bloco,
    )
    if m:
        anexo.receita_tributada = valor_br(m.group(1))
        anexo.aliquota_efetiva = Decimal(m.group(2).replace(",", "."))
        anexo.subtotal = valor_br(m.group(3))

    m = re.search(r"Percentual de Redu[çc][ãa]o:\s*([\d,]+)", bloco)
    if m:
        anexo.percentual_reducao_icms = Decimal(m.group(1).replace(",", "."))

    # bloco em 5 linhas consecutivas: Partilha / Situação / Base / Alíquota / Valor
    # O número de colunas varia por anexo (ex.: IPI só existe no Anexo II) —
    # não assume quantidade fixa, só que as 5 linhas têm a mesma contagem.
    m_bloco = re.search(
        r"Partilha:\s*(.+)\n"
        r"Situa[çc][ãa]o:\s*(.+)\n"
        r"Base de C[áa]lculo:\s*(.+)\n"
        r"Al[íi]quota:\s*(.+)\n"
        r"Valor:\s*(.+)",
        bloco,
    )
    if m_bloco:
        nomes = m_bloco.group(1).split()
        situacoes = re.findall(r"Tributado|Redu[çc][ãa]o|Isento|N[ãa]o incid[êe]ncia", m_bloco.group(2))
        bases = RE_MOEDA.findall(m_bloco.group(3))
        aliqs = re.findall(r"\d+,\d+", m_bloco.group(4))
        valores = RE_MOEDA.findall(m_bloco.group(5))

        n = min(len(nomes), len(situacoes), len(bases), len(aliqs), len(valores))
        for i in range(n):
            anexo.tributos.append(TributoApurado(
                nome=nomes[i],
                situacao=situacoes[i].title(),
                base_calculo=valor_br(bases[i]),
                aliquota=Decimal(aliqs[i].replace(",", ".")),
                valor=valor_br(valores[i]),
            ))

    if anexo.subtotal is None and not anexo.tributos:
        return None
    return anexo


def _validar(e: ExtratoSimples, qtd_marcadores_anexo: int, valor_guia_das: Optional[Decimal]) -> None:
    if not e.anexos:
        if e.total_a_recolher is not None:
            e.alertas.append("Total a recolher foi encontrado, mas nenhum anexo foi extraído — falha de extração.")
        else:
            e.alertas.append("Nenhum anexo de apuração foi extraído.")
        return

    # Rede de segurança contra o bug original: se o documento menciona mais
    # "Anexo:" na seção de apuração do que anexos efetivamente extraídos,
    # algo ficou pelo caminho.
    if qtd_marcadores_anexo > len(e.anexos):
        e.alertas.append(
            f"Documento menciona {qtd_marcadores_anexo} anexos mas apenas {len(e.anexos)} foram extraídos."
        )

    for anexo in e.anexos:
        if anexo.aliquota_efetiva is None:
            e.alertas.append(f"Alíquota efetiva não localizada para o {anexo.anexo}.")
        if not anexo.tributos:
            e.alertas.append(f"Nenhum tributo da partilha foi extraído para o {anexo.anexo}.")
            continue
        soma_tributos = sum((t.valor or Decimal(0)) for t in anexo.tributos)
        if anexo.subtotal is not None and abs(soma_tributos - anexo.subtotal) > TOLERANCIA:
            e.alertas.append(
                f"Soma dos tributos do {anexo.anexo} ({soma_tributos}) diverge do subtotal do anexo ({anexo.subtotal})."
            )

    if e.total_a_recolher is not None:
        soma_subtotais = sum((a.subtotal or Decimal(0)) for a in e.anexos)
        if abs(soma_subtotais - e.total_a_recolher) > TOLERANCIA:
            e.alertas.append(
                f"Soma dos anexos ({soma_subtotais}) diverge do total a recolher ({e.total_a_recolher})."
            )

    # Validação separada: extrato x guia (DAS) da mesma empresa/competência.
    # Diferença de até R$ 0,05 é arredondamento normal do sistema (ex.: extrato
    # R$ 3.132,17 e guia R$ 3.132,16) e é ignorada silenciosamente.
    if e.total_a_recolher is not None and valor_guia_das is not None:
        diferenca_guia = abs(e.total_a_recolher - valor_guia_das)
        if diferenca_guia > TOLERANCIA:
            e.alertas.append(
                f"Total a recolher do extrato ({e.total_a_recolher}) diverge do valor da guia DAS ({valor_guia_das})."
            )


def parse_extrato_simples(caminho: str | Path, valor_guia_das: Optional[Decimal] = None) -> ExtratoSimples:
    with pdfplumber.open(Path(caminho)) as pdf:
        txt = "\n".join((p.extract_text() or "") for p in pdf.pages)

    e = ExtratoSimples()
    if not txt.strip():
        e.alertas.append("PDF sem camada de texto.")
        return e

    m = RE_CNPJ.search(txt)
    if m:
        e.cnpj = re.sub(r"\D", "", m.group(1))
    else:
        e.alertas.append("CNPJ não localizado.")

    # Tenta os dois pontos do documento onde a razão social aparece,
    # nessa ordem: a linha logo antes de "CNPJ:" no cabeçalho e, se não
    # achar, o bloco "Estabelecimento: <código> <NOME> CNPJ: ...".
    m = re.search(r"^([A-ZÀ-Ú][A-ZÀ-Ú0-9 .&'-]{4,}?)\s*\nCNPJ:", txt, re.M)
    if not m:
        m = re.search(r"Estabelecimento:\s*\d+\s+(.+?)\s+CNPJ:", txt)
    if m:
        e.razao_social = m.group(1).strip()

    m = re.search(r"Compet[êe]ncia:\s*(\d{2}/\d{4})", txt)
    if m:
        e.competencia = m.group(1)
    else:
        m = re.search(r"Per[íi]odo:\s*\n?\s*(\d{2}/\d{4})", txt)
        if m:
            e.competencia = m.group(1)

    m = re.search(r"Regime de Compet[êe]ncia\s+([\d.,]+)\s+[\d.,]+\s+([\d.,]+)", txt)
    if m:
        e.rpa = valor_br(m.group(2))

    m = re.search(r"\(RBT12\)\s+([\d.,]+)\s+[\d.,]+\s+([\d.,]+)", txt)
    if m:
        e.rbt12 = valor_br(m.group(2))

    m = re.search(r"Faixa de Enquadramento:\s*([\d.,]+)\s*a\s*([\d.,]+)", txt)
    if m:
        e.faixa_de = valor_br(m.group(1))
        e.faixa_ate = valor_br(m.group(2))

    # ------------------------------------------------------------
    # Seção de apuração ("SIMPLES NACIONAL"): um ou mais anexos, cada um
    # começando em "Anexo:" e indo até o próximo "Anexo:" ou o fim da
    # seção. Empresa que revende e industrializa, por exemplo, aparece
    # em Anexo I e Anexo II na mesma competência.
    # ------------------------------------------------------------
    qtd_marcadores_anexo = 0
    m_apuracao = re.search(
        r"SIMPLES NACIONAL\n(.*?)Simples Nacional a recolher:\s*([\d.,]+)",
        txt, re.S,
    )
    if m_apuracao:
        corpo_apuracao = m_apuracao.group(1)
        e.total_a_recolher = valor_br(m_apuracao.group(2))

        marcadores = list(re.finditer(r"Anexo:\s*(.+)", corpo_apuracao))
        qtd_marcadores_anexo = len(marcadores)

        for i, marcador in enumerate(marcadores):
            fim = marcadores[i + 1].start() if i + 1 < len(marcadores) else len(corpo_apuracao)
            bloco = corpo_apuracao[marcador.start():fim]
            anexo = _parse_bloco_anexo(marcador.group(1).strip(), bloco)
            if anexo:
                e.anexos.append(anexo)
    else:
        e.alertas.append("Seção de apuração do Simples Nacional não encontrada.")

    # Alíquota nominal e parcela a deduzir de cada anexo vêm da memória de
    # cálculo correspondente, mais adiante no documento (um bloco "MEMÓRIA
    # DE CÁLCULO SIMPLES NACIONAL" por anexo). Associa pelo nome do anexo,
    # não pela ordem de aparição.
    for m_mem in re.finditer(
        r"MEMÓRIA DE C[ÁA]LCULO SIMPLES NACIONAL\n.*?"
        r"Anexo:\s*(.+?)\n.*?"
        r"Al[íi]quota nominal:\s*([\d,]+)%.*?"
        r"Parcela a deduzir:\s*([\d.,]+).*?"
        r"Simples Nacional a recolher:",
        txt, re.S,
    ):
        nome_anexo = m_mem.group(1).strip()
        for anexo in e.anexos:
            if anexo.anexo == nome_anexo:
                anexo.aliquota_nominal = Decimal(m_mem.group(2).replace(",", "."))
                anexo.parcela_deduzir = valor_br(m_mem.group(3))
                break

    # histórico de 12 meses de receita bruta (tabela "Receita Bruta Acumulada")
    # — é único para a empresa, não varia por anexo.
    for m in re.finditer(r"(\d{2}/\d{4})\s+([\d.,]+)\s+([\d.,]+)\n", txt):
        e.historico_rbt12.append({
            "competencia": m.group(1),
            "receita_interna": str(valor_br(m.group(2))),
            "receita_exportacao": str(valor_br(m.group(3))),
        })

    _validar(e, qtd_marcadores_anexo, valor_guia_das)

    return e


if __name__ == "__main__":
    import json, sys
    e = parse_extrato_simples(sys.argv[1])
    print(json.dumps(e.to_dict(), ensure_ascii=False, indent=2, default=str))
