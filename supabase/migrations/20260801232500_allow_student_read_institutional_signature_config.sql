-- A carteirinha do aluno usa a assinatura institucional configurada no
-- registro legado `assinaturas`. Sem esta leitura, o preview recebe URL vazia
-- e bloqueia tanto a exibição quanto a geração do PDF.
--
-- Esta política não libera `assinaturas_pessoas`, assinaturas de professores
-- ou qualquer operação de escrita.

drop policy if exists "documentos_templates_student_identity_select"
  on public.documentos_templates;

create policy "documentos_templates_student_identity_select"
  on public.documentos_templates
  for select
  to authenticated
  using (
    public.current_aluno_id() is not null
    and id in ('carteirinha', 'cracha', 'assinaturas')
  );

comment on policy "documentos_templates_student_identity_select"
  on public.documentos_templates is
  'Permite ao aluno autenticado ler seus modelos de identificação e somente a configuração institucional de assinaturas usada nesses documentos.';
