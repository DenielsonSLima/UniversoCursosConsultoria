begin;

create function internal_academic.freeze_contract_individual_finance(
  p_matricula_id uuid, p_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_config public.matriculas_tecnicas_financeiro_config%rowtype;
  v_entry internal_academic.technical_transfer_entry_plans%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_runs jsonb := '[]';
  v_items jsonb;
  v_item jsonb;
  v_policy jsonb;
  v_rule jsonb;
  v_plan jsonb;
  v_entry_json jsonb;
  v_request_response jsonb;
  v_enrollment_mode text;
  v_first_due date;
  v_matches integer;
  v_modality text;
  v_waived boolean;
  v_has_config boolean;
begin
  select m.* into v_enrollment from public.matriculas m where m.id = p_matricula_id for share;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select t.* into strict v_class from public.turmas t where t.id = v_enrollment.turma_id for share;
  if public.can_manage_secretaria_document('contrato_aluno', v_class.polo_id) is not true then
    raise exception 'Acesso à emissão de contrato não autorizado.' using errcode = '42501';
  end if;
  select upper(c.modalidade) into v_modality from public.cursos c where c.id = v_class.curso_id;
  if v_modality not in ('TECNICO', 'TÉCNICO') then return p_snapshot; end if;

  -- Unproven imported or internal-transfer coverage must not become a fresh C1.
  if internal_academic.transfer_financial_origin(p_matricula_id) is not null
    or internal_academic.technical_imported_cycle_exists(p_matricula_id, 1)
    or internal_academic.technical_imported_cycle_exists(p_matricula_id, 2)
  then
    raise exception 'Contrato: há continuidade financeira ou cobertura importada. Revise e confirme o plano contratual individual completo antes da emissão.'
      using errcode = '55000';
  end if;
  select c.* into v_config from public.matriculas_tecnicas_financeiro_config c
    where c.matricula_id = p_matricula_id for share nowait;
  v_has_config := found;
  select e.* into v_entry from internal_academic.technical_transfer_entry_plans e
    where e.matricula_id = p_matricula_id for share nowait;
  if found then v_entry_json := to_jsonb(v_entry); end if;
  if not v_has_config and v_entry_json is null then
    raise exception 'Contrato: financeiro individual ainda não configurado. Revise a matrícula antes da emissão.' using errcode = '55000';
  end if;
  v_rule := internal_academic.technical_financial_effective_rule(p_matricula_id);
  v_first_due := coalesce(v_config.primeiro_vencimento,
    v_enrollment.data_primeiro_vencimento_financeiro, v_class.primeiro_vencimento_padrao);

  -- Existing ledger items corroborate reviewed cycles. They are never the
  -- sole source of the plan or its future installment count.
  -- Bank persistence locks receivable -> run, while financial corrections
  -- lock run -> receivable. Never wait while holding the opposite lock: fail
  -- this read-only projection and let the financial writer finish first.
  perform 1 from internal_academic.technical_manual_cycle_runs r
    where r.matricula_id = p_matricula_id order by r.cycle_number for share nowait;
  perform 1 from public.contas_receber r where r.matricula_id = p_matricula_id order by r.id for share nowait;
  if exists(select 1 from public.contas_receber r where r.matricula_id = p_matricula_id
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id and r.id = any(run.receivable_ids))) then
    raise exception 'Contrato: existem cobranças fora dos ciclos revisados. Confirme o plano individual completo antes de emitir.' using errcode = '55000';
  end if;

  for v_run in select r.* from internal_academic.technical_manual_cycle_runs r
    where r.matricula_id = p_matricula_id order by r.cycle_number loop
    v_items := '[]';
    v_enrollment_mode := null;
    select r.response into v_request_response from internal_academic.technical_financial_requests r
      where r.request_id = v_run.request_id and r.operation = 'GERACAO_CICLO_TECNICO_MANUAL'
      for share nowait;
    if found and v_request_response #>> '{ciclo,numero}' = v_run.cycle_number::text
      and v_request_response #>> '{ciclo,quantidadeItens}' = v_run.item_count::text then
      v_enrollment_mode := v_request_response #>> '{ciclo,modoMatricula}';
    end if;
    if v_run.state = 'LOCAL_CREATED' and jsonb_typeof(v_run.reviewed_items) = 'array' then
      if cardinality(v_run.receivable_ids) is distinct from v_run.item_count then
        raise exception 'Contrato: ciclo com evidência incompleta de cobranças.' using errcode = '55000';
      end if;
      for v_item in select i from jsonb_array_elements(v_run.reviewed_items) i loop
        select count(*) into v_matches from public.contas_receber r
          where r.id = any(v_run.receivable_ids) and r.origem_cronograma_id = v_item ->> 'chave';
        if v_matches <> 1 then
          raise exception 'Contrato: item revisado sem cobrança correspondente única.' using errcode = '55000';
        end if;
        select r.* into strict v_receivable from public.contas_receber r
          where r.id = any(v_run.receivable_ids) and r.origem_cronograma_id = v_item ->> 'chave';
        perform internal_academic.assert_manual_cycle_reviewed_receivable(v_receivable);
        if v_receivable.matricula_id is distinct from p_matricula_id
          or v_receivable.turma_id is distinct from v_class.id then
          raise exception 'Contrato: evidência de outra matrícula.' using errcode = '55000';
        end if;
        v_waived := internal_financial_correction.local_waiver_complete(v_receivable);
        if upper(coalesce(v_receivable.status, '')) = 'CANCELADO' then
          if not coalesce(v_waived, false) then
            raise exception 'Contrato: ciclo contém cancelamento sem plano substituto confirmado. Revise as condições individuais.' using errcode = '55000';
          end if;
          v_items := v_items || jsonb_build_array(v_item || jsonb_build_object('dispensaComprovada', true));
          continue;
        end if;
        v_policy := v_receivable.regra_financeira_tecnica_snapshot;
        if jsonb_typeof(v_policy) is distinct from 'object'
          or not (v_policy ?& array['aplicarDesconto', 'aplicarMultaJuros',
            'descontoPontualidade', 'jurosAtrasoPercentual', 'multaAtrasoPercentual'])
        then
          raise exception 'Contrato: cobrança sem snapshot completo de encargos.' using errcode = '55000';
        end if;
        -- Canonically corrected dates/terms supersede the original reviewed
        -- copy only after its existing integrity guard accepts the ledger row.
        v_item := v_item || jsonb_build_object('valor', v_receivable.valor,
          'vencimento', v_receivable.data_vencimento,
          'detalhesBoleto', jsonb_build_object(
            'desconto', case when (v_policy ->> 'aplicarDesconto')::boolean then
              jsonb_build_object('valor', v_policy -> 'descontoPontualidade') else null end,
            'juros', case when (v_policy ->> 'aplicarMultaJuros')::boolean then
              jsonb_build_object('percentualMes', v_policy -> 'jurosAtrasoPercentual') else null end,
            'multa', case when (v_policy ->> 'aplicarMultaJuros')::boolean then
              jsonb_build_object('percentual', v_policy -> 'multaAtrasoPercentual') else null end));
        v_items := v_items || jsonb_build_array(v_item);
      end loop;
    else
      -- The pure projection produces the actionable failure for unfinished or
      -- historical runs without reviewed evidence; no substitute is invented.
      v_items := v_run.reviewed_items;
    end if;
    v_runs := v_runs || jsonb_build_array(jsonb_build_object(
      'cycle_number', v_run.cycle_number, 'state', v_run.state,
      'modoMatricula', v_enrollment_mode,
      'item_count', v_run.item_count, 'expected_installment_count', v_run.expected_installment_count,
      'reviewed_items', v_items));
  end loop;
  v_plan := internal_academic.contract_financial_plan(v_rule, v_entry_json, v_runs, v_first_due);
  return jsonb_set(p_snapshot, '{financeiro}', internal_academic.contract_financial_summary(v_plan), true);
exception when lock_not_available then
  raise exception 'O financeiro desta matrícula está sendo atualizado. Aguarde a conclusão e tente emitir o contrato novamente.'
    using errcode = '55P03';
end;
$function$;

revoke all on function internal_academic.freeze_contract_individual_finance(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Only V4 templates have the complete plan and conditions tokens. Installing
-- infrastructure must not replace finances under an approved legacy model.
-- Authorization, replay and the immutability trigger stay unchanged.
do $wire$
declare
  v_definition text;
  v_boundary text := E'    v_rendered := public.renderizar_contrato_aluno_documento(\n';
begin
  v_definition := pg_get_functiondef('public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid)'::regprocedure);
  if position('internal_academic.freeze_contract_individual_finance' in v_definition) > 0 then
    raise exception 'Contract financial snapshot wiring already present; inspect migration history.';
  end if;
  if length(v_definition) - length(replace(v_definition, v_boundary, '')) <> length(v_boundary) then
    raise exception 'Contract emission boundary changed; financial snapshot migration not applied.';
  end if;
  execute replace(v_definition, v_boundary,
    E'    if v_model.conteudo ->> ''presentationVersion'' = ''CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL'' then\n'
    || E'      v_snapshot := internal_academic.freeze_contract_individual_finance(v_target.matricula_id, v_snapshot);\n'
    || E'    end if;\n\n'
    || v_boundary);
end;
$wire$;
revoke all on function public.preparar_emissao_contrato_aluno_base_secure(uuid, text, uuid[], text, uuid)
  from public, anon, authenticated, service_role;
commit;
