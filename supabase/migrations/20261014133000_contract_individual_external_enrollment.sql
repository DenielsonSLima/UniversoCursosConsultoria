begin;

-- Administrative evidence for contract composition only. This is not a cash
-- settlement or a receivable, and never creates a boleto or changes a balance.
create table internal_academic.contract_external_enrollment_receipts (
  matricula_id uuid primary key references public.matriculas(id),
  turma_id uuid not null references public.turmas(id),
  amount numeric(12,2) not null check (amount > 0),
  first_cycle_request_id uuid not null,
  source_note text not null check (length(trim(source_note)) between 20 and 2000),
  operation_reference text not null check (length(trim(operation_reference)) between 10 and 200),
  payment_date date,
  recorded_at timestamptz not null default now(),
  recorded_by_database_role text not null default current_user
);
alter table internal_academic.contract_external_enrollment_receipts enable row level security;
revoke all on internal_academic.contract_external_enrollment_receipts
  from public, anon, authenticated, service_role;
comment on table internal_academic.contract_external_enrollment_receipts is
  'Declared historical enrollment payment outside the system, scoped to one enrollment and original omitted C1. Contract evidence only; no cash reconciliation.';

create function internal_academic.contract_summary_with_external_enrollment(
  p_matricula_id uuid, p_plan jsonb
)
returns jsonb language plpgsql set search_path = '' as $function$
declare
  v_receipt internal_academic.contract_external_enrollment_receipts%rowtype;
  v_base jsonb;
  v_result jsonb;
  v_item jsonb;
  v_description text;
begin
  v_base := internal_academic.contract_financial_summary(p_plan);
  select e.* into v_receipt from internal_academic.contract_external_enrollment_receipts e
    where e.matricula_id = p_matricula_id for share nowait;
  if not found then return v_base; end if;

  -- A regenerated or changed cycle must be reconciled before reusing evidence.
  if not exists (
    select 1 from public.matriculas m
    join internal_academic.technical_manual_cycle_runs r on r.matricula_id = m.id
    join internal_academic.technical_financial_requests q on q.request_id = r.request_id
      and q.operation = 'GERACAO_CICLO_TECNICO_MANUAL'
    where m.id = p_matricula_id and m.turma_id = v_receipt.turma_id
      and r.turma_id = m.turma_id and r.cycle_number = 1 and r.state = 'LOCAL_CREATED'
      and r.request_id = v_receipt.first_cycle_request_id
      and q.response #>> '{ciclo,numero}' = '1'
      and q.response #>> '{ciclo,quantidadeItens}' = r.item_count::text
      and (
        (q.response #>> '{ciclo,modoMatricula}' = 'OMITIR'
          and not exists (select 1 from jsonb_array_elements(r.reviewed_items) i where i->>'tipo' = 'MATRICULA'))
        or (q.response #>> '{ciclo,modoMatricula}' = 'REGISTRO_SEM_BOLETO'
          and (select count(*) from jsonb_array_elements(r.reviewed_items) i where i->>'tipo' = 'MATRICULA') = 1
          and exists (select 1 from public.contas_receber c
            where c.id = any(r.receivable_ids) and c.matricula_id = m.id and c.turma_id = m.turma_id
              and c.origem_cronograma_id = 'matricula' and c.valor = v_receipt.amount
              and internal_academic.contract_local_waiver_complete(c)))
      )
  ) or (v_base->>'quantidadeMatriculas')::integer <> 0 then
    raise exception 'Contrato: matrícula recebida externamente conflita com o ciclo atual. Revise o registro antes de emitir.'
      using errcode = '55000';
  end if;

  v_item := jsonb_build_object('tipo', 'MATRICULA', 'cicloNumero', 1, 'ordem', 0,
    'valor', v_receipt.amount, 'vencimento', null,
    'descontoPontualidade', 0, 'jurosAtrasoPercentual', 0, 'multaAtrasoPercentual', 0,
    'origem', 'RECEBIMENTO_EXTERNO_DECLARADO', 'situacao', 'PAGO_FORA_DO_SISTEMA',
    'dataPagamento', v_receipt.payment_date, 'registradoEm', v_receipt.recorded_at,
    'referenciaRegistro', v_receipt.operation_reference, 'incluiSaldoACobrar', false);
  v_result := internal_academic.contract_financial_summary(jsonb_set(p_plan, '{itens}',
    jsonb_build_array(v_item) || (p_plan->'itens')));
  v_description := 'ciclo 1: matrícula de ' || public.formatar_valor_brl_documento(v_receipt.amount)
    || ', já recebida presencialmente'
    || case when v_receipt.payment_date is null then '' else ' em ' || to_char(v_receipt.payment_date, 'DD/MM/YYYY') end
    || ', conforme registro administrativo; incluída no valor total do contrato, sem nova cobrança';
  -- The paid item has no future due date or late charges. Other terms remain
  -- byte-for-byte from the canonical plan, including individualized discounts.
  return v_result || jsonb_build_object(
    'planoPagamentoExibicao', v_description || '; ' || (v_base->>'planoPagamentoExibicao'),
    'condicoesExibicao', v_base->>'condicoesExibicao',
    'vencimentosPendentesConfirmacao', v_base->'vencimentosPendentesConfirmacao',
    'valorMatriculaRecebidoExternamente', v_receipt.amount,
    'recebimentoExternoMatricula', v_item);
end;
$function$;
revoke all on function internal_academic.contract_summary_with_external_enrollment(uuid,jsonb)
  from public, anon, authenticated, service_role;

-- Preserve the existing authorization, ledger proof and NOWAIT lock guards.
do $wire$
declare
  v_definition text;
  v_old text := 'internal_academic.contract_financial_summary(v_plan)';
begin
  v_definition := pg_get_functiondef('internal_academic.freeze_contract_individual_finance(uuid,jsonb)'::regprocedure);
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Contract financial projection changed; external enrollment hook not applied.';
  end if;
  v_definition := replace(v_definition, v_old,
    'internal_academic.contract_summary_with_external_enrollment(p_matricula_id, v_plan)');
  if position('internal_financial_correction.local_waiver_complete(v_receivable)' in v_definition) = 0 then
    raise exception 'Contract waiver projection changed; hook not applied.';
  end if;
  execute replace(v_definition, 'internal_financial_correction.local_waiver_complete(v_receivable)',
    'internal_academic.contract_local_waiver_complete(v_receivable)');
end;
$wire$;
revoke all on function internal_academic.freeze_contract_individual_finance(uuid,jsonb)
  from public, anon, authenticated, service_role;
commit;
