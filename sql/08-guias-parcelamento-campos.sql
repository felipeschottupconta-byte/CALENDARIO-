-- ============================================================
-- ADENDO — campos de parcelamento direto na guia.
--
-- Um DAS de parcelamento (PARCSN, PARCMEI, RELP...) não tem
-- competência única (cobre "Diversos") e o valor da guia é sempre o
-- total (principal + multa + juros). guia_parser.py já extrai isso;
-- faltavam as colunas pra gravar. Só adiciona — não mexe em nada
-- existente.
-- ============================================================

alter table guias add column if not exists eh_parcelamento boolean not null default false;
alter table guias add column if not exists parcelamento_sigla text;
alter table guias add column if not exists parcelamento_numero text;
alter table guias add column if not exists parcela_atual int;
alter table guias add column if not exists parcela_total int;
alter table guias add column if not exists valor_principal numeric(14,2);
alter table guias add column if not exists valor_multa numeric(14,2);
alter table guias add column if not exists valor_juros numeric(14,2);

create index if not exists guias_parcelamento_numero_idx
  on guias (empresa_id, parcelamento_numero) where eh_parcelamento;
