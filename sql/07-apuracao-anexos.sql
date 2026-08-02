-- ============================================================
-- ADENDO — suporte a múltiplos anexos na apuração do Simples.
--
-- apuracoes_simples continua sendo o "envelope" da apuração (empresa,
-- competência, rpa, rbt12, faixa, total_a_recolher, guia_id vinculado
-- ao DAS correspondente, publicada) e mantém os campos de anexo único
-- (anexo, aliquota_nominal, aliquota_efetiva, parcela_deduzir,
-- percentual_reducao_icms) preenchidos quando há só um anexo — o
-- "Entenda seu imposto" de anexo único (Su Lingerie, Gata Serrana)
-- continua lendo exatamente como antes, sem mudar uma linha de query.
--
-- Quando há mais de um anexo (empresa que revende e industrializa na
-- mesma competência — caso real: Puro Estilo), cada anexo vira uma
-- linha em apuracao_anexos, e os tributos daquele anexo se linkam por
-- apuracao_anexo_id. Só adiciona; não altera nem remove nada existente.
-- ============================================================

create table apuracao_anexos (
  id                      uuid primary key default uuid_generate_v4(),
  apuracao_id             uuid not null references apuracoes_simples(id) on delete cascade,
  anexo                   text not null,
  receita_tributada       numeric(14,2),
  aliquota_nominal        numeric(6,3),
  aliquota_efetiva        numeric(12,10),
  parcela_deduzir         numeric(14,2),
  percentual_reducao_icms numeric(6,3),
  subtotal                numeric(14,2)
);

create index on apuracao_anexos (apuracao_id);

alter table apuracao_tributos
  add column if not exists apuracao_anexo_id uuid references apuracao_anexos(id) on delete cascade;

alter table apuracao_anexos enable row level security;

create policy "ve anexos de apuracao acessivel" on apuracao_anexos
  for select using (
    exists (
      select 1 from apuracoes_simples a
      where a.id = apuracao_id
        and (is_staff() or (tem_acesso(a.empresa_id) and a.publicada))
    )
  );

create policy "staff escreve anexos" on apuracao_anexos
  for all using (is_staff()) with check (is_staff());
