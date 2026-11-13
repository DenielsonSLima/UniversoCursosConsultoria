begin;

-- Read-only Pix projection within the existing scoped EAD exception.
-- No table grants, RLS policies, banking calls or payment mutations change.
create or replace function public.parceiro_aluno_ead_boletos(p_aluno_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.parceiros p where p.id=p_aluno_id
    and public.is_partner_in_gestor_read_scope(p.polo_id,p.polo_ids)
  ) then raise exception 'Acesso ao aluno não autorizado.' using errcode='42501'; end if;

  with eligible as (
    select r.id,r.cliente_id,r.matricula_id,r.turma_id,r.polo_id,r.descricao,
      r.valor,r.valor_pago,r.data_vencimento,r.data_pagamento,r.status,r.tipo_lancamento,
      capability.can_open_boleto,
      case when capability.can_open_boleto
        and r.data_pagamento is null and coalesce(r.valor_pago,0)=0
        and upper(btrim(r.gateway_status)) in ('PENDING','OPEN','REGISTERED','CREATED','2')
        and nullif(btrim(r.gateway_pix_payload),'') is not null
        and nullif(btrim(r.gateway_pix_encoded_image),'') is not null
        then r.gateway_pix_payload else null end as pix_copy_payload,
      jsonb_build_object('id',m.id,'status',m.status,'data_matricula',m.data_matricula) as matriculas,
      jsonb_build_object('nome',t.nome,'codigo',t.codigo,
        'cursos',jsonb_build_object('id',c.id,'nome',c.nome,'modalidade',c.modalidade),
        'polos',jsonb_build_object('nome',polo.nome)) as turmas
    from public.contas_receber r
    join public.matriculas m on m.id=r.matricula_id
    join public.turmas t on t.id=m.turma_id
    join public.cursos c on c.id=t.curso_id
    left join public.polos polo on polo.id=t.polo_id
    cross join lateral (
      select (r.gateway_provider='banese_card' and r.gateway_payment_method='BOLETO'
        and r.gateway_environment='production'
        and nullif(r.gateway_boleto_codigo_barras,'') is not null
        and nullif(r.gateway_boleto_linha_digitavel,'') is not null
        and r.gateway_boleto_issued_at is not null
        and r.status in ('PENDENTE','VENCIDO')) as can_open_boleto
    ) capability
    where r.cliente_id=p_aluno_id and public.parceiro_aluno_ead_boleto_can_read(r.id)
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(e) order by e.data_vencimento desc,e.id) from eligible e),'[]'::jsonb),
    'summary',jsonb_build_object(
      'paid',coalesce((select sum(coalesce(nullif(valor_pago,0),valor,0)) from eligible where status='PAGO'),0),
      'open',coalesce((select sum(coalesce(valor,0)) from eligible where status in ('PENDENTE','VENCIDO')),0),
      'suspended',coalesce((select sum(coalesce(valor,0)) from eligible where status='SUSPENSO'),0)
    )) into v_result;
  return v_result;
end; $$;
revoke all on function public.parceiro_aluno_ead_boletos(uuid) from public,anon;
grant execute on function public.parceiro_aluno_ead_boletos(uuid) to authenticated;

commit;
