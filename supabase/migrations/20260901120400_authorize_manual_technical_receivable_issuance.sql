begin;

create table internal_academic.technical_manual_receivable_issuance_authorizations (
  receivable_id uuid primary key
    references public.contas_receber(id) on delete restrict,
  matricula_id uuid not null,
  turma_id uuid not null,
  cycle_number smallint not null,
  request_id uuid not null unique,
  receivable_fingerprint text not null
    check (receivable_fingerprint ~ '^[0-9a-f]{64}$'),
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  first_claimed_at timestamptz,
  last_claimed_at timestamptz,
  claim_count integer not null default 0 check (claim_count >= 0),
  foreign key (matricula_id, cycle_number)
    references internal_academic.technical_manual_cycle_runs(
      matricula_id, cycle_number
    ) on delete restrict
);

alter table internal_academic.technical_manual_receivable_issuance_authorizations
  enable row level security;
revoke all on table
  internal_academic.technical_manual_receivable_issuance_authorizations
  from public, anon, authenticated, service_role;

create or replace function
internal_academic.technical_manual_receivable_issuance_fingerprint(
  p_receivable public.contas_receber
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(jsonb_build_object(
        'versao', 1,
        'receivableId', p_receivable.id,
        'matriculaId', p_receivable.matricula_id,
        'turmaId', p_receivable.turma_id,
        'poloId', p_receivable.polo_id,
        'clienteId', p_receivable.cliente_id,
        'tipo', p_receivable.tipo_lancamento,
        'parcelaNumero', p_receivable.parcela_numero,
        'origem', p_receivable.origem_cronograma_id,
        'descricao', p_receivable.descricao,
        'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
        'vencimento', p_receivable.data_vencimento
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function
  internal_academic.technical_manual_receivable_issuance_fingerprint(
    public.contas_receber
  ) from public, anon, authenticated, service_role;

create or replace function
public.authorize_technical_manual_receivable_issuance_secure(
  p_receivable_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_receivable public.contas_receber%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_enrollment_status text;
  v_fingerprint text;
  v_existing internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_request_owner uuid;
  v_has_remote_identity boolean;
begin
  if v_actor is null then
    raise exception 'Autenticação obrigatória para autorizar a emissão.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_request_id is null then
    raise exception 'Recebível e requisição são obrigatórios.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-receivable-issuance-request:' || p_request_id::text,
      0
    )
  );

  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
  for update;
  if not found then
    return jsonb_build_object(
      'required', false, 'authorized', false, 'replayed', false
    );
  end if;

  if internal_academic.is_technical_manual_cycle_protected(
    v_receivable.matricula_id
  ) then
    raise exception 'Matrícula protegida: nova emissão bancária bloqueada.'
      using errcode = '42501';
  end if;

  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = v_receivable.matricula_id
    and run.turma_id = v_receivable.turma_id
    and v_receivable.id = any(run.receivable_ids)
    and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
  order by run.cycle_number desc
  limit 1;
  if not found then
    return jsonb_build_object(
      'required', false, 'authorized', false, 'replayed', false
    );
  end if;

  if not (
    public.gestor_has_financeiro_tab('receber')
    and public.is_gestor_for_polo(v_receivable.polo_id)
  ) then
    raise exception 'Sem permissão financeira para emitir este recebível.'
      using errcode = '42501';
  end if;

  if v_run.state = 'PROTECTED_EXISTING' then
    raise exception 'Matrícula protegida: nova emissão bancária bloqueada.'
      using errcode = '42501';
  end if;

  select upper(coalesce(enrollment.status, '')) into v_enrollment_status
  from public.matriculas enrollment
  where enrollment.id = v_receivable.matricula_id
    and enrollment.turma_id = v_receivable.turma_id;
  if coalesce(v_enrollment_status, '') not in ('PENDENTE', 'ATIVO') then
    raise exception 'A situação acadêmica não permite emitir cobranças.'
      using errcode = 'P0001';
  end if;
  if upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO') then
    raise exception 'O recebível não está disponível para emissão.'
      using errcode = 'P0001';
  end if;

  v_fingerprint :=
    internal_academic.technical_manual_receivable_issuance_fingerprint(
      v_receivable
    );

  select authz.receivable_id into v_request_owner
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.request_id = p_request_id;
  if v_request_owner is not null
    and v_request_owner is distinct from p_receivable_id
  then
    raise exception 'A requisição já autoriza outro recebível.'
      using errcode = '23505';
  end if;

  select authz.* into v_existing
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = p_receivable_id;
  if v_existing.receivable_id is not null
    and v_existing.request_id = p_request_id
  then
    if v_existing.authorized_by is distinct from v_actor
      or v_existing.receivable_fingerprint is distinct from v_fingerprint
    then
      raise exception 'Replay de autorização incompatível.'
        using errcode = '40001';
    end if;
    return jsonb_build_object(
      'required', true,
      'authorized', true,
      'replayed', true,
      'receivableId', p_receivable_id,
      'cycleNumber', v_run.cycle_number
    );
  end if;

  v_has_remote_identity :=
    v_receivable.gateway_boleto_issued_at is not null
    or v_receivable.gateway_payment_id is not null
    or v_receivable.gateway_payment_link_id is not null
    or v_receivable.gateway_boleto_linha_digitavel is not null
    or v_receivable.gateway_boleto_codigo_barras is not null
    or v_receivable.gateway_invoice_url is not null
    or v_receivable.gateway_bank_slip_url is not null
    or v_receivable.asaas_payment_id is not null
    or v_receivable.asaas_payment_link_id is not null;

  if not v_has_remote_identity then
    insert into
      internal_academic.technical_manual_receivable_issuance_authorizations(
        receivable_id, matricula_id, turma_id, cycle_number, request_id,
        receivable_fingerprint, authorized_by, authorized_at
      ) values (
        p_receivable_id, v_run.matricula_id, v_run.turma_id,
        v_run.cycle_number, p_request_id, v_fingerprint, v_actor, now()
      )
    on conflict (receivable_id) do update
    set request_id = excluded.request_id,
        receivable_fingerprint = excluded.receivable_fingerprint,
        authorized_by = excluded.authorized_by,
        authorized_at = excluded.authorized_at;

    perform public.registrar_turma_financeiro_auditoria(
      v_run.matricula_id,
      'EMISSAO_RECEBIVEL_CICLO_TECNICO_MANUAL_AUTORIZADA',
      jsonb_build_object(
        'receivableId', p_receivable_id,
        'cycleNumber', v_run.cycle_number,
        'requestId', p_request_id,
        'fingerprint', v_fingerprint,
        'actorId', v_actor
      ),
      'Consentimento explícito registrado antes do primeiro claim bancário.'
    );
  end if;

  return jsonb_build_object(
    'required', true,
    'authorized', true,
    'replayed', false,
    'existingRemoteTitle', v_has_remote_identity,
    'receivableId', p_receivable_id,
    'cycleNumber', v_run.cycle_number
  );
end;
$function$;

revoke all on function
  public.authorize_technical_manual_receivable_issuance_secure(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.authorize_technical_manual_receivable_issuance_secure(uuid, uuid)
  to authenticated;

create or replace function
internal_academic.guard_manual_technical_receivable_first_bank_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_authorization
    internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_fingerprint text;
  v_first_claim boolean;
  v_protected_claim boolean;
  v_old_remote_identity boolean;
  v_enrollment_status text;
  v_protected_enrollment boolean;
begin
  v_protected_enrollment :=
    internal_academic.is_technical_manual_cycle_protected(new.matricula_id);
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = new.matricula_id
    and run.turma_id = new.turma_id
    and new.id = any(run.receivable_ids)
    and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
  order by run.cycle_number desc
  limit 1;
  if not found and not v_protected_enrollment then
    return new;
  end if;

  v_old_remote_identity :=
    old.gateway_boleto_issued_at is not null
    or old.gateway_payment_id is not null
    or old.gateway_payment_link_id is not null
    or old.gateway_boleto_linha_digitavel is not null
    or old.gateway_boleto_codigo_barras is not null
    or old.gateway_invoice_url is not null
    or old.gateway_bank_slip_url is not null
    or old.asaas_payment_id is not null
    or old.asaas_payment_link_id is not null;

  v_first_claim :=
    (old.gateway_creation_token is null
      and new.gateway_creation_token is not null)
    or (old.gateway_cnab_file_id is null
      and new.gateway_cnab_file_id is not null)
    or (old.gateway_submission_channel is null
      and new.gateway_submission_channel = 'CNAB')
    or (
      not v_old_remote_identity
      and (
        (old.gateway_submission_channel is null
          and new.gateway_submission_channel = 'API')
        or (old.gateway_submission_status is null
          and new.gateway_submission_status in (
            'API_REGISTERED', 'API_AMBIGUOUS',
            'CNAB_GENERATED', 'CNAB_SENT', 'CNAB_REGISTERED'
          ))
      )
    );

  v_protected_claim :=
    (new.gateway_creation_token is not null
      and new.gateway_creation_token is distinct from old.gateway_creation_token)
    or (new.gateway_cnab_file_id is not null
      and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id)
    or (new.gateway_submission_channel = 'CNAB'
      and new.gateway_submission_channel is distinct from old.gateway_submission_channel)
    or (new.gateway_submission_status = 'API_AMBIGUOUS'
      and new.gateway_submission_status is distinct from old.gateway_submission_status)
    or v_first_claim;

  if v_protected_enrollment then
    if v_protected_claim then
      raise exception 'Matrícula protegida: novo claim bancário bloqueado.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not v_first_claim then
    return new;
  end if;

  select upper(coalesce(enrollment.status, '')) into v_enrollment_status
  from public.matriculas enrollment
  where enrollment.id = new.matricula_id
    and enrollment.turma_id = new.turma_id;
  if coalesce(v_enrollment_status, '') not in ('PENDENTE', 'ATIVO') then
    raise exception 'A situação acadêmica não permite o primeiro claim bancário.'
      using errcode = 'P0001';
  end if;

  select authz.* into v_authorization
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = new.id;
  if v_authorization.receivable_id is null then
    raise exception 'Emissão manual exige consentimento explícito por recebível.'
      using errcode = '42501';
  end if;

  v_fingerprint :=
    internal_academic.technical_manual_receivable_issuance_fingerprint(new);
  if v_authorization.matricula_id is distinct from new.matricula_id
    or v_authorization.turma_id is distinct from new.turma_id
    or v_authorization.cycle_number is distinct from v_run.cycle_number
    or v_authorization.receivable_fingerprint is distinct from v_fingerprint
  then
    raise exception 'A autorização não corresponde mais ao recebível.'
      using errcode = '40001';
  end if;

  update internal_academic.technical_manual_receivable_issuance_authorizations
  set first_claimed_at = coalesce(first_claimed_at, now()),
      last_claimed_at = now(),
      claim_count = claim_count + 1
  where receivable_id = new.id;
  return new;
end;
$function$;

revoke all on function
  internal_academic.guard_manual_technical_receivable_first_bank_claim()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_manual_technical_receivable_first_bank_claim
  on public.contas_receber;
create trigger guard_manual_technical_receivable_first_bank_claim
before update of gateway_creation_token, gateway_cnab_file_id,
  gateway_submission_channel, gateway_submission_status
on public.contas_receber
for each row execute function
  internal_academic.guard_manual_technical_receivable_first_bank_claim();

comment on table
  internal_academic.technical_manual_receivable_issuance_authorizations is
  'Consentimento durável por recebível LOCAL_CREATED antes do primeiro claim bancário.';
comment on function
  public.authorize_technical_manual_receivable_issuance_secure(uuid, uuid) is
  'Autoriza explicitamente um recebível técnico manual após RBAC e escopo de polo.';

notify pgrst, 'reload schema';
commit;
