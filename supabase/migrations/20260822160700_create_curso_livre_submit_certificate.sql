begin;

create or replace function internal_academic.guard_curso_livre_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if upper(coalesce(new.status, '')) = 'CONCLUIDO'
    and (tg_op = 'INSERT' or upper(coalesce(old.status, '')) <> 'CONCLUIDO')
    and exists (
      select 1 from public.turmas class
      join public.cursos course on course.id = class.curso_id
      where class.id = new.turma_id and upper(coalesce(course.modalidade, '')) = 'LIVRE'
    )
    and not exists (
      select 1 from public.curso_livre_tentativas attempt
      where attempt.matricula_id = new.id and attempt.status = 'APROVADA'
    )
  then
    raise exception 'A matrícula Livre só conclui após aprovação na prova final.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_completion()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_completion_trigger
before insert or update of status on public.matriculas
for each row execute function internal_academic.guard_curso_livre_completion();

create or replace function internal_academic.guard_curso_livre_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if upper(coalesce(new.modalidade, '')) = 'LIVRE'
    and upper(coalesce(new.status, '')) = 'FINALIZADO'
    and (tg_op = 'INSERT' or upper(coalesce(old.status, '')) <> 'FINALIZADO')
    and not exists (
      select 1 from public.curso_livre_tentativas attempt
      where attempt.matricula_id = new.matricula_id and attempt.status = 'APROVADA'
    )
  then
    raise exception 'O certificado Livre só finaliza após aprovação na prova final.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_curso_livre_certificate()
  from public, anon, authenticated, service_role;
create trigger guard_curso_livre_certificate_trigger
before insert or update of status on public.certificados_academicos
for each row execute function internal_academic.guard_curso_livre_certificate();

create or replace function internal_academic.finalize_curso_livre_certificate(
  p_matricula_id uuid,
  p_nota_percentual numeric
)
returns public.certificados_academicos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_certificate public.certificados_academicos%rowtype;
  v_code text;
  v_document_status text;
begin
  select certificate.* into v_certificate
  from public.certificados_academicos certificate
  where certificate.matricula_id = p_matricula_id
  for update;
  if not found then
    raise exception 'A fila do certificado Livre não foi criada.' using errcode = '55000';
  end if;
  if v_certificate.status = 'FINALIZADO' and v_certificate.codigo_validacao is not null then
    return v_certificate;
  end if;
  select issuance.codigo, issuance.status
  into v_code, v_document_status
  from public.emitir_documento_validacao_interno(
    'certificado_livre', p_matricula_id, null, null, null, auth.uid(), false
  ) issuance;
  if v_code is null or v_document_status <> 'ATIVO' then
    raise exception 'Não foi possível emitir a validação do certificado Livre.'
      using errcode = '55000';
  end if;
  update public.certificados_academicos certificate
  set status = 'FINALIZADO',
      nota_final = p_nota_percentual,
      codigo_validacao = v_code,
      emitido_em = now(),
      emitido_por = auth.uid(),
      metadados = coalesce(certificate.metadados, '{}'::jsonb) || jsonb_build_object(
        'emissaoAutomatica', true,
        'origem', 'PROVA_FINAL_CURSO_LIVRE'
      ),
      updated_at = now()
  where certificate.id = v_certificate.id
  returning * into v_certificate;
  return v_certificate;
end;
$function$;

revoke all on function internal_academic.finalize_curso_livre_certificate(uuid, numeric)
  from public, anon, authenticated, service_role;

create or replace function public.entregar_tentativa_curso_livre_secure(
  p_request_id uuid,
  p_tentativa_id uuid,
  p_respostas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_context record;
  v_attempt public.curso_livre_tentativas%rowtype;
  v_stored internal_academic.curso_livre_tentativa_requests%rowtype;
  v_hash text;
  v_item record;
  v_answer integer;
  v_total integer;
  v_correct integer := 0;
  v_score numeric(5,2);
  v_passed boolean;
  v_response jsonb;
begin
  if p_request_id is null or p_tentativa_id is null
    or pg_catalog.jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'requestId, tentativaId e respostas são obrigatórios.'
      using errcode = '22023';
  end if;
  select attempt.*, enrollment.aluno_id, enrollment.turma_id,
    enrollment.status as matricula_status, assessment.nota_minima_percentual
  into v_context
  from public.curso_livre_tentativas attempt
  join public.matriculas enrollment on enrollment.id = attempt.matricula_id
  join public.curso_livre_avaliacoes assessment on assessment.id = attempt.avaliacao_id
  where attempt.id = p_tentativa_id;
  if not found then raise exception 'Tentativa Livre não encontrada.' using errcode = 'P0002'; end if;
  if coalesce((select auth.role()), '') <> 'service_role'
    and v_context.aluno_id is distinct from public.current_aluno_id() then
    raise exception 'Sem permissão para entregar esta tentativa.' using errcode = '42501';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('tentativaId', p_tentativa_id, 'respostas', p_respostas)::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-attempt-request:' || p_request_id::text, 0
  ));
  select request.* into v_stored
  from internal_academic.curso_livre_tentativa_requests request
  where request.request_id = p_request_id;
  if found then
    if v_stored.operacao <> 'ENTREGAR' or v_stored.actor_id is distinct from v_actor_id
      or v_stored.payload_hash <> v_hash then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_stored.response, '{replayed}', 'true'::jsonb, true);
  end if;

  select attempt.* into v_attempt
  from public.curso_livre_tentativas attempt
  where attempt.id = p_tentativa_id for update;
  if v_attempt.status <> 'EM_ANDAMENTO' then
    raise exception 'A tentativa Livre já foi entregue.' using errcode = '55000';
  end if;
  perform 1 from public.matriculas enrollment
  where enrollment.id = v_attempt.matricula_id
    and upper(coalesce(enrollment.status, '')) = 'ATIVO'
  for update;
  if not found then
    raise exception 'A entrega exige matrícula Livre ATIVA.' using errcode = '55000';
  end if;
  select count(*)::integer into v_total
  from public.curso_livre_tentativa_questoes snapshot
  where snapshot.tentativa_id = p_tentativa_id;
  if v_total <> 10 or (
    select count(*) from pg_catalog.jsonb_object_keys(p_respostas)
  ) <> v_total then
    raise exception 'Responda exatamente as 10 questões sorteadas.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_respostas) answer_key(key)
    where not exists (
      select 1 from public.curso_livre_tentativa_questoes snapshot
      where snapshot.tentativa_id = p_tentativa_id
        and snapshot.id::text = answer_key.key
    )
  ) then
    raise exception 'As respostas contêm questão fora desta tentativa.' using errcode = '22023';
  end if;

  for v_item in
    select snapshot.id, snapshot.resposta_correta,
      pg_catalog.jsonb_array_length(snapshot.opcoes) as option_count,
      p_respostas -> snapshot.id::text as answer_value
    from public.curso_livre_tentativa_questoes snapshot
    where snapshot.tentativa_id = p_tentativa_id
  loop
    if pg_catalog.jsonb_typeof(v_item.answer_value) <> 'number'
      or (v_item.answer_value #>> '{}') !~ '^[0-9]+$' then
      raise exception 'Todas as respostas devem indicar o índice de uma alternativa.'
        using errcode = '22023';
    end if;
    v_answer := (v_item.answer_value #>> '{}')::integer;
    if v_answer < 0 or v_answer >= v_item.option_count then
      raise exception 'Uma resposta aponta para alternativa inexistente.' using errcode = '22023';
    end if;
    if v_answer = v_item.resposta_correta then v_correct := v_correct + 1; end if;
  end loop;

  v_score := round(v_correct::numeric / v_total::numeric * 100, 2);
  v_passed := v_score >= v_context.nota_minima_percentual;
  update public.curso_livre_tentativas attempt
  set status = case when v_passed then 'APROVADA' else 'REPROVADA' end,
      enviada_em = now(), acertos = v_correct, total = v_total,
      nota_percentual = v_score, respostas = p_respostas,
      resposta_hash = v_hash, updated_at = now()
  where attempt.id = p_tentativa_id;

  if v_passed then
    perform pg_catalog.set_config('app.nontechnical_single_plan_enrollment', 'on', true);
    update public.matriculas enrollment
    set status = 'CONCLUIDO'
    where enrollment.id = v_attempt.matricula_id;
    perform internal_academic.finalize_curso_livre_certificate(
      v_attempt.matricula_id, v_score
    );
  end if;

  v_response := jsonb_build_object('replayed', false)
    || internal_academic.curso_livre_student_payload(v_attempt.matricula_id);
  insert into internal_academic.curso_livre_tentativa_requests(
    request_id, operacao, actor_id, payload_hash, response
  ) values (p_request_id, 'ENTREGAR', v_actor_id, v_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.entregar_tentativa_curso_livre_secure(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.entregar_tentativa_curso_livre_secure(uuid, uuid, jsonb)
  to authenticated, service_role;

commit;
