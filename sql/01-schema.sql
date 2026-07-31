-- ============================================================
-- PORTAL DO CLIENTE — RN Contabilidade
-- Schema Supabase (Postgres) · v1
--
-- Ordem de execução: rode este arquivo inteiro no SQL Editor.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. EMPRESAS E ACESSO
-- ============================================================

create type regime_tributario as enum ('simples', 'presumido', 'real', 'mei', 'imune');

create table empresas (
  id                uuid primary key default uuid_generate_v4(),
  cnpj              char(14) not null unique,          -- só dígitos
  razao_social      text not null,
  nome_fantasia     text,
  regime            regime_tributario not null,
  inscricao_estadual text,
  inscricao_municipal text,
  municipio         text not null default 'Nova Friburgo',
  uf                char(2) not null default 'RJ',
  endereco          text,
  data_abertura     date,
  ativa             boolean not null default true,

  -- perfil que alimenta o motor de agenda
  tem_funcionarios      boolean not null default false,
  tem_prolabore         boolean not null default false,
  contribuinte_icms     boolean not null default false,
  contribuinte_iss      boolean not null default false,

  -- pasta de origem no servidor do escritório (watcher)
  pasta_origem      text,

  criada_em         timestamptz not null default now(),
  atualizada_em     timestamptz not null default now()
);

create index on empresas (cnpj);
create index on empresas (ativa) where ativa;

-- Perfil espelha auth.users. Papel define staff vs cliente.
create type papel_usuario as enum ('cliente', 'colaborador', 'admin');

create table perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null,
  telefone    text,
  papel       papel_usuario not null default 'cliente',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Um usuário pode ver várias empresas (grupo econômico, contador do cliente).
create table usuario_empresa (
  usuario_id  uuid not null references perfis(id) on delete cascade,
  empresa_id  uuid not null references empresas(id) on delete cascade,
  pode_pedir  boolean not null default true,   -- pode abrir solicitações
  criado_em   timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);

create index on usuario_empresa (empresa_id);

-- Função auxiliar: usuário é staff do escritório?
create or replace function is_staff()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and papel in ('colaborador','admin') and ativo
  );
$$;

-- Função auxiliar: usuário tem acesso a esta empresa?
create or replace function tem_acesso(p_empresa uuid)
returns boolean language sql stable security definer as $$
  select is_staff() or exists (
    select 1 from usuario_empresa
    where usuario_id = auth.uid() and empresa_id = p_empresa
  );
$$;

-- ============================================================
-- 2. CATÁLOGO DE OBRIGAÇÕES  (dado, não código)
-- ============================================================

create type grupo_obrigacao as enum ('guia', 'dp', 'obrigacao', 'voce');

create table obrigacoes (
  id            text primary key,                -- 'das', 'fgts', 'iss'...
  nome          text not null,
  grupo         grupo_obrigacao not null,
  regra         jsonb not null,                  -- { tipo:'diaFixo', dia:20 }
  regimes       regime_tributario[],             -- null = todos
  meses         smallint[],                      -- null = todo mês
  exige_funcionarios boolean not null default false,
  exige_icms         boolean not null default false,
  exige_iss          boolean not null default false,
  ativa         boolean not null default true,
  ordem         smallint not null default 100
);

-- Exceções por empresa (parcelamentos, ICMS-ST, prazo especial)
create table obrigacoes_empresa (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  obrigacao_id  text references obrigacoes(id),
  nome_custom   text,
  regra_custom  jsonb,
  desativada    boolean not null default false,
  observacao    text
);

create index on obrigacoes_empresa (empresa_id);

-- ============================================================
-- 3. GUIAS E DOCUMENTOS
-- ============================================================

create type status_guia as enum (
  'processando',   -- watcher pegou o arquivo, ainda classificando
  'revisao',       -- classificação incerta ou CNPJ divergente
  'publicada',     -- visível para o cliente
  'paga',
  'cancelada'
);

create table guias (
  id              uuid primary key default uuid_generate_v4(),
  empresa_id      uuid not null references empresas(id) on delete restrict,
  obrigacao_id    text references obrigacoes(id),

  tipo            text not null,                 -- 'DAS','FGTS','DARF','ISS'
  descricao       text not null,
  competencia     char(7),                       -- 'MM/AAAA'
  vencimento      date not null,
  valor           numeric(14,2),
  linha_digitavel text,
  codigo_barras   text,

  status          status_guia not null default 'processando',
  paga_em         date,
  paga_marcada_por uuid references perfis(id),

  -- arquivo
  storage_path    text,                          -- guias/{empresa}/{ano}/{arquivo}.pdf
  arquivo_hash    text unique,                   -- sha256: impede duplicata
  arquivo_bytes   integer,
  nome_original   text,

  -- classificação
  origem          text not null default 'watcher',  -- watcher | manual | api
  confianca       numeric(4,3),                     -- 0..1 do classificador
  classificado_por text,                            -- 'regex:das_v2' | 'llm' | 'humano'
  revisado_por    uuid references perfis(id),
  revisado_em     timestamptz,

  -- espelhos do log (para consulta rápida; a verdade está em guia_eventos)
  publicada_em         timestamptz,
  notificada_em        timestamptz,
  vista_em             timestamptz,
  baixada_em           timestamptz,

  criada_em       timestamptz not null default now()
);

create index on guias (empresa_id, vencimento desc);
create index on guias (status) where status in ('revisao','processando');
create index on guias (vencimento) where status = 'publicada';
-- para o relatório "publicada e nunca vista"
create index on guias (empresa_id) where status = 'publicada' and vista_em is null;

-- Documentos que não são guia (folha, balancete, certidão, contrato)
create table documentos (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid not null references empresas(id) on delete restrict,
  categoria     text not null,                  -- 'Departamento Pessoal', 'Contábil'...
  titulo        text not null,
  referencia    char(7),                        -- competência, se houver
  storage_path  text not null,
  arquivo_hash  text,
  arquivo_bytes integer,
  publicado     boolean not null default false,
  publicado_em  timestamptz,
  vista_em      timestamptz,
  baixada_em    timestamptz,
  criado_em     timestamptz not null default now()
);

create index on documentos (empresa_id, criado_em desc);

-- ============================================================
-- 4. LOG DE EVENTOS  — append-only, é a prova
-- ============================================================

create type tipo_evento as enum (
  'publicada',      -- escritório liberou
  'notificada',     -- push/e-mail disparado
  'entregue',       -- push confirmado pelo dispositivo
  'vista',          -- cliente abriu a tela da guia
  'baixada',        -- cliente gerou o PDF / copiou o código
  'marcada_paga'    -- cliente declarou pagamento
);

create table guia_eventos (
  id          bigserial primary key,
  guia_id     uuid references guias(id) on delete cascade,
  documento_id uuid references documentos(id) on delete cascade,
  tipo        tipo_evento not null,
  usuario_id  uuid references perfis(id),
  ocorrido_em timestamptz not null default now(),
  ip          inet,
  user_agent  text,
  meta        jsonb,
  check (guia_id is not null or documento_id is not null)
);

create index on guia_eventos (guia_id, ocorrido_em);
create index on guia_eventos (tipo, ocorrido_em desc);

-- Atualiza os espelhos na guia sem perder o log
create or replace function sync_guia_espelhos()
returns trigger language plpgsql as $$
begin
  if new.guia_id is null then return new; end if;
  update guias set
    publicada_em  = case when new.tipo='publicada'  and publicada_em  is null then new.ocorrido_em else publicada_em  end,
    notificada_em = case when new.tipo='notificada' and notificada_em is null then new.ocorrido_em else notificada_em end,
    vista_em      = case when new.tipo='vista'      and vista_em      is null then new.ocorrido_em else vista_em      end,
    baixada_em    = case when new.tipo='baixada'    and baixada_em    is null then new.ocorrido_em else baixada_em    end
  where id = new.guia_id;
  return new;
end $$;

create trigger trg_sync_espelhos
after insert on guia_eventos
for each row execute function sync_guia_espelhos();

-- ============================================================
-- 5. FILA DE AVISOS AO ESCRITÓRIO
-- Edge Function lê pendentes e envia e-mail (Resend/SendGrid).
-- ============================================================

create table avisos_escritorio (
  id          bigserial primary key,
  tipo        text not null,        -- 'primeira_visualizacao','nao_visualizou','pedido_novo','guia_revisao'
  empresa_id  uuid references empresas(id),
  guia_id     uuid references guias(id),
  assunto     text not null,
  corpo       text not null,
  destinatarios text[] not null,
  criado_em   timestamptz not null default now(),
  enviado_em  timestamptz,
  erro        text
);

create index on avisos_escritorio (criado_em) where enviado_em is null;

-- Gatilho: primeira visualização de uma guia gera aviso
create or replace function aviso_primeira_visualizacao()
returns trigger language plpgsql as $$
declare v_guia guias%rowtype; v_emp empresas%rowtype; v_nome text;
begin
  if new.tipo <> 'vista' or new.guia_id is null then return new; end if;

  select * into v_guia from guias where id = new.guia_id;
  if v_guia.vista_em is not null and v_guia.vista_em < new.ocorrido_em then
    return new;  -- já tinha sido vista antes
  end if;

  select * into v_emp from empresas where id = v_guia.empresa_id;
  select nome into v_nome from perfis where id = new.usuario_id;

  insert into avisos_escritorio (tipo, empresa_id, guia_id, assunto, corpo, destinatarios)
  values (
    'primeira_visualizacao', v_emp.id, v_guia.id,
    format('%s visualizou a guia %s %s', v_emp.nome_fantasia, v_guia.tipo, v_guia.competencia),
    format('%s (%s) abriu a guia %s de %s, no valor de R$ %s, em %s.',
           coalesce(v_nome,'Usuário'), v_emp.razao_social, v_guia.tipo,
           v_guia.competencia, coalesce(v_guia.valor::text,'—'),
           to_char(new.ocorrido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')),
    array['fiscal@rncontabilidade.com.br']
  );
  return new;
end $$;

create trigger trg_aviso_visualizacao
after insert on guia_eventos
for each row execute function aviso_primeira_visualizacao();

-- ============================================================
-- 6. PEDIDOS DO CLIENTE
-- ============================================================

create type status_pedido as enum ('recebido','andamento','aguardando_cliente','concluido','cancelado');

create table pedidos (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid not null references empresas(id) on delete restrict,
  aberto_por    uuid not null references perfis(id),
  tipo          text not null,
  descricao     text,
  status        status_pedido not null default 'recebido',
  responsavel   uuid references perfis(id),
  prazo         date,
  criado_em     timestamptz not null default now(),
  concluido_em  timestamptz
);

create table pedido_mensagens (
  id          bigserial primary key,
  pedido_id   uuid not null references pedidos(id) on delete cascade,
  autor_id    uuid not null references perfis(id),
  texto       text,
  anexo_path  text,
  criado_em   timestamptz not null default now()
);

create index on pedidos (empresa_id, criado_em desc);
create index on pedidos (status) where status <> 'concluido';

-- ============================================================
-- 7. RLS — isolamento por empresa
-- ============================================================

alter table empresas            enable row level security;
alter table perfis              enable row level security;
alter table usuario_empresa     enable row level security;
alter table guias               enable row level security;
alter table documentos          enable row level security;
alter table guia_eventos        enable row level security;
alter table pedidos             enable row level security;
alter table pedido_mensagens    enable row level security;
alter table obrigacoes_empresa  enable row level security;
alter table avisos_escritorio   enable row level security;

create policy "ve a propria empresa" on empresas
  for select using (tem_acesso(id));

create policy "ve o proprio perfil" on perfis
  for select using (id = auth.uid() or is_staff());

create policy "ve os proprios vinculos" on usuario_empresa
  for select using (usuario_id = auth.uid() or is_staff());

-- Cliente só enxerga guia PUBLICADA da empresa dele.
-- Guia em 'processando' ou 'revisao' é invisível — não vaza erro de classificação.
create policy "cliente ve guias publicadas" on guias
  for select using (
    is_staff() or (tem_acesso(empresa_id) and status in ('publicada','paga'))
  );

create policy "staff escreve guias" on guias
  for all using (is_staff()) with check (is_staff());

create policy "cliente ve documentos publicados" on documentos
  for select using (
    is_staff() or (tem_acesso(empresa_id) and publicado)
  );

-- Cliente só grava evento sobre guia que ele pode ver, e só como ele mesmo.
create policy "cliente registra proprio evento" on guia_eventos
  for insert with check (
    usuario_id = auth.uid()
    and tipo in ('vista','baixada','marcada_paga','entregue')
    and exists (
      select 1 from guias g
      where g.id = guia_eventos.guia_id and tem_acesso(g.empresa_id)
    )
  );

create policy "staff le eventos" on guia_eventos
  for select using (is_staff());

create policy "cliente ve pedidos da empresa" on pedidos
  for select using (tem_acesso(empresa_id));

create policy "cliente abre pedido" on pedidos
  for insert with check (
    aberto_por = auth.uid()
    and exists (
      select 1 from usuario_empresa ue
      where ue.usuario_id = auth.uid()
        and ue.empresa_id = pedidos.empresa_id
        and ue.pode_pedir
    )
  );

create policy "mensagens do proprio pedido" on pedido_mensagens
  for select using (
    exists (select 1 from pedidos p where p.id = pedido_id and tem_acesso(p.empresa_id))
  );

create policy "escreve mensagem no proprio pedido" on pedido_mensagens
  for insert with check (
    autor_id = auth.uid()
    and exists (select 1 from pedidos p where p.id = pedido_id and tem_acesso(p.empresa_id))
  );

create policy "so staff ve avisos" on avisos_escritorio
  for select using (is_staff());

-- ============================================================
-- 8. STORAGE
-- Bucket privado. Download NUNCA é link direto: passa por Edge
-- Function que registra o evento e devolve signed URL de 60s.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('guias', 'guias', false)
on conflict do nothing;

-- Leitura direta só para staff. Cliente recebe signed URL.
create policy "staff le storage" on storage.objects
  for select using (bucket_id = 'guias' and is_staff());

create policy "staff escreve storage" on storage.objects
  for insert with check (bucket_id = 'guias' and is_staff());

-- ============================================================
-- 9. VIEWS DE ACOMPANHAMENTO
-- ============================================================

-- Painel: guias publicadas que o cliente ainda não abriu
create view v_guias_nao_vistas as
select
  g.id, e.razao_social, e.nome_fantasia, e.cnpj,
  g.tipo, g.competencia, g.vencimento, g.valor,
  g.publicada_em,
  (g.vencimento - current_date) as dias_para_vencer,
  extract(epoch from (now() - g.publicada_em))/3600 as horas_desde_publicacao
from guias g
join empresas e on e.id = g.empresa_id
where g.status = 'publicada' and g.vista_em is null
order by g.vencimento;

-- Painel: taxa de leitura por empresa nos últimos 6 meses
create view v_engajamento_empresa as
select
  e.id, e.razao_social,
  count(*) filter (where g.status in ('publicada','paga')) as guias,
  count(*) filter (where g.vista_em is not null)           as vistas,
  count(*) filter (where g.baixada_em is not null)         as baixadas,
  round(100.0 * count(*) filter (where g.vista_em is not null)
        / nullif(count(*) filter (where g.status in ('publicada','paga')),0), 1) as pct_leitura
from empresas e
left join guias g on g.empresa_id = e.id and g.criada_em > now() - interval '6 months'
group by e.id, e.razao_social
order by pct_leitura nulls last;
