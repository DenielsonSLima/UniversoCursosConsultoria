begin;

create or replace function internal_academic.nontechnical_installment_simulation_v2(
  p_value numeric,
  p_on_time_discount numeric,
  p_monthly_interest numeric,
  p_fixed_fine numeric
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_value numeric := round(coalesce(p_value, 0), 2);
  v_discount numeric := round(coalesce(p_on_time_discount, 0), 2);
  v_interest_rate numeric := round(coalesce(p_monthly_interest, 0), 4);
  v_fine numeric := round(coalesce(p_fixed_fine, 0), 2);
  v_daily_rate numeric;
  v_daily_interest numeric;
  v_month_interest numeric;
  v_on_time numeric;
  v_late numeric;
  v_money_value text;
  v_money_discount text;
  v_money_on_time text;
  v_money_daily text;
  v_money_month text;
  v_money_fine text;
begin
  if v_value <= 0 or v_discount < 0 or v_discount >= v_value
    or v_interest_rate not between 0 and 100 or v_fine < 0
  then
    raise exception 'Valores inválidos para simular a parcela do plano único.'
      using errcode = '22023';
  end if;
  v_daily_rate := round(v_interest_rate / 30.0, 6);
  v_daily_interest := round(v_value * v_interest_rate / 100.0 / 30.0, 2);
  v_month_interest := round(v_value * v_interest_rate / 100.0, 2);
  v_on_time := round(v_value - v_discount, 2);
  v_late := round(v_value + v_month_interest + v_fine, 2);
  v_money_value := pg_catalog.replace(pg_catalog.to_char(v_value, 'FM999999990.00'), '.', ',');
  v_money_discount := pg_catalog.replace(pg_catalog.to_char(v_discount, 'FM999999990.00'), '.', ',');
  v_money_on_time := pg_catalog.replace(pg_catalog.to_char(v_on_time, 'FM999999990.00'), '.', ',');
  v_money_daily := pg_catalog.replace(pg_catalog.to_char(v_daily_interest, 'FM999999990.00'), '.', ',');
  v_money_month := pg_catalog.replace(pg_catalog.to_char(v_month_interest, 'FM999999990.00'), '.', ',');
  v_money_fine := pg_catalog.replace(pg_catalog.to_char(v_fine, 'FM999999990.00'), '.', ',');
  return jsonb_build_object(
    'descontoAplicado', v_discount,
    'jurosMensal', v_month_interest,
    'jurosPercentualDia', v_daily_rate,
    'jurosValorDia', v_daily_interest,
    'multa', v_fine,
    'valorComDesconto', v_on_time,
    'valorComAtraso30Dias', v_late,
    'mensagemPontualidade',
      'Parcela R$ ' || v_money_value || ' - desconto de pontualidade R$ '
      || v_money_discount || ' = R$ ' || v_money_on_time || '.',
    'mensagemAtraso30Dias',
      'Juros de '
      || pg_catalog.replace(pg_catalog.to_char(v_interest_rate, 'FM999999990.0000'), '.', ',')
      || '% ao mês = '
      || pg_catalog.replace(pg_catalog.to_char(v_daily_rate, 'FM999999990.000000'), '.', ',')
      || '% ao dia, aproximadamente R$ ' || v_money_daily
      || '/dia. Em 30 dias: R$ ' || v_money_month
      || '. Multa única: R$ ' || v_money_fine || '.'
  );
end;
$function$;

revoke all on function internal_academic.nontechnical_installment_simulation_v2(
  numeric, numeric, numeric, numeric
) from public, anon, authenticated, service_role;

create or replace function internal_academic.build_nontechnical_effective_schedule_v2(
  p_normalized jsonb,
  p_plan_revision integer,
  p_effective_fingerprint text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_total_cents bigint := round(
    (p_normalized ->> 'valorTotalEfetivo')::numeric * 100
  )::bigint;
  v_count integer := (p_normalized ->> 'qtdParcelas')::integer;
  v_first_due date := (p_normalized ->> 'primeiroVencimento')::date;
  v_due_day integer := (p_normalized ->> 'diaVencimento')::integer;
  v_base_cents bigint;
  v_remainder bigint;
  v_number integer;
  v_value numeric;
  v_due date;
  v_id_prefix text;
  v_result jsonb := '[]'::jsonb;
begin
  v_base_cents := v_total_cents / v_count;
  v_remainder := v_total_cents % v_count;
  v_id_prefix := 'plano-unico-v' || p_plan_revision || '-'
    || pg_catalog.substr(p_effective_fingerprint, 1, 12) || '-parc-';
  for v_number in 1..v_count loop
    v_value := (
      v_base_cents + case when v_number <= v_remainder then 1 else 0 end
    )::numeric / 100;
    v_due := case when v_number = 1 then v_first_due else public.data_vencimento_mensal(
      v_first_due, v_due_day, v_number - 1
    ) end;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_id_prefix || v_number,
      'tipo', 'PARCELA',
      'numero', v_number,
      'label', case when v_count = 1 then 'Boleto único à vista'
        else 'Parcela ' || v_number || '/' || v_count end,
      'valor', v_value,
      'dataVencimento', v_due,
      'fingerprint', p_effective_fingerprint,
      'simulacao', internal_academic.nontechnical_installment_simulation_v2(
        v_value,
        (p_normalized ->> 'descontoPontualidade')::numeric,
        (p_normalized ->> 'jurosAtrasoPercentual')::numeric,
        (p_normalized ->> 'multaAtraso')::numeric
      )
    ));
  end loop;
  return v_result;
end;
$function$;

revoke all on function internal_academic.build_nontechnical_effective_schedule_v2(
  jsonb, integer, text
) from public, anon, authenticated, service_role;

create or replace function internal_academic.render_nontechnical_condition_v2(
  p_plan public.turmas_plano_financeiro_unico,
  p_adjustment jsonb,
  p_override_revision integer default null,
  p_preview boolean default false
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_normalized jsonb := internal_academic.normalize_nontechnical_adjustment_v2(
    p_plan, p_adjustment
  );
  v_override_fingerprint text := internal_academic.nontechnical_adjustment_fingerprint_v2(
    v_normalized
  );
  v_effective_fingerprint text := internal_academic.nontechnical_effective_fingerprint_v2(
    p_plan.revisao, p_plan.fingerprint, v_normalized
  );
  v_schedule jsonb;
  v_first_simulation jsonb;
begin
  v_schedule := internal_academic.build_nontechnical_effective_schedule_v2(
    v_normalized, p_plan.revisao, v_effective_fingerprint
  );
  v_first_simulation := v_schedule -> 0 -> 'simulacao';
  return jsonb_build_object(
    'versao', 2,
    'origem', v_normalized ->> 'modo',
    'revisao', p_plan.revisao,
    'fingerprint', v_effective_fingerprint,
    'identidade', jsonb_build_object(
      'planoTurmaRevisao', p_plan.revisao,
      'planoTurmaFingerprint', p_plan.fingerprint,
      'overrideRevisao', p_override_revision,
      'overrideFingerprint', v_override_fingerprint,
      'efetivaFingerprint', v_effective_fingerprint,
      'preview', p_preview
    ),
    'valorTotal', v_normalized -> 'valorTotalEfetivo',
    'valorTotalNominal', v_normalized -> 'valorTotalNominal',
    'descontoComercial', jsonb_build_object(
      'tipo', v_normalized ->> 'descontoComercialTipo',
      'valor', v_normalized -> 'descontoComercialValor'
    ),
    'valorTotalEfetivo', v_normalized -> 'valorTotalEfetivo',
    'qtdParcelas', v_normalized -> 'qtdParcelas',
    'primeiroVencimento', v_normalized -> 'primeiroVencimento',
    'diaVencimento', v_normalized -> 'diaVencimento',
    'descontoPontualidade', v_normalized -> 'descontoPontualidade',
    'jurosAtrasoPercentual', v_normalized -> 'jurosAtrasoPercentual',
    'multaAtraso', v_normalized -> 'multaAtraso',
    'menorParcela', v_normalized -> 'menorParcela',
    'encargos', jsonb_build_object(
      'descontoPontualidade', v_normalized -> 'descontoPontualidade',
      'jurosAtrasoPercentual', v_normalized -> 'jurosAtrasoPercentual',
      'multaAtraso', v_normalized -> 'multaAtraso'
    ),
    'cronograma', v_schedule,
    'mensagens', jsonb_build_object(
      'pagamentoAteVencimento', v_first_simulation ->> 'mensagemPontualidade',
      'pagamentoCom30DiasAtraso', v_first_simulation ->> 'mensagemAtraso30Dias',
      'parcelamento', case when (v_normalized ->> 'qtdParcelas')::integer = 1
        then 'Será criado 1 boleto local à vista.'
        else 'Serão criadas ' || (v_normalized ->> 'qtdParcelas') || ' parcelas locais.' end
    )
  );
end;
$function$;

revoke all on function internal_academic.render_nontechnical_condition_v2(
  public.turmas_plano_financeiro_unico, jsonb, integer, boolean
) from public, anon, authenticated, service_role;

create or replace function public.prever_condicao_matricula_plano_financeiro_unico_secure(
  p_turma_id uuid,
  p_aluno_id uuid,
  p_ajuste jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan public.turmas_plano_financeiro_unico%rowtype;
begin
  if p_turma_id is null or p_aluno_id is null then
    raise exception 'Turma e aluno são obrigatórios para a prévia.' using errcode = '22023';
  end if;
  perform internal_academic.assert_can_operate_nontechnical_plan_v2(p_turma_id, true);
  perform 1 from public.parceiros student
  where student.id = p_aluno_id and student.tipo = 'Aluno';
  if not found then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;
  select plan.* into v_plan
  from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id;
  if not found then
    raise exception 'Configure o plano financeiro desta turma antes da prévia.'
      using errcode = '22023';
  end if;
  return jsonb_build_object(
    'regra', internal_academic.render_nontechnical_condition_v2(
      v_plan, p_ajuste, null, true
    )
  );
end;
$function$;

revoke all on function public.prever_condicao_matricula_plano_financeiro_unico_secure(
  uuid, uuid, jsonb
) from public, anon;
grant execute on function public.prever_condicao_matricula_plano_financeiro_unico_secure(
  uuid, uuid, jsonb
) to authenticated, service_role;

commit;
