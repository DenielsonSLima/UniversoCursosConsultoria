-- Regressao sintetica do primeiro preview do ciclo 1.
-- Nao cria matricula, recebivel ou emissao; todas as estruturas sao pg_temp
-- e a transacao termina sempre em rollback.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

create temporary table first_preview_enrollment (
  id uuid primary key,
  turma_id uuid not null
);

create temporary table first_preview_class (
  id uuid primary key,
  codigo text not null,
  nome text not null
);

create temporary table first_preview_receivable (
  matricula_id uuid not null,
  tipo_lancamento text,
  origem_cronograma_id text,
  data_vencimento date
);

create temporary table first_preview_context (
  matricula_id uuid primary key,
  state jsonb not null,
  rule jsonb not null
);

insert into first_preview_class (id, codigo, nome)
values (
  '00000000-0000-4000-8000-000000000046',
  'T-SINTETICA',
  'Turma sintetica'
);

insert into first_preview_enrollment (id, turma_id)
values (
  '00000000-0000-4000-8000-000000000146',
  '00000000-0000-4000-8000-000000000046'
);

insert into first_preview_context (matricula_id, state, rule)
values (
  '00000000-0000-4000-8000-000000000146',
  jsonb_build_object(
    'habilitado', true,
    'podeGerar', true,
    'proximoCicloNumero', 1,
    'politica', jsonb_build_object('fingerprint', 'synthetic-policy')
  ),
  jsonb_build_object(
    'identidade', jsonb_build_object(
      'efetivaFingerprint', 'synthetic-rule'
    ),
    'vencimento', jsonb_build_object('diaBase', 5),
    'cobranca', jsonb_build_object(
      'matricula', jsonb_build_object('valor', '100.00'),
      'mensalidade', jsonb_build_object(
        'quantidade', 12,
        'valor', '300.00'
      ),
      'rematricula', jsonb_build_object(
        'habilitada', true,
        'valor', '100.00'
      )
    ),
    'encargos', jsonb_build_object(
      'descontoPontualidade', '0.00',
      'jurosAtrasoPercentual', '0.00',
      'multaAtrasoPercentual', '0.00'
    ),
    'aplicacao', jsonb_build_object(
      'matricula', jsonb_build_object(
        'desconto', false,
        'multaJuros', false
      ),
      'rematricula', jsonb_build_object(
        'desconto', false,
        'multaJuros', false
      ),
      'mensalidade', jsonb_build_object(
        'desconto', false,
        'multaJuros', false
      )
    ),
    'boleto', jsonb_build_object('instrucao', 'CONTRATO SINTETICO')
  )
);

create function pg_temp.first_preview_assert_fresh(uuid)
returns void
language sql
stable
set search_path = ''
as $function$
  select null::void;
$function$;

create function pg_temp.first_preview_state(p_matricula_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select c.state
  from pg_temp.first_preview_context c
  where c.matricula_id = p_matricula_id;
$function$;

create function pg_temp.first_preview_rule(p_matricula_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select c.rule
  from pg_temp.first_preview_context c
  where c.matricula_id = p_matricula_id;
$function$;

-- Copia as funcoes vigentes para pg_temp e troca apenas as dependencias de
-- dados/tempo. Assim o teste exercita o corpo real sem ler ou gravar fixtures.
do $clone$
declare
  v_definition text;
  v_old text;
begin
  v_definition := pg_get_functiondef(
    'internal_academic.review_manual_cycle_items_with_enrollment_mode(jsonb,jsonb,jsonb,text,text,text)'::regprocedure
  );
  if pg_catalog.strpos(v_definition, 'manual_cycle_due_is_allowed') = 0 then
    raise exception 'A revisao vigente perdeu a guarda de vencimento.';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.review_manual_cycle_items_with_enrollment_mode',
    'pg_temp.first_preview_review_with_mode'
  );
  v_old := $old$v_today date := pg_catalog.timezone('America/Maceio', pg_catalog.now())::date;$old$;
  if pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'A fronteira temporal da revisao mudou.';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    v_old,
    $new$v_today date := date '2026-09-30';$new$
  );
  execute v_definition;

  v_definition := pg_get_functiondef(
    'internal_academic.review_manual_cycle_items(jsonb,jsonb,jsonb,text,text)'::regprocedure
  );
  if pg_catalog.strpos(v_definition, 'manual_cycle_enrollment_mode') = 0 then
    raise exception 'A revisao vigente perdeu o modo explicito da matricula.';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.review_manual_cycle_items_with_enrollment_mode',
    'pg_temp.first_preview_review_with_mode'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.review_manual_cycle_items',
    'pg_temp.first_preview_review_items'
  );
  execute v_definition;

  v_definition := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)'::regprocedure
  );
  if pg_catalog.strpos(v_definition, 'manual_cycle_due_is_allowed') = 0
    or pg_catalog.strpos(v_definition, 'manual_cycle_monthly_offset') = 0
    or pg_catalog.strpos(v_definition, 'review_manual_cycle_items') = 0
  then
    raise exception 'A implementacao vigente perdeu as guardas do primeiro preview.';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry',
    'pg_temp.first_preview'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'public.matriculas%rowtype',
    'pg_temp.first_preview_enrollment%rowtype'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'public.turmas%rowtype',
    'pg_temp.first_preview_class%rowtype'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_proesc.assert_fresh_cycle_generation',
    'pg_temp.first_preview_assert_fresh'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.technical_manual_cycle_state',
    'pg_temp.first_preview_state'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.technical_financial_effective_rule',
    'pg_temp.first_preview_rule'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'internal_academic.review_manual_cycle_items',
    'pg_temp.first_preview_review_items'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'public.matriculas',
    'pg_temp.first_preview_enrollment'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'public.turmas',
    'pg_temp.first_preview_class'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'public.contas_receber',
    'pg_temp.first_preview_receivable'
  );
  v_old := $old$v_today date := timezone('America/Maceio', now())::date;$old$;
  if pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'A fronteira temporal do preview mudou.';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    v_old,
    $new$v_today date := date '2026-09-30';$new$
  );
  if pg_catalog.strpos(v_definition, 'public.matriculas') > 0
    or pg_catalog.strpos(v_definition, 'public.turmas') > 0
    or pg_catalog.strpos(v_definition, 'public.contas_receber') > 0
    or pg_catalog.strpos(v_definition, 'internal_proesc.assert_fresh_cycle_generation') > 0
  then
    raise exception 'O clone do preview ainda depende de dados operacionais.';
  end if;
  execute v_definition;
end;
$clone$;

do $test$
declare
  v_id constant uuid := '00000000-0000-4000-8000-000000000146';
  v_local jsonb;
  v_omit jsonb;
  v_cycle_two jsonb;
  v_cycle_two_legacy jsonb;
  v_item jsonb;
  v_number integer;
  v_expected date;
  v_wrapper text;
begin
  -- O wrapper externo deve continuar repassando a revisao ao corpo testado.
  v_wrapper := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)'::regprocedure
  );
  if pg_catalog.strpos(
    v_wrapper,
    'technical_manual_cycle_reviewed_preview_before_transfer_entry'
  ) = 0 or pg_catalog.strpos(
    v_wrapper,
    'p_matricula_id,p_cycle_number,v_due,p_review'
  ) = 0 then
    raise exception 'O wrapper nao encaminha a revisao para o preview vigente.';
  end if;

  -- O modo chega ja na primeira chamada: matricula local retroativa em 05/09,
  -- seguida de mensalidades em meses-calendario independentes.
  v_local := pg_temp.first_preview(
    v_id,
    1,
    date '2026-09-05',
    jsonb_build_object(
      'modoMatricula', 'REGISTRO_SEM_BOLETO',
      'emitirMatricula', false,
      'itens', '[]'::jsonb
    )
  ) -> 'preview';

  if v_local ->> 'dataOrigem' is distinct from '2026-09-05'
    or v_local ->> 'primeiroVencimento' is distinct from '2026-09-05'
    or v_local ->> 'modoMatricula' is distinct from 'REGISTRO_SEM_BOLETO'
    or v_local ->> 'quantidadeItens' is distinct from '13'
    or v_local ->> 'quantidadeBancaria' is distinct from '12'
    or v_local ->> 'quantidadeLocal' is distinct from '1'
    or v_local #>> '{itens,0,tipo}' is distinct from 'MATRICULA'
    or v_local #>> '{itens,0,destinoCobranca}' is distinct from 'LOCAL'
    or v_local #>> '{itens,0,vencimento}' is distinct from '2026-09-05'
    or v_local #>> '{itens,1,vencimento}' is distinct from '2026-10-05'
    or v_local #>> '{itens,2,vencimento}' is distinct from '2026-11-05'
    or v_local #>> '{itens,12,vencimento}' is distinct from '2027-09-05'
  then
    raise exception 'Primeiro preview local nao preservou 05/09, M1 05/10 e M2 05/11.';
  end if;

  for v_item, v_number in
    select item, (item ->> 'numero')::integer
    from jsonb_array_elements(v_local -> 'itens') a(item)
    where item ->> 'tipo' = 'PARCELA'
  loop
    v_expected := public.data_vencimento_mensal(
      date '2026-09-05',
      5,
      v_number
    );
    if (v_item ->> 'vencimento')::date is distinct from v_expected then
      raise exception 'Parcela % deixou de seguir mes-calendario: %, esperado %.',
        v_number, v_item ->> 'vencimento', v_expected;
    end if;
  end loop;

  -- OMITIR usa a data de origem na M1; nao cria matricula nem reserva um mes.
  v_omit := pg_temp.first_preview(
    v_id,
    1,
    date '2026-10-05',
    jsonb_build_object(
      'modoMatricula', 'OMITIR',
      'emitirMatricula', false,
      'itens', '[]'::jsonb
    )
  ) -> 'preview';

  if v_omit ->> 'dataOrigem' is distinct from '2026-10-05'
    or v_omit ->> 'primeiroVencimento' is distinct from '2026-10-05'
    or v_omit ->> 'modoMatricula' is distinct from 'OMITIR'
    or v_omit ->> 'quantidadeItens' is distinct from '12'
    or v_omit ->> 'quantidadeBancaria' is distinct from '12'
    or v_omit ->> 'quantidadeLocal' is distinct from '0'
    or exists (
      select 1
      from jsonb_array_elements(v_omit -> 'itens') i
      where i ->> 'tipo' = 'MATRICULA'
    )
    or v_omit #>> '{matriculaSemBoleto,tipo}' is distinct from 'MATRICULA'
    or v_omit #>> '{itens,0,numero}' is distinct from '1'
    or v_omit #>> '{itens,0,vencimento}' is distinct from '2026-10-05'
    or v_omit #>> '{itens,1,vencimento}' is distinct from '2026-11-05'
    or v_omit #>> '{itens,11,vencimento}' is distinct from '2027-09-05'
  then
    raise exception 'OMITIR criou matricula ou ainda reservou o primeiro mes.';
  end if;

  -- A excecao retroativa permanece fechada para boleto.
  begin
    perform pg_temp.first_preview(
      v_id,
      1,
      date '2026-09-05',
      jsonb_build_object(
        'modoMatricula', 'BOLETO',
        'emitirMatricula', true,
        'itens', '[]'::jsonb
      )
    );
    raise exception 'Preview aceitou boleto de matricula retroativo.'
      using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;

  -- O ajuste do ciclo 1 nao altera o contrato do ciclo 2: rematricula no
  -- primeiro vencimento e M1 no mes seguinte, inclusive no legado booleano.
  update pg_temp.first_preview_context
  set state = jsonb_set(state, '{proximoCicloNumero}', '2'::jsonb)
  where matricula_id = v_id;

  v_cycle_two := pg_temp.first_preview(
    v_id,
    2,
    date '2026-10-05',
    null
  ) -> 'preview';
  if v_cycle_two ->> 'quantidadeItens' is distinct from '13'
    or v_cycle_two ->> 'modoMatricula' is distinct from 'BOLETO'
    or v_cycle_two #>> '{itens,0,tipo}' is distinct from 'REMATRICULA'
    or v_cycle_two #>> '{itens,0,vencimento}' is distinct from '2026-10-05'
    or v_cycle_two #>> '{itens,1,numero}' is distinct from '1'
    or v_cycle_two #>> '{itens,1,vencimento}' is distinct from '2026-11-05'
    or v_cycle_two #>> '{itens,12,vencimento}' is distinct from '2027-10-05'
  then
    raise exception 'O contrato de rematricula e mensalidades do ciclo 2 mudou.';
  end if;

  v_cycle_two_legacy := pg_temp.first_preview(
    v_id,
    2,
    date '2026-10-05',
    jsonb_build_object('emitirMatricula', false, 'itens', '[]'::jsonb)
  ) -> 'preview';
  if v_cycle_two_legacy ->> 'quantidadeItens' is distinct from '13'
    or v_cycle_two_legacy #>> '{itens,0,tipo}' is distinct from 'REMATRICULA'
    or v_cycle_two_legacy #>> '{itens,0,vencimento}' is distinct from '2026-10-05'
    or v_cycle_two_legacy #>> '{itens,1,vencimento}' is distinct from '2026-11-05'
  then
    raise exception 'O booleano legado suprimiu a rematricula do ciclo 2.';
  end if;
end;
$test$;

rollback;
