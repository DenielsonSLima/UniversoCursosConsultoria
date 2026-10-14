BEGIN;
CREATE SCHEMA internal_financial_payments;
REVOKE ALL ON SCHEMA internal_financial_payments FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.financial_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  source_kind text NOT NULL CHECK(source_kind IN ('RECEIVABLE','EXPENSE','PAYABLE')),
  source_id uuid NOT NULL,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  payment_date date NOT NULL,
  original_cents bigint NOT NULL CHECK(original_cents>0),
  principal_cents bigint NOT NULL CHECK(principal_cents>=0),
  interest_cents bigint NOT NULL CHECK(interest_cents>=0),
  penalty_cents bigint NOT NULL CHECK(penalty_cents>=0),
  addition_cents bigint NOT NULL CHECK(addition_cents>=0),
  discount_cents bigint NOT NULL CHECK(discount_cents>=0),
  payment_cents bigint NOT NULL CHECK(payment_cents>0),
  input jsonb NOT NULL,
  payload_hash text NOT NULL,
  preview jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id),
  reversal_request_id uuid UNIQUE,
  reversal_reason text,
  CHECK(payment_cents=principal_cents+interest_cents+penalty_cents+addition_cents),
  CHECK((reversed_at IS NULL AND reversed_by IS NULL AND reversal_request_id IS NULL AND reversal_reason IS NULL)
    OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_request_id IS NOT NULL
      AND length(reversal_reason) BETWEEN 5 AND 500))
);
CREATE INDEX financial_payment_events_source_idx ON public.financial_payment_events(source_kind,source_id,created_at,id);
CREATE INDEX financial_payment_events_polo_date_idx ON public.financial_payment_events(polo_id,payment_date);
CREATE TABLE public.financial_payment_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.financial_payment_events(id),
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 20),
  account_id uuid NOT NULL REFERENCES public.contas_bancarias(id),
  method text NOT NULL CHECK(method IN ('DINHEIRO','PIX','CARTAO','BOLETO','TED','TRANSFERENCIA','DEBITO','CREDITO')),
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  UNIQUE(event_id,sequence)
);
CREATE INDEX financial_payment_components_account_idx ON public.financial_payment_components(account_id,event_id);
ALTER TABLE public.financial_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_payment_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_payment_events,public.financial_payment_components FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION internal_financial_payments.money(p_cents bigint) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT to_char(p_cents::numeric/100,'FM999999999999999990.00');
$$;
CREATE FUNCTION internal_financial_payments.cents(p_value jsonb) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v text;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PAYMENT_INVALID_AMOUNT'; END IF;
  v:=p_value#>>'{}';
  IF v !~ '^(0|[1-9][0-9]{0,10})([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'PAYMENT_INVALID_AMOUNT'; END IF;
  RETURN (v::numeric*100)::bigint;
END $$;
create function internal_financial_payments.actor_allowed(p_actor uuid,p_polo uuid,p_tab text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  u public.usuarios_sistema%rowtype;
  profile public.perfis_acesso%rowtype;
  permissions jsonb;
  tabs jsonb;
  schedule jsonb;
  allowed_polos uuid[];
  day_number integer;
  access_time text;
  start_time text;
  end_time text;
  allowed_day integer;
begin
  if p_actor is null or p_polo is null or not coalesce(
    public.portal_identidade_institucional_acesso_liberado(p_actor,'GESTOR'),false)
  then return false; end if;
  select * into u from public.usuarios_sistema where auth_user_id = p_actor;
  if not found or not coalesce(public.is_active_status(u.status),false)
    or lower(btrim(coalesce(u.perfil,''))) not in ('gestor','financeiro') then
    return false;
  end if;
  select * into profile from public.perfis_acesso where id = u.perfil_acesso_id;
  permissions := case when profile.id is not null and not coalesce(u.personalizar_permissoes,false)
    then coalesce(profile.permissoes,'{}'::jsonb) else coalesce(u.permissoes,'{}'::jsonb) end;
  if jsonb_typeof(permissions->'modules') is distinct from 'array'
    or not coalesce(permissions->'modules' ? 'financeiro',false) then return false; end if;
  tabs := permissions#>'{tabs,financeiro}';
  if jsonb_typeof(tabs) is distinct from 'array' or jsonb_array_length(tabs) = 0 then
    tabs := permissions->'financeiroTabs';
  end if;
  if jsonb_typeof(tabs) is distinct from 'array'
    or not coalesce(tabs ? p_tab,false) then return false; end if;
  allowed_polos := coalesce(u.polo_ids,array[]::uuid[]);
  if cardinality(allowed_polos) = 0 and u.context ~*
    '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    allowed_polos := array[u.context::uuid];
  end if;
  if not coalesce((p_polo = any(allowed_polos) or (
    u.permissoes->'allPolos' = 'true'::jsonb
    and cardinality(coalesce(u.polo_ids,array[]::uuid[])) = 0
    and exists (select 1 from public.polos where id=p_polo and lower(status)='ativo')
  )),false) then return false; end if;
  schedule := coalesce(u.restricao_horario,profile.restricao_horario,
    '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb);
  if jsonb_typeof(schedule->'ativo') is distinct from 'boolean' then return false; end if;
  if schedule->'ativo' = 'false'::jsonb then return true; end if;
  day_number := extract(dow from now() at time zone 'America/Maceio')::integer;
  access_time := to_char(now() at time zone 'America/Maceio','HH24:MI');
  start_time := schedule->>'horario_inicio'; end_time := schedule->>'horario_fim';
  if jsonb_typeof(schedule->'dias') is distinct from 'array'
    or start_time is null or end_time is null
    or start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or start_time = end_time then return false; end if;
  allowed_day := case when start_time>end_time and access_time<=end_time
    then (day_number+6)%7 else day_number end;
  return coalesce((case when start_time<end_time then access_time between start_time and end_time
    else access_time>=start_time or access_time<=end_time end)
    and exists(select 1 from jsonb_array_elements_text(schedule->'dias') d(value)
      where d.value=allowed_day::text),false);
end $$;


CREATE FUNCTION internal_financial_payments.preserve_event_history()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='financial_payment_components' THEN
    RAISE EXCEPTION 'PAYMENT_HISTORY_IMMUTABLE';
  END IF;
  IF OLD.reversed_at IS NOT NULL OR
    (to_jsonb(NEW)-ARRAY['reversed_at','reversed_by','reversal_request_id','reversal_reason'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['reversed_at','reversed_by','reversal_request_id','reversal_reason']) THEN
    RAISE EXCEPTION 'PAYMENT_HISTORY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER financial_payment_event_immutable BEFORE UPDATE OR DELETE ON public.financial_payment_events
FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.preserve_event_history();
CREATE TRIGGER financial_payment_component_immutable BEFORE UPDATE OR DELETE ON public.financial_payment_components
FOR EACH ROW EXECUTE FUNCTION internal_financial_payments.preserve_event_history();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_financial_payments FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
