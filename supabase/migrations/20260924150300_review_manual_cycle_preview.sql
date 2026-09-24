begin;

create or replace function internal_academic.technical_manual_cycle_reviewed_preview(
  p_matricula_id uuid,
  p_cycle_number integer,
  p_first_due_date date,
  p_review jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_state jsonb;
  v_rule jsonb;
  v_items jsonb := '[]'::jsonb;
  v_source text;
  v_origin_date date;
  v_first_due date;
  v_due date;
  v_day integer;
  v_count integer;
  v_number integer;
  v_total numeric := 0;
  v_value numeric;
  v_description text;
  v_key text;
  v_rule_fingerprint text;
  v_policy_fingerprint text;
  v_schedule_fingerprint text;
  v_has_lead_fee boolean := false;
  v_reviewed jsonb;
  v_today date := timezone('America/Maceio', now())::date;
begin
  perform internal_proesc.assert_fresh_cycle_generation(p_matricula_id);
  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  select class.* into v_class
  from public.turmas class
  where class.id = v_enrollment.turma_id;
  v_state := internal_academic.technical_manual_cycle_state(p_matricula_id);

  if not coalesce((v_state ->> 'habilitado')::boolean, false)
    or p_cycle_number is distinct from
      (v_state ->> 'proximoCicloNumero')::integer
  then
    raise exception 'Ciclo técnico manual inválido para esta matrícula.'
      using errcode = '22023';
  end if;
  if not coalesce((v_state ->> 'podeGerar')::boolean, false) then
    raise exception '%', coalesce(
      v_state -> 'bloqueio' ->> 'mensagem', 'Ciclo indisponível.'
    ) using errcode = 'P0001';
  end if;

  v_rule :=
    internal_academic.technical_financial_effective_rule(p_matricula_id);
  v_rule_fingerprint := v_rule -> 'identidade' ->> 'efetivaFingerprint';
  v_policy_fingerprint := v_state -> 'politica' ->> 'fingerprint';
  v_count :=
    (v_rule -> 'cobranca' -> 'mensalidade' ->> 'quantidade')::integer;

  if p_first_due_date is not null then
    v_source := 'INDIVIDUAL';
    v_origin_date := p_first_due_date;
    v_first_due := p_first_due_date;
    v_day := extract(day from p_first_due_date)::integer;
  else
    v_source := case when p_cycle_number = 2 then 'INDIVIDUAL' else 'TURMA' end;
    v_day := (v_rule -> 'vencimento' ->> 'diaBase')::integer;
    select max(receivable.data_vencimento) into v_origin_date
    from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.tipo_lancamento = 'PARCELA'
      and receivable.origem_cronograma_id like
        'ciclo-' || (p_cycle_number - 1) || '-parc-%';
    v_origin_date := coalesce(
      (v_state ->> 'primeiroVencimentoSugerido')::date,
      v_origin_date,
      (v_rule ->> 'primeiroVencimentoSugerido')::date,
      v_today
    );
    v_origin_date := greatest(v_origin_date, v_today);
    v_first_due := public.data_vencimento_mensal(v_origin_date, v_day, 0);
    if v_first_due < v_today then
      v_first_due := public.data_vencimento_mensal(v_origin_date, v_day, 1);
    end if;
  end if;

  if v_first_due < (pg_catalog.timezone('America/Maceio', now()))::date
    or v_first_due
      > (pg_catalog.timezone('America/Maceio', now()))::date + 1825
  then
    raise exception 'O primeiro vencimento deve estar entre hoje e cinco anos.'
      using errcode = '22023';
  end if;

  -- A taxa aparece para revisão mesmo quando a turma não cobra matrícula.
  if p_cycle_number = 1 then
    v_value :=
      (v_rule -> 'cobranca' -> 'matricula' ->> 'valor')::numeric;
    v_description := 'Matrícula - Ciclo 1 - ' || v_class.nome;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'chave', 'matricula', 'tipo', 'MATRICULA', 'numero', 0,
      'descricao', v_description,
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
      'detalhesBoleto',
        internal_academic.technical_manual_cycle_boleto_details(
          v_value, v_first_due, v_rule, 'MATRICULA',
          v_description, v_class.codigo, v_class.nome
        )
    ));
    v_total := v_total + v_value;
    v_has_lead_fee := true;
  elsif p_cycle_number = 2
    and (v_rule -> 'cobranca' -> 'rematricula' ->> 'habilitada')::boolean
  then
    v_value :=
      (v_rule -> 'cobranca' -> 'rematricula' ->> 'valor')::numeric;
    v_description := 'Rematrícula - Ciclo 2 - ' || v_class.nome;
    v_key := 'ciclo-1-rematricula';
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'chave', v_key, 'tipo', 'REMATRICULA', 'numero', 0,
      'descricao', v_description,
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
      'detalhesBoleto',
        internal_academic.technical_manual_cycle_boleto_details(
          v_value, v_first_due, v_rule, 'REMATRICULA',
          v_description, v_class.codigo, v_class.nome
        )
    ));
    v_total := v_total + v_value;
    v_has_lead_fee := true;
  end if;

  for v_number in 1..v_count loop
    v_due := public.data_vencimento_mensal(
      v_first_due,
      v_day,
      v_number - case when v_has_lead_fee then 0 else 1 end
    );
    v_value :=
      (v_rule -> 'cobranca' -> 'mensalidade' ->> 'valor')::numeric;
    v_key := 'ciclo-' || p_cycle_number || '-parc-' || v_number;
    v_description := 'Mensalidade ' || v_number || '/' || v_count
      || ' - Ciclo ' || p_cycle_number || ' - ' || v_class.nome;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'chave', v_key, 'tipo', 'PARCELA', 'numero', v_number,
      'descricao', v_description,
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_due, 'YYYY-MM-DD'),
      'detalhesBoleto',
        internal_academic.technical_manual_cycle_boleto_details(
          v_value, v_due, v_rule, 'MENSALIDADE',
          v_description, v_class.codigo, v_class.nome
        )
    ));
    v_total := v_total + v_value;
  end loop;

  v_reviewed := internal_academic.review_manual_cycle_items(
    v_items, p_review, v_rule, v_class.codigo, v_class.nome);
  v_items := v_reviewed -> 'itens';
  v_first_due := (v_items -> 0 ->> 'vencimento')::date;
  select sum((i ->> 'valor')::numeric) into v_total
    from jsonb_array_elements(v_items) i;

  v_schedule_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(jsonb_build_object(
      'matriculaId', p_matricula_id,
      'cicloNumero', p_cycle_number,
      'sourceVencimento', v_source,
      'dataOrigem', v_origin_date,
      'primeiroVencimento', v_first_due,
      'itens', v_items,
      'matriculaSemBoleto', v_reviewed -> 'matriculaSemBoleto',
      'regraEfetivaFingerprint', v_rule_fingerprint,
      'politicaFingerprint', v_policy_fingerprint
    )::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'matriculaId', p_matricula_id,
    'turmaId', v_enrollment.turma_id,
    'cicloManual', v_state,
    'preview', jsonb_build_object(
      'cicloNumero', p_cycle_number,
      'sourceVencimento', v_source,
      'dataOrigem', pg_catalog.to_char(v_origin_date, 'YYYY-MM-DD'),
      'primeiroVencimento', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
      'quantidadeItens', jsonb_array_length(v_items),
      'total', pg_catalog.to_char(v_total, 'FM999999990.00'),
      'termos', internal_academic.technical_manual_cycle_terms(v_rule),
      'itens', v_items,
      'matriculaSemBoleto', v_reviewed -> 'matriculaSemBoleto',
      'regraEfetivaFingerprint', v_rule_fingerprint,
      'politicaFingerprint', v_policy_fingerprint,
      'cronogramaFingerprint', v_schedule_fingerprint
    )
  );
end;
$function$;

revoke all on function internal_academic.technical_manual_cycle_reviewed_preview(
  uuid, integer, date, jsonb
) from public, anon, authenticated, service_role;

-- Compatibilidade dos consumidores anteriores; todos passam pelas mesmas guardas.
create or replace function internal_academic.technical_manual_cycle_preview(
  p_matricula_id uuid, p_cycle_number integer, p_first_due_date date default null
)
returns jsonb language sql volatile security definer set search_path = ''
as $function$
  select internal_academic.technical_manual_cycle_reviewed_preview(
    p_matricula_id, p_cycle_number, p_first_due_date, null);
$function$;
revoke all on function internal_academic.technical_manual_cycle_preview(uuid, integer, date)
  from public, anon, authenticated, service_role;

create or replace function public.preview_ciclo_financeiro_tecnico_manual_secure(
  p_matricula_id uuid, p_ciclo_numero integer, p_primeiro_vencimento date, p_revisao jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_turma_id uuid;
begin
  select turma_id into v_turma_id from public.matriculas where id = p_matricula_id;
  if v_turma_id is null then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not coalesce(
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro'), false
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;
  return internal_academic.technical_manual_cycle_reviewed_preview(
    p_matricula_id, p_ciclo_numero, p_primeiro_vencimento, p_revisao);
end;
$function$;
revoke all on function public.preview_ciclo_financeiro_tecnico_manual_secure(uuid, integer, date, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.preview_ciclo_financeiro_tecnico_manual_secure(uuid, integer, date, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
