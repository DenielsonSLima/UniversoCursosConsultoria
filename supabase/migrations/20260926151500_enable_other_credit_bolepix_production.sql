-- Enable the existing, authorized BolePix route only; never issue a charge here.
-- The UUID parser fix and the explicit route allowlist must be deployed with this change.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $other_credit_route$
declare
  v_route public.payment_gateway_routes%rowtype;
  v_credential public.payment_gateway_credentials%rowtype;
  v_runtime public.payment_gateway_runtime_config%rowtype;
  v_route_before jsonb;
  v_other_routes_before text;
  v_other_routes_after text;
  v_changed integer;
  v_marker constant text := 'OUTROS_CREDITOS_BOLEPIX_PRODUCTION_20260926';
  v_original_notes constant text := 'ESCOPO_BANESE_MP_20260722: Banese boleto/Pix; Mercado Pago cartao. Rotas nao homologadas permanecem desativadas. | ETAPA_HOMOLOGACAO_20260724: somente EAD + boleto Banese no sandbox';
begin
  select * into strict v_runtime
  from public.payment_gateway_runtime_config where id for share;
  if v_runtime.enabled is distinct from true
    or v_runtime.active_environment is distinct from 'production' then
    raise exception 'Runtime bancario divergiu: ativacao de Outros Creditos cancelada.';
  end if;

  -- Hold the three route rows while confirming the production credential shared
  -- by the two already enabled and homologated BolePix paths.
  perform 1 from public.payment_gateway_routes
  where environment = 'production' and payment_method = 'BOLETO'
    and modalidade in ('EAD', 'TECNICO', 'OUTROS_CREDITOS')
  order by id for update;

  select * into strict v_route from public.payment_gateway_routes
  where id = '491a75b8-2e9c-4f54-b3d3-ea86e7fc3394';
  if v_route.modalidade is distinct from 'OUTROS_CREDITOS'
    or v_route.payment_method is distinct from 'BOLETO'
    or v_route.environment is distinct from 'production'
    or v_route.provider_code is distinct from 'banese_card'
    or v_route.credential_id is distinct from '0390f87a-6374-4d0b-b682-5313e44d444c'::uuid
    or v_route.enabled is distinct from false
    or v_route.priority is distinct from 1
    or v_route.updated_at is distinct from timestamptz '2026-07-24 02:02:50.154763+00'
    or v_route.notes is distinct from v_original_notes then
    raise exception 'Rota Outros Creditos divergiu da base revisada; nenhuma rota alterada.';
  end if;
  if (select count(*) from public.payment_gateway_routes
      where modalidade in ('EAD', 'TECNICO') and payment_method = 'BOLETO'
        and environment = 'production' and provider_code = 'banese_card'
        and enabled and credential_id = v_route.credential_id) <> 2 then
    raise exception 'Rotas BolePix de referencia divergiram; ativacao cancelada.';
  end if;

  select * into strict v_credential from public.payment_gateway_credentials
  where id = v_route.credential_id for share;
  if v_credential.provider_code is distinct from 'banese_card'
    or v_credential.environment is distinct from 'production'
    or v_credential.configured is distinct from true
    or v_credential.client_id_configured is distinct from true
    or v_credential.client_secret_configured is distinct from true
    or v_credential.metadata->'bolepixBankManaged' is distinct from 'true'::jsonb
    or coalesce(regexp_replace(coalesce(v_credential.metadata->>'baneseBoletoConvenio',
         v_credential.metadata->>'baneseConvenio'), '[^0-9]', '', 'g'), '') !~ '^[0-9]{1,20}$'
    or coalesce(regexp_replace(v_credential.metadata->>'baneseAgencia', '[^0-9]', '', 'g'), '') !~ '^[0-9]{3}$'
    or regexp_replace(v_credential.metadata->>'baneseAgencia', '[^0-9]', '', 'g') = '000'
    or coalesce(regexp_replace(v_credential.metadata->>'baneseConta', '[^0-9]', '', 'g'), '') = ''
    or nullif(trim(v_credential.metadata->>'baneseBeneficiarioNome'), '') is null
    or coalesce(regexp_replace(v_credential.metadata->>'baneseBeneficiarioInscricao',
         '[^0-9]', '', 'g'), '') !~ '^([0-9]{11}|[0-9]{14})$' then
    raise exception 'Configuracao BolePix de producao incompleta; ativacao cancelada.';
  end if;
  -- EDI7 belongs only to CNAB contingency and is not an API BolePix prerequisite.
  v_route_before := to_jsonb(v_route);
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text, '[]'))
  into v_other_routes_before from public.payment_gateway_routes r where r.id <> v_route.id;

  update public.payment_gateway_routes r
  set enabled = true,
      notes = v_route.notes || ' | ' || v_marker,
      updated_at = clock_timestamp()
  where r.id = v_route.id and to_jsonb(r) = v_route_before;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Compare-and-set da rota Outros Creditos falhou.';
  end if;

  select * into strict v_route from public.payment_gateway_routes
  where id = '491a75b8-2e9c-4f54-b3d3-ea86e7fc3394';
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text, '[]'))
  into v_other_routes_after from public.payment_gateway_routes r where r.id <> v_route.id;
  if v_route.enabled is distinct from true
    or v_route.notes is distinct from v_original_notes || ' | ' || v_marker
    or (to_jsonb(v_route) - array['enabled','notes','updated_at'])
      is distinct from (v_route_before - array['enabled','notes','updated_at'])
    or v_other_routes_after is distinct from v_other_routes_before then
    raise exception 'Pos-condicao da rota BolePix falhou; transacao revertida.';
  end if;
end;
$other_credit_route$;

commit;
