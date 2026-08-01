-- ============================================================
-- ADENDO AO schema-supabase.sql
-- Rodar depois do schema principal (e do 02-addendum), uma única vez.
--
-- Parcelamentos de débito (PERT, REFIS estaduais/municipais, parcelamento
-- simplificado do Simples etc.) e o cronograma de parcelas de cada um.
-- Mesma lógica de publicação do resto do app: nada aparece pro cliente
-- até o escritório marcar `publicado`.
-- ============================================================

create type situacao_parcelamento as enum ('ativo', 'quitado', 'rescindido', 'suspenso');

create table parcelamentos (
  id                    uuid primary key default uuid_generate_v4(),
  empresa_id            uuid not null references empresas(id) on delete restrict,

  tipo                  text not null,          -- 'PERT','Simples Nacional','ICMS-RJ','ISS','Previdenciário','Outro'
  orgao                 text not null,           -- 'RFB','PGFN','SEFAZ-RJ','Prefeitura'
  numero_processo       text,
  competencia_inicio    char(7),                -- 'MM/AAAA', competência do débito original

  valor_total           numeric(14,2) not null,
  valor_entrada         numeric(14,2),
  total_parcelas        int not null check (total_parcelas > 0),
  parcela_atual         int not null default 1 check (parcela_atual > 0),
  valor_parcela         numeric(14,2) not null,
  dia_vencimento        int check (dia_vencimento between 1 and 31),

  data_adesao           date,
  data_quitacao_prevista date,

  situacao              situacao_parcelamento not null default 'ativo',
  observacao            text,

  publicado             boolean not null default false,
  criado_em             timestamptz not null default now(),

  check (parcela_atual <= total_parcelas)
);

create index on parcelamentos (empresa_id);
create index on parcelamentos (situacao) where situacao = 'ativo';

-- Cronograma de cada parcelamento. Uma linha por parcela, vinculável à
-- guia real quando o escritório emite o DARF/GPS daquela competência.
create table parcelamento_parcelas (
  id                bigserial primary key,
  parcelamento_id   uuid not null references parcelamentos(id) on delete cascade,

  numero            int not null,
  competencia       char(7),
  vencimento        date not null,
  valor             numeric(14,2) not null,
  guia_id           uuid references guias(id) on delete set null,

  paga              boolean not null default false,
  paga_em           date
);

create unique index on parcelamento_parcelas (parcelamento_id, numero);
create index on parcelamento_parcelas (parcelamento_id, vencimento);
create index on parcelamento_parcelas (vencimento) where not paga;

-- ------------------------------------------------------------
-- RLS — mesmo padrão do resto do schema: cliente só vê publicado
-- ------------------------------------------------------------

alter table parcelamentos          enable row level security;
alter table parcelamento_parcelas  enable row level security;

create policy "cliente ve parcelamentos publicados" on parcelamentos
  for select using (
    is_staff() or (tem_acesso(empresa_id) and publicado)
  );

create policy "staff escreve parcelamentos" on parcelamentos
  for all using (is_staff()) with check (is_staff());

create policy "ve parcelas de parcelamento acessivel" on parcelamento_parcelas
  for select using (
    exists (
      select 1 from parcelamentos p
      where p.id = parcelamento_id
        and (is_staff() or (tem_acesso(p.empresa_id) and p.publicado))
    )
  );

create policy "staff escreve parcelas" on parcelamento_parcelas
  for all using (is_staff()) with check (is_staff());

-- ------------------------------------------------------------
-- View de apoio: parcelamentos ativos com saldo devedor e avanço,
-- mais a próxima parcela em aberto (o card do app lê daqui).
-- ------------------------------------------------------------

create view v_parcelamentos_ativos as
select
  p.*,
  (p.total_parcelas - p.parcela_atual + 1)                              as parcelas_restantes,
  p.valor_parcela * (p.total_parcelas - p.parcela_atual + 1)            as saldo_devedor,
  round(100.0 * (p.parcela_atual - 1) / p.total_parcelas, 1)            as percentual_concluido,
  prox.vencimento as proxima_parcela_vencimento,
  prox.valor      as proxima_parcela_valor
from parcelamentos p
left join lateral (
  select vencimento, valor
  from parcelamento_parcelas
  where parcelamento_id = p.id and not paga
  order by vencimento
  limit 1
) prox on true
where p.situacao = 'ativo';
