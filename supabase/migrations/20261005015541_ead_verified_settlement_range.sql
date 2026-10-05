begin;

create function internal_contas.ead_settlement_amount_bounds_cents(p_value numeric)
returns bigint[] language sql immutable set search_path='' as $$
  select case when abs(p_value*100-round(p_value*100))<0.00000001
    then array[round(p_value*100)::bigint,round(p_value*100)::bigint]
    else array[floor(p_value*100+0.00000001)::bigint,ceil(p_value*100-0.00000001)::bigint] end;
$$;
revoke all on function internal_contas.ead_settlement_amount_bounds_cents(numeric) from public,anon,authenticated,service_role;

-- Port of the canonical Banese settlement-range contract: bounds for each
-- monetary term, calendar extension through the next national banking day,
-- daily accrual inclusive of startsOn, and no union of punctual/late ranges.
create function internal_contas.ead_verified_settlement_cents(p_snapshot jsonb,p_payment_date date)
returns bigint[] language plpgsql stable security definer set search_path='' as $$
declare
  v_terms jsonb:=p_snapshot->'financialTerms';v_nominal numeric;v_due date;v_effective date;
  v_bank date;v_term jsonb;v_kind text;v_type text;v_value numeric;v_date date;
  v_discount numeric:=0;v_penalty numeric:=0;v_interest numeric:=0;v_raw numeric;
  v_min numeric;v_max numeric;v_db bigint[];v_pb bigint[];v_ib bigint[];
begin
  if p_payment_date is null or jsonb_typeof(v_terms) is distinct from 'object'
    or jsonb_typeof(v_terms->'nominalAmount') is distinct from 'number'
    or v_terms->>'dueDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  v_nominal:=round((v_terms->>'nominalAmount')::numeric,2);v_due:=(v_terms->>'dueDate')::date;
  if v_nominal<=0 or v_nominal is distinct from (p_snapshot->>'amount')::numeric
    or v_due is distinct from (p_snapshot->>'dueDate')::date then return null; end if;
  v_bank:=public.banese_next_national_banking_day(v_due);
  v_effective:=case when p_payment_date>v_due and p_payment_date<=v_bank then v_due else p_payment_date end;
  foreach v_kind in array array['discount','penalty','interest'] loop
    v_term:=v_terms->v_kind;
    if v_term is null or v_term='null'::jsonb then continue; end if;
    if jsonb_typeof(v_term)<>'object' or jsonb_typeof(v_term->'value') is distinct from 'number' then return null; end if;
    v_type:=v_term->>'type';
    if v_kind='interest' then
      if v_type not in ('daily-fixed','monthly-percentage') then return null; end if;
    elsif v_type not in ('fixed','percentage') then return null; end if;
    if v_type is null then return null; end if;
    v_value:=round((v_term->>'value')::numeric,case when v_type in ('percentage','monthly-percentage') then 6 else 2 end);
    if v_value<=0 or v_type in ('percentage','monthly-percentage') and v_value>=100
      or v_kind in ('discount','penalty') and v_type='fixed' and v_value>=v_nominal then return null; end if;
    if v_kind='discount' then
      if coalesce(v_term->>'validUntil',v_due::text) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
      v_date:=coalesce(v_term->>'validUntil',v_due::text)::date;
      if v_date>v_due then return null; end if;
      if v_effective<=v_date then
        v_discount:=case when v_type='fixed' then v_value else v_nominal*v_value/100 end;
      end if;
    else
      if coalesce(v_term->>'startsOn',(v_due+1)::text) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
      v_date:=coalesce(v_term->>'startsOn',(v_due+1)::text)::date;
      if v_date<=v_due then return null; end if;
      if v_effective>=v_date then
        if v_kind='penalty' then
          v_penalty:=case when v_type='fixed' then v_value else v_nominal*v_value/100 end;
        else
          v_interest:=case when v_type='daily-fixed' then v_value*(v_effective-v_date+1)
            else v_nominal*v_value/100*(v_effective-v_date+1)/30 end;
        end if;
      end if;
    end if;
  end loop;
  v_db:=internal_contas.ead_settlement_amount_bounds_cents(v_discount);
  v_pb:=internal_contas.ead_settlement_amount_bounds_cents(v_penalty);
  v_ib:=internal_contas.ead_settlement_amount_bounds_cents(v_interest);
  v_min:=greatest(1,round(v_nominal*100)-v_db[2]+v_pb[1]+v_ib[1]);
  v_max:=greatest(v_min,round(v_nominal*100)-v_db[1]+v_pb[2]+v_ib[2]);
  return array[v_min::bigint,v_max::bigint];
exception when others then return null;
end; $$;
revoke all on function internal_contas.ead_verified_settlement_cents(jsonb,date) from public,anon,authenticated,service_role;

commit;
