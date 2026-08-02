-- ============================================================
-- ADENDO — cliente baixando o PDF original da própria guia.
--
-- Descoberto: o botão "PDF" no app do cliente nunca funcionou de
-- verdade (era um toast fake, "Baixando guia em PDF", sem download
-- nenhum) porque não existia política de SELECT em storage.objects
-- pro cliente — só staff podia ler o bucket 'guias' (01-schema.sql).
--
-- Restringe pelo próprio caminho do arquivo: guias/{cnpj}/{ano}/{hash}.pdf
-- — só libera se o primeiro segmento for 'guias' (não deixa vazar
-- comprovantes/ nem extratos/, que têm outro propósito) e o segundo
-- segmento (o CNPJ) for de uma empresa que o usuário tem acesso.
-- ============================================================

create policy "cliente baixa guia da propria empresa" on storage.objects
  for select using (
    bucket_id = 'guias'
    and (storage.foldername(name))[1] = 'guias'
    and exists (
      select 1 from empresas e
      join usuario_empresa ue on ue.empresa_id = e.id
      where ue.usuario_id = auth.uid()
        and e.cnpj = (storage.foldername(name))[2]
    )
  );
