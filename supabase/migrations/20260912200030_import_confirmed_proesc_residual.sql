begin;

alter function internal_academic.is_authorized_external_history_insert(public.contas_receber)
  rename to is_authorized_external_history_insert_before_residual;
revoke all on function internal_academic.is_authorized_external_history_insert_before_residual(public.contas_receber)
  from public, anon, authenticated, service_role;
create function internal_academic.is_authorized_external_history_insert(p_receivable public.contas_receber)
returns boolean language sql stable security definer set search_path = '' as $$
  select internal_academic.is_authorized_external_history_insert_before_residual(p_receivable)
    or exists (select 1 from internal_proesc.mutation_claims claim
      join internal_proesc.reconciliation_requests request on request.request_id = claim.request_id
      where claim.transaction_id = txid_current() and claim.receivable_id = p_receivable.id
        and claim.kind = 'IMPORT_RESIDUAL' and not claim.completed
        and request.action = 'IMPORT_RESIDUAL' and request.response is null
        and to_jsonb(p_receivable) @> claim.expected_new
        and p_receivable.gateway_provider is null and p_receivable.gateway_payment_id is null
        and p_receivable.gateway_creation_token is null and p_receivable.gateway_submission_channel is null
        and p_receivable.gateway_submission_status is null and p_receivable.gateway_boleto_nosso_numero is null
        and p_receivable.gateway_boleto_linha_digitavel is null and p_receivable.gateway_boleto_codigo_barras is null
        and p_receivable.gateway_pix_payload is null and p_receivable.gateway_pix_encoded_image is null
        and p_receivable.asaas_payment_id is null and p_receivable.nosso_numero_asaas is null
        and p_receivable.manual_settlement_id is null
        and (p_receivable.regra_financeira_tecnica_snapshot -> 'cicloManual') is null);
$$;
revoke all on function internal_academic.is_authorized_external_history_insert(public.contas_receber)
  from public, anon, authenticated, service_role;

create function public.proesc_import_residual_obligation_service(
  p_actor_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_replay jsonb;
  v_parent internal_proesc.obligation_links%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_new public.contas_receber%rowtype;
  v_link internal_proesc.obligation_links%rowtype;
  v_expected jsonb;
  v_account uuid;
  v_id uuid := gen_random_uuid();
  v_due date;
  v_amount numeric;
  v_status text;
  v_origin text;
begin
  v_replay := internal_proesc.begin_financial_request('IMPORT_RESIDUAL', p_actor_id, p_request_id, p_payload);
  if v_replay is not null then return v_replay; end if;
  if not coalesce((p_payload -> 'confirmed' = 'true'::jsonb
    and p_payload ->> 'sourceStatus' = 'OPEN'
    and p_payload ->> 'sourceFingerprint' ~ '^[0-9a-f]{64}$'
    and p_payload ->> 'expectedParentBefore' ~ '^[0-9a-f]{64}$'
    and p_payload ->> 'principalCents' ~ '^[0-9]+$'
    and p_payload ->> 'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and p_payload -> 'source' ->> 'unitId' ~ '^[0-9]+$'
    and p_payload -> 'source' ->> 'classId' ~ '^[0-9]+$'
    and p_payload -> 'source' ->> 'key' ~ '^[0-9]+$'), false) then
    raise exception 'Importação residual exige plano e identidade explicitamente confirmados.' using errcode = '22023'; end if;
  select * into strict v_parent from internal_proesc.obligation_links where id = (p_payload ->> 'parentLinkId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('proesc:obligation:' || (p_payload -> 'source')::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'technical-manual-cycle-enrollment:' || v_parent.matricula_id::text, 0));
  perform 1 from public.turmas where id = v_parent.turma_id for update;
  perform 1 from public.matriculas where id = v_parent.matricula_id for update;
  select * into strict v_receivable from public.contas_receber where id = v_parent.receivable_id for update;
  perform internal_proesc.assert_historical_receivable(v_receivable);
  if internal_proesc.receivable_fingerprint(v_receivable) is distinct from p_payload ->> 'expectedParentBefore'
    or v_parent.source_unit_id <> p_payload -> 'source' ->> 'unitId'
    or v_parent.source_class_id <> p_payload -> 'source' ->> 'classId'
    or v_parent.source_key = p_payload -> 'source' ->> 'key' then
    raise exception 'Obrigação-pai ou identidade Proesc divergiu do plano.' using errcode = '40001'; end if;
  if exists (select 1 from internal_academic.technical_manual_cycle_runs where matricula_id = v_parent.matricula_id)
    or exists (select 1 from internal_academic.technical_external_cycle_coverage where matricula_id = v_parent.matricula_id)
    or not exists (select 1 from public.matriculas where id = v_parent.matricula_id and status in ('ATIVO','PENDENTE')) then
    raise exception 'Residual desta matrícula exige revisão antes da inclusão.' using errcode = '42501'; end if;
  if exists (select 1 from internal_proesc.obligation_links where source_unit_id = v_parent.source_unit_id
    and source_class_id = v_parent.source_class_id and source_key = p_payload -> 'source' ->> 'key') then
    raise exception 'Obrigação residual já vinculada; não criar novamente.' using errcode = '40001'; end if;
  v_due := (p_payload ->> 'dueDate')::date;
  v_amount := (p_payload ->> 'principalCents')::numeric / 100;
  if not isfinite(v_due) or v_amount <= 0 or v_amount > v_receivable.valor then
    raise exception 'Principal residual incompatível com a obrigação-pai.' using errcode = '22023'; end if;
  v_account := internal_proesc.shared_account(v_receivable.polo_id);
  v_status := case when v_due < (timezone('America/Maceio', now()))::date then 'VENCIDO' else 'PENDENTE' end;
  v_origin := 'PROESC-V1:' || v_parent.source_unit_id || ':' || (p_payload -> 'source' ->> 'key');
  if exists (select 1 from public.contas_receber where matricula_id = v_parent.matricula_id
    and origem_cronograma_id = v_origin) then
    raise exception 'Recebível com identidade residual já existe.' using errcode = '40001'; end if;
  v_expected := jsonb_build_object('id',v_id,'matricula_id',v_parent.matricula_id,'turma_id',v_parent.turma_id,
    'cliente_id',v_receivable.cliente_id,'polo_id',v_receivable.polo_id,'valor',v_amount,'data_vencimento',v_due,
    'status',v_status,'valor_pago',0,'data_pagamento',null,'conta_bancaria_id',v_account,
    'origem_pagamento','SISTEMA_ANTERIOR','origem_cronograma_id',v_origin,'tipo_lancamento','PARCELA',
    'parcela_numero',null,'descricao','Saldo residual - Histórico Proesc');
  insert into internal_proesc.mutation_claims(request_id,transaction_id,receivable_id,kind,expected_new)
  values (p_request_id,txid_current(),v_id,'IMPORT_RESIDUAL',v_expected);
  insert into public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,descricao,valor,data_vencimento,
    status,valor_pago,data_pagamento,conta_bancaria_id,origem_pagamento,origem_cronograma_id,tipo_lancamento,parcela_numero,categoria)
  values (v_id,v_parent.matricula_id,v_parent.turma_id,v_receivable.cliente_id,v_receivable.polo_id,
    'Saldo residual - Histórico Proesc',v_amount,v_due,v_status,0,null,v_account,'SISTEMA_ANTERIOR',v_origin,'PARCELA',null,'MENSALIDADE')
  returning * into v_new;
  if not to_jsonb(v_new) @> v_expected then
    raise exception 'A inclusão residual divergiu do plano confirmado.' using errcode = '40001'; end if;
  insert into internal_proesc.obligation_links(matricula_id,turma_id,receivable_id,
    source_unit_id,source_class_id,source_key,kind,parent_link_id,auto_enabled,confirmed_by)
  values (v_parent.matricula_id,v_parent.turma_id,v_id,v_parent.source_unit_id,v_parent.source_class_id,
    p_payload -> 'source' ->> 'key','RESIDUAL',v_parent.id,false,p_actor_id) returning * into v_link;
  update internal_proesc.mutation_claims set completed = true where request_id = p_request_id;
  insert into internal_proesc.reconciliation_events(request_id,link_id,mode,result,before_state,after_state)
  values (p_request_id,v_link.id,'IMPORT_RESIDUAL','IMPORTED',
    jsonb_build_object('parentLinkId',v_parent.id,'sourceFingerprint',p_payload ->> 'sourceFingerprint'),to_jsonb(v_new));
  return internal_proesc.finish_financial_request(p_request_id,jsonb_build_object(
    'result','IMPORTED','linkId',v_link.id,'receivableId',v_id,
    'currentBefore',internal_proesc.receivable_fingerprint(v_new)));
end;
$$;
revoke all on function public.proesc_import_residual_obligation_service(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.proesc_import_residual_obligation_service(uuid, uuid, jsonb) to service_role;

-- Preserve the reviewed state machine; extend only its origin predicate. A
-- confirmed residual link is historical evidence, never a second-cycle run.
do $extend_confirmed_t42_history$
declare
  v_definition text;
  v_old text := $old$and receivable.origem_cronograma_id ~ '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'$old$;
  v_new text := $new$and (
          receivable.origem_cronograma_id ~ '^T42-LEG-S[0-9]+-P[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or exists (select 1 from internal_proesc.obligation_links link
            where link.receivable_id = receivable.id and link.matricula_id = p_matricula_id
              and link.turma_id = v_policy.turma_id)
        )$new$;
begin
  v_definition := pg_get_functiondef('internal_academic.technical_manual_cycle_state_before_proesc_coverage(uuid)'::regprocedure);
  if (length(v_definition) - length(replace(v_definition,v_old,''))) / length(v_old) <> 1 then
    raise exception 'O predicado revisado do histórico T42 mudou; revisar migration.'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$extend_confirmed_t42_history$;
notify pgrst, 'reload schema';
commit;
