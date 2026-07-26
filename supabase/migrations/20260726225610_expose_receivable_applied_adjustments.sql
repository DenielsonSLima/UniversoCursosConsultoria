begin;

create or replace function public.get_receivables_modality_page_secure(
  p_modality text,
  p_polo_id uuid default null,
  p_search text default null,
  p_due_start date default null,
  p_due_end date default null,
  p_status_scope text default 'pending',
  p_group_mode text default 'none',
  p_group_key text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_rows jsonb;
begin
  if auth.role() <> 'service_role'
     and not (
       (p_polo_id is null and public.is_gestor_global())
       or (p_polo_id is not null and public.is_gestor_for_polo(p_polo_id))
     ) then
    raise exception 'Acesso financeiro fora do escopo autorizado.'
      using errcode = '42501';
  end if;

  v_payload := public.get_receivables_modality_page(
    p_modality,
    p_polo_id,
    p_search,
    p_due_start,
    p_due_end,
    p_status_scope,
    p_group_mode,
    p_group_key,
    p_page,
    p_page_size
  );

  select coalesce(
    jsonb_agg(
      entry.row_data || jsonb_build_object(
        'gateway_provider', receivable.gateway_provider,
        'gateway_environment', receivable.gateway_environment,
        'gateway_payment_method', receivable.gateway_payment_method,
        'gateway_settlement_channel', receivable.gateway_settlement_channel,
        'gateway_settlement_source', receivable.gateway_settlement_source,
        'desconto_aplicado',
          case
            when receivable.manual_settlement_discount_cents is null then null
            else round(receivable.manual_settlement_discount_cents::numeric / 100, 2)
          end,
        'juros_aplicados',
          case
            when receivable.manual_settlement_interest_cents is null then null
            else round(receivable.manual_settlement_interest_cents::numeric / 100, 2)
          end,
        'multa_aplicada',
          case
            when receivable.manual_settlement_penalty_cents is null then null
            else round(receivable.manual_settlement_penalty_cents::numeric / 100, 2)
          end
      )
      order by entry.position
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_payload -> 'rows', '[]'::jsonb))
       with ordinality as entry(row_data, position)
  left join public.contas_receber as receivable
    on receivable.id = (entry.row_data ->> 'id')::uuid;

  return jsonb_set(v_payload, '{rows}', v_rows, true);
end;
$$;

revoke all on function public.get_receivables_modality_page_secure(
  text, uuid, text, date, date, text, text, text, integer, integer
) from public, anon;

grant execute on function public.get_receivables_modality_page_secure(
  text, uuid, text, date, date, text, text, text, integer, integer
) to authenticated, service_role;

commit;
