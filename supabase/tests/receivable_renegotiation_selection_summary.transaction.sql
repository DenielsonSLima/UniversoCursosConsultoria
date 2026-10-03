-- Harness sintético apenas. Não executar fixtures em produção.
begin;
update public.contas_receber set regra_financeira_tecnica_snapshot =
  regra_financeira_tecnica_snapshot || '{"aplicarDesconto":true}'::jsonb;

do $test$
declare
  v_summary jsonb;
  v_terms jsonb;
  v_preview jsonb;
begin
  v_summary := public.summarize_receivable_renegotiation_selection_secure(array[
    '00000000-0000-0000-0000-000000000403'::uuid,
    '00000000-0000-0000-0000-000000000401'::uuid,
    '00000000-0000-0000-0000-000000000403'::uuid
  ], null);
  assert v_summary ->> 'version' = '1' and v_summary ->> 'count' = '2';
  assert v_summary -> 'receivableIds' = '["00000000-0000-0000-0000-000000000401","00000000-0000-0000-0000-000000000403"]'::jsonb;
  assert v_summary #>> '{discount,status}' = 'KNOWN';
  assert v_summary #>> '{discount,appliedToProposal}' = 'false';
  assert (v_summary #>> '{totals,principalCents}')::bigint = 40000;
  assert (v_summary #>> '{totals,punctualDiscountCents}')::bigint = 500;
  assert (v_summary #>> '{totals,discountedPrincipalCents}')::bigint = 39500;
  assert (v_summary #>> '{totals,interestCents}')::bigint = 100;
  assert (v_summary #>> '{totals,penaltyCents}')::bigint = 1000;
  assert (v_summary #>> '{totals,grossDebtCents}')::bigint = 41100;
  assert (v_summary #>> '{totals,payableCents}')::bigint = 40600;
  v_terms := jsonb_build_object('commercialDiscountCents', 0, 'downPaymentCents', 0,
    'installmentCount', 1, 'firstDueDate', (now() at time zone 'America/Maceio')::date + 1);
  v_preview := public.preview_receivable_renegotiation_secure(array[
    '00000000-0000-0000-0000-000000000401'::uuid,
    '00000000-0000-0000-0000-000000000403'::uuid
  ], v_terms, '{}'::jsonb, null);
  assert v_preview #>> '{totals,negotiatedCents}' = v_summary #>> '{totals,grossDebtCents}',
    'Resumo não pode aplicar automaticamente desconto à proposta';
end;
$test$;

update public.contas_receber set regra_financeira_tecnica_snapshot =
  regra_financeira_tecnica_snapshot || '{"aplicarDesconto":false}'::jsonb
where id = '00000000-0000-0000-0000-000000000403';
do $test$
declare v_summary jsonb;
begin
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000403'::uuid], null);
  assert v_summary #>> '{totals,punctualDiscountCents}' = '0';
  assert v_summary #>> '{totals,discountedPrincipalCents}' = '30000';
  assert v_summary #>> '{discount,status}' = 'KNOWN';
end;
$test$;
update public.contas_receber set regra_financeira_tecnica_snapshot =
  regra_financeira_tecnica_snapshot - 'aplicarDesconto'
where id = '00000000-0000-0000-0000-000000000403';
do $test$
declare v_summary jsonb;
begin
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000403'::uuid], null);
  assert v_summary #>> '{discount,status}' = 'UNAVAILABLE';
  assert v_summary #>> '{totals,punctualDiscountCents}' is null;
  assert v_summary #>> '{totals,principalCents}' = '30000';
end;
$test$;

-- Stub apenas da identidade da transação: os termos e a carência são reais.
create or replace function internal_academic.receivable_operation_capabilities(
  p_receivable public.contas_receber
) returns jsonb language sql stable as $stub$
  select jsonb_build_object('sourceSystem', case
    when p_receivable.gateway_provider = 'banese_card' then 'BANESE' else 'LOCAL' end,
    'canCancel', p_receivable.gateway_provider = 'banese_card');
$stub$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.contas_receber set gateway_provider = 'banese_card',
  gateway_payment_method = 'BOLETO', gateway_boleto_nosso_numero = '000000001',
  data_vencimento = '2026-09-06', gateway_financial_terms_confirmed_at = now(),
  gateway_financial_terms = '{"nominalAmount":100,"dueDate":"2026-09-06", "discount":{"type":"percentage","value":5,"validUntil":"2026-09-06"}}'::jsonb
where id = '00000000-0000-0000-0000-000000000401';
do $test$
declare v_summary jsonb;
begin
  -- Domingo + feriado nacional: desconto ainda comprovado na terça 08/09.
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000401'::uuid], '2026-09-08');
  assert v_summary #>> '{discount,status}' = 'KNOWN';
  assert v_summary #>> '{totals,punctualDiscountCents}' = '500';
  assert v_summary #>> '{totals,discountedPrincipalCents}' = '9500';
  assert (v_summary #>> '{totals,interestCents}')::int > 0;
  assert v_summary ->> 'payableStatus' = 'UNAVAILABLE';
  assert v_summary #>> '{totals,payableCents}' is null,
    'Carência bancária não pode ser misturada com encargos corridos da prévia';
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000401'::uuid], '2026-09-09');
  assert v_summary #>> '{totals,punctualDiscountCents}' = '0';
  assert v_summary ->> 'payableStatus' = 'KNOWN';
end;
$test$;

update public.contas_receber set gateway_financial_terms_confirmed_at = null
where id = '00000000-0000-0000-0000-000000000401';
do $test$
declare v_summary jsonb;
begin
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000401'::uuid], '2026-09-06');
  assert v_summary #>> '{discount,status}' = 'UNAVAILABLE';
  assert v_summary #>> '{totals,punctualDiscountCents}' is null;
end;
$test$;
update public.contas_receber set data_vencimento = '2027-01-02',
  gateway_financial_terms_confirmed_at = now(), gateway_financial_terms =
    '{"nominalAmount":100,"dueDate":"2027-01-02","discount":{"type":"fixed","value":5,"validUntil":"2027-01-02"}}'::jsonb
where id = '00000000-0000-0000-0000-000000000401';
do $test$
declare v_summary jsonb;
begin
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000401'::uuid], '2027-01-02');
  assert v_summary #>> '{discount,status}' = 'KNOWN';
  assert v_summary #>> '{totals,punctualDiscountCents}' = '500';
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000401'::uuid], '2027-01-04');
  assert v_summary #>> '{discount,status}' = 'UNAVAILABLE';
  assert v_summary #>> '{totals,discountedPrincipalCents}' is null;
end;
$test$;
update public.contas_receber set gateway_financial_terms =
  jsonb_set(gateway_financial_terms, '{discount}', 'null'::jsonb)
where id = '00000000-0000-0000-0000-000000000401';
do $test$
declare v_summary jsonb;
begin
  v_summary := public.summarize_receivable_renegotiation_selection_secure(
    array['00000000-0000-0000-0000-000000000401'::uuid], '2027-01-02');
  assert v_summary #>> '{discount,status}' = 'KNOWN';
  assert v_summary #>> '{totals,punctualDiscountCents}' = '0',
    'Desconto removido no banco não pode renascer do snapshot técnico';
end;
$test$;

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000500"}', true);
insert into public.matriculas(id, aluno_id, turma_id, status) values
  ('00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000200', 'ATIVA');
update public.contas_receber set matricula_id = '00000000-0000-0000-0000-000000000301'
where id = '00000000-0000-0000-0000-000000000402';
set local role authenticated;
do $test$
begin
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(array[
      '00000000-0000-0000-0000-000000000401'::uuid,
      '00000000-0000-0000-0000-000000000402'::uuid], null);
    raise exception 'Matrículas diferentes aceitas';
  exception when check_violation then null; end;
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(
      array['00000000-0000-0000-0000-000000000404'::uuid], null);
    raise exception 'Parcial aceita';
  exception when check_violation then null; end;
  begin
    perform public.summarize_receivable_renegotiation_selection_secure('{}'::uuid[], null);
    raise exception 'Seleção vazia aceita';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(
      array_fill('00000000-0000-0000-0000-000000000401'::uuid, array[121]), null);
    raise exception 'Seleção acima do teto aceita';
  exception when invalid_parameter_value then null; end;
end;
$test$;
reset role;
insert into public.parceiros(id, nome, polo_id, status) values
  ('00000000-0000-0000-0000-000000000101', 'Outro aluno sintético',
    '00000000-0000-0000-0000-000000000010', 'ATIVO');
update public.matriculas set aluno_id = '00000000-0000-0000-0000-000000000101'
where id = '00000000-0000-0000-0000-000000000301';
update public.contas_receber set cliente_id = '00000000-0000-0000-0000-000000000101'
where id = '00000000-0000-0000-0000-000000000402';
do $test$
begin
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(array[
      '00000000-0000-0000-0000-000000000401'::uuid,
      '00000000-0000-0000-0000-000000000402'::uuid], null);
    raise exception 'Alunos diferentes aceitos';
  exception when check_violation then null; end;
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(array[
      '00000000-0000-0000-0000-000000000401'::uuid,
      '00000000-0000-0000-0000-000000000499'::uuid], null);
    raise exception 'Identificador inexistente aceito';
  exception when check_violation then null; end;
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(array[null]::uuid[], null);
    raise exception 'Identificador nulo aceito';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(
      array['00000000-0000-0000-0000-000000000403'::uuid],
      (now() at time zone 'America/Maceio')::date - 1);
    raise exception 'Cliente autenticado escolheu data histórica';
  exception when invalid_parameter_value then null; end;
end;
$test$;
insert into public.polos(id, company_id, nome, status) values
  ('00000000-0000-0000-0000-000000000099',
    '00000000-0000-0000-0000-000000000001', 'Polo restrito sintético', 'ATIVO');
update public.contas_receber set polo_id = '00000000-0000-0000-0000-000000000099'
where id = '00000000-0000-0000-0000-000000000403';
set local role authenticated;
do $test$
begin
  begin
    perform public.summarize_receivable_renegotiation_selection_secure(
      array['00000000-0000-0000-0000-000000000403'::uuid], null);
    raise exception 'Polo fora do escopo aceito';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.summarize_receivable_renegotiation_selection_secure('{}'::uuid[], null);
    raise exception 'Sem identidade acessou RPC';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
set local role anon;
do $test$
begin
  begin
    perform public.summarize_receivable_renegotiation_selection_secure('{}'::uuid[], null);
    raise exception 'Anon acessou RPC';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
rollback;
