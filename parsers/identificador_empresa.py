"""
identificador_empresa.py
========================
Identifica a qual empresa uma guia pertence, cruzando múltiplos sinais.

ORDEM DE CONFIANÇA (do mais forte ao mais fraco):

  1. CNPJ completo (14 dígitos) extraído do PDF        -> certeza
  2. Raiz do CNPJ (8 dígitos) + nome compatível        -> alta
  3. Raiz do CNPJ (8 dígitos) única no cadastro        -> alta
  4. Nome do PDF batendo com razão social ou fantasia  -> média
  5. Nome da pasta de origem                           -> baixa, só confirma

REGRA CENTRAL: quanto mais fraca a identificação, mais alto o nível de
revisão exigido. Nível 4 ou 5 sozinhos NUNCA publicam automaticamente —
vão para a fila com o motivo explícito.

Nome de pasta jamais decide sozinho. Ele existe para CONFIRMAR ou para
LEVANTAR DÚVIDA, nunca para atribuir.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Optional


# ---------------------------------------------------------------------------
# normalização de nomes de empresa
# ---------------------------------------------------------------------------

# Termos que não distinguem empresas e atrapalham a comparação
RUIDO = {
    "LTDA", "ME", "EPP", "EIRELI", "SA", "S", "A", "MEI", "SLU",
    "COMERCIO", "COMERCIAL", "INDUSTRIA", "INDUSTRIAL", "SERVICOS",
    "EMPRESA", "SOCIEDADE", "E", "DE", "DA", "DO", "DOS", "DAS",
}


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


def normalizar_nome(s: str) -> str:
    """'D. F. FERNANDES CONFECÇÕES LTDA.-ME' -> 'DF FERNANDES CONFECCOES'"""
    s = sem_acento(s).upper()
    s = re.sub(r"[.\-/,&]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def tokens_significativos(s: str) -> list[str]:
    """Palavras que realmente identificam a empresa, sem o ruído societário."""
    brutos = normalizar_nome(s).split()
    # junta iniciais soltas: "D F FERNANDES" -> "DF FERNANDES"
    juntos: list[str] = []
    buffer = ""
    for t in brutos:
        if len(t) == 1 and t.isalpha():
            buffer += t
        else:
            if buffer:
                juntos.append(buffer)
                buffer = ""
            juntos.append(t)
    if buffer:
        juntos.append(buffer)
    return [t for t in juntos if t not in RUIDO and len(t) > 1]


def similaridade_nomes(a: str, b: str) -> float:
    """
    0.0 a 1.0. Combina duas medidas:
      - quantos tokens significativos coincidem
      - similaridade textual bruta (pega variações de grafia)
    """
    ta, tb = tokens_significativos(a), tokens_significativos(b)
    if not ta or not tb:
        return 0.0

    comuns = set(ta) & set(tb)
    cobertura = len(comuns) / min(len(ta), len(tb))

    seq = SequenceMatcher(None, " ".join(ta), " ".join(tb)).ratio()

    # o primeiro token costuma ser o mais distintivo
    bonus = 0.15 if ta[0] == tb[0] else 0.0

    return min(1.0, 0.55 * cobertura + 0.45 * seq + bonus)


# ---------------------------------------------------------------------------
# resultado
# ---------------------------------------------------------------------------

@dataclass
class Identificacao:
    empresa: Optional[dict] = None
    metodo: Optional[str] = None       # cnpj_completo | raiz_e_nome | raiz_unica | nome | nenhum
    confianca: float = 0.0             # 0.0 a 1.0
    exige_revisao: bool = True
    motivos: list[str] = field(default_factory=list)
    candidatos: list[dict] = field(default_factory=list)   # quando há ambiguidade

    @property
    def encontrou(self) -> bool:
        return self.empresa is not None


# ---------------------------------------------------------------------------
# identificação
# ---------------------------------------------------------------------------

LIMIAR_NOME_ALTO = 0.85    # acima disso, nome é considerado o mesmo
LIMIAR_NOME_BAIXO = 0.60   # abaixo disso, nomes são considerados diferentes


def identificar(
    cnpj_pdf: Optional[str],
    nome_pdf: Optional[str],
    empresas: list[dict],
    nome_pasta: Optional[str] = None,
) -> Identificacao:
    """
    empresas: lista de dicts do Supabase, com pelo menos
              id, cnpj, razao_social, nome_fantasia

    cnpj_pdf: só dígitos. Pode ter 14 (completo) ou 8 (raiz, caso do GFD).
    """
    r = Identificacao()
    cnpj = re.sub(r"\D", "", cnpj_pdf or "")

    por_cnpj = {e["cnpj"]: e for e in empresas}

    # ---------- nível 1: CNPJ completo ----------
    if len(cnpj) == 14:
        alvo = por_cnpj.get(cnpj)
        if alvo:
            r.empresa = alvo
            r.metodo = "cnpj_completo"
            r.confianca = 1.0
            r.exige_revisao = False
            _conferir_nome(r, nome_pdf, alvo)
            _conferir_pasta(r, nome_pasta, alvo)
            return r
        r.motivos.append(f"CNPJ {_fmt(cnpj)} não está cadastrado.")
        # segue adiante: talvez seja filial de empresa conhecida
        cnpj_raiz = cnpj[:8]
    elif len(cnpj) == 8:
        cnpj_raiz = cnpj
        r.motivos.append("PDF traz apenas a raiz do CNPJ (8 dígitos).")
    else:
        cnpj_raiz = None
        if cnpj:
            r.motivos.append(f"CNPJ com formato inesperado: {cnpj}")

    # ---------- níveis 2 e 3: raiz do CNPJ ----------
    if cnpj_raiz:
        mesma_raiz = [e for e in empresas if e["cnpj"][:8] == cnpj_raiz]

        if len(mesma_raiz) == 1:
            alvo = mesma_raiz[0]
            sim = _melhor_similaridade(nome_pdf, alvo)

            if nome_pdf and sim >= LIMIAR_NOME_ALTO:
                r.empresa, r.metodo, r.confianca = alvo, "raiz_e_nome", 0.95
                r.exige_revisao = False
                r.motivos.append(
                    f"Identificada pela raiz {cnpj_raiz} + nome compatível "
                    f"({sim:.0%})."
                )
            elif nome_pdf and sim < LIMIAR_NOME_BAIXO:
                r.empresa, r.metodo, r.confianca = alvo, "raiz_unica", 0.55
                r.exige_revisao = True
                r.motivos.append(
                    f"Raiz {cnpj_raiz} bate, mas o nome do PDF ('{nome_pdf}') "
                    f"não confere com '{alvo['razao_social']}' ({sim:.0%}). Conferir."
                )
            else:
                r.empresa, r.metodo, r.confianca = alvo, "raiz_unica", 0.80
                r.exige_revisao = True
                r.motivos.append(
                    f"Única empresa com a raiz {cnpj_raiz}. Confirmar a filial "
                    "antes de publicar."
                )
            _conferir_pasta(r, nome_pasta, r.empresa)
            return r

        if len(mesma_raiz) > 1:
            # matriz e filiais: o nome decide
            r.candidatos = mesma_raiz
            melhor, melhor_sim = None, 0.0
            for e in mesma_raiz:
                s = _melhor_similaridade(nome_pdf, e)
                if s > melhor_sim:
                    melhor, melhor_sim = e, s

            if melhor and melhor_sim >= LIMIAR_NOME_ALTO:
                r.empresa, r.metodo, r.confianca = melhor, "raiz_e_nome", 0.85
                r.exige_revisao = True
                r.motivos.append(
                    f"{len(mesma_raiz)} estabelecimentos com a raiz {cnpj_raiz}. "
                    f"Escolhido pelo nome ({melhor_sim:.0%}). Confirmar a filial."
                )
            else:
                r.metodo = "ambiguo"
                r.motivos.append(
                    f"{len(mesma_raiz)} estabelecimentos com a raiz {cnpj_raiz} "
                    "e o nome não desempata. Selecionar manualmente."
                )
            return r

    # ---------- nível 4: só o nome ----------
    if nome_pdf:
        ranking = sorted(
            ((e, _melhor_similaridade(nome_pdf, e)) for e in empresas),
            key=lambda x: x[1], reverse=True,
        )
        if ranking and ranking[0][1] >= LIMIAR_NOME_ALTO:
            alvo, sim = ranking[0]
            segundo = ranking[1][1] if len(ranking) > 1 else 0.0
            if sim - segundo < 0.10:
                r.candidatos = [e for e, s in ranking[:3] if s >= LIMIAR_NOME_BAIXO]
                r.metodo = "ambiguo"
                r.motivos.append(
                    "Mais de uma empresa com nome parecido e sem CNPJ válido "
                    "no documento. Selecionar manualmente."
                )
                return r

            r.empresa, r.metodo, r.confianca = alvo, "nome", 0.50
            r.exige_revisao = True
            r.motivos.append(
                f"Sem CNPJ utilizável no PDF. Identificada só pelo nome "
                f"({sim:.0%}) — conferir obrigatoriamente."
            )
            _conferir_pasta(r, nome_pasta, alvo)
            return r

    # ---------- nada ----------
    r.metodo = "nenhum"
    r.motivos.append("Não foi possível identificar a empresa deste documento.")
    return r


# ---------------------------------------------------------------------------
# conferências auxiliares
# ---------------------------------------------------------------------------

def _melhor_similaridade(nome_pdf: Optional[str], empresa: dict) -> float:
    if not nome_pdf:
        return 0.0
    candidatos = [empresa.get("razao_social"), empresa.get("nome_fantasia")]
    return max((similaridade_nomes(nome_pdf, c) for c in candidatos if c), default=0.0)


def _conferir_nome(r: Identificacao, nome_pdf: Optional[str], empresa: dict) -> None:
    """CNPJ bateu, mas o nome destoa: sinal de PDF trocado ou cadastro errado."""
    if not nome_pdf:
        return
    sim = _melhor_similaridade(nome_pdf, empresa)
    if sim < LIMIAR_NOME_BAIXO:
        r.exige_revisao = True
        r.confianca = min(r.confianca, 0.70)
        r.motivos.append(
            f"CNPJ confere, mas o nome no PDF ('{nome_pdf}') destoa do cadastro "
            f"('{empresa['razao_social']}'). Verificar se o cadastro está correto."
        )


def _conferir_pasta(r: Identificacao, nome_pasta: Optional[str], empresa: Optional[dict]) -> None:
    """
    A pasta nunca atribui, só confirma ou levanta dúvida.
    Arquivo salvo na pasta errada é rotina no escritório.
    """
    if not nome_pasta or not empresa:
        return
    sim = _melhor_similaridade(nome_pasta, empresa)
    if sim < LIMIAR_NOME_BAIXO:
        r.motivos.append(
            f"Arquivo está na pasta '{nome_pasta}', mas pertence a "
            f"'{empresa['razao_social']}'. Provável arquivo salvo no lugar errado."
        )
        # não força revisão quando o CNPJ completo já deu certeza:
        # a guia está certa, a pasta é que está errada.
        if r.metodo != "cnpj_completo":
            r.exige_revisao = True


def _fmt(cnpj: str) -> str:
    if len(cnpj) == 14:
        return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
    if len(cnpj) == 8:
        return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}"
    return cnpj


# ---------------------------------------------------------------------------
# teste rápido
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    empresas = [
        {"id": "1", "cnpj": "18294480000106", "razao_social": "Puro Estilo Moda Íntima Ltda",
         "nome_fantasia": "Puro Estilo"},
        {"id": "2", "cnpj": "32599342000166", "razao_social": "D F Fernandes Confecções Ltda",
         "nome_fantasia": "Kika Lingerie"},
        {"id": "3", "cnpj": "52276638000153", "razao_social": "Gata Serrana Lingerie Ltda",
         "nome_fantasia": "Gata Serrana"},
    ]

    casos = [
        ("CNPJ completo", "18294480000106", "PURO ESTILO MODA INTIMA LTDA", None),
        ("GFD: só raiz + nome", "18294480", "PURO ESTILO MODA INTIMA LTDA", None),
        ("GFD: só raiz, sem nome", "18294480", None, None),
        ("DAM: nome com pontos", "32599342000166", "D. F. FERNANDES CONFECCOES LTDA.-ME", None),
        ("CNPJ desconhecido", "99999999000199", "EMPRESA NOVA LTDA", None),
        ("Sem CNPJ, só nome", None, "GATA SERRANA LINGERIE LTDA", None),
        ("Pasta errada", "52276638000153", "GATA SERRANA LINGERIE LTDA",
         "PURO ESTILO MODA INTIMA LTDA"),
    ]

    for titulo, cnpj, nome, pasta in casos:
        r = identificar(cnpj, nome, empresas, pasta)
        alvo = r.empresa["razao_social"] if r.empresa else "— não identificada —"
        print(f"\n{titulo}")
        print(f"  -> {alvo}")
        print(f"     método={r.metodo} confiança={r.confianca:.0%} revisão={r.exige_revisao}")
        for m in r.motivos:
            print(f"     · {m}")
