-- ============================================================
-- ADENDO — RLS faltante pra staff registrar evento em guia_eventos.
--
-- A política original (01-schema.sql) só cobria o CLIENTE inserindo
-- vista/baixada/marcada_paga/entregue. Nada permitia o escritório
-- inserir 'publicada' (ou 'notificada'), então o painel apanhava 403
-- ao tentar gravar o log logo depois de publicar uma guia — descoberto
-- testando o ciclo completo pela primeira vez.
--
-- Só adiciona; não mexe na política existente do cliente.
-- ============================================================

create policy "staff registra evento de publicacao" on guia_eventos
  for insert with check (
    is_staff() and tipo in ('publicada', 'notificada')
  );
