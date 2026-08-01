"""
Testes de parsers/extrato_simples_parser.py — foco na correção crítica de
extratos com mais de um anexo do Simples Nacional.

PURO ESTILO MODA INTIMA LTDA (fixtures/extrato_puro_estilo_062026.pdf) é o
caso real que expôs o bug: a empresa revende (Anexo I) e industrializa
(Anexo II) na mesma competência. O parser antigo lia só o primeiro anexo e
reportava R$ 659,72 em vez de R$ 12.555,03 — 95% do imposto sumia, sem
gerar nenhum alerta.

SU LINGERIE LTDA (fixtures/extrato_su_lingerie_062026.pdf) é um extrato
real de anexo único, usado para garantir que a reestruturação não quebrou
o caso comum. É também o extrato real por trás do caso documentado de
arredondamento entre extrato (R$ 3.132,17) e guia (R$ 3.132,16).

GATA SERRANA não tem PDF real disponível neste repositório — o texto abaixo
é sintético, mas segue exatamente o formato confirmado nos dois documentos
reais acima (mesmos rótulos, mesma estrutura de seção de apuração e de
memória de cálculo).
"""

import sys
from decimal import Decimal
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "parsers"))
import extrato_simples_parser as mod

FIXTURES = Path(__file__).resolve().parent / "fixtures"

TEXTO_GATA_SERRANA = """Empresa:
Emissão:
Página: 0001
05/07/2026
GATA SERRANA LINGERIE LTDA
CNPJ: 52.276.638/0001-53
Início das atividades: 10/03/2019
CPF Responsável:
Código de Acesso:
Período:
096.149.117-51
706353663764
06/2026

SIMPLES NACIONAL
Total de Receitas Brutas (R$) Mercado Interno Mercado Externo Total
Receita Bruta do período de Apuração (RPA) -
Regime de Competência 177.391,27 0,00 177.391,27
Receita bruta acumulada nos doze meses anteriores
ao período de apuração (RBT12) 2.113.572,55 0,00 2.113.572,55
Faixa de Enquadramento: 1.800.000,01 a 3.600.000,00 0,00 a 0,00
Estabelecimento: 640 GATA SERRANA LINGERIE LTDA CNPJ: 52.276.638/0001-53
Anexo: Anexo I - Comércio
Seção: Seção I - Receitas decorrentes da revenda de mercadorias não sujeitas a substituição tributária, exceto as receitas
decorrentes de exportação
Tabela: Tabela 1 - Sem substituição tributária
Receita Tributada Total: 177.391,27 Alíquota: 10,1695527153776 Simples Nacional Total: 17.844,70
Percentual de Redução: 3,23
Partilha: IRPJ CSLL COFINS PIS INSS/CPP ICMS
Situação: Tributado Tributado Tributado Tributado Tributado Redução
Base de Cálculo: 177.391,27 177.391,27 177.391,27 177.391,27 177.391,27 177.391,27
Alíquota: 0,559325399 0,355934345 1,295601016 0,280679655 4,271212140 3,406800160
Valor: 992,19 631,40 2.298,28 497,90 7.576,76 5.848,17
Outros Acréscimos: 0,00
Outras Deduções: 0,00
Valor Diferido: 0,00
Valor Fixo ICMS: 0,00
Valor Fixo ISS: 0,00
Simples Nacional a recolher: 17.844,70
Sistema licenciado para R N CUNHA CONTABILIDADE LTDA

MEMÓRIA DE CÁLCULO SIMPLES NACIONAL
GATA SERRANA LINGERIE LTDA
CNPJ: 52.276.638/0001-53
Competência: 06/2026
Anexo: Anexo I - Comércio
Seção: Seção I - Receitas decorrentes da revenda de mercadorias não sujeitas a substituição tributária, exceto as receitas decorrentes de exportação
Tabela: Tabela 1 - Sem substituição tributária
Cálculo da alíquota efetiva - Impostos federais
( x ) Alíquota nominal: 14,30% ( ÷ ) RBT12: 2.113.572,55
( = ) Alíquota nominal: 14,30% ( = ) Resultado 1: 302.240,88 ( = ) Alíquota efetiva: 10,1695527153776%
( = ) Parcela a deduzir: 189.000,00 ( + ) Resultado 1: 302.240,88
Simples Nacional a recolher: 17.844,70

SIMPLES NACIONAL - ANEXO
Período Receita Bruta, Exceto Exportação de Mercadorias Receita Bruta Exportação de Mercadorias
06/2025 25.320,69 0,00
07/2025 62.246,98 0,00
08/2025 134.346,45 0,00
09/2025 206.962,87 0,00
10/2025 160.162,95 0,00
11/2025 190.049,67 0,00
12/2025 148.236,18 0,00
01/2026 186.884,71 0,00
02/2026 230.728,71 0,00
03/2026 261.458,94 0,00
04/2026 272.062,59 0,00
05/2026 235.111,81 0,00
Total: 2.113.572,55 0,00
"""


def _fake_pdfplumber_open(texto):
    class FakePage:
        def extract_text(self_inner):
            return texto

    class FakePDF:
        def __enter__(self_inner):
            self_inner.pages = [FakePage()]
            return self_inner

        def __exit__(self_inner, *a):
            return False

    return lambda caminho: FakePDF()


# ------------------------------------------------------------
# Puro Estilo — arquivo real, dois anexos (o caso do bug)
# ------------------------------------------------------------

def test_puro_estilo_dois_anexos():
    e = mod.parse_extrato_simples(FIXTURES / "extrato_puro_estilo_062026.pdf")

    assert len(e.anexos) == 2
    assert e.anexos[0].anexo == "Anexo I - Comércio"
    assert e.anexos[0].subtotal == Decimal("659.72")
    assert e.anexos[1].anexo == "Anexo II - Indústria"
    assert e.anexos[1].subtotal == Decimal("11895.31")
    assert e.total_a_recolher == Decimal("12555.03")


def test_puro_estilo_soma_dos_subtotais_bate_com_total():
    e = mod.parse_extrato_simples(FIXTURES / "extrato_puro_estilo_062026.pdf")
    soma = sum(a.subtotal for a in e.anexos)
    assert soma == e.total_a_recolher


def test_puro_estilo_ipi_so_no_anexo_ii():
    e = mod.parse_extrato_simples(FIXTURES / "extrato_puro_estilo_062026.pdf")
    nomes_anexo_1 = [t.nome for t in e.anexos[0].tributos]
    nomes_anexo_2 = [t.nome for t in e.anexos[1].tributos]
    assert "IPI" not in nomes_anexo_1
    assert "IPI" in nomes_anexo_2


def test_puro_estilo_sem_alertas():
    e = mod.parse_extrato_simples(FIXTURES / "extrato_puro_estilo_062026.pdf")
    assert e.alertas == []


def test_puro_estilo_multiplos_anexos_e_consolidado():
    e = mod.parse_extrato_simples(FIXTURES / "extrato_puro_estilo_062026.pdf")
    assert e.multiplos_anexos is True

    consolidado = {t.nome: t.valor for t in e.tributos_consolidados}
    # IRPJ aparece nos dois anexos: 37,25 (Anexo I) + 672,84 (Anexo II)
    assert consolidado["IRPJ"] == Decimal("37.25") + Decimal("672.84")
    # IPI só existe no Anexo II
    assert consolidado["IPI"] == Decimal("917.52")

    # alíquota efetiva média, ponderada pela receita tributada de cada anexo
    receita_total = Decimal("7609.32") + Decimal("130140.92")
    esperado = (
        Decimal("8.9002224956942") * Decimal("7609.32")
        + Decimal("9.4002224956942") * Decimal("130140.92")
    ) / receita_total
    assert abs(e.aliquota_efetiva_media - esperado) < Decimal("0.0000001")


# ------------------------------------------------------------
# Su Lingerie — arquivo real, anexo único (não pode regredir)
# ------------------------------------------------------------

def test_su_lingerie_anexo_unico():
    e = mod.parse_extrato_simples(FIXTURES / "extrato_su_lingerie_062026.pdf")
    assert len(e.anexos) == 1
    assert e.multiplos_anexos is False
    assert e.anexos[0].anexo == "Anexo I - Comércio"
    assert e.total_a_recolher == Decimal("3132.17")
    assert e.anexos[0].subtotal == Decimal("3132.17")
    assert e.alertas == []


def test_su_lingerie_validacao_contra_guia_ignora_diferenca_de_um_centavo():
    # Caso real: extrato R$ 3.132,17, guia (DAS) R$ 3.132,16.
    e = mod.parse_extrato_simples(
        FIXTURES / "extrato_su_lingerie_062026.pdf",
        valor_guia_das=Decimal("3132.16"),
    )
    assert not any("diverge do valor da guia" in a for a in e.alertas)


def test_su_lingerie_validacao_contra_guia_alerta_diferenca_grande():
    e = mod.parse_extrato_simples(
        FIXTURES / "extrato_su_lingerie_062026.pdf",
        valor_guia_das=Decimal("2900.00"),
    )
    assert any("diverge do valor da guia" in a for a in e.alertas)


# ------------------------------------------------------------
# Gata Serrana — sem PDF real no repo; texto sintético fiel ao formato
# confirmado nos dois documentos reais acima.
# ------------------------------------------------------------

def test_gata_serrana_anexo_unico_sem_regressao():
    with mock.patch.object(mod.pdfplumber, "open", _fake_pdfplumber_open(TEXTO_GATA_SERRANA)):
        e = mod.parse_extrato_simples("gata_serrana.pdf")

    assert len(e.anexos) == 1
    assert e.total_a_recolher == Decimal("17844.70")
    assert e.anexos[0].subtotal == Decimal("17844.70")
    assert e.razao_social == "GATA SERRANA LINGERIE LTDA"
    assert e.alertas == []
