drop policy if exists comunicacao_atendimento_config_student_select
  on public.comunicacao_atendimento_config;

create policy comunicacao_atendimento_config_student_select
on public.comunicacao_atendimento_config
for select
to authenticated
using (
  polo_id = (
    select p.polo_id
    from public.parceiros p
    where p.id = public.current_aluno_id()
      and p.tipo = 'Aluno'
    limit 1
  )
);

comment on policy comunicacao_atendimento_config_student_select
  on public.comunicacao_atendimento_config is
  'Permite ao aluno receber via Realtime apenas a configuração operacional do próprio polo.';
