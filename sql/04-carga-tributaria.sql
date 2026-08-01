-- ============================================================
-- ADENDO AO schema-supabase.sql
-- Rodar depois do schema principal e dos adendos anteriores.
--
-- Comparativo de carga tributária: cruza a receita mensal (extraída
-- do extrato do Simples, via apuracao_historico_receita) com o total
-- de guias publicadas daquela competência. Não introduz tabela nova —
-- só views em cima do que o parser já grava. Herda a regra de
-- publicação de quem alimenta cada lado: só enxerga apuração e guia
-- já publicadas.
-- ============================================================

-- ------------------------------------------------------------
-- Carga percentual por competência.
--
-- O histórico de receita é gravado uma vez por apuração (cada extrato
-- mensal do Simples traz os 12 meses anteriores como snapshot). Usar
-- o histórico de TODAS as apurações duplicaria competências que
-- aparecem em mais de um snapshot — por isso pegamos só o histórico
-- da apuração mais recente publicada de cada empresa, que já cobre os
-- últimos 12 meses.
-- ------------------------------------------------------------

create view v_carga_tributaria_mensal as
with ultima_apuracao as (
  select distinct on (empresa_id) id as apuracao_id, empresa_id
  from apuracoes_simples
  where publicada
  order by empresa_id, competencia desc
),
receita as (
  select
    u.empresa_id,
    h.competencia,
    (h.receita_interna + h.receita_exportacao) as receita_bruta
  from apuracao_historico_receita h
  join ultima_apuracao u on u.apuracao_id = h.apuracao_id
),
tributos as (
  select empresa_id, competencia, sum(valor) as total_tributos
  from guias
  where status in ('publicada', 'paga')
    and tipo in ('DAS', 'DARF', 'DARJ', 'GFD', 'DAM')
  group by empresa_id, competencia
)
select
  r.empresa_id,
  r.competencia,
  r.receita_bruta,
  coalesce(t.total_tributos, 0) as total_tributos,
  round(coalesce(t.total_tributos, 0) / r.receita_bruta * 100, 2) as carga_percentual
from receita r
left join tributos t
  on t.empresa_id = r.empresa_id and t.competencia = r.competencia
where r.receita_bruta > 0;  -- evita divisão por zero em competência sem receita registrada

-- ------------------------------------------------------------
-- Resumo por empresa: média, mês de maior e de menor carga.
-- ------------------------------------------------------------

create view v_carga_tributaria_resumo as
select
  empresa_id,
  round(avg(carga_percentual), 2) as carga_media,
  (array_agg(competencia order by carga_percentual desc))[1] as competencia_maior_carga,
  max(carga_percentual) as maior_carga,
  (array_agg(competencia order by carga_percentual asc))[1] as competencia_menor_carga,
  min(carga_percentual) as menor_carga
from v_carga_tributaria_mensal
group by empresa_id;
