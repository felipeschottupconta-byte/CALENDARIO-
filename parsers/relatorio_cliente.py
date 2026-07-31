"""
relatorio_cliente.py
====================
Transforma o JSON do parser SITFIS em um relatório legível para o cliente.

Divisão de responsabilidade — inegociável:
    parser  -> os números
    Claude  -> as palavras
    humano  -> a aprovação

O modelo recebe dados já estruturados. Nunca o PDF, nunca texto solto.
Depois de gerar, todo valor citado no texto é conferido contra o conjunto
de valores extraídos. Divergiu, o relatório não é publicado.

Dependências:
    pip install anthropic

Uso:
    from sitfis_parser import parse_sitfis
    from relatorio_cliente import gerar_relatorio

    rel = parse_sitfis("sitfis.pdf")
    saida = gerar_relatorio(rel, nome_fantasia="Padaria Serra Verde")
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

import anthropic

MODELO = "claude-sonnet-5"   # Opus 5 (claude-opus-5) se quiser mais cuidado na redação


# ---------------------------------------------------------------------------
# Instruções ao modelo
# ---------------------------------------------------------------------------

SYSTEM = """Você redige relatórios de situação fiscal para clientes de um escritório de contabilidade brasileiro (RN Contabilidade, Nova Friburgo/RJ).

Quem lê é o dono da empresa, não um contador. Ele não sabe o que é DCTF, SIEF, PA ou exigibilidade suspensa. Explique em português comum, sem infantilizar.

REGRAS ABSOLUTAS

1. Use exclusivamente os dados do JSON fornecido. Não calcule, não estime, não complete lacuna com conhecimento geral. Se um campo estiver nulo, escreva que a informação não consta no relatório.

2. Todo valor em reais que você escrever deve aparecer literalmente no JSON. Não some pendências para criar um total novo: use apenas total_devido e total_impeditivo, que já vêm calculados.

3. Não recomende conduta. Você descreve a situação e o efeito prático dela. Decisões — parcelar, compensar, contestar, pagar à vista — são do contador responsável e ficam fora do texto. Pode dizer que o escritório entrará em contato para tratar do assunto.

4. Não afirme que a empresa está regular nem que obterá certidão. Quando pode_cnd for verdadeiro, escreva que nenhuma das pendências listadas é, em princípio, impeditiva, e que a certidão precisa ser consultada separadamente.

5. Deixe explícito o escopo: o relatório cobre apenas débitos federais na Receita Federal e na Procuradoria da Fazenda Nacional. Não cobre ICMS estadual, ISS municipal, FGTS nem parcelamentos fora do âmbito federal.

6. Agrupe pendências da mesma natureza em um parágrafo. Não faça lista item a item quando houver repetição do mesmo tipo.

7. Tom: direto e tranquilo. Sem alarmismo, sem minimizar. Nada de "não se preocupe" nem de "situação gravíssima".

GLOSSÁRIO PARA TRADUZIR
- débito em cobrança: valor que a Receita entende devido e ainda não foi pago
- omissão de declaração: uma declaração obrigatória não foi transmitida; costuma gerar multa mesmo sem imposto a pagar
- exigibilidade suspensa: a cobrança está parada por decisão judicial ou administrativa
- parcelamento ativo: dívida sendo paga em prestações, em dia
- dívida ativa da União: o débito saiu da Receita e foi para a Procuradoria, etapa anterior à cobrança judicial

SAÍDA
Responda apenas com JSON válido, sem cercas de código, neste formato:
{
  "titulo": "string",
  "resumo": "2 a 3 frases com o panorama geral",
  "situacao": "limpa" | "atencao" | "critica",
  "secoes": [{"titulo": "string", "texto": "string"}],
  "escopo": "string com a delimitação do que o relatório cobre",
  "proximo_passo": "string curta sobre o que o escritório fará"
}"""


# ---------------------------------------------------------------------------

@dataclass
class Resultado:
    ok: bool
    conteudo: Optional[dict]
    valores_suspeitos: list[str]
    alertas_parser: list[str]
    motivo: Optional[str] = None

    @property
    def precisa_aprovacao(self) -> bool:
        return True  # sempre. não existe publicação automática aqui.


RE_MOEDA = re.compile(r"\d{1,3}(?:\.\d{3})*,\d{2}")


def _valores_permitidos(dados: dict) -> set[str]:
    """Conjunto de todos os valores que o modelo tem direito de citar."""
    out: set[str] = set()

    def fmt(v) -> str:
        return f"{Decimal(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")

    for chave in ("total_devido", "total_impeditivo"):
        if dados.get(chave) is not None:
            out.add(fmt(dados[chave]))

    for p in dados.get("pendencias", []):
        for campo in ("valor_original", "saldo_devedor"):
            if p.get(campo) is not None:
                out.add(fmt(p[campo]))
    return out


def _conferir_numeros(texto: str, permitidos: set[str]) -> list[str]:
    """Devolve os valores citados no texto que NÃO existem nos dados de origem."""
    return [v for v in RE_MOEDA.findall(texto) if v not in permitidos]


def _texto_completo(conteudo: dict) -> str:
    partes = [conteudo.get("resumo", ""), conteudo.get("escopo", ""),
              conteudo.get("proximo_passo", "")]
    partes += [s.get("texto", "") for s in conteudo.get("secoes", [])]
    return "\n".join(partes)


# ---------------------------------------------------------------------------

def gerar_relatorio(rel, nome_fantasia: str, cliente: anthropic.Anthropic | None = None) -> Resultado:
    """
    rel: RelatorioSitfis vindo de sitfis_parser.parse_sitfis
    """
    dados = rel.to_dict()
    dados["nome_fantasia"] = nome_fantasia

    if rel.precisa_revisao:
        # Parser incerto: nem chama o modelo. Vai direto para a mesa do analista.
        return Resultado(
            ok=False, conteudo=None, valores_suspeitos=[],
            alertas_parser=rel.alertas,
            motivo="Extração incompleta ou com bloco não mapeado — revisar antes de redigir.",
        )

    cliente = cliente or anthropic.Anthropic()

    resp = cliente.messages.create(
        model=MODELO,
        max_tokens=4000,
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": (
                "Dados extraídos do Relatório de Situação Fiscal:\n\n"
                + json.dumps(dados, ensure_ascii=False, indent=2)
            ),
        }],
    )

    bruto = "".join(b.text for b in resp.content if b.type == "text").strip()
    bruto = re.sub(r"^```(?:json)?|```$", "", bruto, flags=re.M).strip()

    try:
        conteudo = json.loads(bruto)
    except json.JSONDecodeError as e:
        return Resultado(False, None, [], rel.alertas, f"Resposta não é JSON válido: {e}")

    suspeitos = _conferir_numeros(_texto_completo(conteudo), _valores_permitidos(dados))
    if suspeitos:
        return Resultado(
            ok=False, conteudo=conteudo, valores_suspeitos=suspeitos,
            alertas_parser=rel.alertas,
            motivo=("Valores citados que não constam nos dados extraídos: "
                    + ", ".join(suspeitos)),
        )

    return Resultado(True, conteudo, [], rel.alertas)


# ---------------------------------------------------------------------------
# Lote mensal — Batch API custa metade
# ---------------------------------------------------------------------------

def montar_lote(relatorios: list[tuple[str, object]]) -> list[dict]:
    """
    relatorios: [(nome_fantasia, RelatorioSitfis), ...]
    Devolve requests prontos para client.messages.batches.create(requests=...).
    Relatórios que precisam de revisão ficam de fora do lote de propósito.
    """
    lote = []
    for nome, rel in relatorios:
        if rel.precisa_revisao:
            continue
        dados = rel.to_dict()
        dados["nome_fantasia"] = nome
        lote.append({
            "custom_id": f"sitfis-{rel.cnpj}",
            "params": {
                "model": MODELO,
                "max_tokens": 4000,
                "system": SYSTEM,
                "messages": [{
                    "role": "user",
                    "content": "Dados extraídos do Relatório de Situação Fiscal:\n\n"
                               + json.dumps(dados, ensure_ascii=False, indent=2),
                }],
            },
        })
    return lote


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    from sitfis_parser import parse_sitfis

    rel = parse_sitfis(sys.argv[1])
    r = gerar_relatorio(rel, nome_fantasia=sys.argv[2] if len(sys.argv) > 2 else "Cliente")

    if not r.ok:
        print("BLOQUEADO —", r.motivo)
        for a in r.alertas_parser:
            print("  !", a)
    else:
        print(json.dumps(r.conteudo, ensure_ascii=False, indent=2))
        print("\n>> minuta pronta. publicar só após aprovação.")
