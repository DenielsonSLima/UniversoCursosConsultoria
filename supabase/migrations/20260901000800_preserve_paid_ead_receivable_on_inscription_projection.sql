begin;

create or replace function public.ead_activate_matricula_on_paid_inscricao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_conta_id uuid;
  v_forma_pagamento text;
begin
  if new.matricula_id is null then
    return new;
  end if;

  select c.modalidade
    into v_modalidade
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
   where m.id = new.matricula_id;

  if v_modalidade is null or v_modalidade <> 'EAD' then
    return new;
  end if;

  if new.status = 'AGUARDANDO_PAGAMENTO' then
    update public.matriculas
       set status = 'PENDENTE'
     where id = new.matricula_id
       and status not in ('PENDENTE', 'ATIVO', 'CONCLUIDO');
    return new;
  end if;

  if new.status in ('CANCELADO', 'ERRO') then
    update public.matriculas
       set status = 'CANCELADO'
     where id = new.matricula_id
       and status in (
         'PENDENTE', 'AGUARDANDO_PAGAMENTO', 'VENCIDO', 'TRANCADO',
         'DESISTENTE', 'TRANSFERIDO'
       );
    return new;
  end if;

  if new.status <> 'PAGO' then
    return new;
  end if;

  update public.matriculas
     set status = 'ATIVO'
   where id = new.matricula_id
     and status in ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'VENCIDO');

  update public.inscricoes_online
     set confirmado_em = coalesce(confirmado_em, now()),
         updated_at = now()
   where id = new.id
     and confirmado_em is null;

  select id
    into v_conta_id
    from public.contas_receber
   where matricula_id = new.matricula_id
     and tipo_lancamento = 'MATRICULA'
   order by
     case
       when asaas_payment_id = nullif(new.asaas_payment_id, '') then 0
       when asaas_payment_id is null then 1
       else 2
     end,
     data_vencimento nulls last,
     id
   limit 1;

  if v_conta_id is null then
    perform public.gerar_cobranca_matricula(new.matricula_id);

    select id
      into v_conta_id
      from public.contas_receber
     where matricula_id = new.matricula_id
       and tipo_lancamento = 'MATRICULA'
     order by data_vencimento nulls last, id
     limit 1;
  end if;

  v_forma_pagamento := case upper(coalesce(new.forma_pagamento, ''))
    when 'CREDIT_CARD' then 'CARTAO'
    when 'CARTAO' then 'CARTAO'
    when 'PIX' then 'PIX'
    when 'BOLETO' then 'BOLETO'
    when 'DINHEIRO' then 'DINHEIRO'
    else null
  end;

  if v_conta_id is not null then
    -- A baixa do gateway é canônica. Uma projeção acadêmica repetida não pode
    -- trocar valor efetivamente pago, data, origem nem identidade bancária.
    update public.contas_receber
       set status = 'PAGO',
           valor_pago = coalesce(new.valor, valor_pago),
           data_pagamento = coalesce(new.pago_em::date, current_date),
           forma_pagamento = coalesce(v_forma_pagamento, forma_pagamento),
           origem_pagamento = coalesce(origem_pagamento, 'ASAAS'),
           asaas_payment_id = coalesce(
             nullif(new.asaas_payment_id, ''), asaas_payment_id
           ),
           asaas_status = coalesce(upper(new.status), asaas_status),
           asaas_synced_at = now(),
           asaas_last_error = null,
           updated_at = now()
     where id = v_conta_id
       and status is distinct from 'PAGO';
  end if;

  return new;
end;
$function$;

revoke all on function public.ead_activate_matricula_on_paid_inscricao()
  from public, anon, authenticated;

commit;
