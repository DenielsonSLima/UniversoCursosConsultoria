begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

-- Positive audit evidence must be cheap to read per receivable. A paid
-- activation alone can refer to a different payment on the same enrollment.
create index sistema_eventos_ead_payment_activation_idx
  on public.sistema_eventos(entidade,entidade_id,created_at)
  where (entidade='matriculas' and acao in ('Criou','Liberou matrícula','Liberou sem receber'))
    or (entidade='contas_receber' and acao='Recebeu pagamento');

-- A purchase confirmed after the historical cutoff was not debt at that
-- cutoff. Require its own receipt and its FIRST paid academic activation;
-- missing or conflicting legacy evidence preserves the existing criterion.
-- Criou/INSERT proves an audited beginning, not a literal PENDENTE snapshot.
-- Known prior activation, conclusion or learning still vetoes this proof.
create function internal_contas.ead_checkout_paid_after_cutoff(
  p_receivable_id uuid,p_payment_cutoff_exclusive date
) returns boolean language sql stable security invoker set search_path='' as $proof$
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
    join lateral (
      select e.created_at from public.sistema_eventos e
      where e.entidade='matriculas' and e.entidade_id=m.id::text
        and e.acao='Criou' and e.detalhes->>'operacao'='INSERT'
      order by e.created_at,e.id limit 1
    ) enrollment_creation on true
    join lateral (
      select e.created_at from public.sistema_eventos e
      where e.entidade='contas_receber' and e.entidade_id=cr.id::text
        and e.acao='Recebeu pagamento'
        and e.detalhes->>'operacao'='UPDATE'
        and e.detalhes->'camposAlterados' ? 'status'
      order by e.created_at,e.id limit 1
    ) receipt on true
    join lateral (
      select e.acao,e.created_at,e.detalhes from public.sistema_eventos e
      where e.entidade='matriculas' and e.entidade_id=m.id::text
        and e.acao in ('Liberou matrícula','Liberou sem receber')
      order by e.created_at,e.id limit 1
    ) activation on true
    where cr.id=p_receivable_id and c.modalidade='EAD'
      and cr.tipo_lancamento='MATRICULA' and cr.status='PAGO'
      and cr.data_pagamento>=p_payment_cutoff_exclusive
      and coalesce(cr.valor_pago,0)>0
      and cr.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE','BANESE')
      and cr.gateway_provider is not null and cr.gateway_environment is not null
      and cr.gateway_payment_id is not null
      and i.gateway_provider=cr.gateway_provider
      and i.gateway_environment=cr.gateway_environment
      and i.gateway_payment_id=cr.gateway_payment_id
      and i.status='PAGO' and i.pago_em is not null
      and enrollment_creation.created_at<=receipt.created_at
      and receipt.created_at>=
        (cr.data_pagamento::timestamp at time zone 'America/Maceio')
      and activation.acao='Liberou matrícula'
      and activation.detalhes->>'operacao'='UPDATE'
      and activation.detalhes->'camposAlterados' ? 'status'
      and activation.created_at>=receipt.created_at
      and not exists (
        select 1 from public.matricula_movimentacoes history
        where history.matricula_id=m.id
          and (history.status_anterior in ('ATIVO','TRANCADO','CONCLUIDO')
            or history.status_novo in ('ATIVO','TRANCADO','CONCLUIDO'))
          and (history.created_at<receipt.created_at
            or history.data_movimentacao<cr.data_pagamento
            or (history.created_at<=activation.created_at
              and history.status_anterior in ('ATIVO','TRANCADO','CONCLUIDO')))
      )
      and not exists (
        select 1 from public.ead_aluno_progresso progress
        where progress.aluno_id=m.aluno_id and progress.curso_id=c.id
          and (progress.started_at<receipt.created_at
            or (progress.started_at is null
              and coalesce(progress.progress,'{}'::jsonb)<>'{}'::jsonb))
      )
      and not exists (
        select 1 from public.contas_receber other
        where other.matricula_id=m.id and other.id<>cr.id
          and (other.status='PAGO' or other.data_pagamento is not null
            or coalesce(other.valor_pago,0)>0 or other.manual_settlement_id is not null)
          and (other.data_pagamento is null or other.data_pagamento<=cr.data_pagamento)
      )
      and not exists (
        select 1 from public.sistema_eventos earlier
        join public.contas_receber other on other.id::text=earlier.entidade_id
        where earlier.entidade='contas_receber' and earlier.acao='Recebeu pagamento'
          and other.matricula_id=m.id and other.id<>cr.id
          and earlier.created_at<=activation.created_at
      )
  );
$proof$;
revoke all on function internal_contas.ead_checkout_paid_after_cutoff(uuid,date)
  from public,anon,authenticated,service_role;
comment on function internal_contas.ead_checkout_paid_after_cutoff(uuid,date) is
  'Private historical proof: canonical online EAD receipt after cutoff, audited enrollment creation and own payment before first paid activation, no earlier obligation or use. Missing evidence preserves existing classification.';

-- Only these readers reconstruct a PAGO as outstanding at an earlier cutoff.
-- Cash revenue readers, current-status overdue lists and date contracts stay
-- untouched. Monthly wrappers/series reuse the same private evidence helper.
do $cutoff$
declare
  target record;
  definition text;
  metadata jsonb;
  occurrences integer;
begin
  for target in select * from (values
    ('internal_contas.caixa_monthly_delinquency(uuid,date,date)',
      $old$and not internal_contas.ead_checkout_is_optional(c.id)$old$,
      $new$and not internal_contas.ead_checkout_is_optional(c.id)
      and not internal_contas.ead_checkout_paid_after_cutoff(c.id,b.payment_exclusive)$new$,1),
    ('internal_contas.caixa_receivables_position_rows(uuid,date,date)',
      $old$and not internal_contas.ead_checkout_is_optional(c.id)$old$,
      $new$and not internal_contas.ead_checkout_is_optional(c.id)
      and not internal_contas.ead_checkout_paid_after_cutoff(c.id,least(p_today+1,b.end_date))$new$,1),
    ('public.get_relatorio_inadimplencia_secure(uuid,date,integer,text)',
      $old$AND NOT internal_contas.ead_checkout_is_optional(recebimento.id)$old$,
      $new$AND NOT internal_contas.ead_checkout_is_optional(recebimento.id)
      AND NOT internal_contas.ead_checkout_paid_after_cutoff(recebimento.id,v_corte+1)$new$,2)
  ) as patch(signature,old_text,new_text,expected_count)
  loop
    select pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
      into definition,metadata
      from pg_catalog.pg_proc p where p.oid=target.signature::regprocedure;
    occurrences:=(length(definition)-length(replace(definition,target.old_text,'')))
      /length(target.old_text);
    if occurrences<>target.expected_count
      or position('ead_checkout_paid_after_cutoff' in definition)>0 then
      raise exception 'Optional EAD historical cutoff drifted: %. Review and rebase.',target.signature;
    end if;
    execute replace(definition,target.old_text,target.new_text);
    if (select to_jsonb(p)-'prosrc' from pg_catalog.pg_proc p
        where p.oid=target.signature::regprocedure) is distinct from metadata then
      raise exception 'Optional EAD historical cutoff changed function metadata: %.',target.signature;
    end if;
  end loop;
end;
$cutoff$;

notify pgrst,'reload schema';
commit;
