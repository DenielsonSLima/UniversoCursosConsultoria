-- Ensaio pós-migration: somente leitura, sem usuário real e sem chamadas bancárias.
-- Execute o arquivo inteiro na mesma conexão via MCP; sucesso termina em ROLLBACK.
-- Verifica catálogo, grants, pgcrypto, readiness e negação sem identidade.
-- Não substitui o ensaio sintético de save/discard nem login real da interface.
begin;
set transaction read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';

do $test$
declare
  v_signature text;
  v_function oid;
  v_table text;
  v_table_oid oid;
begin
  if encode(extensions.digest(convert_to('abc', 'UTF8'), 'sha256'), 'hex')
    <> 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' then
    raise exception 'SHA256 real não corresponde ao vetor conhecido.';
  end if;
  foreach v_signature in array array[
    'get_receivable_renegotiation_readiness_secure(uuid)',
    'list_receivable_renegotiation_proposals_secure(uuid,text,text,integer,integer)',
    'get_receivable_renegotiation_proposal_secure(uuid)',
    'list_receivable_renegotiation_candidate_groups_secure(uuid,text,integer,integer,date)',
    'list_receivable_renegotiation_candidate_items_secure(uuid,date)',
    'preview_receivable_renegotiation_secure(uuid[],jsonb,jsonb,date)',
    'save_receivable_renegotiation_proposal_secure(uuid,uuid[],text,jsonb,jsonb,date,boolean,text)',
    'discard_receivable_renegotiation_proposal_secure(uuid,uuid,bigint,text,text)'
  ] loop
    v_function := to_regprocedure('public.' || v_signature);
    if v_function is null then
      raise exception 'RPC ausente: %.', v_signature;
    end if;
    if has_function_privilege('anon', v_function, 'EXECUTE')
      or not has_function_privilege('authenticated', v_function, 'EXECUTE')
      or not has_function_privilege('service_role', v_function, 'EXECUTE')
      or not exists (select 1 from pg_proc where oid = v_function
        and prosecdef and proconfig @> array['search_path=""']) then
      raise exception 'Grant, SECURITY DEFINER ou search_path incorreto: %.', v_signature;
    end if;
  end loop;
  v_function := to_regprocedure('public.can_read_receivable_renegotiation_for_polo(uuid)');
  if v_function is null
    or not has_function_privilege('authenticated', v_function, 'EXECUTE')
    or has_function_privilege('anon', v_function, 'EXECUTE')
    or not exists (select 1 from pg_proc where oid = v_function
      and prosecdef and proconfig @> array['search_path=""'])
    or has_function_privilege('authenticated',
      'public.gestor_has_effective_financeiro_tab(text)', 'EXECUTE') then
    raise exception 'Predicado RLS inválido ou helper granular indevidamente exposto.';
  end if;
  foreach v_table in array array[
    'receivable_renegotiation_agreements', 'receivable_renegotiation_source_items',
    'receivable_renegotiation_events', 'receivable_renegotiation_requests'
  ] loop
    v_table_oid := to_regclass('public.' || v_table);
    if v_table_oid is null or not exists (
      select 1 from pg_class where oid = v_table_oid and relrowsecurity
    ) then
      raise exception 'Tabela ausente ou sem RLS: %.', v_table;
    end if;
    if has_table_privilege('anon', v_table_oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated', v_table_oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('service_role', v_table_oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
      or (v_table = 'receivable_renegotiation_requests'
        and has_table_privilege('authenticated', v_table_oid, 'SELECT')) then
      raise exception 'Acesso direto indevido: %.', v_table;
    end if;
  end loop;
  if has_schema_privilege('authenticated', 'internal_finance', 'USAGE')
    or has_schema_privilege('anon', 'internal_finance', 'USAGE') then
    raise exception 'Schema financeiro interno exposto.';
  end if;
end;
$test$;

-- Contexto técnico sem sub: não personifica operador/gestor existente.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $test$
declare
  v_readiness jsonb;
  v_capability text;
begin
  v_readiness := public.get_receivable_renegotiation_readiness_secure(null);
  if v_readiness -> 'applied' is distinct from 'true'::jsonb
    or v_readiness -> 'buildReady' is distinct from 'true'::jsonb
    or v_readiness -> 'rulesReady' is distinct from 'true'::jsonb
    or v_readiness -> 'proposalOnly' is distinct from 'true'::jsonb then
    raise exception 'Readiness incompleta após aplicação das migrations do lote.';
  end if;
  foreach v_capability in array array[
    'listProposals', 'viewProposal', 'listCandidateGroups', 'listCandidateItems',
    'previewProposal', 'saveProposal', 'discardProposal'
  ] loop
    if v_readiness -> 'capabilities' -> v_capability is distinct from 'true'::jsonb then
      raise exception 'Capacidade deveria estar disponível: %.', v_capability;
    end if;
  end loop;
  foreach v_capability in array array[
    'activateProposal', 'cancelSourceTitles', 'issueReplacementTitles'
  ] loop
    if v_readiness -> 'capabilities' -> v_capability is distinct from 'false'::jsonb then
      raise exception 'Capacidade fora da fase foi habilitada: %.', v_capability;
    end if;
  end loop;
end;
$test$;
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $test$
declare
  v_sql text;
  v_count bigint;
  v_table text;
begin
  foreach v_sql in array array[
    'select public.get_receivable_renegotiation_readiness_secure(null)',
    'select public.list_receivable_renegotiation_proposals_secure(null,null,null,1,20)',
    $$select public.get_receivable_renegotiation_proposal_secure(
      '00000000-0000-0000-0000-000000000099'::uuid)$$,
    'select public.list_receivable_renegotiation_candidate_groups_secure(null,null,1,20,null)',
    $$select public.list_receivable_renegotiation_candidate_items_secure(
      '00000000-0000-0000-0000-000000000099'::uuid,null)$$,
    $$select public.preview_receivable_renegotiation_secure(
      array['00000000-0000-0000-0000-000000000099'::uuid],'{}','{}',null)$$,
    $$select public.save_receivable_renegotiation_proposal_secure(
      '00000000-0000-0000-0000-000000000098'::uuid,
      array['00000000-0000-0000-0000-000000000099'::uuid],
      repeat('1',64),'{}','{}',null,true,'Ensaio sem identidade')$$,
    $$select public.discard_receivable_renegotiation_proposal_secure(
      '00000000-0000-0000-0000-000000000098'::uuid,
      '00000000-0000-0000-0000-000000000099'::uuid,1,repeat('1',64),
      'Ensaio sem identidade')$$
  ] loop
    begin
      execute v_sql;
      raise exception 'RPC aceitou contexto authenticated sem identidade: %.', v_sql;
    exception when insufficient_privilege then null;
    end;
  end loop;
  foreach v_table in array array[
    'receivable_renegotiation_agreements', 'receivable_renegotiation_source_items',
    'receivable_renegotiation_events'
  ] loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    if v_count <> 0 then
      raise exception 'RLS expôs linhas sem identidade: %.', v_table;
    end if;
  end loop;
  begin
    perform count(*) from public.receivable_renegotiation_requests;
    raise exception 'Registro de idempotência exposto diretamente.';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $test$
begin
  begin
    perform public.get_receivable_renegotiation_readiness_secure(null);
    raise exception 'RPC exposta a anon.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.receivable_renegotiation_agreements;
    raise exception 'Tabela exposta a anon.';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
select jsonb_build_object(
  'status', 'PASS', 'transactionReadOnly', current_setting('transaction_read_only'),
  'checks', jsonb_build_array('catalog', 'pgcrypto', 'grants', 'rls', 'readiness',
    'unauthenticated-rpc-denial'),
  'businessDataWritten', false, 'bankCalls', false
) as renegotiation_release_check;
rollback;
