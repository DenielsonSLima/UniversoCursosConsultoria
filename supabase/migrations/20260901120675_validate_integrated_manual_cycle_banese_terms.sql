begin;

create or replace function
internal_academic.technical_manual_banese_expected_terms(
  p_receivable public.contas_receber
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_snapshot jsonb := p_receivable.regra_financeira_tecnica_snapshot;
  v_cycle jsonb;
  v_kind text;
  v_discount numeric;
  v_interest numeric;
  v_fine_percent numeric;
  v_fine_value numeric;
  v_apply_discount boolean;
  v_apply_late boolean;
  v_next_due text;
begin
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_receivable.matricula_id
    and run.turma_id = p_receivable.turma_id
    and p_receivable.id = any(run.receivable_ids)
    and run.state = 'LOCAL_CREATED'
  order by run.cycle_number desc
  limit 1;
  if not found then
    raise exception 'Recebível não pertence a ciclo técnico manual emitível.'
      using errcode = '23514';
  end if;

  v_cycle := v_snapshot -> 'cicloManual';
  v_kind := case upper(coalesce(p_receivable.tipo_lancamento, ''))
    when 'MATRICULA' then 'MATRICULA'
    when 'REMATRICULA' then 'REMATRICULA'
    when 'PARCELA' then 'MENSALIDADE'
    else null
  end;
  if jsonb_typeof(v_snapshot) is distinct from 'object'
    or coalesce((v_snapshot ->> 'versao')::integer, 0) <> 2
    or jsonb_typeof(v_snapshot -> 'identidade') is distinct from 'object'
    or jsonb_typeof(v_cycle) is distinct from 'object'
    or v_kind is null
    or upper(coalesce(v_snapshot ->> 'tipoLancamento', '')) <> v_kind
    or coalesce(v_cycle ->> 'requestId', '') <> v_run.request_id::text
    or coalesce((v_cycle ->> 'cicloNumero')::integer, 0) <> v_run.cycle_number
    or v_cycle ->> 'regraFingerprint' is distinct from v_run.rule_fingerprint
    or v_cycle ->> 'politicaFingerprint' is distinct from v_run.policy_fingerprint
    or v_cycle ->> 'cronogramaFingerprint' is distinct from v_run.schedule_fingerprint
  then
    raise exception 'Snapshot v2 ou identidade do ciclo manual inválidos.'
      using errcode = '23514';
  end if;
  if p_receivable.origem_cronograma_id is distinct from (
    case v_kind
      when 'MATRICULA' then 'matricula'
      when 'REMATRICULA' then
        'ciclo-' || (v_run.cycle_number - 1)::text || '-rematricula'
      else 'ciclo-' || v_run.cycle_number::text || '-parc-' ||
        p_receivable.parcela_numero::text
    end
  )
  then
    raise exception 'Origem do recebível diverge da identidade do ciclo manual.'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_snapshot -> 'valorBase') is distinct from 'number'
    or jsonb_typeof(v_snapshot -> 'descontoPontualidade') is distinct from 'number'
    or jsonb_typeof(v_snapshot -> 'jurosAtrasoPercentual') is distinct from 'number'
    or jsonb_typeof(v_snapshot -> 'multaAtrasoPercentual') is distinct from 'number'
    or jsonb_typeof(v_snapshot -> 'multaAtrasoValor') is distinct from 'number'
    or jsonb_typeof(v_snapshot -> 'aplicarDesconto') is distinct from 'boolean'
    or jsonb_typeof(v_snapshot -> 'aplicarMultaJuros') is distinct from 'boolean'
  then
    raise exception 'Composição monetária v2 do recebível está incompleta.'
      using errcode = '23514';
  end if;
  v_discount := (v_snapshot ->> 'descontoPontualidade')::numeric;
  v_interest := (v_snapshot ->> 'jurosAtrasoPercentual')::numeric;
  v_fine_percent := (v_snapshot ->> 'multaAtrasoPercentual')::numeric;
  v_fine_value := (v_snapshot ->> 'multaAtrasoValor')::numeric;
  v_apply_discount := (v_snapshot ->> 'aplicarDesconto')::boolean;
  v_apply_late := (v_snapshot ->> 'aplicarMultaJuros')::boolean;
  if coalesce(p_receivable.valor, 0) <= 0
    or p_receivable.data_vencimento is null
    or round((v_snapshot ->> 'valorBase')::numeric, 2) <>
      round(p_receivable.valor, 2)
    or least(v_discount, v_interest, v_fine_percent, v_fine_value) < 0
    or v_interest >= 100 or v_fine_percent >= 100
    or round(v_fine_value, 2) <>
      round(p_receivable.valor * v_fine_percent / 100.0, 2)
    or (v_apply_discount and v_discount >= p_receivable.valor)
  then
    raise exception 'Composição monetária v2 diverge do valor do recebível.'
      using errcode = '23514';
  end if;

  v_next_due := pg_catalog.to_char(
    p_receivable.data_vencimento + 1, 'YYYY-MM-DD'
  );
  return jsonb_build_object(
    'nominalAmount', round(p_receivable.valor, 2),
    'dueDate', pg_catalog.to_char(p_receivable.data_vencimento, 'YYYY-MM-DD'),
    'discount', case when v_apply_discount and v_discount > 0
      then jsonb_build_object(
        'type', 'fixed', 'value', round(v_discount, 2),
        'validUntil', pg_catalog.to_char(
          p_receivable.data_vencimento, 'YYYY-MM-DD'
        )
      ) else 'null'::jsonb end,
    'penalty', case when v_apply_late and v_fine_percent > 0
      then jsonb_build_object(
        'type', 'percentage', 'value', round(v_fine_percent, 6),
        'startsOn', v_next_due
      ) else 'null'::jsonb end,
    'interest', case when v_apply_late and v_interest > 0
      then jsonb_build_object(
        'type', 'monthly-percentage', 'value', round(v_interest, 6),
        'startsOn', v_next_due
      ) else 'null'::jsonb end
  );
end;
$function$;

revoke all on function
  internal_academic.technical_manual_banese_expected_terms(
    public.contas_receber
  ) from public, anon, authenticated, service_role;

comment on function
  internal_academic.technical_manual_banese_expected_terms(
    public.contas_receber
  ) is 'Reconstrói os termos Banese congelados do snapshot técnico manual v2.';

create or replace function
public.technical_manual_banese_expected_terms_service(
  p_receivable_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_receivable public.contas_receber%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role')
  then
    raise exception 'Acesso negado aos termos do ciclo BolePix.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null then
    raise exception 'Recebível obrigatório para validar termos BolePix.'
      using errcode = '22023';
  end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id;
  return internal_academic.technical_manual_banese_expected_terms(
    v_receivable
  );
end;
$function$;

revoke all on function
  public.technical_manual_banese_expected_terms_service(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.technical_manual_banese_expected_terms_service(uuid)
  to service_role;

comment on function
  public.technical_manual_banese_expected_terms_service(uuid)
  is 'Expõe somente ao backend os termos exatos do ciclo manual antes do POST.';

commit;
