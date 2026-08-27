-- Fonte canônica para distinguir cadastro de aluno, matrícula ativa e aluno
-- distinto com matrícula ativa. O frontend apenas apresenta estes valores.

begin;

create or replace function public.get_student_status_kpis_secure(
  p_polo_id uuid default null,
  p_include_global boolean default false,
  p_consumer text default null
)
returns table (
  total_parceiros bigint,
  total_parceiros_ativos bigint,
  cadastros_alunos_total bigint,
  cadastros_alunos_ativos bigint,
  cadastros_alunos_inativos bigint,
  total_professores bigint,
  total_professores_ativos bigint,
  total_professores_inativos bigint,
  matriculas_ativas bigint,
  alunos_com_matricula_ativa bigint,
  parcelas_em_atraso bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_consumer text := upper(trim(coalesce(p_consumer, '')));
  v_can_partner_metrics boolean := false;
  v_can_finance_metrics boolean := false;
begin
  if not v_service_role and auth.uid() is null then
    raise exception 'Autenticação obrigatória para consultar indicadores.'
      using errcode = '42501';
  end if;

  if v_consumer not in ('PARCEIROS', 'FINANCEIRO') then
    raise exception 'Consumidor de indicadores inválido.'
      using errcode = '42501';
  end if;

  v_can_partner_metrics := v_consumer = 'PARCEIROS' and (
    v_service_role or public.gestor_has_module('parceiros')
  );
  v_can_finance_metrics := v_consumer = 'FINANCEIRO' and (
    v_service_role or (
      public.gestor_has_module('financeiro')
      and public.gestor_has_financeiro_tab('resumo')
    )
  );

  if not (v_can_partner_metrics or v_can_finance_metrics) then
    raise exception 'Acesso aos indicadores solicitado não autorizado.'
      using errcode = '42501';
  end if;

  if not v_service_role and (
    (p_polo_id is null and not public.gestor_has_all_polos())
    or (
      p_polo_id is not null
      and not public.is_gestor_for_polo(p_polo_id)
    )
  ) then
    raise exception 'Polo fora do escopo autorizado.'
      using errcode = '42501';
  end if;

  if coalesce(p_include_global, false)
    and not v_service_role
    and (
      v_consumer <> 'PARCEIROS'
      or not public.gestor_has_all_polos()
    )
  then
    raise exception 'Registros globais exigem acesso a todos os polos.'
      using errcode = '42501';
  end if;

  return query
  with partner_scope as (
    select partner.id, partner.tipo, partner.status
    from public.parceiros partner
    where p_polo_id is null
      or partner.polo_id = p_polo_id
      or p_polo_id = any(coalesce(partner.polo_ids, array[]::uuid[]))
      or (
        coalesce(p_include_global, false)
        and partner.polo_id is null
        and partner.tipo <> 'Aluno'
      )
  ),
  enrollment_scope as (
    select enrollment.aluno_id, enrollment.status
    from public.matriculas enrollment
    join public.turmas class on class.id = enrollment.turma_id
    join public.parceiros student
      on student.id = enrollment.aluno_id
     and student.tipo = 'Aluno'
    where p_polo_id is null or class.polo_id = p_polo_id
  )
  select
    case when v_can_partner_metrics then
      (select count(*) from partner_scope)
    end::bigint,
    case when v_can_partner_metrics then
      (select count(*) from partner_scope where status = 'ATIVO')
    end::bigint,
    case when v_can_partner_metrics then
      (select count(*) from partner_scope where tipo = 'Aluno')
    end::bigint,
    case when v_can_partner_metrics then
      (select count(*) from partner_scope where tipo = 'Aluno' and status = 'ATIVO')
    end::bigint,
    case when v_can_partner_metrics then
      (
        select count(*)
        from partner_scope
        where tipo = 'Aluno'
          and status is distinct from 'ATIVO'
      )
    end::bigint,
    case when v_can_partner_metrics then
      (select count(*) from partner_scope where tipo = 'Professor')
    end::bigint,
    case when v_can_partner_metrics then
      (select count(*) from partner_scope where tipo = 'Professor' and status = 'ATIVO')
    end::bigint,
    case when v_can_partner_metrics then
      (
        select count(*)
        from partner_scope
        where tipo = 'Professor'
          and status is distinct from 'ATIVO'
      )
    end::bigint,
    case when v_can_finance_metrics then
      (select count(*) from enrollment_scope where status = 'ATIVO')
    end::bigint,
    case when v_can_finance_metrics then
      (
        select count(distinct aluno_id)
        from enrollment_scope
        where status = 'ATIVO'
      )
    end::bigint,
    case when v_can_finance_metrics then
      (
        select count(*)
        from public.contas_receber receivable
        where receivable.data_pagamento is null
          and (
            receivable.status = 'VENCIDO'
            or (
              receivable.status = 'PENDENTE'
              and receivable.data_vencimento
                < (timezone('America/Maceio', now()))::date
            )
          )
          and (p_polo_id is null or receivable.polo_id = p_polo_id)
      )
    end::bigint;
end;
$$;

revoke all on function public.get_student_status_kpis_secure(uuid, boolean, text)
  from public, anon;
grant execute on function public.get_student_status_kpis_secure(uuid, boolean, text)
  to authenticated, service_role;

comment on function public.get_student_status_kpis_secure(uuid, boolean, text) is
  'KPIs canônicos com autorização campo a campo por consumidor: PARCEIROS ou FINANCEIRO. PENDENTE nunca é somado a ATIVO.';

commit;
