begin;

create table internal_proesc.obligation_links (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas(id),
  turma_id uuid not null references public.turmas(id),
  receivable_id uuid not null unique references public.contas_receber(id),
  source_unit_id text not null check (source_unit_id ~ '^[0-9]+$'),
  source_class_id text not null check (source_class_id ~ '^[0-9]+$'),
  source_key text not null check (source_key ~ '^[0-9]+$'),
  kind text not null check (kind in ('ORIGINAL', 'RESIDUAL')),
  parent_link_id uuid references internal_proesc.obligation_links(id),
  auto_enabled boolean not null default false,
  confirmed_by uuid not null references public.usuarios_sistema(id),
  confirmed_at timestamptz not null default now(),
  unique (source_unit_id, source_class_id, source_key),
  check ((kind = 'RESIDUAL') = (parent_link_id is not null))
);
create index proesc_obligation_links_enrollment_idx on internal_proesc.obligation_links(matricula_id);
create index proesc_obligation_links_class_idx on internal_proesc.obligation_links(turma_id);
create index proesc_obligation_links_parent_idx on internal_proesc.obligation_links(parent_link_id);

create table internal_proesc.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references internal_proesc.obligation_links(id),
  observed_at timestamptz not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  principal_cents bigint not null check (principal_cents > 0),
  received_cents bigint check (received_cents >= 0),
  payment_date date,
  source_status text not null check (source_status in ('OPEN', 'PAID', 'CANCELED', 'UNKNOWN')),
  verification text not null check (verification in ('VERIFIED', 'REVIEW')),
  evidence_kind text not null check (evidence_kind in
    ('API_SINGLE_PAYMENT', 'API_PAYMENT_TOTAL', 'PORTAL_CONFIRMED', 'UNRESOLVED')),
  components jsonb not null check (jsonb_typeof(components) = 'object'),
  accounting_lines jsonb not null check (jsonb_typeof(accounting_lines) = 'array'),
  review_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(review_reasons) = 'array'),
  recorded_by uuid not null references public.usuarios_sistema(id),
  recorded_at timestamptz not null default now(),
  unique (link_id, source_fingerprint, observed_at)
);
create index proesc_financial_snapshots_link_time_idx
  on internal_proesc.financial_snapshots(link_id, observed_at desc);

create table internal_proesc.reconciliation_requests (
  request_id uuid primary key,
  action text not null check (action in ('LINK', 'SNAPSHOT', 'APPLY', 'IMPORT_RESIDUAL')),
  actor_id uuid not null references public.usuarios_sistema(id),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((response is null) = (completed_at is null))
);
create table internal_proesc.reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references internal_proesc.reconciliation_requests(request_id),
  link_id uuid references internal_proesc.obligation_links(id),
  snapshot_id uuid references internal_proesc.financial_snapshots(id),
  mode text not null check (mode in ('LINK', 'IMPORT', 'AUTO', 'CORRECTION', 'IMPORT_RESIDUAL')),
  result text not null check (result in ('LINKED', 'APPLIED', 'UNCHANGED', 'REVIEW', 'IMPORTED')),
  before_state jsonb,
  after_state jsonb,
  recorded_at timestamptz not null default now()
);
create index proesc_reconciliation_events_link_idx on internal_proesc.reconciliation_events(link_id);
create index proesc_reconciliation_events_snapshot_idx on internal_proesc.reconciliation_events(snapshot_id);

-- Private, exact-row mutation claims are created and consumed in one transaction.
create table internal_proesc.mutation_claims (
  request_id uuid primary key references internal_proesc.reconciliation_requests(request_id),
  transaction_id bigint not null,
  receivable_id uuid not null,
  kind text not null check (kind in ('IMPORT', 'AUTO', 'CORRECTION', 'IMPORT_RESIDUAL')),
  expected_new jsonb not null check (jsonb_typeof(expected_new) = 'object'),
  completed boolean not null default false
);
create index proesc_mutation_claims_receivable_idx on internal_proesc.mutation_claims(receivable_id);
alter table internal_proesc.obligation_links enable row level security;
alter table internal_proesc.financial_snapshots enable row level security;
alter table internal_proesc.reconciliation_requests enable row level security;
alter table internal_proesc.reconciliation_events enable row level security;
alter table internal_proesc.mutation_claims enable row level security;
revoke all on internal_proesc.obligation_links, internal_proesc.financial_snapshots,
  internal_proesc.reconciliation_requests, internal_proesc.reconciliation_events,
  internal_proesc.mutation_claims from public, anon, authenticated, service_role;

create function internal_proesc.authorize_financial_operator(p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor jsonb; v_permissions jsonb;
begin
  if coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role'
    is distinct from 'service_role' then
    raise exception 'Acesso interno Proesc não autorizado.' using errcode = '42501';
  end if;
  select to_jsonb(u), case when p.id is not null and not coalesce(u.personalizar_permissoes, false)
    then p.permissoes else u.permissoes end into v_actor, v_permissions
  from public.usuarios_sistema u left join public.perfis_acesso p on p.id = u.perfil_acesso_id
  where u.id = p_actor_id and lower(u.status) in ('ativo', 'active') and lower(u.perfil) = 'gestor';
  if v_actor is null or v_permissions -> 'allPolos' is distinct from 'true'::jsonb
    or not coalesce(v_permissions -> 'modules' @> '["configuracoes"]'::jsonb, false)
    or (jsonb_typeof(v_actor -> 'polo_ids') = 'array' and v_actor -> 'polo_ids' <> '[]'::jsonb)
    or btrim(coalesce(v_actor ->> 'context', ''))
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Gestor global ativo autorizado em Configurações obrigatório.' using errcode = '42501'; end if;
end;
$$;

create function internal_proesc.begin_financial_request(
  p_action text, p_actor_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request internal_proesc.reconciliation_requests%rowtype; v_hash text;
begin
  perform internal_proesc.authorize_financial_operator(p_actor_id);
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Requisição financeira Proesc inválida.' using errcode = '22023'; end if;
  v_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('proesc:financial-request:' || p_request_id::text, 0));
  select * into v_request from internal_proesc.reconciliation_requests where request_id = p_request_id;
  if found then
    if v_request.action is distinct from p_action or v_request.actor_id is distinct from p_actor_id
      or v_request.payload_hash is distinct from v_hash or v_request.response is null then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023'; end if;
    return v_request.response || jsonb_build_object('replayed', true);
  end if;
  insert into internal_proesc.reconciliation_requests(request_id, action, actor_id, payload_hash)
  values (p_request_id, p_action, p_actor_id, v_hash);
  return null;
end;
$$;

create function internal_proesc.finish_financial_request(p_request_id uuid, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update internal_proesc.reconciliation_requests
  set response = p_response || jsonb_build_object('replayed', false), completed_at = now()
  where request_id = p_request_id and response is null;
  if not found then raise exception 'Requisição financeira fora do estado esperado.' using errcode = '40001'; end if;
  return p_response || jsonb_build_object('replayed', false);
end;
$$;

create function internal_proesc.receivable_fingerprint(p_receivable public.contas_receber)
returns text language sql stable set search_path = '' set timezone = 'UTC' as $$
  select encode(extensions.digest(to_jsonb(p_receivable)::text, 'sha256'), 'hex');
$$;

create function internal_proesc.assert_historical_receivable(p_receivable public.contas_receber)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_receivable.id is null or p_receivable.origem_pagamento is distinct from 'SISTEMA_ANTERIOR'
    or p_receivable.matricula_id is null or p_receivable.cliente_id is null
    or not exists (select 1 from public.matriculas m join public.turmas t on t.id = m.turma_id
      where m.id = p_receivable.matricula_id and m.aluno_id = p_receivable.cliente_id
        and t.id = p_receivable.turma_id and t.polo_id = p_receivable.polo_id
        and t.codigo = 'ENF-T42-INT-MAT')
    or p_receivable.gateway_provider is not null or p_receivable.gateway_payment_id is not null
    or p_receivable.gateway_creation_token is not null or p_receivable.gateway_submission_channel is not null
    or p_receivable.gateway_submission_status is not null or p_receivable.gateway_boleto_nosso_numero is not null
    or p_receivable.gateway_boleto_linha_digitavel is not null or p_receivable.gateway_boleto_codigo_barras is not null
    or p_receivable.gateway_pix_payload is not null or p_receivable.gateway_pix_encoded_image is not null
    or p_receivable.asaas_payment_id is not null or p_receivable.nosso_numero_asaas is not null
    or p_receivable.manual_settlement_id is not null
    or (p_receivable.regra_financeira_tecnica_snapshot -> 'cicloManual') is not null
    or exists (select 1 from public.payment_gateway_transactions where receivable_id = p_receivable.id)
    or exists (select 1 from internal_academic.technical_manual_cycle_runs run
      where p_receivable.id = any(run.receivable_ids))
  then raise exception 'A obrigação não pertence ao histórico Proesc autorizado.' using errcode = '42501'; end if;
end;
$$;

create function internal_proesc.shared_account(p_polo_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select account.id into strict v_id from public.contas_bancarias account
  join public.polos owner on owner.id = account.polo_id and owner.is_matriz and lower(owner.status) = 'ativo'
  join public.contas_bancarias_polos scope on scope.conta_bancaria_id = account.id and scope.polo_id = p_polo_id
  where account.codigo_interno = 'INTEGRATION:PROESC:' || owner.id::text
    and account.natureza = 'BANCARIA' and account.system_managed and account.ativo;
  return v_id;
end;
$$;

revoke all on function internal_proesc.authorize_financial_operator(uuid),
  internal_proesc.begin_financial_request(text, uuid, uuid, jsonb),
  internal_proesc.finish_financial_request(uuid, jsonb),
  internal_proesc.receivable_fingerprint(public.contas_receber),
  internal_proesc.assert_historical_receivable(public.contas_receber),
  internal_proesc.shared_account(uuid) from public, anon, authenticated, service_role;
commit;
