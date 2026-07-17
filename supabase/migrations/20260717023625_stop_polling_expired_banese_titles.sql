create or replace function public.claim_banese_reconciliation_batch(
  p_limit integer default 10
)
returns table(receivable_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 10));
begin
  return query
  with candidates as (
    select cr.id
    from public.contas_receber cr
    where cr.gateway_provider = 'banese_card'
      and cr.gateway_payment_method = 'BOLETO'
      and cr.gateway_environment in ('sandbox', 'production')
      and cr.status in ('PENDENTE', 'VENCIDO')
      and cr.gateway_boleto_nosso_numero ~ '^[0-9]{9}$'
      and coalesce(cr.gateway_status, '') not in (
        'PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELED_BY_BANK',
        'EXPIRED', 'REFUNDED', 'REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED'
      )
      and coalesce(cr.gateway_synced_at, '-infinity'::timestamptz)
        < now() - interval '4 minutes'
    order by coalesce(cr.gateway_synced_at, '-infinity'::timestamptz), cr.id
    limit v_limit
    for update skip locked
  )
  update public.contas_receber cr
  set gateway_synced_at = now(),
      gateway_last_error = null,
      updated_at = now()
  from candidates candidate
  where cr.id = candidate.id
  returning cr.id;
end;
$$;

revoke all on function public.claim_banese_reconciliation_batch(integer)
  from public, anon, authenticated;
grant execute on function public.claim_banese_reconciliation_batch(integer)
  to service_role;

comment on function public.claim_banese_reconciliation_batch(integer) is
  'Reserva boletos Banese nao terminais; titulos expirados ficam fora do polling recorrente.';
