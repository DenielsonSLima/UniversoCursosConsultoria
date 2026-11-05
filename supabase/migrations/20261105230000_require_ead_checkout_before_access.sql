begin;

-- Legacy manager actions must never manufacture a paid enrollment. The
-- canonical checkout reserves a PENDENTE enrollment and its unique charge;
-- confirmed settlement alone projects the academic activation.
create or replace function public.ead_matricular_aluno_manual(
  p_turma_id uuid,
  p_aluno_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    public.gestor_has_module('gestao')
    and public.can_write_turma(p_turma_id)
  ) then
    raise exception 'Gestor sem permissão para matricular nesta turma EAD.'
      using errcode = '42501';
  end if;
  raise exception 'Confirme a cobrança no checkout EAD. O acesso será liberado somente após o pagamento confirmado.'
    using errcode = 'PT409';
end;
$$;

create or replace function public.ead_liberar_matricula(p_matricula_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turma_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão de gestor obrigatória.' using errcode = '42501';
  end if;
  select m.turma_id into v_turma_id
  from public.matriculas m
  where m.id = p_matricula_id;
  if v_turma_id is null or not (
    public.gestor_has_module('gestao')
    and public.can_write_turma(v_turma_id)
  ) then
    raise exception 'Gestor sem permissão para liberar esta matrícula EAD.'
      using errcode = '42501';
  end if;
  raise exception 'A liberação EAD é automática após a confirmação financeira. Registrar acesso manualmente não confirma pagamento.'
    using errcode = 'PT409';
end;
$$;

revoke all on function public.ead_matricular_aluno_manual(uuid, uuid),
  public.ead_liberar_matricula(uuid) from public, anon, service_role;
grant execute on function public.ead_matricular_aluno_manual(uuid, uuid),
  public.ead_liberar_matricula(uuid) to authenticated;

commit;
