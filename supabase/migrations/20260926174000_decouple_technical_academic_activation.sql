-- Vínculo acadêmico técnico independe de pagamento e checklist.
-- Função interna: os entrypoints públicos mantêm a autorização por turma.
begin;

create or replace function internal_academic.activate_started_technical_enrollment(
  p_matricula_id uuid,
  p_record_movement boolean default true
)
returns boolean
language plpgsql
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_turma_status text;
  v_matricula public.matriculas%rowtype;
begin
  select turma_id into v_turma_id
  from public.matriculas where id = p_matricula_id;
  if not found then return false; end if;

  -- A mesma ordem de locks do ingresso: turma antes de matrícula.
  select turma.status into v_turma_status
  from public.turmas turma
  join public.cursos curso on curso.id = turma.curso_id
  where turma.id = v_turma_id
    and upper(coalesce(curso.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  for update of turma;
  if not found or v_turma_status <> 'EM_ANDAMENTO' then return false; end if;

  select * into v_matricula
  from public.matriculas where id = p_matricula_id for update;
  if not found
    or v_matricula.fluxo_operacional <> 'REGULAR'
    or v_matricula.status not in ('PENDENTE', 'AGUARDANDO_CONFIRMACAO')
  then return false; end if;

  perform internal_academic.authorize_enrollment_status(v_matricula.id, 'ATIVO');
  update public.matriculas set status = 'ATIVO' where id = v_matricula.id;

  if p_record_movement then
    insert into public.matricula_movimentacoes (
      matricula_id, aluno_id, tipo, status_anterior, status_novo,
      turma_destino_id, motivo, responsavel_id
    ) values (
      v_matricula.id, v_matricula.aluno_id, 'REATIVACAO', v_matricula.status,
      'ATIVO', v_matricula.turma_id,
      'Ativação acadêmica pelo vínculo em turma iniciada, independente do financeiro e do checklist documental.',
      case when auth.uid() is null then null
        else internal_academic.resolve_responsavel() end
    );
  end if;
  return true;
end;
$function$;

revoke all on function internal_academic.activate_started_technical_enrollment(uuid, boolean)
  from public, anon, authenticated, service_role;

-- A máquina de estados continua exigindo uma transição autorizada.
-- Este guard valida somente o contexto acadêmico, sem consultar cobranças.
create or replace function public.guard_technical_activation_document_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_turma_status text;
begin
  if tg_op <> 'UPDATE'
    or upper(coalesce(new.status, '')) <> 'ATIVO'
    or upper(coalesce(old.status, '')) = 'ATIVO'
  then return new; end if;

  select upper(coalesce(curso.modalidade, '')), turma.status
  into v_modalidade, v_turma_status
  from public.turmas turma
  join public.cursos curso on curso.id = turma.curso_id
  where turma.id = new.turma_id;
  if v_modalidade not in ('TECNICO', 'TÉCNICO') then return new; end if;

  if new.fluxo_operacional <> 'REGULAR' then
    raise exception 'Matrícula de implantação não pode ser ativada como matrícula regular.'
      using errcode = '22023';
  end if;
  if v_turma_status <> 'EM_ANDAMENTO' then
    raise exception 'A ativação acadêmica exige turma em andamento.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_technical_activation_document_versions()
  from public, anon, authenticated, service_role;

commit;
