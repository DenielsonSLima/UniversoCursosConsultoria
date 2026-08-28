begin;
set local lock_timeout = '5s';

create table internal_academic.banese_discount_correction_audit (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null unique
    references public.contas_receber(id) on delete restrict,
  transaction_id uuid not null
    references public.payment_gateway_transactions(id) on delete restrict,
  environment text not null check (environment in ('sandbox', 'production')),
  nosso_numero text not null check (nosso_numero ~ '^[0-9]{9}$'),
  actor_auth_user_id uuid,
  database_txid bigint not null,
  expected_updated_at timestamptz not null,
  expected_transaction_updated_at timestamptz not null,
  expected_financial_terms jsonb not null
    check (jsonb_typeof(expected_financial_terms) = 'object'),
  corrected_financial_terms jsonb not null
    check (jsonb_typeof(corrected_financial_terms) = 'object'),
  expected_technical_snapshot jsonb not null
    check (jsonb_typeof(expected_technical_snapshot) = 'object'),
  corrected_technical_snapshot jsonb not null
    check (jsonb_typeof(corrected_technical_snapshot) = 'object'),
  remote_snapshot jsonb not null
    check (jsonb_typeof(remote_snapshot) = 'object'),
  remote_snapshot_sha256 text not null check (
    remote_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  state text not null check (
    state in ('AUTHORIZED', 'SNAPSHOT_APPLIED', 'APPLIED')
  ),
  authorized_at timestamptz not null,
  snapshot_applied_at timestamptz,
  applied_at timestamptz,
  check (
    (state = 'AUTHORIZED' and snapshot_applied_at is null and applied_at is null)
    or (state = 'SNAPSHOT_APPLIED' and snapshot_applied_at is not null
      and applied_at is null)
    or (state = 'APPLIED' and snapshot_applied_at is not null
      and applied_at is not null)
  )
);

create index banese_discount_correction_audit_transaction_idx
  on internal_academic.banese_discount_correction_audit(transaction_id);

alter table internal_academic.banese_discount_correction_audit
  enable row level security;
revoke all on internal_academic.banese_discount_correction_audit
  from public, anon, authenticated, service_role;

create or replace function internal_academic.guard_technical_receivable_policy_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot jsonb;
  v_authorization_id uuid;
begin
  if tg_op = 'INSERT' then
    v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
      new.matricula_id, new.tipo_lancamento, new.descricao, new.valor, false
    );
    if v_snapshot is not null then
      new.regra_financeira_tecnica_snapshot := v_snapshot;
    end if;
    return new;
  end if;

  if old.regra_financeira_tecnica_snapshot is not null then
    if new.valor is distinct from old.valor
      or new.matricula_id is distinct from old.matricula_id
      or new.tipo_lancamento is distinct from old.tipo_lancamento
    then
      raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
        using errcode = '23514';
    end if;
    if new.regra_financeira_tecnica_snapshot
        is distinct from old.regra_financeira_tecnica_snapshot
    then
      select audit.id into v_authorization_id
      from internal_academic.banese_discount_correction_audit as audit
      where audit.receivable_id = old.id
        and audit.database_txid = pg_catalog.txid_current()
        and audit.state = 'AUTHORIZED'
        and audit.expected_technical_snapshot
          = old.regra_financeira_tecnica_snapshot
        and audit.corrected_technical_snapshot
          = new.regra_financeira_tecnica_snapshot
      for update;
      if not found then
        raise exception 'A política e o valor de um título técnico emitido são imutáveis.'
          using errcode = '23514';
      end if;
      update internal_academic.banese_discount_correction_audit as audit
      set state = 'SNAPSHOT_APPLIED', snapshot_applied_at = clock_timestamp()
      where audit.id = v_authorization_id and audit.state = 'AUTHORIZED';
      if not found then
        raise exception 'Autorização da correção técnica já foi consumida.'
          using errcode = '40001';
      end if;
    end if;
    return new;
  end if;

  v_snapshot := internal_academic.build_technical_receivable_policy_snapshot(
    new.matricula_id, new.tipo_lancamento, new.descricao, new.valor, false
  );
  if v_snapshot is not null then
    new.regra_financeira_tecnica_snapshot := v_snapshot;
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_technical_receivable_policy_snapshot()
  from public, anon, authenticated, service_role;

create or replace function public.persist_banese_discount_removal_correction(
  p_receivable_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_financial_terms jsonb,
  p_corrected_financial_terms jsonb,
  p_expected_technical_snapshot jsonb,
  p_corrected_technical_snapshot jsonb,
  p_environment text,
  p_nosso_numero text,
  p_remote_snapshot jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_updated public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_audit internal_academic.banese_discount_correction_audit%rowtype;
  v_audit_id uuid := gen_random_uuid();
  v_now timestamptz;
  v_transaction_count integer;
  v_remote_discount jsonb;
  v_remote_nosso_numero text;
  v_remote_line text;
  v_remote_barcode text;
  v_remote_status integer;
  v_marker constant text :=
    'BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT';
  v_allowed_remote_keys constant text[] := array[
    'id', 'Id', 'NossoNumero', 'nossoNumero', 'CodigoMoeda',
    'DataEmissao', 'DataVencimento', 'ValorNominal', 'NumeroDocumento',
    'IdTituloEmpresa', 'CodigoEspecie', 'QuantidadeDiasBaixaDevolucao',
    'Desconto', 'desconto', 'Juros', 'juros', 'Multa', 'multa',
    'CodigoSituacaoBoleto', 'codigoSituacaoBoleto', 'DataBaixa', 'dataBaixa',
    'NumeroLinhaDigitavel', 'numeroLinhaDigitavel', 'NumeroCodigoBarras',
    'numeroCodigoBarras', 'status', 'Status'
  ];
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado à correção de desconto Banese.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_expected_updated_at is null
    or p_environment not in ('sandbox', 'production')
    or coalesce(p_nosso_numero, '') !~ '^[0-9]{9}$'
    or p_nosso_numero = '000000000'
    or jsonb_typeof(p_expected_financial_terms) <> 'object'
    or jsonb_typeof(p_corrected_financial_terms) <> 'object'
    or jsonb_typeof(p_expected_technical_snapshot) <> 'object'
    or jsonb_typeof(p_corrected_technical_snapshot) <> 'object'
    or jsonb_typeof(p_remote_snapshot) <> 'object'
    or pg_catalog.octet_length(p_remote_snapshot::text) > 131072
  then
    raise exception 'Parâmetros da correção de desconto Banese são inválidos.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_remote_snapshot) as remote_key(key)
    where not (remote_key.key = any(v_allowed_remote_keys))
  ) then
    raise exception 'Snapshot remoto contém campos não autorizados.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'banese-discount-removal:' || p_receivable_id::text, 0
    )
  );
  select receivable.* into v_receivable
  from public.contas_receber as receivable
  where receivable.id = p_receivable_id
  for update;
  if not found then
    raise exception 'Título Banese não encontrado.' using errcode = 'P0002';
  end if;

  select audit.* into v_audit
  from internal_academic.banese_discount_correction_audit as audit
  where audit.receivable_id = p_receivable_id
  for update;
  if found then
    if v_audit.state <> 'APPLIED'
      or v_audit.expected_updated_at is distinct from p_expected_updated_at
      or v_audit.expected_financial_terms is distinct from p_expected_financial_terms
      or v_audit.corrected_financial_terms is distinct from p_corrected_financial_terms
      or v_audit.expected_technical_snapshot is distinct from p_expected_technical_snapshot
      or v_audit.corrected_technical_snapshot is distinct from p_corrected_technical_snapshot
      or v_audit.environment is distinct from p_environment
      or v_audit.nosso_numero is distinct from p_nosso_numero
      or v_audit.remote_snapshot is distinct from p_remote_snapshot
      or v_audit.actor_auth_user_id is distinct from p_actor_id
      or v_receivable.gateway_financial_terms
        is distinct from p_corrected_financial_terms
      or v_receivable.regra_financeira_tecnica_snapshot
        is distinct from p_corrected_technical_snapshot
      or v_receivable.gateway_last_error is not null
      or not exists (
        select 1 from public.payment_gateway_transactions as transaction
        where transaction.id = v_audit.transaction_id
          and transaction.receivable_id = p_receivable_id
          and transaction.raw_payload -> 'discountRemovalCorrection'
            ->> 'auditId' = v_audit.id::text
      )
    then
      raise exception 'Replay divergente da correção de desconto Banese.'
        using errcode = '40001';
    end if;
    return jsonb_build_object(
      'receivable', to_jsonb(v_receivable), 'auditId', v_audit.id,
      'replayed', true
    );
  end if;

  if not exists (
    select 1
    from public.matriculas as enrollment
    join public.turmas as class on class.id = enrollment.turma_id
    where enrollment.id = v_receivable.matricula_id
      and class.codigo = 'ENF-T42-INT-MAT'
      and class.regra_financeira_revisao = 2
      and class.regra_financeira_fingerprint =
        'f8a6ab2dc5ac3c82faaa364d0c3d611bc1c303be119c136c2e1c3c1b0e642216'
      and class.aplicar_desconto_matricula is false
      and class.aplicar_desconto_mensalidade is true
      and class.aplicar_desconto_rematricula is false
  ) then
    raise exception 'Regra canônica da T42 não está corrigida.'
      using errcode = '23514';
  end if;
  if p_actor_id is not null and not exists (
    select 1 from public.usuarios_sistema as actor
    where actor.auth_user_id = p_actor_id
      and upper(actor.status) = 'ATIVO'
      and (
        actor.pode_visualizar_todos_polos
        or v_receivable.polo_id = any(actor.polo_ids)
      )
  ) then
    raise exception 'Ator da correção não possui vínculo ativo com o polo.'
      using errcode = '42501';
  end if;

  if v_receivable.updated_at is distinct from p_expected_updated_at
    or v_receivable.gateway_provider <> 'banese_card'
    or v_receivable.gateway_environment is distinct from p_environment
    or v_receivable.gateway_payment_method <> 'BOLETO'
    or v_receivable.gateway_submission_channel <> 'API'
    or v_receivable.gateway_submission_status <> 'API_REGISTERED'
    or v_receivable.gateway_cnab_file_id is not null
    or v_receivable.tipo_lancamento <> 'REMATRICULA'
    or v_receivable.parcela_numero is distinct from 0
    or round(v_receivable.valor, 2) is distinct from 100.00::numeric
    or v_receivable.status <> 'PENDENTE'
    or v_receivable.gateway_status <> 'PENDING'
    or v_receivable.data_pagamento is not null
    or v_receivable.valor_pago is not null
    or v_receivable.gateway_settlement_evidence is not null
    or v_receivable.gateway_settlement_recorded_at is not null
    or v_receivable.gateway_last_error is distinct from v_marker
    or v_receivable.gateway_financial_terms
      is distinct from p_expected_financial_terms
    or v_receivable.regra_financeira_tecnica_snapshot
      is distinct from p_expected_technical_snapshot
  then
    raise exception 'Título Banese mudou antes da persistência da correção.'
      using errcode = '40001';
  end if;
  if p_corrected_financial_terms - 'discount'
      is distinct from p_expected_financial_terms - 'discount'
    or p_corrected_financial_terms -> 'discount' is distinct from 'null'::jsonb
    or coalesce((p_expected_financial_terms -> 'discount' ->> 'type'), '')
      <> 'fixed'
    or round((p_expected_financial_terms -> 'discount' ->> 'value')::numeric, 2)
      is distinct from 19.90::numeric
    or (p_expected_financial_terms -> 'discount' ->> 'validUntil')::date
      is distinct from v_receivable.data_vencimento
    or round((p_corrected_financial_terms ->> 'nominalAmount')::numeric, 2)
      is distinct from round(v_receivable.valor, 2)
    or (p_corrected_financial_terms ->> 'dueDate')::date
      is distinct from v_receivable.data_vencimento
  then
    raise exception 'Termos corrigidos não representam somente a remoção do desconto.'
      using errcode = '23514';
  end if;
  if p_expected_technical_snapshot ->> 'tipoLancamento' <> 'REMATRICULA'
    or (p_expected_technical_snapshot ->> 'aplicarDesconto')::boolean is not true
    or round((p_expected_technical_snapshot ->> 'descontoPontualidade')::numeric, 2)
      is distinct from 19.90::numeric
    or p_corrected_technical_snapshot is distinct from jsonb_set(
      p_expected_technical_snapshot, '{aplicarDesconto}', 'false'::jsonb, false
    )
  then
    raise exception 'Snapshot técnico corrigido não é a alteração mínima autorizada.'
      using errcode = '23514';
  end if;

  v_remote_nosso_numero := lpad(regexp_replace(coalesce(
    p_remote_snapshot ->> 'NossoNumero',
    p_remote_snapshot ->> 'nossoNumero', ''
  ), '\D', '', 'g'), 9, '0');
  v_remote_line := regexp_replace(coalesce(
    p_remote_snapshot ->> 'NumeroLinhaDigitavel',
    p_remote_snapshot ->> 'numeroLinhaDigitavel', ''
  ), '\D', '', 'g');
  v_remote_barcode := regexp_replace(coalesce(
    p_remote_snapshot ->> 'NumeroCodigoBarras',
    p_remote_snapshot ->> 'numeroCodigoBarras', ''
  ), '\D', '', 'g');
  v_remote_status := coalesce(
    (p_remote_snapshot ->> 'CodigoSituacaoBoleto')::integer,
    (p_remote_snapshot ->> 'codigoSituacaoBoleto')::integer
  );
  v_remote_discount := coalesce(
    p_remote_snapshot -> 'Desconto', p_remote_snapshot -> 'desconto'
  );
  if v_remote_discount is not null
    and jsonb_typeof(v_remote_discount) <> 'array'
  then
    raise exception 'GET pós-PUT retornou desconto em formato inválido.'
      using errcode = '23514';
  end if;
  if v_remote_nosso_numero <> p_nosso_numero or v_remote_status <> 2
    or v_remote_line <> v_receivable.gateway_boleto_linha_digitavel
    or v_remote_barcode <> v_receivable.gateway_boleto_codigo_barras
    or p_remote_snapshot ->> 'ValorNominal' is null
    or round((p_remote_snapshot ->> 'ValorNominal')::numeric, 2)
      is distinct from round(v_receivable.valor, 2)
    or p_remote_snapshot ->> 'DataVencimento' is null
    or (p_remote_snapshot ->> 'DataVencimento')::date
      is distinct from v_receivable.data_vencimento
    or v_remote_discount is not null and (
      exists (
        select 1 from jsonb_array_elements(v_remote_discount) as discount(item)
        where coalesce(
            (discount.item ->> 'TipoDesconto')::integer,
            (discount.item ->> 'tipoDesconto')::integer, -1
          ) <> 0
          or round(coalesce(
            (discount.item ->> 'Valor')::numeric,
            (discount.item ->> 'valor')::numeric, -1
          ), 2) <> 0::numeric
      )
    )
  then
    raise exception 'GET pós-PUT não comprova a remoção no mesmo boleto.'
      using errcode = '23514';
  end if;
  if regexp_replace(coalesce(v_receivable.gateway_boleto_nosso_numero, ''),
      '\D', '', 'g') <> p_nosso_numero
    or regexp_replace(coalesce(v_receivable.gateway_payment_id, ''),
      '\D', '', 'g') <> p_nosso_numero
    or v_remote_line !~ '^[0-9]{47}$' or v_remote_barcode !~ '^[0-9]{44}$'
    or substring(v_remote_barcode from 31 for 9) <> p_nosso_numero
  then
    raise exception 'Identidade bancária local diverge do GET pós-PUT.'
      using errcode = '23514';
  end if;

  select count(*)::integer into v_transaction_count
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id;
  if v_transaction_count <> 1 then
    raise exception 'Título precisa possuir uma única transação bancária.'
      using errcode = '23514';
  end if;
  select transaction.* into v_transaction
  from public.payment_gateway_transactions as transaction
  where transaction.receivable_id = p_receivable_id
  for update;
  if v_transaction.provider_code <> 'banese_card'
    or v_transaction.environment <> p_environment
    or v_transaction.payment_method <> 'BOLETO'
    or v_transaction.remote_status <> 'PENDING'
    or round(v_transaction.amount, 2) is distinct from 100.00::numeric
    or regexp_replace(coalesce(v_transaction.remote_payment_id, ''),
      '\D', '', 'g') <> p_nosso_numero
    or regexp_replace(coalesce(v_transaction.bank_slip_our_number, ''),
      '\D', '', 'g') <> p_nosso_numero
    or v_transaction.bank_slip_digitable_line <> v_remote_line
    or v_transaction.bank_slip_barcode <> v_remote_barcode
  then
    raise exception 'Transação bancária diverge da identidade corrigida.'
      using errcode = '23514';
  end if;

  v_now := clock_timestamp();
  insert into internal_academic.banese_discount_correction_audit (
    id, receivable_id, transaction_id, environment, nosso_numero,
    actor_auth_user_id, database_txid, expected_updated_at,
    expected_transaction_updated_at, expected_financial_terms,
    corrected_financial_terms, expected_technical_snapshot,
    corrected_technical_snapshot, remote_snapshot, remote_snapshot_sha256,
    state, authorized_at
  ) values (
    v_audit_id, p_receivable_id, v_transaction.id, p_environment,
    p_nosso_numero, p_actor_id, pg_catalog.txid_current(),
    p_expected_updated_at, v_transaction.updated_at,
    p_expected_financial_terms, p_corrected_financial_terms,
    p_expected_technical_snapshot, p_corrected_technical_snapshot,
    p_remote_snapshot,
    encode(extensions.digest(p_remote_snapshot::text, 'sha256'), 'hex'),
    'AUTHORIZED', v_now
  );

  update public.contas_receber as receivable
  set gateway_financial_terms = p_corrected_financial_terms,
      gateway_financial_terms_confirmed_at = v_now,
      regra_financeira_tecnica_snapshot = p_corrected_technical_snapshot,
      gateway_last_error = null,
      gateway_synced_at = v_now,
      updated_at = v_now
  where receivable.id = p_receivable_id
    and receivable.updated_at = p_expected_updated_at
    and receivable.gateway_last_error = v_marker
  returning receivable.* into v_updated;
  if not found then
    raise exception 'CAS do título Banese não foi aplicado.'
      using errcode = '40001';
  end if;
  if not exists (
    select 1
    from internal_academic.banese_discount_correction_audit as audit
    where audit.id = v_audit_id and audit.state = 'SNAPSHOT_APPLIED'
  ) then
    raise exception 'Guard não consumiu a autorização do snapshot.'
      using errcode = '23514';
  end if;

  update public.payment_gateway_transactions as transaction
  set raw_payload = coalesce(transaction.raw_payload, '{}'::jsonb)
        || jsonb_build_object('discountRemovalCorrection', jsonb_build_object(
          'auditId', v_audit_id, 'actorId', p_actor_id,
          'persistedAt', v_now, 'remoteSnapshot', p_remote_snapshot
        )),
      last_error = null,
      synced_at = v_now,
      updated_at = v_now
  where transaction.id = v_transaction.id
    and transaction.updated_at = v_transaction.updated_at;
  if not found then
    raise exception 'CAS da transação Banese não foi aplicado.'
      using errcode = '40001';
  end if;

  update internal_academic.banese_discount_correction_audit as audit
  set state = 'APPLIED', applied_at = v_now
  where audit.id = v_audit_id and audit.state = 'SNAPSHOT_APPLIED';
  if not found then
    raise exception 'Auditoria da correção Banese não foi concluída.'
      using errcode = '40001';
  end if;
  return jsonb_build_object(
    'receivable', to_jsonb(v_updated), 'auditId', v_audit_id,
    'replayed', false
  );
end;
$function$;

revoke all on function public.persist_banese_discount_removal_correction(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.persist_banese_discount_removal_correction(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, uuid
) to service_role;

comment on function public.persist_banese_discount_removal_correction(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, uuid
) is 'Persiste, após GET pós-PUT, a remoção auditada do desconto Banese da rematrícula T42.';

commit;
