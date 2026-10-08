-- One-off correction authorized by the owner on 2026-10-07.
-- Bank cancellations are already confirmed. No bank call or issuance occurs here.
-- Preserve technical evidence privately; remove only the erroneous operational run.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if md5(pg_get_functiondef('internal_academic.guard_technical_manual_banese_canceled_number_reuse()'::regprocedure))
    <> '021ca2c47baeed9e513fabd78b835dd9' then
    raise exception 'Canceled-number guard changed since review.';
  end if;
end;
$$;

create table internal_financial_correction.normal_cycle_reset_archive (
  reset_key text not null default 'T46_FIRST_CYCLE_RESET_20261007',
  source_table text not null,
  source_key text not null,
  payload jsonb not null,
  bank_environment text,
  bank_convenio text,
  canceled_nosso_numero text,
  archived_at timestamptz not null default clock_timestamp(),
  primary key (reset_key, source_table, source_key)
);
alter table internal_financial_correction.normal_cycle_reset_archive enable row level security;
revoke all on internal_financial_correction.normal_cycle_reset_archive
  from public, anon, authenticated, service_role;
create index normal_cycle_reset_canceled_number
  on internal_financial_correction.normal_cycle_reset_archive
  (bank_environment, bank_convenio, canceled_nosso_numero)
  where canceled_nosso_numero is not null;

create function internal_financial_correction.preserve_normal_cycle_reset_archive()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Technical reset evidence is immutable.' using errcode = '55000';
end;
$$;
revoke all on function internal_financial_correction.preserve_normal_cycle_reset_archive()
  from public, anon, authenticated, service_role;
create trigger preserve_normal_cycle_reset_archive
  before update or delete on internal_financial_correction.normal_cycle_reset_archive
  for each row execute function internal_financial_correction.preserve_normal_cycle_reset_archive();

-- Retain the existing cross-modality fence after moving the old operational jobs.
create or replace function internal_academic.guard_technical_manual_banese_canceled_number_reuse()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.gateway_boleto_nosso_numero is null
    or new.gateway_provider is distinct from 'banese_card'
    or new.gateway_payment_method is distinct from 'BOLETO' then
    return new;
  end if;
  if new.gateway_environment is null or new.gateway_boleto_convenio is null then
    raise exception 'Ambiente e convênio Banese são obrigatórios.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banese-canceled-number:' || new.gateway_environment || ':' ||
    new.gateway_boleto_convenio || ':' || new.gateway_boleto_nosso_numero, 0));
  if exists (
    select 1 from internal_academic.technical_manual_banese_reissue_archive a
    where a.environment = new.gateway_environment
      and a.convenio = new.gateway_boleto_convenio
      and a.canceled_nosso_numero = new.gateway_boleto_nosso_numero
    union all
    select 1 from public.banese_ead_title_replacement_archive a
    where a.environment = new.gateway_environment
      and a.convenio = new.gateway_boleto_convenio
      and a.canceled_nosso_numero = new.gateway_boleto_nosso_numero
    union all
    select 1 from internal_financial_correction.normal_cycle_reset_archive a
    where a.bank_environment = new.gateway_environment
      and a.bank_convenio = new.gateway_boleto_convenio
      and a.canceled_nosso_numero = new.gateway_boleto_nosso_numero
  ) then
    raise exception 'Nosso Número Banese cancelado não pode ser reutilizado.' using errcode = '23505';
  end if;
  return new;
end;
$$;

do $reset$
declare
  operation internal_financial_correction.operations%rowtype;
  targets uuid[]; receipt_ids uuid[]; transaction_ids uuid[];
  paid public.contas_receber%rowtype;
  settlement public.receivable_manual_settlements%rowtype;
  preserved jsonb; enrollments_before jsonb; actual jsonb; result jsonb; v_state jsonb;
  source record; fk record; enrollment uuid; changed integer; total integer;
  previous_claims text := current_setting('request.jwt.claims', true);
  previous_role text := current_setting('request.jwt.claim.role', true);
  previous_sub text := current_setting('request.jwt.claim.sub', true);
  reason constant text := 'Correção administrativa via MCP autorizada pelo gestor: lançamento de matrícula registrado por engano; sem devolução bancária.';
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Administrative migration session required.' using errcode = '42501';
  end if;
  -- The operation fingerprint identifies the reviewed source without generated IDs.
  select * into strict operation from internal_financial_correction.operations
  where fingerprint = '2bceecc45d6dac70f45043c871adae0455f4f369731792646bde8347e5370709'
    and plan_fingerprint = '5f31520e581a88f39ab26bbcd218763e09a556e3265a15c30838ebe123b49b02'
    and purpose = 'FINANCIAL_CORRECTION_CANCEL_ONLY' and state = 'FINALIZED';
  if not exists(select 1 from public.usuarios_sistema u
      where u.auth_user_id = operation.actor_id and public.is_active_status(u.status)
        and lower(u.perfil) = 'gestor')
  then raise exception 'Owner authorizing the correction changed.'; end if;
  if not exists(select 1 from pg_constraint
    where conrelid = 'public.contas_receber'::regclass and conname = 'contas_receber_manual_settlement_fkey'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (manual_settlement_id) REFERENCES receivable_manual_settlements(id) ON DELETE RESTRICT'
      and convalidated and not condeferrable and not condeferred)
  then raise exception 'Local settlement foreign key changed since review.'; end if;

  -- Serialize writers while the three immutable-source triggers are suspended.
  lock table internal_financial_correction.operations,
    internal_financial_correction.items,
    internal_academic.technical_manual_cycle_runs,
    internal_academic.technical_manual_receivable_issuance_authorizations,
    internal_academic.technical_manual_banese_reissue_jobs,
    internal_academic.technical_manual_banese_reissue_archive,
    public.receivable_manual_settlements, public.receivable_manual_settlement_events,
    public.contas_receber, public.payment_gateway_transactions,
    public.banese_reconciliation_queue, public.banese_reconciliation_attempts
    in share row exclusive mode;

  select array_agg(distinct matricula_id) into targets
  from internal_financial_correction.items
  where operation_id = operation.id and kind = 'RESET_C1';
  select array_agg(id order by id) into receipt_ids from public.contas_receber
  where matricula_id = any(targets);
  select array_agg(transaction_id order by transaction_id) into transaction_ids
  from internal_financial_correction.items
  where operation_id = operation.id and kind <> 'LOCAL_WAIVER';
  select jsonb_agg(to_jsonb(m) order by m.id) into enrollments_before
    from public.matriculas m where m.id = any(targets);
  if cardinality(targets) <> 3 or cardinality(receipt_ids) <> 52
    or cardinality(transaction_ids) <> 49 or operation.item_count <> 49
    or (select count(*) from internal_financial_correction.items where operation_id = operation.id) <> 54
    or (select count(*) from internal_financial_correction.items where operation_id = operation.id
      and matricula_id = any(targets)) <> 51
    or exists(select 1 from public.contas_receber where id = any(receipt_ids)
      and turma_id is distinct from operation.turma_id)
  then raise exception 'Exact reset scope changed.'; end if;

  if exists(select 1 from internal_financial_correction.items i
    join public.payment_gateway_transactions t on t.id = i.transaction_id
    where i.operation_id = operation.id and i.kind <> 'LOCAL_WAIVER'
      and (i.state <> 'FINALIZED' or i.consent_at is not null
        or i.bank_evidence_hash is distinct from internal_financial_correction.sha256(i.bank_evidence::text)
        or i.bank_evidence #>> '{bankResult,situationCode}' is distinct from '5'
        or i.bank_evidence #>> '{bankResult,remoteStatus}' is distinct from 'CANCELED'
        or i.bank_evidence #>> '{bankResult,proof,paymentsCount}' is distinct from '0'
        or i.bank_evidence #>> '{bankResult,proof,strictEffectivePayments}' is distinct from 'true'
        or i.bank_evidence #>> '{bankResult,proof,identityValidated}' is distinct from 'true'
        or i.bank_evidence #>> '{bankResult,proof,termsValidated}' is distinct from 'true'
        or t.remote_status is distinct from 'CANCELED'))
    or (select count(*) from public.payment_gateway_transactions where id = any(transaction_ids)) <> 49
    or exists(select 1 from public.banese_reconciliation_queue where receivable_id = any(receipt_ids)
      and (state <> 'DONE' or lease_until > now()))
    or exists(select 1 from internal_academic.technical_manual_banese_reissue_jobs
      where matricula_id = any(targets) and (status <> 'RESET_COMPLETE' or lease_valid_until > now()))
  then raise exception 'Bank evidence or idle worker fence changed.'; end if;

  -- New/unknown dependencies cause a safe rollback rather than cascading silently.
  for fk in select c.conrelid::regclass relation, a.attname column_name
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.contas_receber'::regclass
      and c.conrelid not in ('internal_financial_correction.items'::regclass,
        'public.receivable_manual_settlements'::regclass,
        'public.banese_reconciliation_queue'::regclass,
        'public.banese_reconciliation_attempts'::regclass,
        'public.payment_gateway_transactions'::regclass,
        'internal_academic.technical_manual_receivable_issuance_authorizations'::regclass,
        'internal_academic.technical_manual_banese_reissue_jobs'::regclass,
        'internal_academic.technical_manual_banese_reissue_archive'::regclass)
  loop
    execute format('select count(*) from %s where %I = any($1)', fk.relation, fk.column_name)
      into total using receipt_ids;
    if total <> 0 then raise exception 'Unexpected reset dependency: %', fk.relation; end if;
  end loop;

  select jsonb_agg(jsonb_build_object('item',to_jsonb(i),'receipt',to_jsonb(r),
    'waived',internal_financial_correction.local_waiver_complete(r),
    'state',internal_academic.technical_manual_cycle_state(i.matricula_id)) order by i.receivable_id)
  into preserved from internal_financial_correction.items i
  join public.contas_receber r on r.id = i.receivable_id
  where i.operation_id = operation.id and not (i.matricula_id = any(targets));
  if jsonb_array_length(preserved) <> 3
    or exists(select 1 from jsonb_array_elements(preserved) p where p->>'waived' <> 'true')
  then raise exception 'Unrelated local waivers changed.'; end if;

  select * into strict paid from public.contas_receber where id = any(receipt_ids)
    and tipo_lancamento = 'MATRICULA' and status = 'PAGO';
  select * into strict settlement from public.receivable_manual_settlements
    where id = paid.manual_settlement_id and receivable_id = paid.id;
  if paid.valor <> 200 or paid.valor_pago <> 200 or settlement.state <> 'COMPLETED'
    or settlement.received_cents <> 20000 or settlement.reversed_at is not null
    or (select count(*) from public.receivable_manual_settlements where receivable_id = any(receipt_ids)) <> 1
    or exists(select 1 from public.contas_receber r where r.id = any(receipt_ids)
      and r.id <> paid.id and internal_financial_correction.has_payment_evidence(r))
  then raise exception 'Authorized erroneous local payment changed.'; end if;
  insert into internal_financial_correction.normal_cycle_reset_archive(source_table,source_key,payload)
  values ('public.contas_receber.before_reversal',paid.id::text,to_jsonb(paid)),
    ('public.receivable_manual_settlements.before_reversal',settlement.id::text,to_jsonb(settlement));

  -- Attribute the explicitly authorized administrative reversal to the owner.
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',operation.actor_id)::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',operation.actor_id::text,true);
  result := public.estornar_matricula_local_sem_boleto_secure(paid.id,settlement.id,reason);
  if result->>'success' is distinct from 'true' or result->>'gatewayRecreated' is distinct from 'false'
    or result #>> '{receivable,status}' is distinct from 'PENDENTE'
  then raise exception 'Canonical local reversal failed.'; end if;
  result := public.estornar_matricula_local_sem_boleto_secure(paid.id,settlement.id,reason);
  if result->>'replayed' is distinct from 'true' then raise exception 'Reversal replay failed.'; end if;
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);

  -- Archive each source row before removing its operational projection.
  for source in select * from (values
    ('internal_financial_correction.items','x.receivable_id','x.receivable_id = any($1)',51),
    ('internal_academic.technical_manual_cycle_runs',
      'x.matricula_id::text || '':'' || x.cycle_number::text','x.matricula_id = any($2)',4),
    ('internal_academic.technical_manual_receivable_issuance_authorizations','x.receivable_id','x.receivable_id = any($1)',49),
    ('internal_academic.technical_manual_banese_reissue_jobs','x.id','x.receivable_id = any($1)',36),
    ('internal_academic.technical_manual_banese_reissue_archive','x.job_id','x.receivable_id = any($1)',36),
    ('public.contas_receber','x.id','x.id = any($1)',52),
    ('public.receivable_manual_settlements','x.id','x.receivable_id = any($1)',1),
    ('public.receivable_manual_settlement_events','x.id',
      'x.settlement_id in (select id from public.receivable_manual_settlements where receivable_id = any($1))',-1),
    ('public.banese_reconciliation_queue','x.receivable_id','x.receivable_id = any($1)',49),
    ('public.banese_reconciliation_attempts','x.id','x.receivable_id = any($1)',-1),
    ('public.payment_gateway_transactions','x.id','x.id = any($3)',49)
  ) as sources(relation,key_expression,predicate,expected_count)
  loop
    execute format('insert into internal_financial_correction.normal_cycle_reset_archive(source_table,source_key,payload)
      select %L,(%s)::text,to_jsonb(x) from %s x where %s',
      source.relation,source.key_expression,source.relation,source.predicate)
      using receipt_ids,targets,transaction_ids;
    get diagnostics changed = row_count;
    if source.expected_count >= 0 and changed <> source.expected_count then
      raise exception 'Archive cardinality changed for %: %',source.relation,changed;
    end if;
  end loop;
  insert into internal_financial_correction.normal_cycle_reset_archive(source_table,source_key,payload)
  values ('internal_financial_correction.operations',operation.id::text,to_jsonb(operation));

  -- Insert permanent bank identities separately; immutable evidence is never edited.
  insert into internal_financial_correction.normal_cycle_reset_archive
    (source_table,source_key,payload,bank_environment,bank_convenio,canceled_nosso_numero)
  select 'canceled_bank_identity',i.receivable_id::text,
    jsonb_build_object('evidenceHash',i.bank_evidence_hash,'transactionId',i.transaction_id),
    i.receivable_snapshot->>'gateway_environment',i.bank_evidence #>> '{bankResult,convenio}',
    i.bank_evidence #>> '{bankResult,nossoNumero}'
  from internal_financial_correction.items i where i.operation_id = operation.id and i.kind <> 'LOCAL_WAIVER';
  if (select count(*) from internal_financial_correction.normal_cycle_reset_archive
      where source_table = 'canceled_bank_identity' and bank_environment = 'production'
        and bank_convenio ~ '^[0-9]+$' and canceled_nosso_numero ~ '^[0-9]{9}$') <> 49
  then raise exception 'Canceled bank identity archive incomplete.'; end if;

  alter table internal_financial_correction.items disable trigger immutable_correction_item;
  delete from internal_financial_correction.items where operation_id = operation.id and matricula_id = any(targets);
  alter table internal_financial_correction.items enable trigger immutable_correction_item;
  delete from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id = any(receipt_ids);
  alter table internal_academic.technical_manual_banese_reissue_archive
    disable trigger prevent_technical_manual_banese_reissue_archive_mutation;
  delete from internal_academic.technical_manual_banese_reissue_archive where receivable_id = any(receipt_ids);
  alter table internal_academic.technical_manual_banese_reissue_archive
    enable trigger prevent_technical_manual_banese_reissue_archive_mutation;
  delete from internal_academic.technical_manual_banese_reissue_jobs where receivable_id = any(receipt_ids);
  delete from internal_academic.technical_manual_cycle_runs where matricula_id = any(targets);

  -- Keep all canceled gateway transactions and detach only the old C2 links.
  update public.payment_gateway_transactions set receivable_id = null
    where id = any(transaction_ids) and receivable_id = any(receipt_ids) and remote_status = 'CANCELED';
  get diagnostics changed = row_count;
  if changed <> 13 then raise exception 'Canceled transaction detach changed: %',changed; end if;
  if exists(select 1 from public.payment_gateway_transactions t
    join internal_financial_correction.normal_cycle_reset_archive a
      on a.source_table = 'public.payment_gateway_transactions' and a.source_key = t.id::text
    where (to_jsonb(t)-'receivable_id') is distinct from (a.payload-'receivable_id'))
  then raise exception 'Canceled transaction evidence changed.'; end if;

  alter table public.receivable_manual_settlement_events disable trigger prevent_receivable_manual_settlement_event_mutation;
  delete from public.receivable_manual_settlement_events where settlement_id = settlement.id;
  alter table public.receivable_manual_settlement_events enable trigger prevent_receivable_manual_settlement_event_mutation;
  -- Recreate only this circular FK unchanged after deleting both archived rows.
  alter table public.contas_receber drop constraint contas_receber_manual_settlement_fkey;
  delete from public.receivable_manual_settlements where id = settlement.id and state = 'REVERSED';
  delete from public.contas_receber where id = any(receipt_ids);
  get diagnostics changed = row_count;
  if changed <> 52 then raise exception 'Operational receivable removal changed: %',changed; end if;
  set constraints all immediate;
  alter table public.contas_receber add constraint contas_receber_manual_settlement_fkey
    foreign key(manual_settlement_id) references public.receivable_manual_settlements(id) on delete restrict;
  update internal_financial_correction.operations set execution_enabled = false where id = operation.id;

  foreach enrollment in array targets loop
    v_state := internal_academic.technical_manual_cycle_state(enrollment);
    if v_state->>'estado' is distinct from 'ELEGIVEL' or v_state->>'podeGerar' is distinct from 'true'
      or v_state->>'proximoCicloNumero' is distinct from '1'
      or coalesce(v_state->>'cicloBaseHistorico','0') <> '0'
      or v_state->'cicloGerado' is distinct from 'null'::jsonb
      or v_state->'correcaoEmissao' is not null
    then raise exception 'Normal first-cycle eligibility not restored: %, %, %',
      v_state->>'estado',v_state->>'podeGerar',v_state->>'proximoCicloNumero'; end if;
  end loop;
  select jsonb_agg(jsonb_build_object('item',to_jsonb(i),'receipt',to_jsonb(r),
    'waived',internal_financial_correction.local_waiver_complete(r),
    'state',internal_academic.technical_manual_cycle_state(i.matricula_id)) order by i.receivable_id)
  into actual from internal_financial_correction.items i
  join public.contas_receber r on r.id = i.receivable_id where i.operation_id = operation.id;
  if actual is distinct from preserved then raise exception 'Unrelated waivers changed.'; end if;
  select jsonb_agg(to_jsonb(m) order by m.id) into actual
    from public.matriculas m where m.id = any(targets);
  if actual is distinct from enrollments_before then raise exception 'Academic enrollment changed.'; end if;
  if exists(select 1 from public.contas_receber where matricula_id = any(targets))
    or exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id = any(targets))
    or exists(select 1 from public.payment_gateway_transactions
      where id = any(transaction_ids) and (remote_status <> 'CANCELED' or receivable_id is not null))
    or not exists(select 1 from internal_financial_correction.normal_cycle_reset_archive
      where source_table = 'public.receivable_manual_settlements' and payload->>'state' = 'REVERSED')
    or exists(select 1 from public.banese_reconciliation_queue where receivable_id = any(receipt_ids))
    or exists(select 1 from public.banese_reconciliation_attempts where receivable_id = any(receipt_ids))
    or (select count(*) from pg_trigger where tgenabled = 'O' and
      (tgrelid,tgname) in (
        ('internal_financial_correction.items'::regclass,'immutable_correction_item'),
        ('internal_academic.technical_manual_banese_reissue_archive'::regclass,'prevent_technical_manual_banese_reissue_archive_mutation'),
        ('public.receivable_manual_settlement_events'::regclass,'prevent_receivable_manual_settlement_event_mutation'))) <> 3
  then raise exception 'Final reset invariant failed.'; end if;
end;
$reset$;
commit;
