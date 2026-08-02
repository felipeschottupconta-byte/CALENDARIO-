-- ============================================================
-- ADENDO — Fator R (Anexo III/V, prestação de serviço).
--
-- Só existe no extrato de empresas sujeitas ao fator R — o campo fica
-- null pra todo o resto (comércio, indústria puros). É um número só
-- pra empresa inteira nessa competência, não por anexo, por isso vive
-- em apuracoes_simples e não em apuracao_anexos.
-- ============================================================

alter table apuracoes_simples add column if not exists fator_r numeric(6,2);
alter table apuracoes_simples add column if not exists folha_12_meses numeric(14,2);
