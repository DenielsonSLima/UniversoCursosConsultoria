-- Permite que o portal autenticado do aluno carregue somente os modelos
-- necessários para renderizar seus documentos de identificação.
--
-- A leitura geral de documentos_templates continua restrita aos gestores.

drop policy if exists "documentos_templates_student_identity_select"
  on public.documentos_templates;

create policy "documentos_templates_student_identity_select"
  on public.documentos_templates
  for select
  to authenticated
  using (
    public.current_aluno_id() is not null
    and id in ('carteirinha', 'cracha')
  );

comment on policy "documentos_templates_student_identity_select"
  on public.documentos_templates is
  'Permite ao aluno autenticado ler apenas os modelos usados na própria carteirinha e no próprio crachá.';
