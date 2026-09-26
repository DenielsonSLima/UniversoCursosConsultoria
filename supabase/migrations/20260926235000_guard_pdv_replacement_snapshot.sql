create or replace function public.reserve_banese_pdv_replacement(p_receivable_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.banese_pdv_cancellation_jobs; r public.contas_receber;
begin
 select * into j from public.banese_pdv_cancellation_jobs where receivable_id=p_receivable_id for update;
 if not found or j.state<>'CANCELED' or j.confirmed_at is null or j.evidence_sha256 is null then raise exception 'Baixa bancaria nao confirmada.'; end if;
 select * into r from public.contas_receber where id=p_receivable_id for update;
 if r.status<>'CANCELADO' or r.gateway_status<>'CANCELED' or r.data_pagamento is not null or coalesce(r.valor_pago,0)<>0 then raise exception 'Titulo antigo mudou.'; end if;
 if j.snapshot is null or exists (
   select 1 from unnest(array['polo_id','cliente_id','valor','data_vencimento','descricao','categoria_financeira_id']) k
   where to_jsonb(r)->k is distinct from j.snapshot->k
 ) then raise exception 'Dados da substituicao diferem do titulo autorizado.'; end if;
 if not exists(select 1 from public.payment_gateway_transactions where receivable_id=r.id and remote_status='CANCELED') then raise exception 'Transacao antiga nao cancelada.'; end if;
 return jsonb_build_object('idempotencyKey',j.replacement_request_id,'poloId',r.polo_id,'descricao',r.descricao,
 'valor',r.valor,'dataVencimento',r.data_vencimento,'clienteId',r.cliente_id,'categoriaFinanceiraId',r.categoria_financeira_id,
 'mode','GATEWAY','formaPagamento','BOLETO');
end $$;
revoke all on function public.reserve_banese_pdv_replacement(uuid) from public,anon,authenticated;
grant execute on function public.reserve_banese_pdv_replacement(uuid) to service_role;
