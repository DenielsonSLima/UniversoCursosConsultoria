-- Todo boleto Banese já cancelado usa a mesma prova canônica, futuro ou vencido.

create or replace function public.ajustar_financeiro_movimentacao_matricula()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'TRANCAMENTO' then
    update public.contas_receber
    set status = 'SUSPENSO', updated_at = now()
    where matricula_id = new.matricula_id
      and status in ('PENDENTE', 'VENCIDO')
      and data_pagamento is null
      and data_vencimento > new.data_movimentacao;
  elsif new.tipo = 'REATIVACAO' then
    update public.contas_receber
    set status = case
          when data_vencimento < current_date then 'VENCIDO'
          else 'PENDENTE'
        end,
        updated_at = now()
    where matricula_id = new.matricula_id
      and status = 'SUSPENSO'
      and data_pagamento is null;
  elsif new.tipo in (
    'CANCELAMENTO', 'DESISTENCIA', 'TRANSFERENCIA_EXTERNA_ENVIADA'
  ) then
    if not exists (
      select 1
      from public.matriculas m
      where m.id = new.matricula_id
        and m.status in ('DESISTENTE', 'CANCELADO', 'TRANSFERIDO')
        and new.status_novo = m.status
    ) then
      return new;
    end if;

    if exists (
      select 1
      from public.matriculas m
      where m.id = new.matricula_id
        and (
          m.gerar_cobranca_futura is distinct from false
          or m.sincronizar_asaas is distinct from false
        )
    ) then
      perform internal_academic.authorize_matricula_control_update(
        new.matricula_id
      );
      update public.matriculas
      set gerar_cobranca_futura = false,
          sincronizar_asaas = false
      where id = new.matricula_id;
    end if;

    update public.contas_receber
    set status = 'CANCELADO', updated_at = now()
    where matricula_id = new.matricula_id
      and status in ('PENDENTE', 'VENCIDO', 'SUSPENSO')
      and data_pagamento is null
      and (
        (
          data_vencimento > new.data_movimentacao
          and (
            gateway_provider is distinct from 'banese_card'
            or gateway_payment_method is distinct from 'BOLETO'
          )
        )
        or (
          gateway_provider is null
          and gateway_payment_id is null
          and gateway_payment_link_id is null
          and gateway_installment_id is null
          and gateway_boleto_nosso_numero is null
          and gateway_cnab_file_id is null
          and asaas_payment_id is null
          and asaas_payment_link_id is null
          and asaas_installment_id is null
          and manual_settlement_id is null
          and not exists (
            select 1
            from public.payment_gateway_transactions t
            where t.receivable_id = public.contas_receber.id
          )
        )
        or (
          gateway_provider = 'banese_card'
          and gateway_environment in ('sandbox', 'production')
          and gateway_payment_method = 'BOLETO'
          and gateway_submission_channel = 'API'
          and gateway_submission_status = 'API_REGISTERED'
          and gateway_cnab_file_id is null
          and manual_settlement_id is null
          and gateway_payment_id = gateway_boleto_nosso_numero
          and coalesce(gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
          and upper(coalesce(gateway_status, '')) in (
            'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
          )
          and (
            select count(*)
            from public.payment_gateway_transactions t
            where t.receivable_id = public.contas_receber.id
              and t.provider_code = 'banese_card'
              and t.environment = public.contas_receber.gateway_environment
              and t.payment_method = 'BOLETO'
          ) = 1
          and exists (
            select 1
            from public.payment_gateway_transactions t
            where t.receivable_id = public.contas_receber.id
              and t.provider_code = 'banese_card'
              and t.environment = public.contas_receber.gateway_environment
              and t.payment_method = 'BOLETO'
              and t.remote_payment_id =
                public.contas_receber.gateway_boleto_nosso_numero
              and t.bank_slip_our_number =
                public.contas_receber.gateway_boleto_nosso_numero
              and upper(coalesce(t.remote_status, '')) in (
                'CANCELED', 'CANCELED_BY_BANK', 'CANCELLED'
              )
          )
        )
      );
  end if;
  return new;
end;
$$;
