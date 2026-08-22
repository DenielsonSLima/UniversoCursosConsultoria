begin;

create or replace function internal_academic.normalize_nontechnical_plan_preview_v2(
  p_plan jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_first_due_text text;
  v_first_due date;
  v_input jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'O plano financeiro deve ser informado.' using errcode = '22023';
  end if;
  v_first_due_text := p_plan ->> 'primeiroVencimento';
  if coalesce(v_first_due_text, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'O primeiro vencimento deve estar no formato AAAA-MM-DD.'
      using errcode = '22023';
  end if;
  begin
    v_first_due := v_first_due_text::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception 'O primeiro vencimento é inválido.' using errcode = '22023';
  end;
  v_input := (p_plan - 'diaVencimento') || jsonb_build_object(
    'diaVencimento', extract(day from v_first_due)::integer
  );
  return internal_academic.validate_nontechnical_single_plan_input(v_input);
end;
$function$;

revoke all on function internal_academic.normalize_nontechnical_plan_preview_v2(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.prever_plano_financeiro_unico_turma_secure(
  p_curso_id uuid,
  p_polo_id uuid,
  p_plano jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_rule jsonb;
  v_fingerprint text;
begin
  if p_curso_id is null or p_polo_id is null then
    raise exception 'Curso e polo são obrigatórios para a prévia.' using errcode = '22023';
  end if;
  perform internal_academic.assert_can_preview_nontechnical_plan_v2(p_polo_id);
  perform 1 from public.polos polo where polo.id = p_polo_id;
  if not found then raise exception 'Polo não encontrado.' using errcode = '22023'; end if;
  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.cursos course where course.id = p_curso_id;
  if not found or v_modalidade not in ('LIVRE', 'ESPECIALIZACAO') then
    raise exception 'O plano único é exclusivo de Cursos Livres e Especializações.'
      using errcode = '22023';
  end if;
  v_rule := internal_academic.normalize_nontechnical_plan_preview_v2(p_plano);
  v_fingerprint := internal_academic.nontechnical_single_plan_fingerprint(v_rule);
  return jsonb_build_object(
    'regra', v_rule || jsonb_build_object(
      'revisao', 1,
      'fingerprint', v_fingerprint,
      'cronograma', internal_academic.build_nontechnical_single_plan_schedule(
        v_rule, 1, v_fingerprint
      )
    )
  );
end;
$function$;

revoke all on function public.prever_plano_financeiro_unico_turma_secure(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.prever_plano_financeiro_unico_turma_secure(uuid, uuid, jsonb)
  to authenticated, service_role;

create or replace function internal_academic.normalize_nontechnical_adjustment_v2(
  p_plan public.turmas_plano_financeiro_unico,
  p_adjustment jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_input jsonb := coalesce(p_adjustment, '{"modo":"HERDAR"}'::jsonb);
  v_unknown text;
  v_mode text;
  v_count integer;
  v_first_due_text text;
  v_first_due date;
  v_discount_type text;
  v_commercial_discount numeric;
  v_on_time_discount numeric;
  v_interest numeric;
  v_fine numeric;
  v_effective_total numeric;
  v_effective_cents bigint;
  v_min_installment numeric;
begin
  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'A condição da matrícula deve ser um objeto.' using errcode = '22023';
  end if;
  select key into v_unknown from jsonb_object_keys(v_input) key
  where key not in (
    'modo', 'qtdParcelas', 'primeiroVencimento',
    'descontoComercialTipo', 'descontoComercialValor',
    'descontoPontualidade', 'jurosAtrasoPercentual', 'multaAtraso'
  ) limit 1;
  if v_unknown is not null then
    raise exception 'Campo de condição não suportado: %.', v_unknown using errcode = '22023';
  end if;
  v_mode := upper(pg_catalog.btrim(coalesce(v_input ->> 'modo', 'HERDAR')));
  if v_mode not in ('HERDAR', 'PERSONALIZAR') then
    raise exception 'Modo da condição deve ser HERDAR ou PERSONALIZAR.' using errcode = '22023';
  end if;

  if v_mode = 'HERDAR' then
    if exists (
      select 1 from jsonb_each(v_input) item
      where item.key <> 'modo' and item.value <> 'null'::jsonb
    ) then
      raise exception 'O modo HERDAR não aceita campos individuais.' using errcode = '22023';
    end if;
    v_count := p_plan.qtd_parcelas;
    v_first_due := p_plan.primeiro_vencimento;
    v_discount_type := 'NENHUM';
    v_commercial_discount := 0;
    v_on_time_discount := p_plan.desconto_pontualidade;
    v_interest := p_plan.juros_atraso_percentual;
    v_fine := p_plan.multa_atraso;
  else
    if not (
      v_input ? 'qtdParcelas' and v_input ? 'primeiroVencimento'
      and v_input ? 'descontoComercialTipo'
      and v_input ? 'descontoComercialValor'
      and v_input ? 'descontoPontualidade'
      and v_input ? 'jurosAtrasoPercentual'
      and v_input ? 'multaAtraso'
    ) then
      raise exception 'A condição personalizada está incompleta.' using errcode = '22023';
    end if;
    v_first_due_text := v_input ->> 'primeiroVencimento';
    if coalesce(v_first_due_text, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'O primeiro vencimento individual deve usar AAAA-MM-DD.'
        using errcode = '22023';
    end if;
    begin
      v_count := (v_input ->> 'qtdParcelas')::integer;
      v_first_due := v_first_due_text::date;
      v_commercial_discount := round((v_input ->> 'descontoComercialValor')::numeric, 2);
      v_on_time_discount := round((v_input ->> 'descontoPontualidade')::numeric, 2);
      v_interest := round((v_input ->> 'jurosAtrasoPercentual')::numeric, 4);
      v_fine := round((v_input ->> 'multaAtraso')::numeric, 2);
    exception when invalid_text_representation or numeric_value_out_of_range
      or datetime_field_overflow or invalid_datetime_format then
      raise exception 'A condição personalizada contém valor inválido.' using errcode = '22023';
    end;
    v_discount_type := upper(pg_catalog.btrim(coalesce(
      v_input ->> 'descontoComercialTipo', ''
    )));
    if v_count is null or v_count not between 1 and 60
      or v_first_due is null or not pg_catalog.isfinite(v_first_due)
      or v_discount_type is null
      or v_discount_type not in ('NENHUM', 'A_VISTA', 'NEGOCIADO')
      or v_commercial_discount is null or v_commercial_discount < 0
      or v_on_time_discount is null or v_on_time_discount < 0
      or v_interest is null or v_interest not between 0 and 100
      or v_fine is null or v_fine < 0
    then
      raise exception 'Revise parcelas, vencimento, desconto e encargos individuais.'
        using errcode = '22023';
    end if;
    if (v_discount_type = 'NENHUM' and v_commercial_discount <> 0)
      or (v_discount_type = 'A_VISTA' and (v_count <> 1 or v_commercial_discount <= 0))
      or (v_discount_type = 'NEGOCIADO' and v_commercial_discount <= 0)
    then
      raise exception 'O tipo do desconto comercial não corresponde ao valor ou parcelamento.'
        using errcode = '22023';
    end if;
  end if;

  v_effective_total := round(p_plan.valor_total - v_commercial_discount, 2);
  v_effective_cents := round(v_effective_total * 100)::bigint;
  if v_effective_total is null or v_effective_total <= 0
    or v_effective_cents is null or v_effective_cents < v_count
  then
    raise exception 'O total efetivo deve garantir ao menos R$ 0,01 por parcela.'
      using errcode = '22023';
  end if;
  if v_commercial_discount >= p_plan.valor_total then
    raise exception 'O desconto comercial deve ser menor que o valor nominal.'
      using errcode = '22023';
  end if;
  v_min_installment := (v_effective_cents / v_count)::numeric / 100;
  if v_on_time_discount >= v_min_installment and v_on_time_discount > 0 then
    raise exception 'O desconto por pontualidade deve ser menor que a menor parcela.'
      using errcode = '22023';
  end if;
  if v_mode = 'PERSONALIZAR'
    and v_count = p_plan.qtd_parcelas
    and v_first_due = p_plan.primeiro_vencimento
    and v_discount_type = 'NENHUM'
    and v_commercial_discount = 0
    and v_on_time_discount = p_plan.desconto_pontualidade
    and v_interest = p_plan.juros_atraso_percentual
    and v_fine = p_plan.multa_atraso
  then
    raise exception 'A condição personalizada deve alterar ao menos um campo da turma.'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'modo', v_mode,
    'valorTotalNominal', p_plan.valor_total,
    'descontoComercialTipo', v_discount_type,
    'descontoComercialValor', v_commercial_discount,
    'valorTotalEfetivo', v_effective_total,
    'qtdParcelas', v_count,
    'primeiroVencimento', v_first_due,
    'diaVencimento', extract(day from v_first_due)::integer,
    'descontoPontualidade', v_on_time_discount,
    'jurosAtrasoPercentual', v_interest,
    'multaAtraso', v_fine,
    'menorParcela', v_min_installment
  );
end;
$function$;

revoke all on function internal_academic.normalize_nontechnical_adjustment_v2(
  public.turmas_plano_financeiro_unico, jsonb
) from public, anon, authenticated, service_role;

create or replace function internal_academic.nontechnical_adjustment_fingerprint_v2(
  p_normalized jsonb
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('versao', 2, 'condicao', p_normalized)::text,
    'UTF8'
  ), 'sha256'), 'hex');
$function$;

create or replace function internal_academic.nontechnical_effective_fingerprint_v2(
  p_plan_revision integer,
  p_plan_fingerprint text,
  p_normalized jsonb
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'versao', 2,
      'planoTurmaRevisao', p_plan_revision,
      'planoTurmaFingerprint', p_plan_fingerprint,
      'condicao', p_normalized
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
$function$;

revoke all on function internal_academic.nontechnical_adjustment_fingerprint_v2(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function internal_academic.nontechnical_effective_fingerprint_v2(integer, text, jsonb)
  from public, anon, authenticated, service_role;

commit;
