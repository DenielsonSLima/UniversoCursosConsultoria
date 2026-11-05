begin;

-- Academic access never proves revenue. Prefer canonical receivables and use
-- confirmed bank-backed legacy inscriptions only when no receipt owns them.
create or replace function public.ead_get_turma_dashboard(p_turma_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and not coalesce(
    public.gestor_has_module('gestao') and public.can_write_turma(p_turma_id),false
  ) then
    raise exception 'Gestor sem permissão para consultar esta turma EAD.' using errcode='42501';
  end if;
  with receipts as (
    select r.*,ledger.has_ledger,ledger.received from public.contas_receber r
    left join public.matriculas m on m.id=r.matricula_id
    left join lateral (
      select count(*)>0 as has_ledger,
        coalesce(sum(e.payment_cents) filter(where e.reversed_at is null),0)::numeric/100 as received
      from public.financial_payment_events e where e.source_kind='RECEIVABLE' and e.source_id=r.id
    ) ledger on true
    where coalesce(r.turma_id,m.turma_id)=p_turma_id
  ), legacy_paid as (
    select distinct on (coalesce(nullif(i.gateway_provider,''),'asaas'),
      coalesce(i.gateway_environment,''),coalesce(nullif(i.gateway_payment_id,''),i.asaas_payment_id)) i.valor
    from public.inscricoes_online i
    where i.turma_id=p_turma_id and i.status='PAGO'
      and coalesce(i.pago_em,i.confirmado_em) is not null and coalesce(i.valor,0)>0
      and coalesce(nullif(i.gateway_payment_id,''),nullif(i.asaas_payment_id,'')) is not null
      and not exists(select 1 from public.contas_receber r
        where r.id=i.receivable_id or (r.matricula_id=i.matricula_id and r.tipo_lancamento='MATRICULA')
          or (nullif(i.gateway_payment_id,'') is not null and r.gateway_payment_id=i.gateway_payment_id
            and r.gateway_provider=i.gateway_provider and r.gateway_environment is not distinct from i.gateway_environment)
          or (nullif(i.asaas_payment_id,'') is not null and r.asaas_payment_id=i.asaas_payment_id))
    order by coalesce(nullif(i.gateway_provider,''),'asaas'),coalesce(i.gateway_environment,''),
      coalesce(nullif(i.gateway_payment_id,''),i.asaas_payment_id),coalesce(i.confirmado_em,i.pago_em) desc,i.id
  ), financial as (
    select coalesce((select sum(r.valor) from receipts r where r.status in ('PENDENTE','VENCIDO','PAGO','SUSPENSO','PARCIAL')),0)
        +coalesce((select sum(l.valor) from legacy_paid l),0) as expected,
      coalesce((select sum(case when r.has_ledger then r.received
        when r.status='PAGO' and r.data_pagamento is not null and r.valor_pago>0 then r.valor_pago
        else 0 end) from receipts r),0)
        +coalesce((select sum(l.valor) from legacy_paid l),0) as received
  ), enrollments as (
    select m.* from public.matriculas m where m.turma_id=p_turma_id
  )
  select jsonb_build_object('turmaId',t.id,'codigo',t.codigo,'nome',t.nome,'status',t.status,
    'cursoId',c.id,'cursoNome',c.nome,'area',coalesce(c.area,'Outros'),'valor',coalesce(c.valor,0),
    'asaasUrl',c.asaas_payment_link_url,'vagasTotais',t.vagas_totais,
    'alunosTotal',(select count(*) from enrollments),
    'alunosPendentes',(select count(*) from enrollments where status in ('PENDENTE','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')),
    'alunosLiberados',(select count(*) from enrollments where status='ATIVO'),
    'alunosConcluidos',(select count(*) from enrollments where status='CONCLUIDO'),
    'certificadosPendentes',(select count(*) from public.certificados_academicos ca
      join enrollments m on m.id=ca.matricula_id where ca.status='PENDENTE'),
    'certificadosEmitidos',(select count(*) from public.certificados_academicos ca
      join enrollments m on m.id=ca.matricula_id where ca.status='FINALIZADO'),
    'receitaPrevista',f.expected,'receitaConfirmada',f.received,'configuracao',coalesce(c.ead_config,'{}'::jsonb))
  into v_result from public.turmas t join public.cursos c on c.id=t.curso_id cross join financial f
  where t.id=p_turma_id and c.modalidade='EAD';
  if v_result is null then raise exception 'Turma EAD não encontrada'; end if;
  return v_result;
end; $$;
revoke all on function public.ead_get_turma_dashboard(uuid) from public,anon;
grant execute on function public.ead_get_turma_dashboard(uuid) to authenticated,service_role;
commit;
