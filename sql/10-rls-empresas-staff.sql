-- ============================================================
-- ADENDO — staff cadastrando/editando empresa.
--
-- Descoberto ao preparar o upload da Puro Estilo: `empresas` tem RLS
-- ligado (01-schema.sql) mas só existe a política de SELECT ("ve a
-- propria empresa", que já libera staff via tem_acesso()). Não existe
-- política de INSERT nem UPDATE — então FormNovaEmpresa, no painel,
-- nunca conseguiria cadastrar uma empresa nova pelo app; só via SQL
-- Editor direto (bypassa RLS), que foi o caminho usado até agora.
-- ============================================================

create policy "staff cadastra e edita empresa" on empresas
  for all using (is_staff()) with check (is_staff());
