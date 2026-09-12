begin;

-- A contract can prove external cycle coverage without assigning its installments
-- to a locally generated cycle. No bank identity or payment is inferred here.
create table internal_academic.technical_external_cycle_coverage (
  matricula_id uuid not null references public.matriculas(id),
  turma_id uuid not null references public.turmas(id),
  cycle_number smallint not null check (cycle_number = 2),
  source_system text not null check (source_system = 'PROESC'),
  scope text not null check (scope = 'CONTRATO_COMPLETO'),
  state text not null check (state in ('IMPORTING', 'CONFIRMED')),
  request_id uuid not null unique,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  item_count integer not null check (item_count = 25),
  installment_count integer not null check (installment_count = 24),
  total_amount numeric(14,2) not null check (total_amount = 6817.60),
  import_transaction_id bigint not null,
  created_by uuid not null references public.usuarios_sistema(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (matricula_id, cycle_number),
  check ((state = 'CONFIRMED') = (confirmed_at is not null))
);

create table internal_academic.technical_external_cycle_evidence (
  matricula_id uuid not null,
  cycle_number smallint not null,
  source_key text not null check (length(source_key) between 1 and 180),
  source_unit_id text not null check (source_unit_id ~ '^[0-9]+$'),
  source_class_id text not null check (source_class_id ~ '^[0-9]+$'),
  source_kind text not null check (source_kind in ('MENSALIDADE', 'REMATRICULA')),
  source_ordinal integer check (source_ordinal between 1 and 24),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  receivable_id uuid not null unique references public.contas_receber(id)
    deferrable initially deferred,
  imported_now boolean not null,
  expected_receivable jsonb not null check (jsonb_typeof(expected_receivable) = 'object'),
  primary key (matricula_id, cycle_number, source_key),
  unique (source_unit_id, source_class_id, source_key),
  unique (matricula_id, cycle_number, source_ordinal),
  check ((source_kind = 'MENSALIDADE') = (source_ordinal is not null)),
  foreign key (matricula_id, cycle_number) references
    internal_academic.technical_external_cycle_coverage(matricula_id, cycle_number)
);
create index technical_external_cycle_coverage_turma_idx
  on internal_academic.technical_external_cycle_coverage(turma_id);
alter table internal_academic.technical_external_cycle_coverage enable row level security;
alter table internal_academic.technical_external_cycle_evidence enable row level security;
revoke all on internal_academic.technical_external_cycle_coverage,
  internal_academic.technical_external_cycle_evidence
  from public, anon, authenticated, service_role;

create or replace function internal_academic.is_technical_manual_cycle_protected(
  p_matricula_id uuid
) returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id = p_matricula_id and run.state = 'PROTECTED_EXISTING'
  ) or exists (
    select 1 from internal_academic.technical_external_cycle_coverage coverage
    where coverage.matricula_id = p_matricula_id and coverage.state = 'CONFIRMED'
  );
$function$;
revoke all on function internal_academic.is_technical_manual_cycle_protected(uuid)
  from public, anon, authenticated, service_role;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_proesc_coverage;
revoke all on function internal_academic.technical_manual_cycle_state_before_proesc_coverage(uuid)
  from public, anon, authenticated, service_role;

create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_state jsonb;
  v_coverage internal_academic.technical_external_cycle_coverage%rowtype;
begin
  v_state := internal_academic.technical_manual_cycle_state_before_proesc_coverage(p_matricula_id);
  select coverage.* into v_coverage
  from internal_academic.technical_external_cycle_coverage coverage
  where coverage.matricula_id = p_matricula_id and coverage.state = 'CONFIRMED';
  if not found then return v_state; end if;
  -- Coverage records describe external issuance, never local Banese issuance.
  return v_state || jsonb_build_object(
    'estado', 'PROTEGIDO_EXISTENTE', 'podeGerar', false,
    'proximoCicloNumero', null, 'primeiroVencimentoSugerido', null,
    'bloqueio', null,
    'cicloGerado', jsonb_build_object(
      'numero', 2, 'status', 'EXTERNAL_COVERAGE',
      'origemEmissao', 'PROESC', 'abrangencia', 'CONTRATO_COMPLETO',
      'quantidadeItens', v_coverage.item_count,
      'total', to_char(v_coverage.total_amount, 'FM999999990.00'),
      'emitidosBanese', 0, 'pendentesEmissao', 0, 'emRevisao', 0
    )
  );
end;
$function$;
revoke all on function internal_academic.technical_manual_cycle_state(uuid)
  from public, anon, authenticated, service_role;

-- A transaction-bound private claim only permits the exact historical INSERT
-- prepared by the service RPC. A client-controlled GUC alone is never enough.
create function internal_academic.is_authorized_external_history_insert(
  p_receivable public.contas_receber
) returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from internal_academic.technical_external_cycle_coverage coverage
    join internal_academic.technical_external_cycle_evidence evidence
      on evidence.matricula_id = coverage.matricula_id
      and evidence.cycle_number = coverage.cycle_number
    where coverage.state = 'IMPORTING'
      and coverage.import_transaction_id = txid_current()
      and coverage.matricula_id = p_receivable.matricula_id
      and coverage.turma_id = p_receivable.turma_id
      and evidence.receivable_id = p_receivable.id and evidence.imported_now
      and to_jsonb(p_receivable) @> evidence.expected_receivable
      and p_receivable.gateway_provider is null
      and p_receivable.gateway_payment_id is null
      and p_receivable.gateway_creation_token is null
      and p_receivable.gateway_submission_channel is null
      and p_receivable.gateway_submission_status is null
      and p_receivable.gateway_boleto_nosso_numero is null
      and p_receivable.gateway_boleto_linha_digitavel is null
      and p_receivable.gateway_boleto_codigo_barras is null
      and p_receivable.gateway_pix_payload is null
      and p_receivable.gateway_pix_encoded_image is null
      and p_receivable.asaas_payment_id is null
      and p_receivable.nosso_numero_asaas is null
      and (p_receivable.regra_financeira_tecnica_snapshot -> 'cicloManual') is null
  );
$function$;
revoke all on function internal_academic.is_authorized_external_history_insert(public.contas_receber)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.guard_technical_manual_cycle_insert()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_request_id uuid;
  v_expected_origin text;
begin
  if new.matricula_id is not null
    and upper(coalesce(new.tipo_lancamento, '')) in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    and exists (
      select 1 from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = new.matricula_id and coverage.state = 'CONFIRMED'
    ) then
    raise exception 'Matrícula com cobertura Proesc: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;
  if new.matricula_id is null
    or upper(coalesce(new.tipo_lancamento, '')) not in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    or not exists (
      select 1 from public.matriculas enrollment
      join internal_academic.technical_manual_cycle_policies policy
        on policy.turma_id = enrollment.turma_id and policy.active
        and policy.generation_mode = 'MANUAL'
      where enrollment.id = new.matricula_id
    ) then return new; end if;
  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id) then
    raise exception 'Matrícula protegida: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;
  if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
  begin
    v_request_id := nullif(current_setting('app.technical_manual_cycle_request_id', true), '')::uuid;
  exception when invalid_text_representation then v_request_id := null;
  end;
  select run.* into v_run from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = new.matricula_id and run.request_id = v_request_id
    and run.state = 'GENERATING';
  if v_run.matricula_id is null then
    raise exception 'Cobrança de ciclo técnico manual exige RPC autorizada.' using errcode = '42501';
  end if;
  v_expected_origin := case upper(new.tipo_lancamento)
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'ciclo-' || (v_run.cycle_number - 1) || '-rematricula'
    else 'ciclo-' || v_run.cycle_number || '-parc-' || new.parcela_numero end;
  if new.origem_cronograma_id is distinct from v_expected_origin then
    raise exception 'Identidade de cobrança incompatível com o ciclo manual.' using errcode = '22023';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_technical_manual_cycle_insert()
  from public, anon, authenticated, service_role;

-- Evidence remains linked even if the local billing origin is later edited.
-- The foreign key blocks DELETE; financial identity cannot drift silently.
create function internal_academic.guard_external_cycle_evidence_identity()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if exists (
    select 1 from internal_academic.technical_external_cycle_evidence evidence
    where evidence.receivable_id = old.id
  ) and (new.id, new.matricula_id, new.turma_id, new.cliente_id, new.polo_id,
      new.valor, new.data_vencimento, new.origem_cronograma_id, new.tipo_lancamento)
    is distinct from (old.id, old.matricula_id, old.turma_id, old.cliente_id, old.polo_id,
      old.valor, old.data_vencimento, old.origem_cronograma_id, old.tipo_lancamento)
  then
    raise exception 'A identidade vinculada à cobertura Proesc exige revisão auditada.' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_external_cycle_evidence_identity()
  from public, anon, authenticated, service_role;
create trigger guard_external_cycle_evidence_identity
before update on public.contas_receber for each row
execute function internal_academic.guard_external_cycle_evidence_identity();

notify pgrst, 'reload schema';
commit;
