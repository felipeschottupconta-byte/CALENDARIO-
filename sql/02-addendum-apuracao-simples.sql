-- ============================================================
-- ADENDO AO schema-supabase.sql
-- Rodar depois do schema principal, uma única vez.
--
-- Cobre duas coisas que apareceram nos arquivos reais e ainda
-- não tinham lugar no banco:
--   1. Guia sem linha digitável, paga por Pix (caso do FGTS Digital)
--   2. Apuração do Simples Nacional, que alimenta o "Entenda seu
--      imposto" — não é a guia em si, é a explicação de como ela
--      foi calculada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Guia paga por Pix (GFD e outras que vierem a usar o mesmo padrão)
-- ------------------------------------------------------------

alter table guias add column if not exists pix_copia_cola text;

-- publicavel, no app, passa a aceitar linha_digitavel OU pix_copia_cola.
-- Isso é regra de aplicação (guia_parser.py já marca), o banco só guarda.

comment on column guias.pix_copia_cola is
  'Payload Pix Copia e Cola, para guias que não têm código de barras (ex.: GFD do FGTS Digital).';

-- ------------------------------------------------------------
-- 2. Apuração do Simples Nacional — "Entenda seu imposto"
-- ------------------------------------------------------------

create table apuracoes_simples (
  id                uuid primary key default uuid_generate_v4(),
  empresa_id        uuid not null references empresas(id) on delete restrict,
  guia_id           uuid references guias(id) on delete set null,  -- vincula ao DAS da mesma competência

  competencia       char(7) not null,          -- 'MM/AAAA'
  anexo             text,                      -- 'Anexo I - Comércio'

  rpa               numeric(14,2),             -- receita do período (regime de competência)
  rbt12             numeric(14,2),              -- receita bruta acumulada 12 meses
  faixa_de          numeric(14,2),
  faixa_ate         numeric(14,2),

  aliquota_nominal  numeric(6,3),
  aliquota_efetiva  numeric(12,10),
  parcela_deduzir   numeric(14,2),
  total_a_recolher  numeric(14,2),

  -- projeção do próximo mês, quando o extrato já traz (Domínio inclui)
  proxima_competencia      char(7),
  proxima_aliquota_efetiva numeric(12,10),

  -- origem e conferência
  storage_path      text,                      -- PDF do extrato no Storage
  arquivo_hash      text unique,
  publicada         boolean not null default false,
  publicada_em      timestamptz,

  criada_em         timestamptz not null default now()
);

create index on apuracoes_simples (empresa_id, competencia desc);
create unique index on apuracoes_simples (empresa_id, competencia);

create table apuracao_tributos (
  id             bigserial primary key,
  apuracao_id    uuid not null references apuracoes_simples(id) on delete cascade,
  nome           text not null,        -- IRPJ, CSLL, COFINS, PIS, INSS/CPP, ICMS, ISS, IPI
  situacao       text,                 -- Tributado | Redução | Isento | Não incidência
  base_calculo   numeric(14,2),
  aliquota       numeric(14,9),        -- alíquota efetiva daquele tributo especificamente
  percentual_reducao numeric(6,3),     -- só quando situacao = 'Redução' (caso do ICMS-RJ)
  valor          numeric(14,2)
);

create index on apuracao_tributos (apuracao_id);

-- histórico de receita dos 12 meses, usado no gráfico do app
create table apuracao_historico_receita (
  id           bigserial primary key,
  apuracao_id  uuid not null references apuracoes_simples(id) on delete cascade,
  competencia  char(7) not null,
  receita_interna numeric(14,2) not null default 0,
  receita_exportacao numeric(14,2) not null default 0
);

create index on apuracao_historico_receita (apuracao_id);

-- ------------------------------------------------------------
-- RLS — mesmo padrão do resto do schema: cliente só vê publicada
-- ------------------------------------------------------------

alter table apuracoes_simples          enable row level security;
alter table apuracao_tributos          enable row level security;
alter table apuracao_historico_receita enable row level security;

create policy "cliente ve apuracao publicada" on apuracoes_simples
  for select using (
    is_staff() or (tem_acesso(empresa_id) and publicada)
  );

create policy "staff escreve apuracao" on apuracoes_simples
  for all using (is_staff()) with check (is_staff());

create policy "ve tributos de apuracao acessivel" on apuracao_tributos
  for select using (
    exists (
      select 1 from apuracoes_simples a
      where a.id = apuracao_id
        and (is_staff() or (tem_acesso(a.empresa_id) and a.publicada))
    )
  );

create policy "staff escreve tributos" on apuracao_tributos
  for all using (is_staff()) with check (is_staff());

create policy "ve historico de apuracao acessivel" on apuracao_historico_receita
  for select using (
    exists (
      select 1 from apuracoes_simples a
      where a.id = apuracao_id
        and (is_staff() or (tem_acesso(a.empresa_id) and a.publicada))
    )
  );

create policy "staff escreve historico" on apuracao_historico_receita
  for all using (is_staff()) with check (is_staff());

-- ------------------------------------------------------------
-- View de apoio: última apuração de cada empresa, com variação
-- de alíquota em relação à projeção do mês seguinte (o aviso
-- "sua alíquota deve subir" do app vem direto daqui).
-- ------------------------------------------------------------

create view v_ultima_apuracao_simples as
select distinct on (empresa_id)
  a.*,
  (proxima_aliquota_efetiva - aliquota_efetiva) as variacao_proxima_aliquota
from apuracoes_simples a
where publicada
order by empresa_id, competencia desc;
