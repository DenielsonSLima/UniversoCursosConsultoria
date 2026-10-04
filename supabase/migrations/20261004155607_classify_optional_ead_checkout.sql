begin;

-- Cancellation eligibility is deliberately stricter than debt classification.
-- Payment, learning or identity evidence blocks expiration, even before the
-- canonical receipt arrives. Neither private helper mutates financial facts.
create function internal_contas.ead_checkout_can_expire(p_receivable_id uuid)
returns boolean language sql stable set search_path='' as $expiration$
  select exists (
    select 1
    from public.contas_receber cr
    join public.matriculas m on m.id=cr.matricula_id
      and m.aluno_id=cr.cliente_id and m.turma_id=cr.turma_id
    join public.turmas t on t.id=cr.turma_id
    join public.cursos c on c.id=t.curso_id
    join public.inscricoes_online i on i.receivable_id=cr.id
      and i.matricula_id=m.id and i.aluno_id=cr.cliente_id
      and i.turma_id=t.id and i.curso_id=c.id
    where cr.id=p_receivable_id and c.modalidade='EAD'
      and cr.tipo_lancamento='MATRICULA'
      and cr.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE')
      and cr.status in ('PENDENTE','VENCIDO','SUSPENSO',
        'AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
      and m.status='PENDENTE' and i.status='AGUARDANDO_PAGAMENTO'
      and not exists (
        select 1 from public.matricula_movimentacoes history
        where history.matricula_id=m.id and (
          history.status_anterior in ('ATIVO','TRANCADO','CONCLUIDO')
          or history.status_novo in ('ATIVO','TRANCADO','CONCLUIDO'))
      )
      and cr.data_pagamento is null and coalesce(cr.valor_pago,0)=0
      and cr.manual_settlement_id is null
      and i.pago_em is null and i.confirmado_em is null
      and not exists (
        select 1 from public.contas_receber paid
        where paid.matricula_id=m.id and (
          paid.status='PAGO' or paid.data_pagamento is not null
          or coalesce(paid.valor_pago,0)>0 or paid.manual_settlement_id is not null)
      )
      and not exists (
        select 1 from public.inscricoes_online confirmed
        where confirmed.matricula_id=m.id and (
          confirmed.status='PAGO' or confirmed.pago_em is not null
          or confirmed.confirmado_em is not null)
      )
      and not exists (
        select 1 from public.payment_gateway_transactions paid_tx
        where paid_tx.receivable_id=cr.id
          and upper(coalesce(paid_tx.remote_status,'')) in
            ('PAID','RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
      )
      and not exists (
        select 1 from public.ead_aluno_progresso progress
        where progress.aluno_id=m.aluno_id and progress.curso_id=c.id
          and (progress.started_at is not null
            or coalesce(progress.progress,'{}'::jsonb)<>'{}'::jsonb)
      )
  );
$expiration$;

-- A payment detected before the canonical local settlement is reconciliation,
-- not a new debt. Keep paid canonical receipts in the regular revenue readers.
-- Active EAD obligations without a payment witness are not excluded here.
create function internal_contas.ead_checkout_is_optional(p_receivable_id uuid)
returns boolean language sql stable set search_path='' as $optional$
  select exists (
    select 1
    from public.contas_receber cr
    join public.matriculas m on m.id=cr.matricula_id
      and m.aluno_id=cr.cliente_id and m.turma_id=cr.turma_id
    join public.turmas t on t.id=cr.turma_id
    join public.cursos c on c.id=t.curso_id
    join public.inscricoes_online i on i.receivable_id=cr.id
      and i.matricula_id=m.id and i.aluno_id=cr.cliente_id
      and i.turma_id=t.id and i.curso_id=c.id
    where cr.id=p_receivable_id and c.modalidade='EAD'
      and cr.tipo_lancamento='MATRICULA'
      and cr.status in ('PENDENTE','VENCIDO','SUSPENSO',
        'AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
      and (
        cr.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE')
        or (cr.origem_pagamento='BANESE'
          and cr.gateway_provider='banese_card'
          and i.gateway_provider=cr.gateway_provider
          and i.gateway_environment=cr.gateway_environment
          and i.gateway_payment_id=cr.gateway_payment_id
          and cr.gateway_payment_id is not null)
      )
      and (
        (m.status='PENDENTE' and i.status='AGUARDANDO_PAGAMENTO'
          and not exists (
            select 1 from public.matricula_movimentacoes history
            where history.matricula_id=m.id and (
              history.status_anterior in ('ATIVO','TRANCADO','CONCLUIDO')
              or history.status_novo in ('ATIVO','TRANCADO','CONCLUIDO'))
          )
          and not exists (
            select 1 from public.ead_aluno_progresso progress
            where progress.aluno_id=m.aluno_id and progress.curso_id=c.id
              and (progress.started_at is not null
                or coalesce(progress.progress,'{}'::jsonb)<>'{}'::jsonb)
          ))
        or cr.data_pagamento is not null or coalesce(cr.valor_pago,0)>0
        or cr.manual_settlement_id is not null
        or i.status='PAGO' or i.pago_em is not null or i.confirmado_em is not null
        or exists (
          select 1 from public.payment_gateway_transactions paid_tx
          where paid_tx.receivable_id=cr.id and paid_tx.inscricao_online_id=i.id
            and paid_tx.provider_code=cr.gateway_provider
            and paid_tx.environment=cr.gateway_environment
            and paid_tx.remote_payment_id=cr.gateway_payment_id
            and i.gateway_provider=cr.gateway_provider
            and i.gateway_environment=cr.gateway_environment
            and i.gateway_payment_id=cr.gateway_payment_id
            and upper(coalesce(paid_tx.remote_status,'')) in
              ('PAID','RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
        )
      )
  );
$optional$;

revoke all on function internal_contas.ead_checkout_is_optional(uuid),
  internal_contas.ead_checkout_can_expire(uuid)
  from public,anon,authenticated,service_role;
comment on function internal_contas.ead_checkout_is_optional(uuid) is
  'Private financial classifier: initial optional EAD purchase or identity-proven payment awaiting canonical settlement; never debt or premature revenue.';
comment on function internal_contas.ead_checkout_can_expire(uuid) is
  'Private conservative cancellation eligibility: unpaid/unconfirmed online EAD enrollment with no payment, activation or learning evidence. Bank confirmation is still required.';

commit;

