begin;
create function internal_academic.technical_class_admission_policy(
  p_turma_id uuid,p_today date default timezone('America/Maceio',now())::date
)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_start date; v_status text; v_reason text; v_message text;
begin
  select t.data_inicio,t.status into v_start,v_status from public.turmas t
    join public.cursos c on c.id=t.curso_id
    where t.id=p_turma_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO');
  if not found then raise exception 'Turma técnica não encontrada.' using errcode='22023'; end if;
  v_reason:=case when coalesce(v_status,'') not in ('PLANEJADA','INSCRICOES_ABERTAS','EM_ANDAMENTO') then 'TURMA_INDISPONIVEL'
    when v_start is null then 'DATA_INICIO_AUSENTE'
    when p_today>v_start+365 then 'PRAZO_EXPIRADO' else 'PERMITIDA' end;
  v_message:=case v_reason
    when 'TURMA_INDISPONIVEL' then 'Esta fase da turma não permite novas matrículas.'
    when 'DATA_INICIO_AUSENTE' then 'Defina a data de início da turma antes de uma nova matrícula direta.'
    when 'PRAZO_EXPIRADO' then 'O prazo de 365 dias para matrícula direta terminou. Use o recebimento oficial de transferência.'
    else 'Matrícula direta permitida até '||to_char(v_start+365,'DD/MM/YYYY')||'.' end;
  return jsonb_build_object('versao',1,'turmaId',p_turma_id,'dataReferencia',p_today,
    'dataInicio',v_start,'dataLimiteMatriculaDireta',v_start+365,
    'diasDesdeInicio',p_today-v_start,'matriculaDiretaPermitida',v_reason='PERMITIDA',
    'transferenciaObrigatoria',v_reason='PRAZO_EXPIRADO','motivo',v_reason,'mensagem',v_message);
end;
$function$;

create function internal_academic.assert_technical_direct_admission(p_turma_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_policy jsonb;
begin
  perform 1 from public.turmas t join public.cursos c on c.id=t.curso_id
    where t.id=p_turma_id and upper(coalesce(c.modalidade,'')) in ('TECNICO','TÉCNICO') for share of t;
  if not found then return; end if;
  v_policy:=internal_academic.technical_class_admission_policy(p_turma_id);
  if v_policy->>'matriculaDiretaPermitida'<>'true' then
    raise exception '%',v_policy->>'mensagem' using errcode='23514',detail=v_policy->>'motivo'; end if;
end;
$function$;

create function public.get_turma_tecnica_ingresso_secure(p_turma_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or not (coalesce(public.gestor_can_read_enrollment_continuity(p_turma_id),false)
      or coalesce(public.can_write_turma(p_turma_id),false)) then
    raise exception 'Sem permissão para consultar o ingresso desta turma.' using errcode='42501'; end if;
  return internal_academic.technical_class_admission_policy(p_turma_id);
end;
$function$;
revoke all on function internal_academic.technical_class_admission_policy(uuid,date),
  internal_academic.assert_technical_direct_admission(uuid),public.get_turma_tecnica_ingresso_secure(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_turma_tecnica_ingresso_secure(uuid) to authenticated;
commit;
