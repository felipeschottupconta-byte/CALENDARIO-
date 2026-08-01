// src/lib/queries.js
// ============================================================
// Leituras do app do cliente. A RLS já garante o isolamento por
// empresa — estas funções nunca filtram por empresa "a mais" no
// código; se um select vier vazio, é porque a RLS bloqueou, não
// porque esquecemos um .eq(). Ver CLAUDE.md, invariante 2.
//
// Cobertura atual: empresas do usuário, guias, parcelamento (quando a
// parcela publicada estiver linkada à guia), carga tributária e
// sublimite do Simples, e a apuração de "Entenda seu imposto" — só no
// formato de anexo único, que é o que o schema hoje suporta.
//
// Ainda NÃO ligado (gap conhecido, não inventar dado pra cobrir):
//   - agenda (depende do motor de regra agenda-fiscal.js, não
//     integrado ao banco ainda)
//   - panorama fiscal (SITFIS) — sem tabela própria no schema
//   - "Entenda seu imposto" com múltiplos anexos — apuracoes_simples
//     grava um anexo por linha, o parser novo devolve uma lista
// ============================================================

import { supabase } from "./supabase";

const MESES_ORDEM = (comp) => comp; // "MM/AAAA", já ordenável como string

export async function carregarEmpresasDoUsuario(usuarioId) {
  const { data, error } = await supabase
    .from("usuario_empresa")
    .select("empresa_id, empresas(*)")
    .eq("usuario_id", usuarioId);

  if (error) throw error;

  const empresas = {};
  for (const linha of data || []) {
    const e = linha.empresas;
    if (!e) continue;
    empresas[e.id] = {
      id: e.id,
      razao: e.razao_social,
      fantasia: e.nome_fantasia || e.razao_social,
      cnpj: formatarCnpj(e.cnpj),
      regime: rotuloRegime(e.regime),
      situacao: e.ativa ? "Ativa" : "Inativa",
      grupo: e.id, // sem campo de grupo econômico no schema hoje — cada empresa é seu próprio grupo
      guias: [],
      agenda: [],
      panorama: null,
    };
  }
  return empresas;
}

export async function carregarGuiasDaEmpresa(empresaId) {
  const { data: guias, error } = await supabase
    .from("guias")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("vencimento", { ascending: true });
  if (error) throw error;
  if (!guias || guias.length === 0) return [];

  const ids = guias.map((g) => g.id);

  const [{ data: apuracoes }, { data: parcelas }] = await Promise.all([
    supabase
      .from("apuracoes_simples")
      .select("*, apuracao_tributos(*), apuracao_historico_receita(*)")
      .in("guia_id", ids)
      .eq("publicada", true),
    supabase
      .from("parcelamento_parcelas")
      .select("*, parcelamentos(*)")
      .in("guia_id", ids),
  ]);

  const apuracaoPorGuia = {};
  for (const a of apuracoes || []) apuracaoPorGuia[a.guia_id] = a;

  const parcelaPorGuia = {};
  for (const p of parcelas || []) parcelaPorGuia[p.guia_id] = p;

  // parcelas irmãs (próximas/pagas) de cada parcelamento que apareceu
  const idsParcelamento = [...new Set((parcelas || []).map((p) => p.parcelamento_id))];
  let parcelasPorParcelamento = {};
  if (idsParcelamento.length) {
    const { data: todas } = await supabase
      .from("parcelamento_parcelas")
      .select("*")
      .in("parcelamento_id", idsParcelamento);
    for (const p of todas || []) {
      (parcelasPorParcelamento[p.parcelamento_id] ||= []).push(p);
    }
  }

  return guias.map((g) => {
    const item = {
      id: g.id,
      tipo: g.tipo,
      nome: g.descricao,
      orgao: "", // schema não guarda o órgão emissor na guia hoje — ver nota no topo do arquivo
      comp: g.competencia,
      venc: g.vencimento,
      valor: g.valor != null ? Number(g.valor) : null,
      linha: g.linha_digitavel,
      pix: !!g.pix_copia_cola,
      pixPayload: g.pix_copia_cola,
      novo: !g.vista_em,
    };

    const apuracao = apuracaoPorGuia[g.id];
    if (apuracao) {
      item.entenda = {
        anexo: apuracao.anexo,
        rpa: numero(apuracao.rpa),
        rbt12: numero(apuracao.rbt12),
        faixaDe: numero(apuracao.faixa_de),
        faixaAte: numero(apuracao.faixa_ate),
        aliquotaNominal: numero(apuracao.aliquota_nominal),
        aliquotaEfetiva: numero(apuracao.aliquota_efetiva),
        tributos: (apuracao.apuracao_tributos || []).map((t) => ({
          nome: t.nome, situacao: t.situacao,
          aliquota: numero(t.aliquota), valor: numero(t.valor),
          reducao: numero(t.percentual_reducao),
        })),
        historico: (apuracao.apuracao_historico_receita || [])
          .slice()
          .sort((a, b) => MESES_ORDEM(a.competencia).localeCompare(MESES_ORDEM(b.competencia)))
          .map((h) => ({ comp: h.competencia, receita: numero(h.receita_interna) + numero(h.receita_exportacao) })),
        proximo: apuracao.proxima_competencia
          ? { comp: apuracao.proxima_competencia, aliquotaEfetiva: numero(apuracao.proxima_aliquota_efetiva) }
          : null,
      };
    }

    const parcela = parcelaPorGuia[g.id];
    if (parcela && parcela.parcelamentos) {
      const pl = parcela.parcelamentos;
      const irmas = (parcelasPorParcelamento[pl.id] || [])
        .filter((p) => p.numero !== pl.parcela_atual)
        .map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: numero(p.valor), paga: p.paga, pagaEm: p.paga_em }));
      item.parcelamento = {
        numeroProcesso: pl.numero_processo,
        totalParcelas: pl.total_parcelas,
        parcelaAtual: pl.parcela_atual,
        valorParcela: numero(pl.valor_parcela),
        dataQuitacaoPrevista: pl.data_quitacao_prevista,
        parcelas: irmas,
      };
    }

    return item;
  });
}

export async function carregarCargaTributaria(empresaId) {
  const [{ data: mensal }, { data: resumo }] = await Promise.all([
    supabase.from("v_carga_tributaria_mensal").select("*").eq("empresa_id", empresaId).order("competencia"),
    supabase.from("v_carga_tributaria_resumo").select("*").eq("empresa_id", empresaId).maybeSingle(),
  ]);
  if (!mensal || mensal.length === 0 || !resumo) return null;
  return {
    serie: mensal.map((m) => ({ comp: m.competencia, cargaPercentual: numero(m.carga_percentual) })),
    mediaPercentual: numero(resumo.carga_media),
    maior: { comp: resumo.competencia_maior_carga, cargaPercentual: numero(resumo.maior_carga) },
    menor: { comp: resumo.competencia_menor_carga, cargaPercentual: numero(resumo.menor_carga) },
  };
}

export async function carregarLimiteSimples(empresaId) {
  const { data } = await supabase.from("v_alerta_faixa_simples").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (!data) return null;
  return {
    rbt12Atual: numero(data.rbt12_atual),
    faixaDe: numero(data.faixa_de),
    faixaAte: numero(data.faixa_ate),
    sublimiteIcmsIss: numero(data.sublimite_icms_iss),
    limiteGeral: numero(data.limite_geral),
    mesesAteSublimite: data.meses_ate_sublimite,
  };
}

// Best-effort: quem chama não precisa aguardar nem tratar erro — perder um
// evento de 'vista'/'baixada' não pode travar a navegação do cliente.
export async function registrarEvento(guiaId, tipo, meta = null) {
  try {
    const { data: sessao } = await supabase.auth.getSession();
    const usuarioId = sessao?.session?.user?.id;
    if (!usuarioId) return;
    await supabase.from("guia_eventos").insert({ guia_id: guiaId, tipo, usuario_id: usuarioId, meta });
  } catch {
    // silencioso de propósito — ver comentário acima
  }
}

function numero(v) {
  return v == null ? null : Number(v);
}

function formatarCnpj(c) {
  return c ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c;
}

function rotuloRegime(r) {
  return { simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real", mei: "MEI", imune: "Imune" }[r] || r;
}
