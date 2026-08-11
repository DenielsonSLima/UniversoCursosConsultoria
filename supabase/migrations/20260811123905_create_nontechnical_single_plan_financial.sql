begin;

-- Cursos livres e especializações usam um plano único por turma. Este
-- contrato não compartilha matrícula/rematrícula nem geradores técnicos.
create table if not exists public.turmas_plano_financeiro_unico (
  turma_id uuid primary key references public.turmas(id) on delete cascade,
  modalidade text not null check (modalidade in ('LIVRE', 'ESPECIALIZACAO')),
  valor_total numeric(14, 2) not null check (valor_total > 0),
  qtd_parcelas integer not null check (qtd_parcelas between 1 and 60),
  primeiro_vencimento date not null,
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  desconto_pontualidade numeric(14, 2) not null default 0 check (desconto_pontualidade >= 0),
  juros_atraso_percentual numeric(8, 4) not null default 0 check (juros_atraso_percentual >= 0),
  multa_atraso numeric(14, 2) not null default 0 check (multa_atraso >= 0),
  revisao integer not null default 1 check (revisao > 0),
  fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists turmas_plano_financeiro_unico_modalidade_idx
  on public.turmas_plano_financeiro_unico(modalidade, created_at desc);

create table if not exists public.matriculas_plano_financeiro_unico (
  matricula_id uuid primary key,
  turma_id uuid not null references public.turmas(id) on delete cascade,
  aluno_id uuid not null references public.parceiros(id) on delete restrict,
  constraint matriculas_plano_financeiro_unico_matricula_turma_aluno_fkey
    foreign key (matricula_id, turma_id, aluno_id)
    references public.matriculas(id, turma_id, aluno_id)
    on delete cascade,
  plano_turma_revisao integer not null check (plano_turma_revisao > 0),
  plano_turma_fingerprint text not null,
  regra_snapshot jsonb not null check (jsonb_typeof(regra_snapshot) = 'object'),
  valor_total numeric(14, 2) not null check (valor_total > 0),
  qtd_parcelas integer not null check (qtd_parcelas between 1 and 60),
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists matriculas_plano_financeiro_unico_turma_idx
  on public.matriculas_plano_financeiro_unico(turma_id, created_at desc);
create index if not exists matriculas_plano_financeiro_unico_aluno_idx
  on public.matriculas_plano_financeiro_unico(aluno_id, created_at desc);

create table if not exists internal_academic.nontechnical_financial_requests (
  request_id uuid primary key,
  operation text not null,
  actor_id uuid references auth.users(id) on delete set null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.contas_receber
  add column if not exists regra_financeira_plano_unico_snapshot jsonb;

alter table public.contas_receber
  drop constraint if exists contas_receber_regra_financeira_plano_unico_snapshot_check,
  add constraint contas_receber_regra_financeira_plano_unico_snapshot_check
    check (
      regra_financeira_plano_unico_snapshot is null
      or jsonb_typeof(regra_financeira_plano_unico_snapshot) = 'object'
    );

comment on table public.turmas_plano_financeiro_unico is
  'Plano financeiro exclusivo e imutável de cada turma LIVRE ou ESPECIALIZACAO. Não usa matrícula/rematrícula.';
comment on table public.matriculas_plano_financeiro_unico is
  'Snapshot do plano único copiado para a matrícula no instante de gerar as parcelas.';
comment on column public.contas_receber.regra_financeira_plano_unico_snapshot is
  'Política de parcela LIVRE/ESPECIALIZACAO congelada na geração; edição posterior da turma não reprifica títulos.';

alter table public.turmas_plano_financeiro_unico enable row level security;
alter table public.matriculas_plano_financeiro_unico enable row level security;

revoke all on table public.turmas_plano_financeiro_unico
  from public, anon, authenticated;
revoke all on table public.matriculas_plano_financeiro_unico
  from public, anon, authenticated;
revoke all on table internal_academic.nontechnical_financial_requests
  from public, anon, authenticated, service_role;
grant all on table public.turmas_plano_financeiro_unico to service_role;
grant all on table public.matriculas_plano_financeiro_unico to service_role;

-- A policy financeira existente continua atendendo alunos, Caixa e demais
-- perfis. Esta policy permissiva soma somente o escopo de Gestão > Financeiro
-- para eventos vinculados à turma que o gestor já pode operar.
drop policy if exists finance_realtime_events_gestao_financeiro_turma_select
  on public.finance_realtime_events;
create policy finance_realtime_events_gestao_financeiro_turma_select
  on public.finance_realtime_events
  as permissive
  for select
  to authenticated
  using (
    turma_id is not null
    and (select public.can_operate_turma_academics(turma_id))
    and (select public.gestor_has_tab('gestao', 'financeiro'))
  );
comment on policy finance_realtime_events_gestao_financeiro_turma_select
  on public.finance_realtime_events is
  'Permite ao gestor de Gestão > Financeiro receber apenas eventos da turma acadêmica que pode operar, em complemento às permissões financeiras existentes.';

create or replace function internal_academic.validate_nontechnical_single_plan_input(
  p_plan jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_unknown text;
  v_total numeric;
  v_count integer;
  v_first_due_text text;
  v_first_due date;
  v_due_day integer;
  v_discount numeric;
  v_interest numeric;
  v_fine numeric;
  v_total_cents bigint;
  v_min_installment numeric;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'O plano financeiro da turma deve ser informado.' using errcode = '22023';
  end if;

  select key into v_unknown
  from jsonb_object_keys(p_plan) key
  where key not in (
    'valorTotal', 'qtdParcelas', 'primeiroVencimento', 'diaVencimento',
    'descontoPontualidade', 'jurosAtrasoPercentual', 'multaAtraso'
  )
  limit 1;
  if v_unknown is not null then
    raise exception 'Campo financeiro não suportado: %.', v_unknown using errcode = '22023';
  end if;

  if not (
    p_plan ? 'valorTotal'
    and p_plan ? 'qtdParcelas'
    and p_plan ? 'primeiroVencimento'
    and p_plan ? 'diaVencimento'
    and p_plan ? 'descontoPontualidade'
    and p_plan ? 'jurosAtrasoPercentual'
    and p_plan ? 'multaAtraso'
  ) then
    raise exception 'O plano financeiro está incompleto.' using errcode = '22023';
  end if;

  v_first_due_text := p_plan ->> 'primeiroVencimento';
  if v_first_due_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'O primeiro vencimento deve estar no formato AAAA-MM-DD.' using errcode = '22023';
  end if;

  begin
    v_total := round((p_plan ->> 'valorTotal')::numeric, 2);
    v_count := (p_plan ->> 'qtdParcelas')::integer;
    v_first_due := v_first_due_text::date;
    v_due_day := (p_plan ->> 'diaVencimento')::integer;
    v_discount := round((p_plan ->> 'descontoPontualidade')::numeric, 2);
    v_interest := round((p_plan ->> 'jurosAtrasoPercentual')::numeric, 4);
    v_fine := round((p_plan ->> 'multaAtraso')::numeric, 2);
  exception when invalid_text_representation or numeric_value_out_of_range
    or datetime_field_overflow or invalid_datetime_format then
    raise exception 'O plano financeiro contém valor inválido.' using errcode = '22023';
  end;

  if v_total is null
    or v_count is null
    or v_first_due is null
    or not pg_catalog.isfinite(v_first_due)
    or v_due_day is null
    or v_discount is null
    or v_interest is null
    or v_fine is null
    or v_total not between 0.01 and 1000000
    or v_count not between 1 and 60
    or v_due_day not between 1 and 31
    or v_discount < 0
    or v_interest not between 0 and 100
    or v_fine < 0
  then
    raise exception 'Revise o valor total, parcelas, vencimento e encargos do plano.' using errcode = '22023';
  end if;

  v_total_cents := round(v_total * 100)::bigint;
  if v_total_cents < v_count then
    raise exception 'O valor total precisa garantir ao menos R$ 0,01 em cada parcela.' using errcode = '22023';
  end if;
  if v_due_day <> extract(day from v_first_due)::integer then
    raise exception
      'O dia de vencimento deve corresponder ao dia do primeiro vencimento.'
      using errcode = '22023';
  end if;
  v_min_installment := (v_total_cents / v_count)::numeric / 100;
  if v_discount >= v_min_installment and v_discount > 0 then
    raise exception 'O desconto por pontualidade deve ser menor que a menor parcela.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'valorTotal', v_total,
    'qtdParcelas', v_count,
    'primeiroVencimento', v_first_due,
    'diaVencimento', v_due_day,
    'descontoPontualidade', v_discount,
    'jurosAtrasoPercentual', v_interest,
    'multaAtraso', v_fine
  );
end;
$function$;

revoke all on function internal_academic.validate_nontechnical_single_plan_input(jsonb)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.nontechnical_single_plan_fingerprint(
  p_rule jsonb
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_rule::text, 'UTF8'), 'sha256'),
    'hex'
  );
$function$;

revoke all on function internal_academic.nontechnical_single_plan_fingerprint(jsonb)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.build_nontechnical_single_plan_schedule(
  p_rule jsonb,
  p_revision integer,
  p_fingerprint text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_total_cents bigint := round((p_rule ->> 'valorTotal')::numeric * 100)::bigint;
  v_count integer := (p_rule ->> 'qtdParcelas')::integer;
  v_first_due date := (p_rule ->> 'primeiroVencimento')::date;
  v_due_day integer := (p_rule ->> 'diaVencimento')::integer;
  v_base_cents bigint;
  v_remainder bigint;
  v_number integer;
  v_value numeric;
  v_due date;
  v_result jsonb := '[]'::jsonb;
begin
  v_base_cents := v_total_cents / v_count;
  v_remainder := v_total_cents % v_count;

  for v_number in 1..v_count loop
    v_value := (
      v_base_cents + case when v_number <= v_remainder then 1 else 0 end
    )::numeric / 100;
    v_due := case
      when v_number = 1 then v_first_due
      else public.data_vencimento_mensal(v_first_due, v_due_day, v_number - 1)
    end;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'plano-unico-v' || p_revision || '-parc-' || v_number,
      'tipo', 'PARCELA',
      'numero', v_number,
      'label', 'Parcela ' || v_number || '/' || v_count,
      'valor', v_value,
      'dataVencimento', v_due,
      'fingerprint', p_fingerprint
    ));
  end loop;

  return v_result;
end;
$function$;

revoke all on function internal_academic.build_nontechnical_single_plan_schedule(jsonb, integer, text)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.render_nontechnical_single_plan(
  p_plan public.turmas_plano_financeiro_unico
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_rule jsonb;
begin
  v_rule := jsonb_build_object(
    'valorTotal', p_plan.valor_total,
    'qtdParcelas', p_plan.qtd_parcelas,
    'primeiroVencimento', p_plan.primeiro_vencimento,
    'diaVencimento', p_plan.dia_vencimento,
    'descontoPontualidade', p_plan.desconto_pontualidade,
    'jurosAtrasoPercentual', p_plan.juros_atraso_percentual,
    'multaAtraso', p_plan.multa_atraso
  );
  return v_rule || jsonb_build_object(
    'revisao', p_plan.revisao,
    'fingerprint', p_plan.fingerprint,
    'cronograma', internal_academic.build_nontechnical_single_plan_schedule(
      v_rule, p_plan.revisao, p_plan.fingerprint
    )
  );
end;
$function$;

revoke all on function internal_academic.render_nontechnical_single_plan(public.turmas_plano_financeiro_unico)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_manage_nontechnical_single_plan(
  p_turma_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') = 'service_role' then return; end if;
  if not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão financeira para operar esta turma.' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_manage_nontechnical_single_plan(uuid)
  from public, anon, authenticated, service_role;

-- A reserva de vaga pertence ao contrato não técnico. A trava por turma e o
-- bloqueio da linha impedem duas matrículas simultâneas de ultrapassarem a
-- última vaga, sem reutilizar o ciclo de vida técnico.
create or replace function internal_academic.assert_nontechnical_single_plan_enrollment_lifecycle(
  p_turma_id uuid,
  p_aluno_id uuid
)
returns public.turmas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_class public.turmas%rowtype;
  v_capacity integer := 0;
  v_occupancy bigint := 0;
  v_student_already_occupies boolean := false;
begin
  if p_turma_id is null or p_aluno_id is null then
    raise exception 'Turma e aluno são obrigatórios para reservar uma vaga.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'nontechnical-single-plan-capacity:' || p_turma_id::text,
      0
    )
  );

  select class.* into v_class
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id
    and upper(coalesce(course.modalidade, '')) in ('LIVRE', 'ESPECIALIZACAO')
  for update of class;
  if not found then
    raise exception 'Esta turma não utiliza o plano financeiro único.' using errcode = '22023';
  end if;

  if upper(coalesce(v_class.status, '')) not in (
    'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO'
  ) then
    raise exception 'A fase atual da turma não permite novas matrículas.' using errcode = '23514';
  end if;

  if coalesce(v_class.bloquear_matriculas_apos_completar_vagas, true) then
    v_capacity := coalesce(v_class.vagas_totais, 0);
    if v_capacity > 0 then
      select
        pg_catalog.count(distinct enrollment.aluno_id),
        coalesce(
          pg_catalog.bool_or(enrollment.aluno_id = p_aluno_id),
          false
        )
      into v_occupancy, v_student_already_occupies
      from public.matriculas enrollment
      where enrollment.turma_id = p_turma_id
        and upper(coalesce(enrollment.status, '')) in (
          'ATIVO',
          'CONCLUIDO',
          'PENDENTE',
          'AGUARDANDO_PAGAMENTO',
          'AGUARDANDO_CONFIRMACAO'
        );

      if not v_student_already_occupies and v_occupancy >= v_capacity then
        raise exception 'Turma sem vagas disponíveis para nova matrícula.'
          using
            errcode = 'P0001',
            detail = pg_catalog.format(
              'Turma %s: capacidade %s, ocupação %s.',
              p_turma_id,
              v_capacity,
              v_occupancy
            );
      end if;
    end if;
  end if;

  return v_class;
end;
$function$;

revoke all on function internal_academic.assert_nontechnical_single_plan_enrollment_lifecycle(
  uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function internal_academic.protect_nontechnical_single_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if row(
    new.modalidade, new.valor_total, new.qtd_parcelas, new.primeiro_vencimento,
    new.dia_vencimento, new.desconto_pontualidade, new.juros_atraso_percentual,
    new.multa_atraso, new.revisao, new.fingerprint
  ) is distinct from row(
    old.modalidade, old.valor_total, old.qtd_parcelas, old.primeiro_vencimento,
    old.dia_vencimento, old.desconto_pontualidade, old.juros_atraso_percentual,
    old.multa_atraso, old.revisao, old.fingerprint
  ) then
    raise exception 'O plano financeiro da turma é imutável depois de aberto.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.protect_nontechnical_single_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_nontechnical_single_plan on public.turmas_plano_financeiro_unico;
create trigger protect_nontechnical_single_plan
before update on public.turmas_plano_financeiro_unico
for each row execute function internal_academic.protect_nontechnical_single_plan();

-- A tabela de plano é a autoridade; os campos legados da turma são apenas
-- espelhos para os adaptadores existentes de boleto. Não podem ser usados
-- para alterar uma regra que já tenha sido congelada.
create or replace function internal_academic.protect_nontechnical_single_plan_turma_mirrors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.turmas_plano_financeiro_unico plan
    where plan.turma_id = old.id
  ) then
    return new;
  end if;

  if new.curso_id is distinct from old.curso_id
    or new.polo_id is distinct from old.polo_id
    or new.permitir_inscricoes_online is distinct from old.permitir_inscricoes_online
    or new.exige_matricula is distinct from old.exige_matricula
    or new.cobrar_matricula is distinct from old.cobrar_matricula
    or new.valor_matricula is distinct from old.valor_matricula
    or new.cobrar_rematricula is distinct from old.cobrar_rematricula
    or new.valor_rematricula is distinct from old.valor_rematricula
    or new.qtd_parcelas is distinct from old.qtd_parcelas
    or new.valor_parcela is distinct from old.valor_parcela
    or new.desconto_pontualidade is distinct from old.desconto_pontualidade
    or new.juros_atraso is distinct from old.juros_atraso
    or new.multa_atraso is distinct from old.multa_atraso
    or new.multa_atraso_percentual is distinct from old.multa_atraso_percentual
    or new.dia_vencimento_padrao is distinct from old.dia_vencimento_padrao
    or new.primeiro_vencimento_padrao is distinct from old.primeiro_vencimento_padrao
    or new.instrucao_boleto_carne is distinct from old.instrucao_boleto_carne
    or new.cronograma_financeiro is distinct from old.cronograma_financeiro
    or new.origem_financeira is distinct from old.origem_financeira
    or new.financeiro_herdado is distinct from old.financeiro_herdado
    or new.gerar_cobrancas_futuras is distinct from old.gerar_cobrancas_futuras
    or new.sincronizar_asaas_futuro is distinct from old.sincronizar_asaas_futuro
    or new.obs_financeira_origem is distinct from old.obs_financeira_origem
  then
    raise exception
      'A regra financeira desta turma está congelada no plano único. Crie uma nova turma para usar outra condição.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.protect_nontechnical_single_plan_turma_mirrors()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_nontechnical_single_plan_turma_mirrors
  on public.turmas;
create trigger protect_nontechnical_single_plan_turma_mirrors
before update on public.turmas
for each row execute function internal_academic.protect_nontechnical_single_plan_turma_mirrors();

-- Trocar a modalidade do curso poderia fazer uma turma de plano único cair
-- em triggers técnicos numa atualização futura. Essa modalidade fica
-- imutável enquanto houver turma vinculada ao plano.
create or replace function internal_academic.protect_nontechnical_single_plan_course_modality()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.modalidade is distinct from old.modalidade
    and exists (
      select 1
      from public.turmas class
      join public.turmas_plano_financeiro_unico plan on plan.turma_id = class.id
      where class.curso_id = old.id
    )
  then
    raise exception
      'A modalidade deste curso não pode ser alterada enquanto existir turma com plano financeiro único.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.protect_nontechnical_single_plan_course_modality()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_nontechnical_single_plan_course_modality
  on public.cursos;
create trigger protect_nontechnical_single_plan_course_modality
before update of modalidade on public.cursos
for each row execute function internal_academic.protect_nontechnical_single_plan_course_modality();

create or replace function internal_academic.guard_nontechnical_single_plan_receivable_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_single_plan_title boolean := false;
begin
  if tg_op = 'DELETE' then
    select exists (
      select 1
      from public.turmas_plano_financeiro_unico plan
      left join public.matriculas_plano_financeiro_unico snapshot
        on snapshot.matricula_id = old.matricula_id
      where plan.turma_id = old.turma_id
        or snapshot.matricula_id is not null
        or old.regra_financeira_plano_unico_snapshot is not null
    ) into v_is_single_plan_title;
    if v_is_single_plan_title then
      raise exception 'As parcelas do plano único não podem ser excluídas fora de um cancelamento financeiro auditado.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.turmas_plano_financeiro_unico plan
      where plan.turma_id = new.turma_id
    ) or exists (
      select 1
      from public.matriculas_plano_financeiro_unico snapshot
      where snapshot.matricula_id = new.matricula_id
    ) or new.regra_financeira_plano_unico_snapshot is not null
    into v_is_single_plan_title;
  else
    select exists (
      select 1
      from public.turmas_plano_financeiro_unico plan
      where plan.turma_id = new.turma_id or plan.turma_id = old.turma_id
    ) or exists (
      select 1
      from public.matriculas_plano_financeiro_unico snapshot
      where snapshot.matricula_id = new.matricula_id
         or snapshot.matricula_id = old.matricula_id
    ) or old.regra_financeira_plano_unico_snapshot is not null
      or new.regra_financeira_plano_unico_snapshot is not null
    into v_is_single_plan_title;
  end if;

  if not v_is_single_plan_title then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(pg_catalog.current_setting('app.nontechnical_single_plan_titles', true), '') is null then
      raise exception 'A parcela do plano único deve ser criada pelo fluxo financeiro oficial.'
        using errcode = '23514';
    end if;
    if new.matricula_id is null
      or new.turma_id is null
      or new.regra_financeira_plano_unico_snapshot is null
      or upper(coalesce(new.tipo_lancamento, '')) <> 'PARCELA'
      or upper(coalesce(new.forma_pagamento, '')) <> 'BOLETO'
      or coalesce(new.origem_cronograma_id, '') not like 'plano-unico-v%'
    then
      raise exception 'A parcela do plano único exige matrícula, cronograma, boleto e snapshot financeiro.'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.matriculas_plano_financeiro_unico snapshot
      cross join lateral jsonb_array_elements(snapshot.regra_snapshot -> 'cronograma') as schedule(item)
      where snapshot.matricula_id = new.matricula_id
        and snapshot.turma_id = new.turma_id
        and snapshot.aluno_id = new.cliente_id
        and new.origem_cronograma_id = schedule.item ->> 'id'
        and new.parcela_numero = (schedule.item ->> 'numero')::integer
        and new.valor = (schedule.item ->> 'valor')::numeric
        and new.data_vencimento = (schedule.item ->> 'dataVencimento')::date
        and new.regra_financeira_plano_unico_snapshot ->> 'fingerprint'
          = snapshot.regra_snapshot ->> 'fingerprint'
        and new.regra_financeira_plano_unico_snapshot ->> 'revisao'
          = snapshot.regra_snapshot ->> 'revisao'
    ) then
      raise exception 'A parcela não corresponde ao cronograma congelado da matrícula.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin', 'service_role')
  ) then
    raise exception
      'A baixa, o estorno e a atualização da parcela do plano único devem usar o processo financeiro autorizado.'
      using errcode = '23514';
  end if;

  if new.regra_financeira_plano_unico_snapshot is distinct from old.regra_financeira_plano_unico_snapshot
    or new.valor is distinct from old.valor
    or new.data_vencimento is distinct from old.data_vencimento
    or new.cliente_id is distinct from old.cliente_id
    or new.matricula_id is distinct from old.matricula_id
    or new.turma_id is distinct from old.turma_id
    or new.tipo_lancamento is distinct from old.tipo_lancamento
    or new.parcela_numero is distinct from old.parcela_numero
    or new.origem_cronograma_id is distinct from old.origem_cronograma_id
    or (
      new.forma_pagamento is distinct from old.forma_pagamento
      and not (
        upper(coalesce(old.forma_pagamento, '')) = 'BOLETO'
        and upper(coalesce(new.forma_pagamento, '')) in (
          'PIX', 'CARTAO', 'DINHEIRO', 'TED'
        )
        and upper(coalesce(new.status, '')) = 'PAGO'
      )
    )
  then
    raise exception 'O plano, cronograma e valor da parcela gerada são imutáveis.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_nontechnical_single_plan_receivable_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_nontechnical_single_plan_receivable_snapshot on public.contas_receber;
create trigger guard_nontechnical_single_plan_receivable_snapshot
before insert or update or delete
on public.contas_receber
for each row execute function internal_academic.guard_nontechnical_single_plan_receivable_snapshot();

-- Nenhum outro fluxo acadêmico pode inserir uma matrícula em turma de plano
-- único sem passar pelo RPC financeiro que cria o snapshot e as parcelas.
create or replace function internal_academic.guard_nontechnical_single_plan_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.turmas_plano_financeiro_unico plan
      where plan.turma_id = old.turma_id
    ) then
      raise exception 'A matrícula com plano financeiro único não pode ser excluída fora de um cancelamento financeiro auditado.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.turma_id is not distinct from old.turma_id then
    if exists (
      select 1
      from public.turmas_plano_financeiro_unico plan
      where plan.turma_id = old.turma_id
    ) and (
      new.aluno_id is distinct from old.aluno_id
      or new.status is distinct from old.status
      or new.financeiro_herdado is distinct from old.financeiro_herdado
      or new.gerar_cobranca_inicial is distinct from old.gerar_cobranca_inicial
      or new.gerar_cobranca_futura is distinct from old.gerar_cobranca_futura
      or new.sincronizar_asaas is distinct from old.sincronizar_asaas
      or new.qtd_parcelas_individual is distinct from old.qtd_parcelas_individual
      or new.valor_parcela_individual is distinct from old.valor_parcela_individual
      or new.dia_vencimento_individual is distinct from old.dia_vencimento_individual
      or new.cobrar_matricula_individual is distinct from old.cobrar_matricula_individual
      or new.cobrar_rematricula_individual is distinct from old.cobrar_rematricula_individual
      or new.desconto_pontualidade_individual is distinct from old.desconto_pontualidade_individual
      or new.juros_atraso_individual is distinct from old.juros_atraso_individual
      or new.multa_atraso_individual is distinct from old.multa_atraso_individual
      or new.multa_atraso_percentual_individual is distinct from old.multa_atraso_percentual_individual
      or new.aplicar_desconto_matricula_individual is distinct from old.aplicar_desconto_matricula_individual
      or new.aplicar_multa_juros_matricula_individual is distinct from old.aplicar_multa_juros_matricula_individual
      or new.aplicar_desconto_mensalidade_individual is distinct from old.aplicar_desconto_mensalidade_individual
      or new.aplicar_multa_juros_mensalidade_individual is distinct from old.aplicar_multa_juros_mensalidade_individual
      or new.aplicar_desconto_rematricula_individual is distinct from old.aplicar_desconto_rematricula_individual
      or new.aplicar_multa_juros_rematricula_individual is distinct from old.aplicar_multa_juros_rematricula_individual
      or new.instrucao_boleto_carne_individual is distinct from old.instrucao_boleto_carne_individual
    ) and coalesce((select auth.role()), '') <> 'service_role'
      and nullif(
        pg_catalog.current_setting('app.nontechnical_single_plan_enrollment', true),
        ''
      ) is null
    then
      raise exception
        'A ativação e as condições financeiras desta matrícula dependem da confirmação do boleto do plano único.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
    from public.turmas_plano_financeiro_unico plan
    where plan.turma_id = new.turma_id or plan.turma_id = old.turma_id
  ) then
    raise exception 'A matrícula do plano financeiro único não pode ser transferida fora de um fluxo financeiro auditado.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.turmas_plano_financeiro_unico plan
    where plan.turma_id = new.turma_id
  ) and nullif(
    pg_catalog.current_setting('app.nontechnical_single_plan_enrollment', true),
    ''
  ) is null then
    raise exception
      'Esta turma usa plano financeiro único. A matrícula deve gerar o snapshot e todas as parcelas.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function internal_academic.guard_nontechnical_single_plan_enrollment()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_nontechnical_single_plan_enrollment on public.matriculas;
create trigger guard_nontechnical_single_plan_enrollment
before insert or update or delete on public.matriculas
for each row execute function internal_academic.guard_nontechnical_single_plan_enrollment();

create or replace function internal_academic.protect_nontechnical_single_plan_enrollment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'O snapshot financeiro da matrícula é imutável.' using errcode = '23514';
end;
$function$;

revoke all on function internal_academic.protect_nontechnical_single_plan_enrollment_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_nontechnical_single_plan_enrollment_snapshot
  on public.matriculas_plano_financeiro_unico;
create trigger protect_nontechnical_single_plan_enrollment_snapshot
before update or delete on public.matriculas_plano_financeiro_unico
for each row execute function internal_academic.protect_nontechnical_single_plan_enrollment_snapshot();

create or replace function internal_academic.upsert_nontechnical_single_plan_enrollment(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid default null
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula public.matriculas%rowtype;
  v_created boolean := false;
begin
  insert into public.matriculas as enrollment(
    aluno_id, turma_id, status, financeiro_herdado,
    gerar_cobranca_inicial, gerar_cobranca_futura, sincronizar_asaas
  )
  values (p_aluno_id, p_turma_id, 'PENDENTE', false, false, true, true)
  on conflict (aluno_id, turma_id) do nothing
  returning * into v_matricula;
  v_created := found;

  if not v_created then
    select * into v_matricula
    from public.matriculas enrollment
    where enrollment.aluno_id = p_aluno_id
      and enrollment.turma_id = p_turma_id
    for update;

    if not found then
      raise exception 'A matrícula existente não pôde ser confirmada.' using errcode = '40001';
    end if;
    if upper(coalesce(v_matricula.status, '')) not in ('PENDENTE', 'ATIVO', 'CONCLUIDO') then
      raise exception
        'Esta matrícula já foi encerrada ou movimentada e não pode ser reaberta pelo plano financeiro.'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.matriculas_plano_financeiro_unico snapshot
      where snapshot.matricula_id = v_matricula.id
    ) then
      raise exception
        'Já existe uma matrícula nesta turma sem snapshot financeiro do plano único.'
        using errcode = '23514';
    end if;
  end if;

  if v_created and not exists (
    select 1
    from public.matricula_movimentacoes movement
    where movement.matricula_id = v_matricula.id
      and movement.tipo = 'MATRICULA'
  ) then
    insert into public.matricula_movimentacoes(
      matricula_id, aluno_id, tipo, status_anterior, status_novo,
      turma_destino_id, motivo, responsavel_id
    ) values (
      v_matricula.id, v_matricula.aluno_id, 'MATRICULA', null,
      v_matricula.status, v_matricula.turma_id,
      'Matrícula acadêmica pendente de confirmação do primeiro boleto do plano único.',
      p_responsavel_id
    );
  end if;

  return v_matricula;
end;
$function$;

revoke all on function internal_academic.upsert_nontechnical_single_plan_enrollment(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function public.criar_turma_plano_financeiro_unico_secure(
  p_request_id uuid,
  p_turma jsonb,
  p_plano jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_polo_id uuid;
  v_curso_id uuid;
  v_modalidade text;
  v_start_date date;
  v_end_date date;
  v_status text;
  v_rule jsonb;
  v_fingerprint text;
  v_schedule jsonb;
  v_payload_hash text;
  v_existing record;
  v_turma public.turmas%rowtype;
  v_plan public.turmas_plano_financeiro_unico%rowtype;
  v_response jsonb;
begin
  if p_request_id is null or p_turma is null or jsonb_typeof(p_turma) <> 'object' then
    raise exception 'Dados obrigatórios da turma não informados.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_turma ->> 'codigo', '')), '') is null
    or nullif(pg_catalog.btrim(coalesce(p_turma ->> 'nome', '')), '') is null
  then
    raise exception 'Código e nome da turma são obrigatórios.' using errcode = '22023';
  end if;

  begin
    v_polo_id := (p_turma ->> 'polo_id')::uuid;
    v_curso_id := (p_turma ->> 'curso_id')::uuid;
    v_start_date := nullif(p_turma ->> 'data_inicio', '')::date;
    v_end_date := nullif(p_turma ->> 'data_previsao_termino', '')::date;
  exception when invalid_text_representation or datetime_field_overflow
    or invalid_datetime_format then
    raise exception 'Dados da turma inválidos.' using errcode = '22023';
  end;
  if v_polo_id is null or v_curso_id is null or v_start_date is null or v_end_date is null then
    raise exception 'Curso, polo, início e término da turma são obrigatórios.' using errcode = '22023';
  end if;
  if v_end_date < v_start_date then
    raise exception 'O término da turma não pode anteceder o início.' using errcode = '22023';
  end if;

  v_rule := internal_academic.validate_nontechnical_single_plan_input(p_plano);
  v_fingerprint := internal_academic.nontechnical_single_plan_fingerprint(v_rule);
  v_schedule := internal_academic.build_nontechnical_single_plan_schedule(v_rule, 1, v_fingerprint);
  v_status := upper(coalesce(nullif(pg_catalog.btrim(p_turma ->> 'status'), ''), 'EM_ANDAMENTO'));
  if v_status not in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO', 'FINALIZADA') then
    raise exception 'Status de turma inválido.' using errcode = '22023';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.gestor_has_module('gestao')
    and public.gestor_has_tab('gestao', 'financeiro')
    and public.is_gestor_for_polo(v_polo_id)
  ) then
    raise exception 'Sem permissão para criar turma com plano financeiro.' using errcode = '42501';
  end if;

  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.cursos course
  where course.id = v_curso_id;
  if v_modalidade not in ('LIVRE', 'ESPECIALIZACAO') then
    raise exception 'O plano único é exclusivo de Cursos Livres e Especializações.' using errcode = '22023';
  end if;

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('turma', p_turma, 'plano', v_rule)::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'create-nontechnical-single-plan-class:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.nontechnical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'CRIAR_TURMA_PLANO_UNICO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  insert into public.turmas(
    codigo, nome, curso_id, polo_id, data_inicio, data_previsao_termino,
    data_inicio_inscricao, data_fim_inscricao, publicar_no_site,
    permitir_inscricoes_online, exige_matricula, aceita_concomitante,
    aceita_subsequente, serie_minima_ensino_medio, qtd_vagas_minima,
    frequencia_minima_percent, media_minima, bloquear_matriculas_apos_completar_vagas,
    turno, status, vagas_totais, cobrar_matricula, valor_matricula,
    cobrar_rematricula, valor_rematricula, qtd_parcelas, valor_parcela,
    desconto_pontualidade, juros_atraso, multa_atraso, dia_vencimento_padrao,
    primeiro_vencimento_padrao, instrucao_boleto_carne, cronograma_financeiro,
    origem_financeira, financeiro_herdado, gerar_cobrancas_futuras,
    sincronizar_asaas_futuro, obs_financeira_origem
  ) values (
    pg_catalog.btrim(p_turma ->> 'codigo'), pg_catalog.btrim(p_turma ->> 'nome'),
    v_curso_id, v_polo_id, v_start_date, v_end_date,
    nullif(p_turma ->> 'data_inicio_inscricao', '')::date,
    nullif(p_turma ->> 'data_fim_inscricao', '')::date,
    coalesce((p_turma ->> 'publicar_no_site')::boolean, false),
    false,
    false, false, true,
    coalesce((p_turma ->> 'serie_minima_ensino_medio')::integer, 2),
    coalesce((p_turma ->> 'qtd_vagas_minima')::integer, 0),
    coalesce((p_turma ->> 'frequencia_minima_percent')::numeric, 75),
    coalesce((p_turma ->> 'media_minima')::numeric, 6),
    coalesce((p_turma ->> 'bloquear_matriculas_apos_completar_vagas')::boolean, true),
    p_turma ->> 'turno', v_status,
    coalesce((p_turma ->> 'vagas_totais')::integer, 40),
    false, 0, false, 0,
    (v_rule ->> 'qtdParcelas')::integer,
    (v_schedule -> 0 ->> 'valor')::numeric,
    (v_rule ->> 'descontoPontualidade')::numeric,
    (v_rule ->> 'jurosAtrasoPercentual')::numeric,
    (v_rule ->> 'multaAtraso')::numeric,
    (v_rule ->> 'diaVencimento')::integer,
    (v_rule ->> 'primeiroVencimento')::date,
    'Parcelas do curso conforme o plano financeiro desta turma.',
    v_schedule,
    'NORMAL', false, true, true,
    'Plano único por turma; não utiliza matrícula ou rematrícula.'
  ) returning * into v_turma;

  insert into public.turmas_plano_financeiro_unico(
    turma_id, modalidade, valor_total, qtd_parcelas, primeiro_vencimento,
    dia_vencimento, desconto_pontualidade, juros_atraso_percentual,
    multa_atraso, revisao, fingerprint, created_by
  ) values (
    v_turma.id, v_modalidade, (v_rule ->> 'valorTotal')::numeric,
    (v_rule ->> 'qtdParcelas')::integer, (v_rule ->> 'primeiroVencimento')::date,
    (v_rule ->> 'diaVencimento')::integer,
    (v_rule ->> 'descontoPontualidade')::numeric,
    (v_rule ->> 'jurosAtrasoPercentual')::numeric,
    (v_rule ->> 'multaAtraso')::numeric, 1, v_fingerprint, auth.uid()
  ) returning * into v_plan;

  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    v_turma.id, null, 'PLANO_UNICO_TURMA_CRIADO',
    internal_academic.render_nontechnical_single_plan(v_plan),
    'Plano financeiro de Curso Livre/Especialização criado sem matrícula ou rematrícula.'
  );

  v_response := jsonb_build_object(
    'operacao', 'CRIAR_TURMA_PLANO_UNICO',
    'requestId', p_request_id,
    'replayed', false,
    'turma', to_jsonb(v_turma),
    'plano', internal_academic.render_nontechnical_single_plan(v_plan)
  );
  insert into internal_academic.nontechnical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'CRIAR_TURMA_PLANO_UNICO', auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

revoke all on function public.criar_turma_plano_financeiro_unico_secure(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.criar_turma_plano_financeiro_unico_secure(uuid, jsonb, jsonb)
  to authenticated, service_role;

create or replace function public.obter_plano_financeiro_unico_turma_secure(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan public.turmas_plano_financeiro_unico%rowtype;
  v_students integer := 0;
  v_installments integer := 0;
  v_total_lancado numeric := 0;
  v_total_recebido numeric := 0;
  v_total_em_aberto numeric := 0;
begin
  if p_turma_id is null then
    raise exception 'Turma obrigatória.' using errcode = '22023';
  end if;
  perform internal_academic.assert_can_manage_nontechnical_single_plan(p_turma_id);

  select * into v_plan
  from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id;
  if not found then
    return jsonb_build_object(
      'turmaId', p_turma_id,
      'configurado', false,
      'motivo', 'PLANO_AUSENTE'
    );
  end if;

  select count(*)::integer into v_students
  from public.matriculas_plano_financeiro_unico snapshot
  where snapshot.turma_id = p_turma_id;
  select
    count(*)::integer,
    coalesce(sum(title.valor), 0),
    coalesce(
      sum(coalesce(title.valor_pago, title.valor))
        filter (where upper(coalesce(title.status, '')) = 'PAGO'),
      0
    ),
    coalesce(
      sum(title.valor)
        filter (where upper(coalesce(title.status, '')) <> 'PAGO'),
      0
    )
  into v_installments, v_total_lancado, v_total_recebido, v_total_em_aberto
  from public.contas_receber title
  where title.turma_id = p_turma_id
    and title.regra_financeira_plano_unico_snapshot is not null;

  return jsonb_build_object(
    'turmaId', p_turma_id,
    'configurado', true,
    'regra', internal_academic.render_nontechnical_single_plan(v_plan),
    'resumo', jsonb_build_object(
      'alunosComPlano', v_students,
      'parcelasGeradas', v_installments,
      'totalLancado', v_total_lancado,
      'totalRecebido', v_total_recebido,
      'emAberto', v_total_em_aberto
    )
  );
end;
$function$;

revoke all on function public.obter_plano_financeiro_unico_turma_secure(uuid)
  from public, anon;
grant execute on function public.obter_plano_financeiro_unico_turma_secure(uuid)
  to authenticated, service_role;

create or replace function public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(
  p_request_id uuid,
  p_turma_id uuid,
  p_aluno_id uuid,
  p_expected_revisao integer,
  p_expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.turmas_plano_financeiro_unico%rowtype;
  v_class public.turmas%rowtype;
  v_rule jsonb;
  v_snapshot jsonb;
  v_payload_hash text;
  v_existing record;
  v_enrollment public.matriculas%rowtype;
  v_generated integer := 0;
  v_total_generated integer := 0;
  v_titles jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  if p_request_id is null or p_turma_id is null or p_aluno_id is null then
    raise exception 'Turma, aluno e requestId são obrigatórios.' using errcode = '22023';
  end if;
  if p_expected_revisao is null
    or nullif(pg_catalog.btrim(coalesce(p_expected_fingerprint, '')), '') is null
  then
    raise exception 'A identidade do plano financeiro é obrigatória.' using errcode = '22023';
  end if;
  perform internal_academic.assert_can_manage_nontechnical_single_plan(p_turma_id);

  -- O requestId é verificado logo após a autorização. Assim uma repetição da
  -- mesma intenção concluída continua canônica mesmo se a turma for encerrada
  -- ou lotada posteriormente.
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'alunoId', p_aluno_id,
      'revisao', p_expected_revisao,
      'fingerprint', p_expected_fingerprint
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'nontechnical-single-plan-request:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.nontechnical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'MATRICULAR_E_GERAR_PARCELAS_PLANO_UNICO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  select class.* into v_class
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id
    and upper(coalesce(course.modalidade, '')) in ('LIVRE', 'ESPECIALIZACAO');
  if not found then
    raise exception 'Esta turma não utiliza o plano financeiro único.' using errcode = '22023';
  end if;

  select * into v_plan
  from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id
  for update;
  if not found then
    raise exception 'Configure o plano financeiro desta turma antes de matricular alunos.' using errcode = '22023';
  end if;
  if p_expected_revisao <> v_plan.revisao
    or p_expected_fingerprint <> v_plan.fingerprint
  then
    raise exception 'O plano financeiro foi alterado. Recarregue e confirme novamente.' using errcode = '40001';
  end if;

  if not exists (
    select 1 from public.parceiros student
    where student.id = p_aluno_id and student.tipo = 'Aluno'
  ) then
    raise exception 'Aluno não encontrado.' using errcode = '22023';
  end if;

  v_rule := internal_academic.render_nontechnical_single_plan(v_plan);
  perform public.assert_aluno_sem_matricula_curso_duplicada(
    p_aluno_id,
    v_class.curso_id,
    p_turma_id
  );
  v_class := internal_academic.assert_nontechnical_single_plan_enrollment_lifecycle(
    p_turma_id,
    p_aluno_id
  );
  perform pg_catalog.set_config(
    'app.nontechnical_single_plan_enrollment',
    p_request_id::text,
    true
  );
  v_enrollment := internal_academic.upsert_nontechnical_single_plan_enrollment(
    p_aluno_id, p_turma_id, null
  );

  insert into public.matriculas_plano_financeiro_unico(
    matricula_id, turma_id, aluno_id, plano_turma_revisao,
    plano_turma_fingerprint, regra_snapshot, valor_total, qtd_parcelas,
    generated_by
  ) values (
    v_enrollment.id, p_turma_id, p_aluno_id, v_plan.revisao,
    v_plan.fingerprint, v_rule, v_plan.valor_total, v_plan.qtd_parcelas,
    auth.uid()
  ) on conflict (matricula_id) do nothing;

  select snapshot.regra_snapshot into v_snapshot
  from public.matriculas_plano_financeiro_unico snapshot
  where snapshot.matricula_id = v_enrollment.id
  for update;
  if v_snapshot is null then
    raise exception 'O snapshot financeiro da matrícula não foi confirmado.' using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.nontechnical_single_plan_titles',
    p_request_id::text,
    true
  );
  insert into public.contas_receber(
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento, parcela_numero,
    origem_cronograma_id, forma_pagamento, regra_financeira_plano_unico_snapshot
  )
  select
    v_class.polo_id,
    (item ->> 'label') || ' - ' || v_class.nome,
    (item ->> 'valor')::numeric,
    (item ->> 'dataVencimento')::date,
    case when (item ->> 'dataVencimento')::date < current_date then 'VENCIDO' else 'PENDENTE' end,
    'MENSALIDADE',
    v_enrollment.aluno_id,
    v_enrollment.id,
    p_turma_id,
    'PARCELA',
    (item ->> 'numero')::integer,
    item ->> 'id',
    'BOLETO',
    jsonb_build_object(
    'origem', 'PLANO_UNICO',
      'revisao', v_snapshot -> 'revisao',
      'fingerprint', v_snapshot -> 'fingerprint',
      'valorTotal', v_snapshot -> 'valorTotal',
      'qtdParcelas', v_snapshot -> 'qtdParcelas',
      'primeiroVencimento', v_snapshot -> 'primeiroVencimento',
      'diaVencimento', v_snapshot -> 'diaVencimento',
      'descontoPontualidade', v_snapshot -> 'descontoPontualidade',
      'jurosAtrasoPercentual', v_snapshot -> 'jurosAtrasoPercentual',
      'multaAtraso', v_snapshot -> 'multaAtraso',
      'parcela', item
    )
  from jsonb_array_elements(v_snapshot -> 'cronograma') as schedule(item)
  on conflict (matricula_id, origem_cronograma_id)
    where matricula_id is not null and origem_cronograma_id is not null
  do nothing;
  get diagnostics v_generated = row_count;

  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', title.id,
      'numero', title.parcela_numero,
      'valor', title.valor,
      'vencimento', title.data_vencimento,
      'status', title.status,
      'formaPagamento', title.forma_pagamento
    ) order by title.parcela_numero), '[]'::jsonb)
  into v_total_generated, v_titles
  from public.contas_receber title
  where title.matricula_id = v_enrollment.id
    and title.regra_financeira_plano_unico_snapshot ->> 'fingerprint' = v_snapshot ->> 'fingerprint';

  if v_generated > 0 then
    perform public.registrar_turma_financeiro_auditoria(
      v_enrollment.id,
      'PLANO_UNICO_PARCELAS_GERADAS',
      jsonb_build_object(
        'revisao', v_snapshot ->> 'revisao',
        'fingerprint', v_snapshot ->> 'fingerprint',
        'parcelasInseridas', v_generated,
        'parcelasNoPlano', v_total_generated
      ),
      'Parcelas de boleto geradas a partir do plano pré-configurado da turma.'
    );
  end if;

  v_response := jsonb_build_object(
    'operacao', 'MATRICULAR_E_GERAR_PARCELAS_PLANO_UNICO',
    'requestId', p_request_id,
    'replayed', false,
    'matricula', jsonb_build_object(
      'id', v_enrollment.id,
      'alunoId', v_enrollment.aluno_id,
      'turmaId', v_enrollment.turma_id,
      'status', v_enrollment.status
    ),
    'plano', v_snapshot,
    'parcelasInseridas', v_generated,
    'parcelasGeradas', v_total_generated,
    'parcelas', v_titles
  );
  insert into internal_academic.nontechnical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'MATRICULAR_E_GERAR_PARCELAS_PLANO_UNICO',
    auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

revoke all on function public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(
  uuid, uuid, uuid, integer, text
) from public, anon;
grant execute on function public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(
  uuid, uuid, uuid, integer, text
) to authenticated, service_role;

-- A turma que adota o plano único precisa passar pelo RPC acima, pois é ele que
-- congela a regra do aluno e cria todas as parcelas. Os entrypoints legados
-- continuam disponíveis para turmas antigas e técnicas, mas não podem deixar
-- uma matrícula incompleta em uma turma LIVRE/ESPECIALIZACAO com este plano.
create or replace function public.matricular_aluno_turma(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid default null
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not (
      public.gestor_has_module('gestao')
      and public.can_write_turma(p_turma_id)
    )
  then
    raise exception 'Sem permissão para matricular aluno nesta turma.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.turmas_plano_financeiro_unico plano
    where plano.turma_id = p_turma_id
  ) then
    raise exception
      'Esta turma usa plano financeiro único. Matricule pelo fluxo que gera todas as parcelas.'
      using errcode = '22023';
  end if;

  select upper(coalesce(curso.modalidade, ''))
  into v_modalidade
  from public.turmas turma
  join public.cursos curso on curso.id = turma.curso_id
  where turma.id = p_turma_id;

  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception
      'Matrícula técnica deve ser criada pelo fluxo financeiro pendente ou pela implantação explícita.'
      using errcode = '22023';
  end if;

  perform internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    'ATIVO'
  );

  return internal_academic.legacy_matricular_aluno_turma(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id
  );
end;
$function$;

create or replace function public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid default null,
  p_valor_matricula numeric default null,
  p_data_vencimento_matricula date default null,
  p_valor_parcela numeric default null,
  p_valor_rematricula numeric default null,
  p_dia_vencimento integer default null,
  p_financeiro_herdado boolean default null,
  p_gerar_cobranca_inicial boolean default null,
  p_gerar_cobranca_futura boolean default null,
  p_sincronizar_asaas boolean default null
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not (
      public.gestor_has_module('gestao')
      and public.can_write_turma(p_turma_id)
    )
  then
    raise exception 'Sem permissão para matricular aluno nesta turma.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.turmas_plano_financeiro_unico plano
    where plano.turma_id = p_turma_id
  ) then
    raise exception
      'Esta turma usa plano financeiro único. Matricule pelo fluxo que gera todas as parcelas.'
      using errcode = '22023';
  end if;

  select upper(coalesce(curso.modalidade, '')) into v_modalidade
  from public.turmas turma
  join public.cursos curso on curso.id = turma.curso_id
  where turma.id = p_turma_id;
  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception 'Use o pré-vínculo técnico e a ativação financeira canônica.'
      using errcode = '22023';
  end if;

  perform internal_academic.authorize_enrollment_upsert(
    p_aluno_id,
    p_turma_id,
    'ATIVO'
  );

  return internal_academic.legacy_matricular_aluno_turma_financeiro(
    p_aluno_id,
    p_turma_id,
    p_responsavel_id,
    p_valor_matricula,
    coalesce(
      p_data_vencimento_matricula,
      (pg_catalog.timezone('America/Maceio', now()))::date
    ),
    p_valor_parcela,
    p_valor_rematricula,
    p_dia_vencimento,
    p_financeiro_herdado,
    p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura,
    p_sincronizar_asaas
  );
end;
$function$;

-- Checkout legado também não pode criar uma matrícula sem o snapshot e as
-- parcelas do plano único. Cursos técnicos preservam suas guardas canônicas.
create or replace function public.payment_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean default false
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing_id uuid;
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and public.current_aluno_id() is distinct from p_aluno_id
  then
    raise exception 'O checkout só pode alterar a matrícula do próprio aluno.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.turmas_plano_financeiro_unico plano
    where plano.turma_id = p_turma_id
  ) then
    raise exception
      'Esta turma usa plano financeiro único. Finalize a matrícula pelo fluxo que gera todas as parcelas.'
      using errcode = '22023';
  end if;

  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception 'O checkout não pode gerar cobrança para curso técnico; use a ativação financeira canônica.'
      using errcode = '22023';
  end if;

  select enrollment.id into v_existing_id
  from public.matriculas enrollment
  where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id
  order by enrollment.data_matricula desc nulls last
  limit 1;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE');
  if v_existing_id is not null then
    perform internal_academic.authorize_matricula_control_update(v_existing_id);
  end if;
  return public.p1_payment_checkout_upsert_matricula_20260731(
    p_aluno_id, p_turma_id, p_gerar_cobranca_futura
  );
end;
$function$;

create or replace function public.asaas_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean default false
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing_id uuid;
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'O checkout Asaas legado é restrito à integração de encerramento.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.turmas_plano_financeiro_unico plano
    where plano.turma_id = p_turma_id
  ) then
    raise exception
      'Esta turma usa plano financeiro único. Finalize a matrícula pelo fluxo que gera todas as parcelas.'
      using errcode = '22023';
  end if;

  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception 'O checkout Asaas legado não pode processar curso técnico.' using errcode = '22023';
  end if;

  select enrollment.id into v_existing_id
  from public.matriculas enrollment
  where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id
  order by enrollment.data_matricula desc nulls last
  limit 1;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE');
  if v_existing_id is not null then
    perform internal_academic.authorize_matricula_control_update(v_existing_id);
  end if;
  return public.p1_asaas_checkout_upsert_matricula_20260731(
    p_aluno_id, p_turma_id, p_gerar_cobranca_futura
  );
end;
$function$;

-- O extrato do aluno precisa calcular desconto, juros e multa a partir da regra
-- gravada em cada título. Assim uma alteração posterior na turma nunca muda a
-- apresentação de uma parcela já emitida.
create or replace function public.get_aluno_financeiro_portal_secure(
  p_aluno_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
begin
  if p_aluno_id is null then
    raise exception 'Aluno obrigatorio para consultar o extrato financeiro.'
      using errcode = '22004';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      public.current_aluno_id() is null
      or p_aluno_id is distinct from public.current_aluno_id()
    )
  then
    raise exception 'Extrato financeiro do aluno nao autorizado.'
      using errcode = '42501';
  end if;

  with source_rows as (
    select
      receivable.*,
      enrollment.desconto_pontualidade_individual,
      enrollment.juros_atraso_individual,
      enrollment.multa_atraso_individual,
      class.id as class_id,
      class.curso_id as class_course_id,
      class.nome as class_name,
      class.valor_parcela as class_installment_value,
      class.qtd_parcelas as class_installment_count,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      class.aplicar_desconto_matricula,
      class.aplicar_multa_juros_matricula,
      class.aplicar_desconto_mensalidade,
      class.aplicar_multa_juros_mensalidade,
      class.aplicar_desconto_rematricula,
      class.aplicar_multa_juros_rematricula,
      course.id as course_id,
      course.nome as course_name,
      upper(coalesce(course.modalidade, '')) as course_modality,
      student.nome as student_name,
      student.cpf_cnpj as student_document
    from public.contas_receber receivable
    left join public.matriculas enrollment on enrollment.id = receivable.matricula_id
    left join public.turmas class on class.id = receivable.turma_id
    left join public.cursos course on course.id = class.curso_id
    left join public.parceiros student on student.id = receivable.cliente_id
    where receivable.cliente_id = p_aluno_id
  ),
  classified as (
    select
      source_rows.*,
      (
        upper(coalesce(tipo_lancamento, '')) = 'MATRICULA'
        or lower(coalesce(descricao, '')) like '%matricula%'
        or lower(coalesce(descricao, '')) like '%matrícula%'
      ) as is_enrollment,
      (
        upper(coalesce(tipo_lancamento, '')) = 'REMATRICULA'
        or lower(coalesce(descricao, '')) like '%rematricula%'
        or lower(coalesce(descricao, '')) like '%rematrícula%'
      ) as is_reenrollment,
      (
        upper(coalesce(tipo_lancamento, '')) = 'PARCELA'
        or lower(coalesce(descricao, '')) like '%mensalidade%'
      ) as is_installment,
      (
        status = 'VENCIDO'
        or (status = 'PENDENTE' and data_vencimento < current_date)
      ) as is_overdue,
      (
        lower(coalesce(gateway_provider, '')) = 'banese_card'
        and upper(coalesce(gateway_payment_method, '')) = 'BOLETO'
        and length(regexp_replace(coalesce(gateway_boleto_linha_digitavel, ''), '\D', '', 'g')) = 47
        and length(regexp_replace(coalesce(gateway_boleto_codigo_barras, ''), '\D', '', 'g')) = 44
      ) as has_registered_banese_boleto
    from source_rows
  ),
  policies as (
    select
      classified.*,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO' then true
        when regra_financeira_tecnica_snapshot is not null
          then coalesce((regra_financeira_tecnica_snapshot ->> 'aplicarDesconto')::boolean, false)
        else course_modality <> 'EAD' and (
          (is_enrollment and aplicar_desconto_matricula is true)
          or (is_installment and aplicar_desconto_mensalidade is not false)
          or (is_reenrollment and aplicar_desconto_rematricula is not false)
        )
      end as can_discount,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO' then true
        when regra_financeira_tecnica_snapshot is not null
          then coalesce((regra_financeira_tecnica_snapshot ->> 'aplicarMultaJuros')::boolean, false)
        else course_modality <> 'EAD' and (
          (is_enrollment and aplicar_multa_juros_matricula is not false)
          or (is_installment and aplicar_multa_juros_mensalidade is not false)
          or (is_reenrollment and aplicar_multa_juros_rematricula is not false)
        )
      end as can_late_charge,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'
          then greatest(0, coalesce((regra_financeira_plano_unico_snapshot ->> 'descontoPontualidade')::numeric, 0))
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'descontoPontualidade')::numeric, 0))
        else greatest(0, coalesce(desconto_pontualidade_individual, desconto_pontualidade, 0))
      end as discount_policy_value,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'
          then greatest(0, coalesce((regra_financeira_plano_unico_snapshot ->> 'jurosAtrasoPercentual')::numeric, 0))
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'jurosAtrasoPercentual')::numeric, 0))
        else greatest(0, coalesce(juros_atraso_individual, juros_atraso, 0))
      end as interest_policy_percent,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'
          then greatest(0, coalesce((regra_financeira_plano_unico_snapshot ->> 'multaAtraso')::numeric, 0))
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'multaAtrasoValor')::numeric, 0))
        else greatest(0, coalesce(multa_atraso_individual, multa_atraso, 0))
      end as late_fee_policy_value
    from classified
  ),
  amounts as (
    select
      policies.*,
      case
        when has_registered_banese_boleto or status = 'PAGO' or not can_discount then 0::numeric
        else least(coalesce(valor, 0), discount_policy_value)
      end as punctual_discount,
      case
        when has_registered_banese_boleto or not is_overdue or not can_late_charge then 0::numeric
        else round(
          coalesce(valor, 0)
          * interest_policy_percent
          / 30.0
          / 100.0
          * greatest(current_date - data_vencimento, 0),
          2
        )
      end as interest_value,
      case
        when has_registered_banese_boleto or not is_overdue or not can_late_charge then 0::numeric
        else late_fee_policy_value
      end as late_fee_value
    from policies
  ),
  presented as (
    select
      amounts.*,
      round(greatest(0, coalesce(valor, 0) - punctual_discount), 2) as total_until_due,
      round(coalesce(valor, 0) + interest_value + late_fee_value, 2) as total_with_late
    from amounts
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'cliente_id', cliente_id,
        'matricula_id', matricula_id,
        'turma_id', turma_id,
        'descricao', descricao,
        'categoria', categoria,
        'tipo_lancamento', tipo_lancamento,
        'parcela_numero', parcela_numero,
        'valor', valor,
        'valor_pago', valor_pago,
        'data_vencimento', data_vencimento,
        'data_pagamento', data_pagamento,
        'status', status,
        'forma_pagamento', forma_pagamento,
        'origem_pagamento', origem_pagamento,
        'asaas_invoice_url', asaas_invoice_url,
        'asaas_status', asaas_status,
        'asaas_transaction_receipt_url', asaas_transaction_receipt_url,
        'gateway_provider', gateway_provider,
        'gateway_environment', gateway_environment,
        'gateway_payment_method', gateway_payment_method,
        'gateway_payment_id', gateway_payment_id,
        'gateway_status', gateway_status,
        'gateway_bank_slip_url', gateway_bank_slip_url,
        'gateway_invoice_url', gateway_invoice_url,
        'gateway_boleto_linha_digitavel', gateway_boleto_linha_digitavel,
        'gateway_boleto_codigo_barras', gateway_boleto_codigo_barras,
        'gateway_boleto_nosso_numero', gateway_boleto_nosso_numero,
        'turmas', case
          when class_id is null then null
          else jsonb_build_object(
            'id', class_id,
            'curso_id', class_course_id,
            'nome', class_name,
            'valor_parcela', class_installment_value,
            'qtd_parcelas', class_installment_count,
            'cursos', case
              when course_id is null then null
              else jsonb_build_object(
                'id', course_id,
                'modalidade', course_modality,
                'nome', course_name
              )
            end
          )
        end,
        'parceiros', jsonb_build_object(
          'nome', student_name,
          'cpf_cnpj', student_document
        ),
        'financial_summary', jsonb_build_object(
          'baseValue', coalesce(valor, 0),
          'paidValue', coalesce(valor_pago, valor, 0),
          'punctualDiscount', punctual_discount,
          'totalUntilDue', case when has_registered_banese_boleto then coalesce(valor, 0) else total_until_due end,
          'interestPercent', case
            when has_registered_banese_boleto or not can_late_charge then 0
            else interest_policy_percent
          end,
          'interestValue', interest_value,
          'lateFeeValue', late_fee_value,
          'totalWithLate', case when has_registered_banese_boleto then coalesce(valor, 0) else total_with_late end,
          'highlightValue', case
            when status = 'PAGO' then coalesce(valor_pago, valor, 0)
            when has_registered_banese_boleto then coalesce(valor, 0)
            when is_overdue then total_with_late
            else total_until_due
          end,
          'highlightLabel', case
            when status = 'PAGO' then 'Valor pago'
            when has_registered_banese_boleto then 'Valor do boleto'
            when is_overdue then 'Total em atraso'
            else 'Total até o vencimento'
          end,
          'hasDiscount', punctual_discount > 0,
          'hasLateCharge', interest_value > 0 or late_fee_value > 0,
          'canLateCharge', can_late_charge and not has_registered_banese_boleto
        )
      )
      order by data_vencimento, id
    ),
    '[]'::jsonb
  ) into v_rows
  from presented;

  return jsonb_build_object(
    'rows', v_rows,
    'summary', (
      with elements as (
        select value as row_data
        from jsonb_array_elements(v_rows)
      ),
      open_by_modality as (
        select
          coalesce(nullif(row_data #>> '{turmas,cursos,modalidade}', ''), 'OUTROS') as modality,
          count(*)::integer as item_count,
          coalesce(sum((row_data #>> '{financial_summary,highlightValue}')::numeric), 0) as total_value
        from elements
        where row_data ->> 'status' in ('PENDENTE', 'VENCIDO')
        group by 1
      )
      select jsonb_build_object(
        'totalPaid', coalesce(sum(
          case
            when row_data ->> 'status' = 'PAGO'
              then (row_data #>> '{financial_summary,paidValue}')::numeric
            else 0
          end
        ), 0),
        'totalPending', coalesce(sum(
          case
            when row_data ->> 'status' in ('PENDENTE', 'VENCIDO')
              then (row_data #>> '{financial_summary,highlightValue}')::numeric
            else 0
          end
        ), 0),
        'openByModality', coalesce((
          select jsonb_agg(jsonb_build_object(
            'modality', modality,
            'count', item_count,
            'total', total_value
          ) order by modality)
          from open_by_modality
        ), '[]'::jsonb)
      )
      from elements
    )
  );
end;
$function$;

revoke all on function public.get_aluno_financeiro_portal_secure(uuid)
  from public, anon;
grant execute on function public.get_aluno_financeiro_portal_secure(uuid)
  to authenticated, service_role;

revoke all on function public.matricular_aluno_turma(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.matricular_aluno_turma(uuid, uuid, uuid)
  to authenticated, service_role;

revoke all on function public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer,
  boolean, boolean, boolean, boolean
) from public, anon;
grant execute on function public.matricular_aluno_turma_financeiro(
  uuid, uuid, uuid, numeric, date, numeric, numeric, integer,
  boolean, boolean, boolean, boolean
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
