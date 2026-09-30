begin;

drop function if exists public.get_turma_alunos_academico(uuid);

create function public.get_turma_alunos_academico(p_turma_id uuid)
returns table(
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  cpf text,
  data_nascimento date,
  data_matricula timestamp with time zone,
  status text,
  frequencia_percent numeric,
  tem_lancamentos_academicos boolean,
  pode_remover boolean,
  foto_url text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Acesso ao cadastro acadêmico não autorizado.'
      using errcode = '42501';
  end if;

  return query
  select
    roster.matricula_id,
    roster.aluno_id,
    roster.nome,
    roster.cpf,
    roster.data_nascimento,
    roster.data_matricula,
    roster.status,
    roster.frequencia_percent,
    roster.tem_lancamentos_academicos,
    roster.pode_remover,
    partner.foto_url
  from internal_academic.p1_get_turma_alunos_academico_20260719(p_turma_id) roster
  join public.parceiros partner on partner.id = roster.aluno_id
  order by roster.nome;
end;
$function$;

revoke all on function public.get_turma_alunos_academico(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_turma_alunos_academico(uuid)
  to authenticated, service_role;

comment on function public.get_turma_alunos_academico(uuid) is
  'Cadastro acadêmico completo com foto do aluno, restrito a gestores autorizados para a turma.';

commit;
