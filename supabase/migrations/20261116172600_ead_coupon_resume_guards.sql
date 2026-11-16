begin;
-- Private eligibility predicate shared by quote and the locked redemption.
-- Returns NULL for a clean new enrollment, or the single safe enrollment to reuse.
create or replace function internal_contas.ead_coupon_free_enrollment(p_aluno uuid,p_turma uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_course uuid; v_m public.matriculas%rowtype; v_count integer;
begin
  select curso_id into strict v_course from public.turmas where id=p_turma;
  if exists(select 1 from public.turmas_plano_financeiro_unico where turma_id=p_turma) then
    raise exception 'Esta turma possui plano financeiro. Confira a gratuidade com a secretaria.' using errcode='PT409';
  end if;
  select count(*) into v_count from public.matriculas m join public.turmas t on t.id=m.turma_id
    where m.aluno_id=p_aluno and t.curso_id=v_course;
  if v_count=0 then
    if exists(select 1 from public.ead_checkout_attempts where aluno_id=p_aluno and curso_id=v_course)
      or exists(select 1 from public.inscricoes_online where aluno_id=p_aluno and curso_id=v_course)
      or exists(select 1 from public.contas_receber where cliente_id=p_aluno and turma_id in
        (select id from public.turmas where curso_id=v_course)) then
      raise exception 'Compra anterior exige conferência antes de aplicar gratuidade.' using errcode='PT409';
    end if;
    return null;
  end if;
  select * into v_m from public.matriculas where aluno_id=p_aluno and turma_id=p_turma;
  if v_count<>1 or v_m.id is null or v_m.status is distinct from 'PENDENTE'
    or v_m.financeiro_herdado is true or v_m.gerar_cobranca_futura is true
    or exists(select 1 from public.matricula_movimentacoes where matricula_id=v_m.id
      and (upper(status_novo) in ('ATIVO','CONCLUIDO','TRANCADO')
        or upper(status_anterior) in ('ATIVO','CONCLUIDO','TRANCADO')))
    or exists(select 1 from public.ead_coupon_redemptions where aluno_id=p_aluno and curso_id=v_course)
    or not exists(select 1 from public.ead_checkout_attempts where matricula_id=v_m.id) then
    raise exception 'Matrícula anterior não elegível à retomada gratuita. Confira com a secretaria.' using errcode='PT409';
  end if;
  -- Every prior financial identity must be owned by this exact enrollment.
  if exists(select 1 from public.ead_checkout_attempts a
    where (a.matricula_id=v_m.id or (a.aluno_id=p_aluno and a.curso_id=v_course))
    and (a.matricula_id is distinct from v_m.id or a.aluno_id is distinct from p_aluno
      or a.turma_id is distinct from p_turma or a.curso_id is distinct from v_course
      or a.state is distinct from 'EXPIRED' or a.paid_at is not null
      or a.nature is distinct from 'COMPRA_OPCIONAL'
      or not exists(select 1 from public.contas_receber r
        join public.inscricoes_online i on i.id=a.inscription_id
        join public.payment_gateway_transactions tx on tx.id=a.transaction_id
        join public.banese_ead_checkout_expiration_jobs j on j.receivable_id=r.id
        where r.id=a.receivable_id and r.ead_checkout_attempt_id=a.id
          and r.matricula_id=v_m.id and r.cliente_id=p_aluno and r.turma_id=p_turma
          and r.polo_id=(select polo_id from public.turmas where id=p_turma)
          and r.status='CANCELADO' and r.gateway_status in ('CANCELED','EXPIRED')
          and coalesce(r.valor_pago,0)=0 and r.data_pagamento is null and r.manual_settlement_id is null
          and r.gateway_creation_token is null and r.gateway_provider='banese_card'
          and i.ead_checkout_attempt_id=a.id and i.receivable_id=r.id and i.matricula_id=v_m.id
          and i.aluno_id=p_aluno and i.turma_id=p_turma and i.curso_id=v_course
          and i.status='CANCELADO' and i.pago_em is null and i.confirmado_em is null
          and tx.receivable_id=r.id and tx.inscricao_online_id=i.id and tx.provider_code=r.gateway_provider
          and tx.provider_code=i.gateway_provider
          and tx.environment=r.gateway_environment and tx.environment=i.gateway_environment
          and tx.remote_payment_id=r.gateway_payment_id and tx.remote_payment_id=i.gateway_payment_id
          and tx.amount=r.valor and tx.remote_status in ('CANCELED','EXPIRED')
          and j.matricula_id=v_m.id and j.inscription_id=i.id and j.transaction_id=tx.id
          and j.attempt_id=a.id and j.environment=tx.environment and j.state='DONE'
          and j.canceled_at is not null and j.remote_status in ('CANCELED','EXPIRED')
          and j.processing_payment_detected_at is null and j.lease_token is null)))
    or exists(select 1 from public.contas_receber r
      where (r.matricula_id=v_m.id or (r.cliente_id=p_aluno and r.turma_id in
        (select id from public.turmas where curso_id=v_course)))
      and not exists(select 1 from public.ead_checkout_attempts a
        where a.id=r.ead_checkout_attempt_id and a.matricula_id=v_m.id and a.receivable_id=r.id))
    or exists(select 1 from public.inscricoes_online i
      where (i.matricula_id=v_m.id or (i.aluno_id=p_aluno and i.curso_id=v_course))
      and not exists(select 1 from public.ead_checkout_attempts a
        where a.id=i.ead_checkout_attempt_id and a.matricula_id=v_m.id and a.inscription_id=i.id))
    or exists(select 1 from public.ead_payment_reviews rv join public.ead_checkout_attempts a on a.id=rv.attempt_id
      where a.matricula_id=v_m.id)
    or exists(select 1 from public.payment_gateway_transactions tx join public.contas_receber r on r.id=tx.receivable_id
      where r.matricula_id=v_m.id and not exists(select 1 from public.ead_checkout_attempts a
        where a.matricula_id=v_m.id and a.transaction_id=tx.id))
    or exists(select 1 from public.financial_payment_events e join public.contas_receber r on r.id=e.source_id
      where r.matricula_id=v_m.id and e.source_kind='RECEIVABLE' and e.reversed_at is null and e.payment_cents>0)
    or exists(select 1 from public.receivable_manual_settlements s join public.contas_receber r on r.id=s.receivable_id
      where r.matricula_id=v_m.id and s.reversed_at is null) then
    raise exception 'A compra anterior ainda exige confirmação financeira. Nenhuma gratuidade foi aplicada.' using errcode='PT409';
  end if;
  return v_m.id;
end; $$;
revoke all on function internal_contas.ead_coupon_free_enrollment(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function internal_contas.ead_coupon_financial_snapshot(p_matricula uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.contas_receber r where r.matricula_id=p_matricula),'[]'),
    'inscriptions',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.inscricoes_online i where i.matricula_id=p_matricula),'[]'),
    'transactions',coalesce((select jsonb_agg(to_jsonb(tx) order by tx.id) from public.payment_gateway_transactions tx join public.contas_receber r on r.id=tx.receivable_id where r.matricula_id=p_matricula),'[]'),
    'jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from public.banese_ead_checkout_expiration_jobs j where j.matricula_id=p_matricula),'[]'),
    'ledger',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.financial_payment_events e join public.contas_receber r on r.id=e.source_id where r.matricula_id=p_matricula and e.source_kind='RECEIVABLE'),'[]'),
    'manual',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.receivable_manual_settlements s join public.contas_receber r on r.id=s.receivable_id where r.matricula_id=p_matricula),'[]'),
    'reviews',coalesce((select jsonb_agg(to_jsonb(rv) order by rv.id) from public.ead_payment_reviews rv join public.ead_checkout_attempts a on a.id=rv.attempt_id where a.matricula_id=p_matricula),'[]'),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.ead_checkout_attempts a where a.matricula_id=p_matricula),'[]'));
$$;
revoke all on function internal_contas.ead_coupon_financial_snapshot(uuid) from public,anon,authenticated,service_role;
commit;
