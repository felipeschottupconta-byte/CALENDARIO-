-- ============================================================
-- ADENDO — cliente marcando guia como paga.
--
-- Descoberto ao implementar: o cliente já podia inserir evento
-- 'marcada_paga' em guia_eventos (01-schema.sql já previa isso), mas
-- faltavam DUAS coisas pra virar realidade:
--
--   1. O trigger que espelha guia_eventos pra guias (sync_guia_espelhos)
--      nunca tratava 'marcada_paga' — só publicada/notificada/vista/
--      baixada. E rodava sem security definer, então mesmo os que já
--      tratava ficariam bloqueados pela RLS de guias quando disparados
--      por um cliente (só staff escreve guias hoje).
--
--   2. Não existia política de storage pra cliente subir o comprovante
--      — só staff podia gravar no bucket 'guias'.
--
-- guia_eventos continua append-only (invariante 6 do CLAUDE.md); quem
-- grava status='paga'/paga_em em guias é o trigger, com privilégio
-- elevado, nunca o cliente direto.
-- ============================================================

create or replace function sync_guia_espelhos()
returns trigger language plpgsql security definer as $$
begin
  if new.guia_id is null then return new; end if;
  update guias set
    publicada_em  = case when new.tipo='publicada'  and publicada_em  is null then new.ocorrido_em else publicada_em  end,
    notificada_em = case when new.tipo='notificada' and notificada_em is null then new.ocorrido_em else notificada_em end,
    vista_em      = case when new.tipo='vista'      and vista_em      is null then new.ocorrido_em else vista_em      end,
    baixada_em    = case when new.tipo='baixada'    and baixada_em    is null then new.ocorrido_em else baixada_em    end,
    status        = case when new.tipo='marcada_paga' then 'paga'::status_guia else status end,
    paga_em       = case when new.tipo='marcada_paga'
                          then coalesce((new.meta->>'dataPagamento')::date, new.ocorrido_em::date)
                          else paga_em end,
    paga_marcada_por = case when new.tipo='marcada_paga' then new.usuario_id else paga_marcada_por end
  where id = new.guia_id;
  return new;
end $$;

-- Upload do comprovante: só dentro de comprovantes/, sem acesso de
-- leitura pro cliente (isso continua restrito a staff/signed URL).
create policy "cliente sobe comprovante de pagamento" on storage.objects
  for insert with check (
    bucket_id = 'guias' and name like 'comprovantes/%'
  );
