begin;
set local lock_timeout = '5s';

alter table public.turmas
  alter column aplicar_desconto_rematricula set default false;

do $t42_correction$
declare
  v_class public.turmas%rowtype;
  v_target public.contas_receber%rowtype;
  v_updated_count integer;
  v_counts record;
  v_marker constant text :=
    'BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT';
begin
  select class.* into strict v_class
  from public.turmas as class
  where class.codigo = 'ENF-T42-INT-MAT'
  for update;
  if v_class.regra_financeira_revisao <> 1
    or v_class.regra_financeira_fingerprint <>
      'c020ef5ed4f371d235da937ae0cea177583f6f14dcdecf437ab12bd26bdd16cb'
    or round(v_class.valor_matricula, 2) <> 200.00
    or round(v_class.valor_rematricula, 2) <> 100.00
    or round(v_class.valor_parcela, 2) <> 279.90
    or v_class.qtd_parcelas <> 12
    or round(v_class.desconto_pontualidade, 2) <> 19.90
    or v_class.aplicar_desconto_matricula is not false
    or v_class.aplicar_desconto_mensalidade is not true
    or v_class.aplicar_desconto_rematricula is not true
  then
    raise exception 'CAS financeiro da T42 divergiu; nenhuma alteração aplicada.'
      using errcode = '40001';
  end if;

  select
    count(distinct enrollment.id) as enrollments,
    count(distinct config.matricula_id) as configs,
    count(distinct receivable.id) as receivables,
    count(distinct receivable.id) filter (
      where receivable.gateway_provider = 'banese_card'
        and receivable.gateway_environment = 'production'
        and receivable.gateway_payment_method = 'BOLETO'
    ) as bank_titles,
    count(distinct receivable.id) filter (
      where receivable.gateway_provider = 'banese_card'
        and receivable.gateway_environment = 'production'
        and receivable.gateway_payment_method = 'BOLETO'
        and receivable.tipo_lancamento = 'PARCELA'
    ) as bank_monthlies,
    count(distinct receivable.id) filter (
      where receivable.gateway_provider = 'banese_card'
        and receivable.gateway_environment = 'production'
        and receivable.gateway_payment_method = 'BOLETO'
        and receivable.tipo_lancamento = 'REMATRICULA'
    ) as bank_reenrollments,
    count(distinct transaction.id) filter (
      where transaction.provider_code = 'banese_card'
        and transaction.environment = 'production'
        and transaction.payment_method = 'BOLETO'
    ) as bank_transactions
  into v_counts
  from public.matriculas as enrollment
  left join public.matriculas_tecnicas_financeiro_config as config
    on config.matricula_id = enrollment.id
  left join public.contas_receber as receivable
    on receivable.matricula_id = enrollment.id
  left join public.payment_gateway_transactions as transaction
    on transaction.receivable_id = receivable.id
  where enrollment.turma_id = v_class.id;
  if v_counts.enrollments <> 35 or v_counts.configs <> 35
    or v_counts.receivables <> 353 or v_counts.bank_titles <> 13
    or v_counts.bank_monthlies <> 12 or v_counts.bank_reenrollments <> 1
    or v_counts.bank_transactions <> 13
  then
    raise exception 'Contagens da T42 divergiram; nenhuma alteração aplicada.'
      using errcode = '40001';
  end if;

  update public.turmas as class
  set aplicar_desconto_rematricula = false
  where class.id = v_class.id
    and class.regra_financeira_revisao = 1
    and class.regra_financeira_fingerprint = v_class.regra_financeira_fingerprint
    and class.aplicar_desconto_rematricula is true;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'CAS da regra T42 não atualizou exatamente uma turma.'
      using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.turmas as class
    where class.id = v_class.id
      and class.regra_financeira_revisao = 2
      and class.regra_financeira_fingerprint =
        '5439c26924faa7a642d14377cac507c3caa47e0b5f646de11d632227d612ab21'
      and class.aplicar_desconto_rematricula is false
  ) then
    raise exception 'Fingerprint corrigido da T42 não foi produzido.'
      using errcode = '23514';
  end if;

  select receivable.* into strict v_target
  from public.contas_receber as receivable
  join public.matriculas as enrollment on enrollment.id = receivable.matricula_id
  where enrollment.turma_id = v_class.id
    and receivable.tipo_lancamento = 'REMATRICULA'
    and receivable.parcela_numero = 0
    and round(receivable.valor, 2) = 100.00
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = 'production'
    and receivable.gateway_payment_method = 'BOLETO'
  for update of receivable;
  if v_target.status <> 'PENDENTE' or v_target.gateway_status <> 'PENDING'
    or v_target.gateway_submission_channel <> 'API'
    or v_target.gateway_submission_status <> 'API_REGISTERED'
    or v_target.gateway_cnab_file_id is not null
    or v_target.data_pagamento is not null or v_target.valor_pago is not null
    or v_target.gateway_last_error is not null
    or v_target.gateway_financial_terms_confirmed_at is null
    or coalesce((v_target.regra_financeira_tecnica_snapshot
      ->> 'aplicarDesconto')::boolean, false) is not true
    or round((v_target.regra_financeira_tecnica_snapshot
      ->> 'descontoPontualidade')::numeric, 2) <> 19.90
    or coalesce(v_target.gateway_financial_terms -> 'discount' ->> 'type', '')
      <> 'fixed'
    or round((v_target.gateway_financial_terms -> 'discount'
      ->> 'value')::numeric, 2) <> 19.90
    or coalesce(v_target.gateway_boleto_nosso_numero, '') !~ '^[0-9]{9}$'
    or coalesce(v_target.gateway_boleto_linha_digitavel, '') !~ '^[0-9]{47}$'
    or coalesce(v_target.gateway_boleto_codigo_barras, '') !~ '^[0-9]{44}$'
    or (select count(*) from public.payment_gateway_transactions as transaction
        where transaction.receivable_id = v_target.id) <> 1
  then
    raise exception 'Rematrícula T42 não está no estado bancário auditado.'
      using errcode = '40001';
  end if;

  update public.contas_receber as receivable
  set gateway_last_error = v_marker, updated_at = clock_timestamp()
  where receivable.id = v_target.id
    and receivable.updated_at = v_target.updated_at
    and receivable.gateway_last_error is null;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'CAS do marcador T42 não atualizou exatamente um título.'
      using errcode = '40001';
  end if;
end;
$t42_correction$;

do $validate$
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_attrdef as default_value
      on default_value.adrelid = attribute.attrelid
     and default_value.adnum = attribute.attnum
    where attribute.attrelid = 'public.turmas'::regclass
      and attribute.attname = 'aplicar_desconto_rematricula'
      and pg_catalog.pg_get_expr(
        default_value.adbin, default_value.adrelid
      ) = 'false'
  ) then
    raise exception 'Default de rematrícula sem desconto não foi instalado.';
  end if;
  if has_function_privilege('anon',
      'public.persist_banese_discount_removal_correction(uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid)',
      'EXECUTE')
    or has_function_privilege('authenticated',
      'public.persist_banese_discount_removal_correction(uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.persist_banese_discount_removal_correction(uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid)',
      'EXECUTE')
  then
    raise exception 'Privilégios da RPC de correção Banese estão incorretos.';
  end if;
  if position(
      'banese_discount_correction_audit' in pg_get_functiondef(
        'internal_academic.guard_technical_receivable_policy_snapshot()'::regprocedure
      )
    ) = 0
  then
    raise exception 'Guard técnico não contém autorização transacional auditada.';
  end if;
  if (select count(*) from public.contas_receber as receivable
      join public.matriculas as enrollment on enrollment.id = receivable.matricula_id
      join public.turmas as class on class.id = enrollment.turma_id
      where class.codigo = 'ENF-T42-INT-MAT'
        and receivable.tipo_lancamento = 'REMATRICULA'
        and receivable.parcela_numero = 0
        and receivable.gateway_last_error =
          'BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT') <> 1
    or (select count(*) from public.contas_receber as receivable
        where receivable.gateway_last_error =
          'BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT') <> 1
  then
    raise exception 'Marcador de reparo não ficou restrito à rematrícula T42.';
  end if;
end;
$validate$;

commit;
