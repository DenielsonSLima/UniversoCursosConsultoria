-- Atualização da Turma de Radiologia (2026.1-RAD-INT-JAP) para rematrícula de R$ 100,00
-- e evolução do motor de ciclos para geração antecipada na penúltima parcela paga (11/12)
-- emitindo as 13 cobranças do ciclo seguinte (1 rematrícula + 12 mensalidades) sob adimplência total.

-- 1. Atualização dos parâmetros da turma de Radiologia
update public.turmas
set
  valor_rematricula = 100.00,
  cobrar_rematricula = true,
  aplicar_desconto_rematricula = false,
  aplicar_multa_juros_rematricula = true
where codigo = '2026.1-RAD-INT-JAP';

-- 2. Atualização das configurações individuais dos alunos da turma de Radiologia em matriculas
update public.matriculas
set
  valor_rematricula_individual = 100.00,
  cobrar_rematricula_individual = true,
  aplicar_desconto_rematricula_individual = false,
  aplicar_multa_juros_rematricula_individual = true
where turma_id in (select id from public.turmas where codigo = '2026.1-RAD-INT-JAP');

-- 3. Função de geração do próximo ciclo antecipado (13 cobranças) na penúltima parcela paga
create or replace function public.gerar_rematricula_apos_parcelas(p_matricula_id uuid)
returns public.contas_receber
language plpgsql
security definer
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_effective jsonb;
  v_title public.contas_receber%rowtype;
  v_cycle integer;
  v_new_cycle integer;
  v_count integer;
  v_penultimate integer;
  v_paid_penultimate integer;
  v_total_penultimate integer;
  v_day integer;
  v_value_rematricula numeric;
  v_value_mensalidade numeric;
  v_last_parc_due date;
  v_rematricula_due date;
  v_parc_due date;
  v_number integer;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;

  select class.* into v_class from public.turmas class where class.id = v_enrollment.turma_id;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;

  if not exists (
    select 1 from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id
  ) then return null; end if;

  if not coalesce(v_enrollment.gerar_cobranca_futura, false) then return null; end if;

  v_effective := internal_academic.technical_financial_effective_rule(p_matricula_id);
  if not (v_effective -> 'cobranca' -> 'rematricula' ->> 'habilitada')::boolean then
    return null;
  end if;

  v_value_rematricula := (v_effective -> 'cobranca' -> 'rematricula' ->> 'valor')::numeric;
  if v_value_rematricula <= 0 then return null; end if;

  -- Identifica o ciclo mais recente de parcelas
  select coalesce(max((pg_catalog.regexp_match(
    receivable.origem_cronograma_id, '^ciclo-([0-9]+)-parc-[0-9]+$'
  ))[1]::integer), 0)
  into v_cycle
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.tipo_lancamento = 'PARCELA'
    and receivable.origem_cronograma_id ~ '^ciclo-[0-9]+-parc-[0-9]+$';

  if v_cycle = 0 then return null; end if;

  -- Idempotência: se a rematrícula deste ciclo já existir, retorna o registro existente
  select * into v_title from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.origem_cronograma_id = 'ciclo-' || v_cycle || '-rematricula'
  limit 1;
  if found then return v_title; end if;

  v_count := (v_effective -> 'cobranca' -> 'mensalidade' ->> 'quantidade')::integer;
  if v_count not between 1 and 60 then return null; end if;
  v_penultimate := greatest(v_count - 1, 1);
  v_day := (v_effective -> 'vencimento' ->> 'diaBase')::integer;
  v_value_mensalidade := (v_effective -> 'cobranca' -> 'mensalidade' ->> 'valor')::numeric;

  -- Verifica se todas as parcelas de 1 até a penúltima (ex: 11) estão pagas
  select
    count(*) filter (where receivable.status = 'PAGO'),
    count(*)
  into v_paid_penultimate, v_total_penultimate
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.tipo_lancamento = 'PARCELA'
    and receivable.parcela_numero between 1 and v_penultimate
    and receivable.origem_cronograma_id like 'ciclo-' || v_cycle || '-parc-%';

  if v_total_penultimate < v_penultimate or v_paid_penultimate < v_penultimate then
    return null;
  end if;

  -- Trava de adimplência: nenhum título do aluno pode estar vencido ou em atraso
  if exists (
    select 1 from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and (
        receivable.status = 'VENCIDO'
        or (receivable.status = 'PENDENTE' and receivable.data_vencimento < (pg_catalog.timezone('America/Maceio', now()))::date)
      )
  ) then
    return null;
  end if;

  -- Localiza a data de vencimento da última mensalidade do ciclo atual
  select data_vencimento
  into v_last_parc_due
  from public.contas_receber receivable
  where receivable.matricula_id = p_matricula_id
    and receivable.tipo_lancamento = 'PARCELA'
    and receivable.parcela_numero = v_count
    and receivable.origem_cronograma_id = 'ciclo-' || v_cycle || '-parc-' || v_count;

  if v_last_parc_due is null then
    select max(data_vencimento)
    into v_last_parc_due
    from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.tipo_lancamento = 'PARCELA'
      and receivable.origem_cronograma_id like 'ciclo-' || v_cycle || '-parc-%';
  end if;

  if v_last_parc_due is null then return null; end if;

  -- Rematrícula com vencimento 1 mês após a última mensalidade do ciclo atual
  v_rematricula_due := public.data_vencimento_mensal(v_last_parc_due, v_day, 1);

  -- 1. Insere a Rematrícula do Ciclo (R$ 100,00)
  insert into public.contas_receber(
    polo_id, descricao, valor, data_vencimento, status, categoria,
    cliente_id, matricula_id, turma_id, tipo_lancamento,
    parcela_numero, origem_cronograma_id
  ) values (
    v_class.polo_id,
    'Rematrícula - Ciclo ' || v_cycle || ' - ' || v_class.nome,
    v_value_rematricula,
    v_rematricula_due,
    case when v_rematricula_due < (pg_catalog.timezone('America/Maceio', now()))::date then 'VENCIDO' else 'PENDENTE' end,
    'MENSALIDADE', v_enrollment.aluno_id, v_enrollment.id, v_enrollment.turma_id,
    'REMATRICULA', 0, 'ciclo-' || v_cycle || '-rematricula'
  )
  on conflict (matricula_id, origem_cronograma_id)
    where matricula_id is not null and origem_cronograma_id is not null
  do nothing
  returning * into v_title;

  if v_title.id is null then
    select * into v_title from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.origem_cronograma_id = 'ciclo-' || v_cycle || '-rematricula'
    limit 1;
  end if;

  -- 2. Insere imediatamente as 12 cobranças de Mensalidade do Ciclo Seguinte
  v_new_cycle := v_cycle + 1;
  for v_number in 1..v_count loop
    v_parc_due := public.data_vencimento_mensal(v_rematricula_due, v_day, v_number);
    insert into public.contas_receber(
      polo_id, descricao, valor, data_vencimento, status, categoria,
      cliente_id, matricula_id, turma_id, tipo_lancamento,
      parcela_numero, origem_cronograma_id
    ) values (
      v_class.polo_id,
      'Mensalidade ' || v_number || '/' || v_count || ' - Ciclo ' || v_new_cycle || ' - ' || v_class.nome,
      v_value_mensalidade,
      v_parc_due,
      case when v_parc_due < (pg_catalog.timezone('America/Maceio', now()))::date then 'VENCIDO' else 'PENDENTE' end,
      'MENSALIDADE', v_enrollment.aluno_id, v_enrollment.id, v_enrollment.turma_id,
      'PARCELA', v_number, 'ciclo-' || v_new_cycle || '-parc-' || v_number
    )
    on conflict (matricula_id, origem_cronograma_id)
      where matricula_id is not null and origem_cronograma_id is not null
    do nothing;
  end loop;

  return v_title;
end;
$function$;

-- 4. Trigger de disparo do ciclo após pagamento
create or replace function public.gerar_ciclo_financeiro_apos_pagamento()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_modalidade text;
begin
  if new.status = 'PAGO'
     and old.status is distinct from 'PAGO'
     and new.matricula_id is not null then
    select upper(coalesce(curso.modalidade, ''))
    into v_modalidade
    from public.matriculas as matricula
    join public.turmas as turma
      on turma.id = matricula.turma_id
    join public.cursos as curso
      on curso.id = turma.curso_id
    where matricula.id = new.matricula_id;

    if v_modalidade = 'TECNICO' then
      if new.tipo_lancamento in ('MATRICULA') then
        perform public.gerar_parcelas_matricula(new.matricula_id);
      elsif new.tipo_lancamento = 'PARCELA' then
        perform public.gerar_rematricula_apos_parcelas(new.matricula_id);
      end if;
    end if;
  end if;

  return new;
end;
$function$;
