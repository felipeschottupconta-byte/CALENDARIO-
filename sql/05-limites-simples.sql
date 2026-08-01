-- ============================================================
-- ADENDO AO schema-supabase.sql
-- Rodar depois do schema principal e dos adendos anteriores.
--
-- Alerta de faixa e sublimite do Simples Nacional. Limite geral e
-- sublimite de ICMS/ISS vivem em tabela — mudam por lei, não podem
-- exigir deploy pra atualizar (mesmo princípio do catálogo de
-- obrigações).
-- ============================================================

create table limites_simples (
  id                  serial primary key,
  ano                 int not null,
  limite_geral        numeric(14,2) not null,
  sublimite_icms_iss  numeric(14,2) not null,
  vigente             boolean not null default true
);

create unique index on limites_simples (ano) where vigente;

insert into limites_simples (ano, limite_geral, sublimite_icms_iss, vigente)
values (extract(year from current_date)::int, 4800000.00, 3600000.00, true);

-- ------------------------------------------------------------
-- Posição de cada empresa do Simples frente à faixa atual e ao
-- sublimite, com projeção linear simples baseada na média de receita
-- dos últimos 3 meses. Só considera a última apuração publicada —
-- se não há apuração publicada, a empresa não aparece na view.
-- ------------------------------------------------------------

create view v_alerta_faixa_simples as
with ultima_apuracao as (
  select distinct on (empresa_id) *
  from apuracoes_simples
  where publicada
  order by empresa_id, competencia desc
),
historico_recente as (
  select apuracao_id, competencia, receita_interna, receita_exportacao,
         row_number() over (partition by apuracao_id order by competencia desc) as rn
  from apuracao_historico_receita
),
media_recente as (
  select apuracao_id, avg(receita_interna + receita_exportacao) as media_receita_3m
  from historico_recente
  where rn <= 3
  group by apuracao_id
),
limite_vigente as (
  select limite_geral, sublimite_icms_iss
  from limites_simples
  where vigente
  order by ano desc
  limit 1
)
select
  e.id as empresa_id,
  e.razao_social,
  a.competencia,
  a.rbt12 as rbt12_atual,
  a.faixa_de,
  a.faixa_ate,
  l.sublimite_icms_iss,
  l.limite_geral,
  round(100.0 * (a.rbt12 - a.faixa_de) / nullif(a.faixa_ate - a.faixa_de, 0), 2) as percentual_da_faixa,
  round(100.0 * a.rbt12 / nullif(l.sublimite_icms_iss, 0), 2) as percentual_do_sublimite,
  round(100.0 * a.rbt12 / nullif(l.limite_geral, 0), 2) as percentual_do_limite_geral,
  round(m.media_receita_3m, 2) as media_receita_3m,
  case
    when a.rbt12 >= l.sublimite_icms_iss then null              -- já ultrapassou
    when coalesce(m.media_receita_3m, 0) <= 0 then null          -- sem ritmo pra projetar
    else ceil((l.sublimite_icms_iss - a.rbt12) / m.media_receita_3m)
  end as meses_ate_sublimite
from empresas e
join ultima_apuracao a on a.empresa_id = e.id
left join media_recente m on m.apuracao_id = a.id
cross join limite_vigente l
where e.regime = 'simples';
