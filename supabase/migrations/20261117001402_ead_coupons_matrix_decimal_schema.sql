begin;

-- Existing coupon and redemption snapshots retain their exact percentage.
-- Unconstrained NUMERIC plus scale checks rejects extra decimals instead of
-- silently rounding the administrator's percentage during assignment.
alter table public.ead_coupons drop constraint ead_coupons_discount_percent_check;
alter table public.ead_coupon_redemptions
  drop constraint ead_coupon_redemptions_discount_percent_check,
  drop constraint ead_coupon_redemptions_check1;
alter table public.ead_coupons alter column discount_percent type numeric using discount_percent::numeric;
alter table public.ead_coupon_redemptions alter column discount_percent type numeric using discount_percent::numeric;
alter table public.ead_coupons add constraint ead_coupons_discount_percent_check
  check(discount_percent>0 and discount_percent<=100 and scale(discount_percent)<=2);
alter table public.ead_coupon_redemptions
  add constraint ead_coupon_redemptions_discount_percent_check
    check(discount_percent>0 and discount_percent<=100 and scale(discount_percent)<=2),
  add constraint ead_coupon_redemptions_check1 check(
    (discount_percent=100 and payable_amount=0 and receivable_id is null and status='CONFIRMED')
    or (discount_percent>0 and discount_percent<100 and payable_amount>0
      and receivable_id is not null and attempt_id is not null));

create or replace function public.ead_coupons_can_manage(p_polo_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and auth.role()='authenticated'
    and coalesce((select enabled from internal_contas.ead_coupon_runtime where singleton),false)
    and exists(select 1 from public.polos polo where polo.id=p_polo_id and polo.is_matriz is true
      and polo.company_id is not null
      and public.is_active_status(polo.status))
    and coalesce(public.gestor_has_module('secretaria'),false)
    and coalesce(public.gestor_has_module('financeiro'),false)
    and coalesce(public.is_financeiro_for_polo(p_polo_id),false)
    and exists(select 1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()
      and public.is_active_status(u.status))
$$;
revoke all on function public.ead_coupons_can_manage(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_can_manage(uuid) to authenticated;

create or replace function public.ead_coupons_available()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and auth.role()='authenticated'
    and coalesce((select enabled from internal_contas.ead_coupon_runtime where singleton),false)
    and (exists(select 1 from public.parceiros p where p.auth_user_id=auth.uid()
      and upper(p.tipo)='ALUNO' and upper(p.status)='ATIVO')
    or exists(select 1 from public.polos matriz where matriz.is_matriz is true
      and public.ead_coupons_can_manage(matriz.id)))
$$;
revoke all on function public.ead_coupons_available() from public,anon,authenticated,service_role;
grant execute on function public.ead_coupons_available() to authenticated;

create function public.ead_coupon_management_allowed(p_coupon_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ead_coupons coupon where coupon.id=p_coupon_id
    and public.ead_coupons_can_manage(coupon.polo_id))
$$;
revoke all on function public.ead_coupon_management_allowed(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ead_coupon_management_allowed(uuid) to authenticated;

-- A redemption belongs financially to its real class/polo; the campaign is
-- managed centrally by the owning Matriz, including redemptions at branches.
drop policy ead_coupon_redemptions_read on public.ead_coupon_redemptions;
create policy ead_coupon_redemptions_read on public.ead_coupon_redemptions for select to authenticated
  using(public.ead_coupon_management_allowed(coupon_id) or
    (auth.uid() is not null and aluno_id=public.current_aluno_id() and public.ead_coupons_available()));
drop policy ead_coupon_events_read on public.ead_coupon_events;
create policy ead_coupon_events_read on public.ead_coupon_events for select to authenticated
  using(public.ead_coupons_available() and
    (public.current_aluno_id() is not null or public.ead_coupon_management_allowed(coupon_id)));

create or replace function internal_contas.ead_coupon_invalidate()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_coupon uuid; v_owner uuid;
begin
  if tg_table_name='ead_coupons' then v_coupon:=new.id; else v_coupon:=new.coupon_id; end if;
  select polo_id into strict v_owner from public.ead_coupons where id=v_coupon;
  insert into public.ead_coupon_events(coupon_id,polo_id) values(v_coupon,v_owner)
  on conflict(coupon_id) do update set polo_id=excluded.polo_id,
    revision=public.ead_coupon_events.revision+1,updated_at=clock_timestamp();
  return new;
end; $$;
revoke all on function internal_contas.ead_coupon_invalidate() from public,anon,authenticated,service_role;

commit;
