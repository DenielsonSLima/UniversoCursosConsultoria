-- Keep private reversal authority out of ordinary invoker UPDATE expressions.
-- PostgreSQL checks EXECUTE while initializing an expression, before AND can
-- short-circuit; an unrelated bank claim must never prepare this private call.
begin;

do $patch$
declare
  v_function regprocedure;
  v_definition text;
  v_from text;
  v_to text;
begin
  v_function := 'public.protect_paid_financial_history()'::regprocedure;
  if (select prosecdef from pg_proc where oid = v_function) then
    raise exception 'Paid history guard must remain SECURITY INVOKER.';
  end if;
  v_definition := pg_get_functiondef(v_function);
  v_from := $old$BEGIN
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='contas_receber' AND TG_OP='UPDATE' THEN
    IF OLD.status='PAGO' AND NEW.status='PENDENTE'
      AND OLD.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
      AND internal_academic.local_manual_reversal_authorized(OLD,NEW) THEN RETURN NEW; END IF;
  END IF;
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;$old$;
  v_to := $new$BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='contas_receber' AND TG_OP='UPDATE' THEN
    IF OLD.status='PAGO' AND NEW.status='PENDENTE'
      AND OLD.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' THEN
      IF internal_academic.local_manual_reversal_authorized(OLD,NEW) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, '')) <> length(v_from) then
    raise exception 'Paid history guard boundary changed; review before applying.';
  end if;
  execute replace(v_definition, v_from, v_to);

  v_function := 'public.protect_receivable_manual_settlement_fields()'::regprocedure;
  if (select prosecdef from pg_proc where oid = v_function) then
    raise exception 'Manual settlement guard must remain SECURITY INVOKER.';
  end if;
  v_definition := pg_get_functiondef(v_function);
  v_from := $old$begin
  if old.status='PAGO' and new.status='PENDENTE'
    and old.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
    and internal_academic.local_manual_reversal_authorized(old,new) then return new; end if;
  if v_trusted_writer then
    return new;
  end if;$old$;
  v_to := $new$begin
  if v_trusted_writer then
    return new;
  end if;
  if old.status='PAGO' and new.status='PENDENTE'
    and old.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL' then
    if internal_academic.local_manual_reversal_authorized(old,new) then
      return new;
    end if;
  end if;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, '')) <> length(v_from) then
    raise exception 'Manual settlement guard boundary changed; review before applying.';
  end if;
  execute replace(v_definition, v_from, v_to);

  if exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    where has_function_privilege(role_name,
      'internal_academic.local_manual_reversal_authorized(public.contas_receber,public.contas_receber)',
      'EXECUTE')
  ) then
    raise exception 'Private reversal helper privileges changed; review before applying.';
  end if;
end;
$patch$;

commit;
