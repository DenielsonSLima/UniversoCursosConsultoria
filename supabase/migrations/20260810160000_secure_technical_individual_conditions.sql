begin;

-- A primeira data financeira pertence à turma. A matrícula pode sobrescrevê-la,
-- mas nunca precisa adivinhar qual data será usada.
alter table public.turmas
  add column if not exists primeiro_vencimento_padrao date;

update public.turmas class
set primeiro_vencimento_padrao = coalesce(class.primeiro_vencimento_padrao, class.data_inicio)
from public.cursos course
where course.id = class.curso_id
  and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  and class.primeiro_vencimento_padrao is null;

comment on column public.turmas.primeiro_vencimento_padrao is
  'Primeiro vencimento financeiro sugerido pela turma; a matrícula pode informar uma exceção explícita.';

create table if not exists internal_academic.technical_individual_condition_codes (
  turma_id uuid primary key references public.turmas(id) on delete cascade,
  code_hash text not null,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists internal_academic.technical_individual_condition_attempts (
  turma_id uuid not null references public.turmas(id) on delete cascade,
  aluno_id uuid not null references public.parceiros(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (turma_id, actor_id)
);

create table if not exists internal_academic.technical_individual_condition_requests (
  request_id uuid primary key,
  operation text not null,
  actor_id uuid,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

revoke all on table internal_academic.technical_individual_condition_codes
  from public, anon, authenticated, service_role;
revoke all on table internal_academic.technical_individual_condition_attempts
  from public, anon, authenticated, service_role;
revoke all on table internal_academic.technical_individual_condition_requests
  from public, anon, authenticated, service_role;

create or replace function internal_academic.validate_technical_condition_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_code text := pg_catalog.btrim(coalesce(p_code, ''));
begin
  if pg_catalog.length(v_code) not between 8 and 32
    or pg_catalog.octet_length(v_code) > 72
    or v_code !~ '[A-Za-z]'
    or v_code !~ '[0-9]'
  then
    raise exception 'O código deve ter de 8 a 32 caracteres, com pelo menos uma letra e um número.'
      using errcode = '22023';
  end if;
  return v_code;
end;
$function$;

revoke all on function internal_academic.validate_technical_condition_code(text)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_manage_technical_condition(
  p_turma_id uuid,
  p_require_settings boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') = 'service_role' then return; end if;
  if not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
    and (
      not p_require_settings
      or public.gestor_has_tab('gestao', 'configuracoes')
    )
  ) then
    raise exception 'Sem permissão para autorizar condição financeira individual nesta turma.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_manage_technical_condition(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.set_technical_condition_code(
  p_turma_id uuid,
  p_code text,
  p_actor_id uuid,
  p_event text,
  p_justification text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text := internal_academic.validate_technical_condition_code(p_code);
  v_revision integer;
  v_updated_at timestamptz;
begin
  perform 1 from public.turmas class where class.id = p_turma_id for update;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;

  insert into internal_academic.technical_individual_condition_codes(
    turma_id, code_hash, revision, updated_by, updated_at
  ) values (
    p_turma_id,
    extensions.crypt(v_code, extensions.gen_salt('bf', 10)),
    1,
    p_actor_id,
    now()
  )
  on conflict (turma_id) do update set
    code_hash = excluded.code_hash,
    revision = internal_academic.technical_individual_condition_codes.revision + 1,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning revision, updated_at into v_revision, v_updated_at;

  delete from internal_academic.technical_individual_condition_attempts attempt
  where attempt.turma_id = p_turma_id;

  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    p_turma_id,
    null,
    p_event,
    jsonb_build_object(
      'codigoConfigurado', true,
      'revisao', v_revision,
      'atorId', p_actor_id
    ),
    nullif(pg_catalog.btrim(coalesce(p_justification, '')), '')
  );

  return jsonb_build_object(
    'turmaId', p_turma_id,
    'configurado', true,
    'revisao', v_revision,
    'atualizadoEm', v_updated_at
  );
end;
$function$;

revoke all on function internal_academic.set_technical_condition_code(uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.obter_status_codigo_condicao_individual_turma_tecnica_secure(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_code record;
begin
  perform internal_academic.assert_can_manage_technical_condition(p_turma_id, false);
  select code.revision, code.updated_at
  into v_code
  from internal_academic.technical_individual_condition_codes code
  where code.turma_id = p_turma_id;
  return jsonb_build_object(
    'turmaId', p_turma_id,
    'configurado', found,
    'revisao', case when found then v_code.revision else null end,
    'atualizadoEm', case when found then v_code.updated_at else null end
  );
end;
$function$;

revoke all on function public.obter_status_codigo_condicao_individual_turma_tecnica_secure(uuid)
  from public, anon;
grant execute on function public.obter_status_codigo_condicao_individual_turma_tecnica_secure(uuid)
  to authenticated, service_role;

create or replace function public.redefinir_codigo_condicao_individual_turma_tecnica_secure(
  p_turma_id uuid,
  p_request_id uuid,
  p_novo_codigo text,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload_hash text;
  v_existing record;
  v_status jsonb;
  v_response jsonb;
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  perform internal_academic.assert_can_manage_technical_condition(p_turma_id, true);
  perform internal_academic.validate_technical_condition_code(p_novo_codigo);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_justificativa, ''))) not between 5 and 300 then
    raise exception 'Informe uma justificativa de 5 a 300 caracteres.' using errcode = '22023';
  end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'justificativa', pg_catalog.btrim(p_justificativa)
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-condition-request:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.technical_individual_condition_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'REDEFINIR_CODIGO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
      or not exists (
        select 1
        from internal_academic.technical_individual_condition_codes code
        where code.turma_id = p_turma_id
          and extensions.crypt(
            internal_academic.validate_technical_condition_code(p_novo_codigo),
            code.code_hash
          ) = code.code_hash
      )
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  v_status := internal_academic.set_technical_condition_code(
    p_turma_id,
    p_novo_codigo,
    auth.uid(),
    'CODIGO_CONDICAO_INDIVIDUAL_REDEFINIDO',
    p_justificativa
  );
  v_response := jsonb_build_object(
    'operacao', 'REDEFINIR_CODIGO',
    'requestId', p_request_id,
    'replayed', false,
    'status', v_status
  );
  insert into internal_academic.technical_individual_condition_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'REDEFINIR_CODIGO', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.redefinir_codigo_condicao_individual_turma_tecnica_secure(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.redefinir_codigo_condicao_individual_turma_tecnica_secure(uuid, uuid, text, text)
  to authenticated, service_role;

create or replace function public.validar_codigo_condicao_individual_turma_tecnica_secure(
  p_turma_id uuid,
  p_aluno_id uuid,
  p_codigo text,
  p_motivo text,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_code record;
  v_attempt record;
  v_failed integer;
  v_locked_until timestamptz;
  v_motivo text := upper(pg_catalog.btrim(coalesce(p_motivo, '')));
  v_justification text := pg_catalog.btrim(coalesce(p_justificativa, ''));
begin
  perform internal_academic.assert_can_manage_technical_condition(p_turma_id, false);
  if v_actor is null and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Sessão obrigatória.' using errcode = '42501';
  end if;
  if v_motivo not in ('BOLSA', 'CONVENIO', 'INCENTIVO', 'NEGOCIACAO', 'OUTRO') then
    raise exception 'Motivo da condição individual inválido.' using errcode = '22023';
  end if;
  if v_motivo = 'OUTRO' and pg_catalog.length(v_justification) not between 5 and 300 then
    raise exception 'Descreva o motivo em 5 a 300 caracteres.' using errcode = '22023';
  end if;
  perform 1
  from public.parceiros student
  where student.id = p_aluno_id
    and student.tipo = 'Aluno';
  if not found then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'technical-condition-attempt:' || p_turma_id::text || ':' || coalesce(v_actor::text, 'service'), 0
  ));
  select code.code_hash, code.revision into v_code
  from internal_academic.technical_individual_condition_codes code
  where code.turma_id = p_turma_id;
  if not found then
    return jsonb_build_object('autorizado', false, 'motivo', 'NAO_CONFIGURADO');
  end if;

  select attempt.failed_attempts, attempt.locked_until into v_attempt
  from internal_academic.technical_individual_condition_attempts attempt
  where attempt.turma_id = p_turma_id
    and attempt.actor_id = v_actor;
  if found and v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object(
      'autorizado', false,
      'motivo', 'BLOQUEADO',
      'bloqueadoAte', v_attempt.locked_until
    );
  end if;

  if extensions.crypt(coalesce(p_codigo, ''), v_code.code_hash) <> v_code.code_hash then
    v_failed := case
      when found and (v_attempt.locked_until is null or v_attempt.locked_until <= now())
        then least(v_attempt.failed_attempts + 1, 5)
      else 1
    end;
    v_locked_until := case when v_failed >= 5 then now() + interval '15 minutes' else null end;
    insert into internal_academic.technical_individual_condition_attempts(
      turma_id, aluno_id, actor_id, failed_attempts, locked_until, updated_at
    ) values (
      p_turma_id, p_aluno_id, v_actor, v_failed, v_locked_until, now()
    ) on conflict (turma_id, actor_id) do update set
      aluno_id = excluded.aluno_id,
      failed_attempts = excluded.failed_attempts,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at;
    return jsonb_build_object(
      'autorizado', false,
      'motivo', case when v_locked_until is null then 'INVALIDO' else 'BLOQUEADO' end,
      'tentativasRestantes', greatest(0, 5 - v_failed),
      'bloqueadoAte', v_locked_until
    );
  end if;

  delete from internal_academic.technical_individual_condition_attempts attempt
  where attempt.turma_id = p_turma_id
    and attempt.actor_id = v_actor;
  return jsonb_build_object(
    'autorizado', true,
    'motivo', 'VALIDO',
    'codigoRevisao', v_code.revision
  );
end;
$function$;

revoke all on function public.validar_codigo_condicao_individual_turma_tecnica_secure(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.validar_codigo_condicao_individual_turma_tecnica_secure(uuid, uuid, text, text, text)
  to authenticated, service_role;

-- O curso técnico possui no máximo dois ciclos. O renderizador é compartilhado
-- pela turma, preview e regra efetiva do aluno, então o limite pertence ao
-- contrato canônico e não somente à interface.
create or replace function internal_academic.render_technical_financial_rule(
  p_rule jsonb,
  p_primeiro_vencimento date,
  p_identity jsonb,
  p_origin text default 'TURMA'
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_rule jsonb := internal_academic.validate_technical_financial_rule_input(p_rule);
  v_valor_matricula text;
  v_valor_mensalidade text;
  v_valor_rematricula text;
  v_quantidade integer;
  v_dia integer;
  v_primeiro_vencimento text;
  v_total_ciclos integer;
begin
  v_valor_matricula := pg_catalog.to_char((v_rule ->> 'valorMatricula')::numeric, 'FM999999990.00');
  v_valor_mensalidade := pg_catalog.to_char((v_rule ->> 'valorMensalidade')::numeric, 'FM999999990.00');
  v_valor_rematricula := pg_catalog.to_char((v_rule ->> 'valorRematricula')::numeric, 'FM999999990.00');
  v_quantidade := (v_rule ->> 'qtdMensalidades')::integer;
  v_dia := (v_rule ->> 'diaVencimento')::integer;
  v_primeiro_vencimento := pg_catalog.to_char(p_primeiro_vencimento, 'YYYY-MM-DD');
  v_total_ciclos := case when (v_rule ->> 'cobrarRematricula')::boolean then 2 else 1 end;

  return jsonb_build_object(
    'identidade', p_identity,
    'origem', p_origin,
    'cobranca', jsonb_build_object(
      'matricula', jsonb_build_object(
        'habilitada', (v_rule ->> 'cobrarMatricula')::boolean,
        'valor', v_valor_matricula
      ),
      'mensalidade', jsonb_build_object(
        'habilitada', true,
        'quantidade', v_quantidade,
        'valor', v_valor_mensalidade
      ),
      'rematricula', jsonb_build_object(
        'habilitada', (v_rule ->> 'cobrarRematricula')::boolean,
        'valor', v_valor_rematricula
      )
    ),
    'vencimento', jsonb_build_object(
      'diaBase', v_dia,
      'primeiroVencimentoSugerido', v_primeiro_vencimento
    ),
    'encargos', jsonb_build_object(
      'descontoPontualidade', pg_catalog.to_char(
        (v_rule ->> 'descontoPontualidade')::numeric, 'FM999999990.00'
      ),
      'jurosAtrasoPercentual', pg_catalog.to_char(
        (v_rule ->> 'jurosAtrasoPercentual')::numeric, 'FM999999990.000000'
      ),
      'multaAtrasoPercentual', pg_catalog.to_char(
        (v_rule ->> 'multaAtrasoPercentual')::numeric, 'FM999999990.000000'
      )
    ),
    'aplicacao', jsonb_build_object(
      'matricula', jsonb_build_object(
        'desconto', (v_rule ->> 'aplicarDescontoMatricula')::boolean,
        'multaJuros', (v_rule ->> 'aplicarMultaJurosMatricula')::boolean
      ),
      'mensalidade', jsonb_build_object(
        'desconto', (v_rule ->> 'aplicarDescontoMensalidade')::boolean,
        'multaJuros', (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean
      ),
      'rematricula', jsonb_build_object(
        'desconto', (v_rule ->> 'aplicarDescontoRematricula')::boolean,
        'multaJuros', (v_rule ->> 'aplicarMultaJurosRematricula')::boolean
      )
    ),
    'boleto', jsonb_build_object('instrucao', v_rule ->> 'instrucaoBoleto'),
    'continuidade', jsonb_build_object(
      'recorrente', false,
      'proximoCiclo', case when v_total_ciclos = 2
        then 'APOS_REMATRICULA' else 'ENCERRA_APOS_MENSALIDADES' end,
      'mensalidadesPorCiclo', v_quantidade,
      'maxCiclos', v_total_ciclos,
      'encerraAposCiclo', v_total_ciclos
    ),
    'cronogramaCiclo', internal_academic.build_flexible_technical_financial_schedule(
      p_primeiro_vencimento, v_rule
    ),
    'primeiroVencimentoSugerido', v_primeiro_vencimento,
    'valorMatricula', v_valor_matricula,
    'valorMensalidade', v_valor_mensalidade,
    'valorRematricula', v_valor_rematricula,
    'mensalidadesPorCiclo', v_quantidade,
    'diaVencimento', v_dia
  );
end;
$function$;

revoke all on function internal_academic.render_technical_financial_rule(jsonb, date, jsonb, text)
  from public, anon, authenticated, service_role;

-- O fingerprint passa a incluir o vencimento concreto da turma.
create or replace function internal_academic.technical_financial_rule_fingerprint_v3(
  p_data_inicio date,
  p_primeiro_vencimento date,
  p_rule jsonb
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'versao', 3,
          'dataInicio', p_data_inicio,
          'primeiroVencimento', p_primeiro_vencimento,
          'regra', internal_academic.validate_technical_financial_rule_input(p_rule)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function internal_academic.technical_financial_rule_fingerprint_v3(date, date, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.aplicar_padrao_financeiro_turma_tecnica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_rule jsonb;
  v_fingerprint text;
  v_first_due date;
begin
  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.cursos course where course.id = new.curso_id;
  if v_modalidade not in ('TECNICO', 'TÉCNICO') then return new; end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(jsonb_build_object(
    'cobrarMatricula', coalesce(new.cobrar_matricula, new.valor_matricula > 0),
    'valorMatricula', new.valor_matricula,
    'qtdMensalidades', new.qtd_parcelas,
    'valorMensalidade', new.valor_parcela,
    'cobrarRematricula', coalesce(new.cobrar_rematricula, new.valor_rematricula > 0),
    'valorRematricula', new.valor_rematricula,
    'diaVencimento', new.dia_vencimento_padrao,
    'descontoPontualidade', new.desconto_pontualidade,
    'jurosAtrasoPercentual', new.juros_atraso,
    'multaAtrasoPercentual', coalesce(new.multa_atraso_percentual, 0),
    'aplicarDescontoMatricula', new.aplicar_desconto_matricula,
    'aplicarMultaJurosMatricula', new.aplicar_multa_juros_matricula,
    'aplicarDescontoMensalidade', new.aplicar_desconto_mensalidade,
    'aplicarMultaJurosMensalidade', new.aplicar_multa_juros_mensalidade,
    'aplicarDescontoRematricula', new.aplicar_desconto_rematricula,
    'aplicarMultaJurosRematricula', new.aplicar_multa_juros_rematricula,
    'instrucaoBoleto', new.instrucao_boleto_carne
  ));
  new.cobrar_matricula := (v_rule ->> 'cobrarMatricula')::boolean;
  new.valor_matricula := (v_rule ->> 'valorMatricula')::numeric;
  new.qtd_parcelas := (v_rule ->> 'qtdMensalidades')::integer;
  new.valor_parcela := (v_rule ->> 'valorMensalidade')::numeric;
  new.cobrar_rematricula := (v_rule ->> 'cobrarRematricula')::boolean;
  new.valor_rematricula := (v_rule ->> 'valorRematricula')::numeric;
  new.dia_vencimento_padrao := (v_rule ->> 'diaVencimento')::integer;
  new.desconto_pontualidade := (v_rule ->> 'descontoPontualidade')::numeric;
  new.juros_atraso := (v_rule ->> 'jurosAtrasoPercentual')::numeric;
  new.multa_atraso_percentual := (v_rule ->> 'multaAtrasoPercentual')::numeric;
  new.multa_atraso := round(new.valor_parcela * new.multa_atraso_percentual / 100.0, 2);
  new.aplicar_desconto_matricula := (v_rule ->> 'aplicarDescontoMatricula')::boolean;
  new.aplicar_multa_juros_matricula := (v_rule ->> 'aplicarMultaJurosMatricula')::boolean;
  new.aplicar_desconto_mensalidade := (v_rule ->> 'aplicarDescontoMensalidade')::boolean;
  new.aplicar_multa_juros_mensalidade := (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean;
  new.aplicar_desconto_rematricula := (v_rule ->> 'aplicarDescontoRematricula')::boolean;
  new.aplicar_multa_juros_rematricula := (v_rule ->> 'aplicarMultaJurosRematricula')::boolean;
  new.instrucao_boleto_carne := v_rule ->> 'instrucaoBoleto';
  new.sincronizar_asaas_futuro := false;
  new.primeiro_vencimento_padrao := coalesce(new.primeiro_vencimento_padrao, new.data_inicio);
  v_first_due := coalesce(new.primeiro_vencimento_padrao, new.data_inicio, (pg_catalog.timezone('America/Maceio', now()))::date);
  new.cronograma_financeiro := internal_academic.build_flexible_technical_financial_schedule(v_first_due, v_rule);
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v3(
    new.data_inicio, new.primeiro_vencimento_padrao, v_rule
  );
  if tg_op = 'INSERT' then
    new.regra_financeira_revisao := 1;
  elsif old.regra_financeira_fingerprint is distinct from v_fingerprint then
    new.regra_financeira_revisao := greatest(coalesce(old.regra_financeira_revisao, 0) + 1, 1);
  else
    new.regra_financeira_revisao := old.regra_financeira_revisao;
  end if;
  new.regra_financeira_fingerprint := v_fingerprint;
  return new;
end;
$function$;

create or replace function internal_academic.technical_financial_rule(p_turma_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_rule jsonb;
  v_fingerprint text;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_first_due date;
  v_rendered jsonb;
  v_total numeric;
begin
  select class.*, upper(coalesce(course.modalidade, '')) as modalidade into v_turma
  from public.turmas class join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(jsonb_build_object(
    'cobrarMatricula', coalesce(v_turma.cobrar_matricula, v_turma.valor_matricula > 0),
    'valorMatricula', v_turma.valor_matricula,
    'qtdMensalidades', v_turma.qtd_parcelas,
    'valorMensalidade', v_turma.valor_parcela,
    'cobrarRematricula', coalesce(v_turma.cobrar_rematricula, v_turma.valor_rematricula > 0),
    'valorRematricula', v_turma.valor_rematricula,
    'diaVencimento', v_turma.dia_vencimento_padrao,
    'descontoPontualidade', v_turma.desconto_pontualidade,
    'jurosAtrasoPercentual', v_turma.juros_atraso,
    'multaAtrasoPercentual', coalesce(v_turma.multa_atraso_percentual, 0),
    'aplicarDescontoMatricula', v_turma.aplicar_desconto_matricula,
    'aplicarMultaJurosMatricula', v_turma.aplicar_multa_juros_matricula,
    'aplicarDescontoMensalidade', v_turma.aplicar_desconto_mensalidade,
    'aplicarMultaJurosMensalidade', v_turma.aplicar_multa_juros_mensalidade,
    'aplicarDescontoRematricula', v_turma.aplicar_desconto_rematricula,
    'aplicarMultaJurosRematricula', v_turma.aplicar_multa_juros_rematricula,
    'instrucaoBoleto', v_turma.instrucao_boleto_carne
  ));
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v3(
    v_turma.data_inicio, v_turma.primeiro_vencimento_padrao, v_rule
  );
  -- A identidade financeira deve refletir exatamente a data armazenada. Se ela
  -- já passou, a matrícula exige que o operador escolha explicitamente outra.
  v_first_due := coalesce(v_turma.primeiro_vencimento_padrao, v_turma.data_inicio, v_today);
  v_rendered := internal_academic.render_technical_financial_rule(
    v_rule,
    v_first_due,
    jsonb_build_object(
      'turmaRevisao', v_turma.regra_financeira_revisao,
      'turmaFingerprint', v_fingerprint,
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', v_fingerprint
    ),
    'TURMA'
  );
  v_total :=
    case when (v_rule ->> 'cobrarMatricula')::boolean then (v_rule ->> 'valorMatricula')::numeric else 0 end
    + ((v_rule ->> 'qtdMensalidades')::integer * (v_rule ->> 'valorMensalidade')::numeric)
    + case when (v_rule ->> 'cobrarRematricula')::boolean
      then (v_rule ->> 'valorRematricula')::numeric
        + ((v_rule ->> 'qtdMensalidades')::integer * (v_rule ->> 'valorMensalidade')::numeric)
      else 0 end;
  return v_rendered || jsonb_build_object(
    'revisao', v_turma.regra_financeira_revisao,
    'fingerprint', v_fingerprint,
    'primeiroVencimentoSugerido', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
    'valorMatricula', pg_catalog.to_char(v_turma.valor_matricula, 'FM999999990.00'),
    'valorMensalidade', pg_catalog.to_char(v_turma.valor_parcela, 'FM999999990.00'),
    'valorRematricula', pg_catalog.to_char(v_turma.valor_rematricula, 'FM999999990.00'),
    'mensalidadesPorCiclo', v_turma.qtd_parcelas,
    'diaVencimento', v_turma.dia_vencimento_padrao,
    'curso', jsonb_build_object(
      'totalCiclos', case when (v_rule ->> 'cobrarRematricula')::boolean then 2 else 1 end,
      'totalMensalidades', (v_rule ->> 'qtdMensalidades')::integer
        * case when (v_rule ->> 'cobrarRematricula')::boolean then 2 else 1 end,
      'totalNominal', pg_catalog.to_char(v_total, 'FM999999990.00')
    )
  );
end;
$function$;

create or replace function public.prever_regra_financeira_turma_tecnica_secure(
  p_turma_id uuid,
  p_regra jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_rule jsonb;
  v_first_due date;
  v_rendered jsonb;
  v_total numeric;
  v_fingerprint text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  select class.data_inicio, class.primeiro_vencimento_padrao, class.regra_financeira_revisao
  into v_turma from public.turmas class where class.id = p_turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(p_regra);
  v_first_due := coalesce(
    v_turma.primeiro_vencimento_padrao,
    v_turma.data_inicio,
    (pg_catalog.timezone('America/Maceio', now()))::date
  );
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v3(
    v_turma.data_inicio, v_turma.primeiro_vencimento_padrao, v_rule
  );
  v_rendered := internal_academic.render_technical_financial_rule(
    v_rule,
    v_first_due,
    jsonb_build_object(
      'preview', true,
      'turmaRevisao', v_turma.regra_financeira_revisao,
      'turmaFingerprint', v_fingerprint,
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', v_fingerprint
    ),
    'PREVIEW'
  );
  v_total :=
    case when (v_rule ->> 'cobrarMatricula')::boolean then (v_rule ->> 'valorMatricula')::numeric else 0 end
    + ((v_rule ->> 'qtdMensalidades')::integer * (v_rule ->> 'valorMensalidade')::numeric)
    + case when (v_rule ->> 'cobrarRematricula')::boolean
      then (v_rule ->> 'valorRematricula')::numeric
        + ((v_rule ->> 'qtdMensalidades')::integer * (v_rule ->> 'valorMensalidade')::numeric)
      else 0 end;
  return v_rendered || jsonb_build_object('curso', jsonb_build_object(
    'totalCiclos', case when (v_rule ->> 'cobrarRematricula')::boolean then 2 else 1 end,
    'totalMensalidades', (v_rule ->> 'qtdMensalidades')::integer
      * case when (v_rule ->> 'cobrarRematricula')::boolean then 2 else 1 end,
    'totalNominal', pg_catalog.to_char(v_total, 'FM999999990.00')
  ));
end;
$function$;

-- A regra do curso termina depois do segundo ciclo. O trigger é a última
-- barreira contra geradores legados que tentem abrir um terceiro ciclo.
create or replace function internal_academic.guard_technical_course_cycle_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cycle integer;
begin
  if new.matricula_id is null or new.origem_cronograma_id is null then return new; end if;
  if new.origem_cronograma_id !~ '^ciclo-[0-9]+-(parc-[0-9]+|rematricula)$' then return new; end if;
  if not exists (
    select 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = new.matricula_id
  ) then return new; end if;
  v_cycle := (pg_catalog.regexp_match(new.origem_cronograma_id, '^ciclo-([0-9]+)-'))[1]::integer;
  if (new.tipo_lancamento = 'PARCELA' and v_cycle > 2)
    or (new.tipo_lancamento = 'REMATRICULA' and v_cycle >= 2)
  then return null; end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_technical_course_cycle_limit()
  from public, anon, authenticated, service_role;
drop trigger if exists guard_technical_course_cycle_limit on public.contas_receber;
create trigger guard_technical_course_cycle_limit
before insert on public.contas_receber
for each row execute function internal_academic.guard_technical_course_cycle_limit();

-- Criação técnica transacional: turma e hash nascem juntos.
create or replace function public.criar_turma_tecnica_com_codigo_condicao_secure(
  p_request_id uuid,
  p_turma jsonb,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_polo_id uuid := (p_turma ->> 'polo_id')::uuid;
  v_curso_id uuid := (p_turma ->> 'curso_id')::uuid;
  v_payload_hash text;
  v_existing record;
  v_turma public.turmas%rowtype;
  v_response jsonb;
begin
  if p_request_id is null or p_turma is null or jsonb_typeof(p_turma) <> 'object' then
    raise exception 'Dados obrigatórios da turma não informados.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_turma ->> 'primeiro_vencimento_padrao', '')), '') is null then
    raise exception 'O primeiro vencimento padrão da turma é obrigatório.' using errcode = '22023';
  end if;
  perform internal_academic.validate_technical_condition_code(p_codigo);
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.gestor_has_module('gestao')
    and public.gestor_has_tab('gestao', 'financeiro')
    and public.is_gestor_for_polo(v_polo_id)
  ) then raise exception 'Sem permissão para criar turma técnica com regra financeira.' using errcode = '42501'; end if;
  perform 1 from public.cursos course
  where course.id = v_curso_id
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO');
  if not found then raise exception 'Curso técnico não encontrado.' using errcode = '22023'; end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(p_turma::text, 'UTF8'),
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('create-technical-class:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_individual_condition_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'CRIAR_TURMA_TECNICA'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
      or not exists (
        select 1
        from internal_academic.technical_individual_condition_codes code
        where code.turma_id = (v_existing.response -> 'turma' ->> 'id')::uuid
          and extensions.crypt(
            internal_academic.validate_technical_condition_code(p_codigo),
            code.code_hash
          ) = code.code_hash
      )
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  insert into public.turmas(
    codigo, nome, curso_id, polo_id, data_inicio, data_previsao_termino,
    data_inicio_inscricao, data_fim_inscricao, publicar_no_site,
    permitir_inscricoes_online, exige_matricula, aceita_concomitante,
    aceita_subsequente, serie_minima_ensino_medio, qtd_vagas_minima,
    frequencia_minima_percent, media_minima, bloquear_matriculas_apos_completar_vagas,
    turno, status, vagas_totais, cobrar_matricula, valor_matricula,
    cobrar_rematricula, valor_rematricula, qtd_parcelas, valor_parcela,
    desconto_pontualidade, juros_atraso, multa_atraso, multa_atraso_percentual,
    aplicar_desconto_matricula, aplicar_multa_juros_matricula,
    aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade,
    aplicar_desconto_rematricula, aplicar_multa_juros_rematricula,
    dia_vencimento_padrao, primeiro_vencimento_padrao, instrucao_boleto_carne,
    cronograma_financeiro, origem_financeira, financeiro_herdado,
    gerar_cobrancas_futuras, sincronizar_asaas_futuro, obs_financeira_origem
  ) values (
    p_turma ->> 'codigo', p_turma ->> 'nome', v_curso_id, v_polo_id,
    (p_turma ->> 'data_inicio')::date, (p_turma ->> 'data_previsao_termino')::date,
    nullif(p_turma ->> 'data_inicio_inscricao', '')::date,
    nullif(p_turma ->> 'data_fim_inscricao', '')::date,
    coalesce((p_turma ->> 'publicar_no_site')::boolean, false),
    coalesce((p_turma ->> 'permitir_inscricoes_online')::boolean, false),
    coalesce((p_turma ->> 'exige_matricula')::boolean, true),
    coalesce((p_turma ->> 'aceita_concomitante')::boolean, true),
    coalesce((p_turma ->> 'aceita_subsequente')::boolean, true),
    coalesce((p_turma ->> 'serie_minima_ensino_medio')::integer, 2),
    coalesce((p_turma ->> 'qtd_vagas_minima')::integer, 0),
    coalesce((p_turma ->> 'frequencia_minima_percent')::numeric, 75),
    coalesce((p_turma ->> 'media_minima')::numeric, 6),
    coalesce((p_turma ->> 'bloquear_matriculas_apos_completar_vagas')::boolean, true),
    p_turma ->> 'turno', p_turma ->> 'status',
    coalesce((p_turma ->> 'vagas_totais')::integer, 40),
    coalesce((p_turma ->> 'cobrar_matricula')::boolean, true),
    (p_turma ->> 'valor_matricula')::numeric,
    coalesce((p_turma ->> 'cobrar_rematricula')::boolean, true),
    (p_turma ->> 'valor_rematricula')::numeric,
    (p_turma ->> 'qtd_parcelas')::integer,
    (p_turma ->> 'valor_parcela')::numeric,
    (p_turma ->> 'desconto_pontualidade')::numeric,
    (p_turma ->> 'juros_atraso')::numeric,
    0,
    (p_turma ->> 'multa_atraso_percentual')::numeric,
    coalesce((p_turma ->> 'aplicar_desconto_matricula')::boolean, false),
    coalesce((p_turma ->> 'aplicar_multa_juros_matricula')::boolean, false),
    coalesce((p_turma ->> 'aplicar_desconto_mensalidade')::boolean, true),
    coalesce((p_turma ->> 'aplicar_multa_juros_mensalidade')::boolean, true),
    coalesce((p_turma ->> 'aplicar_desconto_rematricula')::boolean, false),
    coalesce((p_turma ->> 'aplicar_multa_juros_rematricula')::boolean, false),
    (p_turma ->> 'dia_vencimento_padrao')::integer,
    (p_turma ->> 'primeiro_vencimento_padrao')::date,
    p_turma ->> 'instrucao_boleto_carne', '[]'::jsonb,
    coalesce(p_turma ->> 'origem_financeira', 'NORMAL'),
    coalesce((p_turma ->> 'financeiro_herdado')::boolean, false),
    coalesce((p_turma ->> 'gerar_cobrancas_futuras')::boolean, true),
    false,
    nullif(p_turma ->> 'obs_financeira_origem', '')
  ) returning * into v_turma;
  perform internal_academic.set_technical_condition_code(
    v_turma.id, p_codigo, auth.uid(), 'CODIGO_CONDICAO_INDIVIDUAL_CRIADO', 'Definido na criação da turma.'
  );
  v_response := jsonb_build_object(
    'operacao', 'CRIAR_TURMA_TECNICA',
    'requestId', p_request_id,
    'replayed', false,
    'turma', to_jsonb(v_turma)
  );
  insert into internal_academic.technical_individual_condition_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'CRIAR_TURMA_TECNICA', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.criar_turma_tecnica_com_codigo_condicao_secure(uuid, jsonb, text)
  from public, anon;
grant execute on function public.criar_turma_tecnica_com_codigo_condicao_secure(uuid, jsonb, text)
  to authenticated, service_role;

create or replace function public.salvar_override_financeiro_matricula_tecnica_autorizado_secure(
  p_matricula_id uuid,
  p_request_id uuid,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_override_revisao integer,
  p_expected_override_fingerprint text,
  p_override jsonb,
  p_codigo text,
  p_motivo text,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_aluno_id uuid;
  v_turma public.turmas%rowtype;
  v_authorization jsonb;
  v_payload_hash text;
  v_existing record;
  v_inner_request_id uuid;
  v_response jsonb;
  v_motivo text := upper(pg_catalog.btrim(coalesce(p_motivo, '')));
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  select enrollment.turma_id, enrollment.aluno_id into v_turma_id, v_aluno_id
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  perform internal_academic.assert_can_manage_technical_condition(v_turma_id, false);
  if p_override is null or jsonb_typeof(p_override) <> 'object' then
    raise exception 'Condição individual inválida.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_each(p_override) item
    where item.key not in (
      'cobrarMatricula', 'valorMatricula', 'valorMensalidade',
      'valorRematricula', 'descontoPontualidade'
    )
      and item.value <> 'null'::jsonb
  ) then
    raise exception 'A condição individual só pode alterar matrícula, mensalidade, rematrícula e desconto em dia.'
      using errcode = '22023';
  end if;
  select class.* into v_turma from public.turmas class where class.id = v_turma_id;
  if (p_override ->> 'valorMatricula') is not null
      and (p_override ->> 'valorMatricula')::numeric > coalesce(v_turma.valor_matricula, 0)
    or (p_override ->> 'valorMensalidade') is not null
      and (p_override ->> 'valorMensalidade')::numeric > coalesce(v_turma.valor_parcela, 0)
    or (p_override ->> 'valorRematricula') is not null
      and (p_override ->> 'valorRematricula')::numeric > coalesce(v_turma.valor_rematricula, 0)
    or (p_override ->> 'descontoPontualidade') is not null
      and (p_override ->> 'descontoPontualidade')::numeric < coalesce(v_turma.desconto_pontualidade, 0)
    or coalesce((p_override ->> 'cobrarMatricula')::boolean, false)
      and not coalesce(v_turma.cobrar_matricula, false)
  then
    raise exception 'A condição individual deve representar bolsa, isenção ou desconto em relação à turma.'
      using errcode = '22023';
  end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id,
      'expectedTurmaRevisao', p_expected_turma_revisao,
      'expectedTurmaFingerprint', p_expected_turma_fingerprint,
      'expectedOverrideRevisao', p_expected_override_revisao,
      'expectedOverrideFingerprint', p_expected_override_fingerprint,
      'override', p_override,
      'motivo', v_motivo,
      'justificativa', nullif(pg_catalog.btrim(coalesce(p_justificativa, '')), '')
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-condition-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_individual_condition_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'SALVAR_OVERRIDE_AUTORIZADO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  v_authorization := public.validar_codigo_condicao_individual_turma_tecnica_secure(
    v_turma_id, v_aluno_id, p_codigo, v_motivo, p_justificativa
  );
  if coalesce((v_authorization ->> 'autorizado')::boolean, false) is not true then
    -- Retornar, em vez de lançar exceção, preserva o contador de tentativas.
    -- O cliente rejeita este contrato por não conter matrícula/workspace.
    return jsonb_build_object(
      'operacao', 'AUTORIZACAO_NEGADA',
      'requestId', p_request_id,
      'replayed', false,
      'autorizacao', v_authorization
    );
  end if;
  v_inner_request_id := (
    pg_catalog.substr(pg_catalog.md5('condition:' || p_request_id::text), 1, 8) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition:' || p_request_id::text), 9, 4) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition:' || p_request_id::text), 13, 4) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition:' || p_request_id::text), 17, 4) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition:' || p_request_id::text), 21, 12)
  )::uuid;
  v_response := public.salvar_override_financeiro_matricula_tecnica_secure(
    p_matricula_id,
    v_inner_request_id,
    p_expected_turma_revisao,
    p_expected_turma_fingerprint,
    p_expected_override_revisao,
    p_expected_override_fingerprint,
    p_override
  );
  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    v_turma_id,
    p_matricula_id,
    'CONDICAO_INDIVIDUAL_AUTORIZADA',
    jsonb_build_object('motivo', v_motivo, 'atorId', auth.uid(), 'requestId', p_request_id),
    nullif(pg_catalog.btrim(coalesce(p_justificativa, '')), '')
  );
  v_response := jsonb_set(v_response, '{requestId}', to_jsonb(p_request_id), true);
  insert into internal_academic.technical_individual_condition_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'SALVAR_OVERRIDE_AUTORIZADO', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.salvar_override_financeiro_matricula_tecnica_autorizado_secure(
  uuid, uuid, integer, text, integer, text, jsonb, text, text, text
) from public, anon;
grant execute on function public.salvar_override_financeiro_matricula_tecnica_autorizado_secure(
  uuid, uuid, integer, text, integer, text, jsonb, text, text, text
) to authenticated, service_role;

create or replace function public.remover_override_financeiro_matricula_tecnica_autorizado_secure(
  p_matricula_id uuid,
  p_request_id uuid,
  p_expected_turma_revisao integer,
  p_expected_turma_fingerprint text,
  p_expected_override_revisao integer,
  p_expected_override_fingerprint text,
  p_codigo text,
  p_motivo text,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_aluno_id uuid;
  v_authorization jsonb;
  v_payload_hash text;
  v_existing record;
  v_inner_request_id uuid;
  v_response jsonb;
  v_motivo text := upper(pg_catalog.btrim(coalesce(p_motivo, '')));
begin
  if p_request_id is null then raise exception 'requestId é obrigatório.' using errcode = '22023'; end if;
  select enrollment.turma_id, enrollment.aluno_id into v_turma_id, v_aluno_id
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  perform internal_academic.assert_can_manage_technical_condition(v_turma_id, false);
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id,
      'expectedTurmaRevisao', p_expected_turma_revisao,
      'expectedTurmaFingerprint', p_expected_turma_fingerprint,
      'expectedOverrideRevisao', p_expected_override_revisao,
      'expectedOverrideFingerprint', p_expected_override_fingerprint,
      'motivo', v_motivo,
      'justificativa', nullif(pg_catalog.btrim(coalesce(p_justificativa, '')), '')
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-condition-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_individual_condition_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'REMOVER_OVERRIDE_AUTORIZADO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  v_authorization := public.validar_codigo_condicao_individual_turma_tecnica_secure(
    v_turma_id, v_aluno_id, p_codigo, v_motivo, p_justificativa
  );
  if coalesce((v_authorization ->> 'autorizado')::boolean, false) is not true then
    return jsonb_build_object(
      'operacao', 'AUTORIZACAO_NEGADA',
      'requestId', p_request_id,
      'replayed', false,
      'autorizacao', v_authorization
    );
  end if;
  v_inner_request_id := (
    pg_catalog.substr(pg_catalog.md5('condition-remove:' || p_request_id::text), 1, 8) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition-remove:' || p_request_id::text), 9, 4) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition-remove:' || p_request_id::text), 13, 4) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition-remove:' || p_request_id::text), 17, 4) || '-' ||
    pg_catalog.substr(pg_catalog.md5('condition-remove:' || p_request_id::text), 21, 12)
  )::uuid;
  v_response := public.remover_override_financeiro_matricula_tecnica_secure(
    p_matricula_id,
    v_inner_request_id,
    p_expected_turma_revisao,
    p_expected_turma_fingerprint,
    p_expected_override_revisao,
    p_expected_override_fingerprint
  );
  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    v_turma_id,
    p_matricula_id,
    'CONDICAO_INDIVIDUAL_REMOVIDA_AUTORIZADA',
    jsonb_build_object('motivo', v_motivo, 'atorId', auth.uid(), 'requestId', p_request_id),
    nullif(pg_catalog.btrim(coalesce(p_justificativa, '')), '')
  );
  v_response := jsonb_set(v_response, '{requestId}', to_jsonb(p_request_id), true);
  insert into internal_academic.technical_individual_condition_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'REMOVER_OVERRIDE_AUTORIZADO', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.remover_override_financeiro_matricula_tecnica_autorizado_secure(
  uuid, uuid, integer, text, integer, text, text, text, text
) from public, anon;
grant execute on function public.remover_override_financeiro_matricula_tecnica_autorizado_secure(
  uuid, uuid, integer, text, integer, text, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
