"""
extrato_simples_parser.py
==========================
Extração do Extrato/Memória de Cálculo do Simples Nacional (Domínio).

Alimenta o "Entenda seu imposto": alíquota efetiva total e a repartição
por tributo (IRPJ, CSLL, COFINS, PIS, INSS/CPP, ICMS/ISS), por competência.

Este documento não tem linha digitável — é o extrato que explica o DAS,
não o boleto em si. As duas coisas são publicadas juntas: a guia (com o
código de barras) e o extrato (com a explicação do cálculo).
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


@dataclass
class TributoApurado:
    nome: str
    situacao: Optional[str] = None      # Tributado | Redução | Isento | Não incidência
    base_calculo: Optional[Decimal] = None
    aliquota: Optional[Decimal] = None  # % efetivo daquele tributo
    valor: Optional[Decimal] = None


@dataclass
class ExtratoSimples:
    cnpj: Optional[str] = None
    razao_social: Optional[str] = None
    competencia: Optional[str] = None
    anexo: Optional[str] = None
    rpa: Optional[Decimal] = None            # receita do período
    rbt12: Optional[Decimal] = None          # receita bruta últimos 12 meses
    faixa_de: Optional[Decimal] = None
    faixa_ate: Optional[Decimal] = None
    aliquota_nominal: Optional[Decimal] = None
    aliquota_efetiva: Optional[Decimal] = None
    parcela_deduzir: Optional[Decimal] = None
    percentual_reducao_icms: Optional[Decimal] = None
    total_a_recolher: Optional[Decimal] = None
    tributos: list[TributoApurado] = field(default_factory=list)
    historico_rbt12: list[dict] = field(default_factory=list)  # 12 meses de receita
    alertas: list[str] = field(default_factory=list)

    @property
    def precisa_revisao(self) -> bool:
        return bool(self.alertas)

    def to_dict(self) -> dict:
        d = asdict(self)
        for campo in ("rpa", "rbt12", "faixa_de", "faixa_ate", "aliquota_nominal",
                      "aliquota_efetiva", "parcela_deduzir", "percentual_reducao_icms",
                      "total_a_recolher"):
            v = getattr(self, campo)
            d[campo] = str(v) if v is not None else None
        for t, orig in zip(d["tributos"], self.tributos):
            for c in ("base_calculo", "aliquota", "valor"):
                v = getattr(orig, c)
                t[c] = str(v) if v is not None else None
        d["precisa_revisao"] = self.precisa_revisao
        return d


RE_CNPJ = re.compile(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})")
RE_PCT = re.compile(r"(-?\d+,\d+)\s*%?")
RE_MOEDA = re.compile(r"-?\d{1,3}(?:\.\d{3})*,\d{2}")


def parse_extrato_simples(caminho: str | Path) -> ExtratoSimples:
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

    m = re.search(r"CNPJ:\s*[\d./-]+\s*\n?\s*(.+?)\s*\n", txt)
    if m and chave(m.group(1)) == m.group(1).upper().strip():
        pass
    m = re.search(r"^([A-ZÀ-Ú][A-ZÀ-Ú0-9 .&'-]{4,}?)\s*\nCNPJ:", txt, re.M)
    if m:
        e.razao_social = m.group(1).strip()

    m = re.search(r"Compet[êe]ncia:\s*(\d{2}/\d{4})", txt)
    if m:
        e.competencia = m.group(1)
    else:
        m = re.search(r"Per[íi]odo:\s*\n?\s*(\d{2}/\d{4})", txt)
        if m:
            e.competencia = m.group(1)

    m = re.search(r"Anexo:\s*(Anexo\s+[IVX]+[^\n]*)", txt)
    if m:
        e.anexo = m.group(1).strip()

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

    m = re.search(r"Al[íi]quota:\s*([\d,]+)\s+Simples Nacional Total:\s*([\d.,]+)", txt)
    if m:
        e.aliquota_efetiva = valor_br(m.group(1) + ",00" if "," not in m.group(1) else m.group(1))
        # a alíquota vem sem separador de milhar e com vírgula decimal já; valor_br cobre
        e.aliquota_efetiva = Decimal(m.group(1).replace(",", "."))
        e.total_a_recolher = valor_br(m.group(2))

    m = re.search(r"Al[íi]quota nominal:\s*([\d,]+)%", txt)
    if m:
        e.aliquota_nominal = Decimal(m.group(1).replace(",", "."))

    m = re.search(r"Parcela a deduzir:\s*([\d.,]+)", txt)
    if m:
        e.parcela_deduzir = valor_br(m.group(1))

    m = re.search(r"Percentual de Redu[çc][ãa]o:\s*([\d,]+)", txt)
    if m:
        e.percentual_reducao_icms = Decimal(m.group(1).replace(",", "."))

    if e.total_a_recolher is None:
        m = re.search(r"Simples Nacional a recolher:\s*([\d.,]+)", txt)
        if m:
            e.total_a_recolher = valor_br(m.group(1))

    # bloco "Partilha": tributo / situação / base / alíquota / valor,
    # em quatro linhas paralelas (uma por rótulo, colunas por tributo)
    # bloco em 5 linhas consecutivas: Partilha / Situação / Base / Alíquota / Valor
    m_bloco = re.search(
        r"Partilha:\s*(.+)\n"
        r"Situa[çc][ãa]o:\s*(.+)\n"
        r"Base de C[áa]lculo:\s*(.+)\n"
        r"Al[íi]quota:\s*(.+)\n"
        r"Valor:\s*(.+)",
        txt,
    )

    if m_bloco:
        nomes = m_bloco.group(1).split()
        situacoes = re.findall(r"Tributado|Redu[çc][ãa]o|Isento|N[ãa]o incid[êe]ncia", m_bloco.group(2))
        bases = RE_MOEDA.findall(m_bloco.group(3))
        aliqs = re.findall(r"\d+,\d+", m_bloco.group(4))
        valores = RE_MOEDA.findall(m_bloco.group(5))

        n = min(len(nomes), len(situacoes), len(bases), len(aliqs), len(valores))
        if n == 0:
            e.alertas.append("Bloco de partilha por tributo não pôde ser lido — checar layout.")
        for i in range(n):
            e.tributos.append(TributoApurado(
                nome=nomes[i],
                situacao=situacoes[i].title(),
                base_calculo=valor_br(bases[i]),
                aliquota=Decimal(aliqs[i].replace(",", ".")),
                valor=valor_br(valores[i]),
            ))
        if len(nomes) != n:
            e.alertas.append(f"Contagem de colunas inconsistente na partilha ({len(nomes)} tributos, {n} linhas completas).")
    elif False:
        pass
    if not m_bloco:
        e.alertas.append("Bloco de partilha por tributo não encontrado.")

    # histórico de 12 meses de receita bruta (tabela "Receita Bruta Acumulada")
    for m in re.finditer(r"(\d{2}/\d{4})\s+([\d.,]+)\s+([\d.,]+)\n", txt):
        e.historico_rbt12.append({
            "competencia": m.group(1),
            "receita_interna": str(valor_br(m.group(2))),
            "receita_exportacao": str(valor_br(m.group(3))),
        })

    if e.aliquota_efetiva is None:
        e.alertas.append("Alíquota efetiva não localizada.")
    if not e.tributos:
        e.alertas.append("Nenhum tributo da partilha foi extraído.")
    if e.total_a_recolher and e.tributos:
        soma = sum((t.valor or Decimal(0)) for t in e.tributos)
        if abs(soma - e.total_a_recolher) > Decimal("0.05"):
            e.alertas.append(f"Soma dos tributos ({soma}) diverge do total a recolher ({e.total_a_recolher}).")

    return e


if __name__ == "__main__":
    import json, sys
    e = parse_extrato_simples(sys.argv[1])
    print(json.dumps(e.to_dict(), ensure_ascii=False, indent=2, default=str))
