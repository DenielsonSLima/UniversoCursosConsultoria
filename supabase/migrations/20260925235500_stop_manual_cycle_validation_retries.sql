-- Business validation must terminate the request. A custom 40001 makes
-- PostgREST 14 retry the same transaction indefinitely (incident 2026-09-25).
-- PT422 preserves each rejection and returns HTTP 422 without a retry signal.
-- No receivable, authorization, bank identity, grant or eligibility is changed.
-- mark_technical_manual_cycle_banese_failure was already fixed by the applied
-- 20260925140341 migration (source 20260925140500); preserve its PT409 contract.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $migration$
declare
  v_target record;
  v_function regprocedure;
  v_definition text;
  v_expected text;
  v_metadata jsonb;
  v_message text;
  v_hits integer;
  v_pattern constant text :=
    'using[[:space:]]+errcode[[:space:]]*=[[:space:]]*''40001''';
begin
  for v_target in
    select * from (values
      (
        'public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)',
        array['Replay de autorização incompatível.']
      ),
      (
        'public.persist_technical_manual_cycle_banese_issuance(uuid,uuid,uuid,jsonb)',
        array[
          'Autorização ou fingerprint do recebível divergiu.',
          'Replay BolePix não corresponde à emissão persistida.',
          'CAS do recebível falhou após inserir a transação.'
        ]
      ),
      (
        'public.claim_technical_manual_cycle_banese_reconciliation(uuid,uuid,uuid)',
        array[
          'Autorização da conciliação divergiu.',
          'CAS da janela máxima de conciliação falhou.'
        ]
      ),
      (
        'internal_academic.guard_manual_technical_receivable_first_bank_claim()',
        array['A autorização não corresponde mais ao recebível.']
      )
    ) as targets(signature, messages)
  loop
    v_function := v_target.signature::regprocedure;
    select pg_catalog.pg_get_functiondef(v_function), to_jsonb(p) - 'prosrc'
      into strict v_definition, v_metadata
    from pg_catalog.pg_proc p where p.oid = v_function;

    select count(*) into v_hits
      from pg_catalog.regexp_matches(v_definition, v_pattern, 'gi');
    if v_hits <> cardinality(v_target.messages) then
      raise exception 'Unexpected retry-code count in %: %.',
        v_target.signature, v_hits using errcode = '23514';
    end if;
    foreach v_message in array v_target.messages loop
      -- Check the exact rejection associated with every code before patching.
      if not exists (
        select 1 from pg_catalog.regexp_matches(v_definition,
          'raise[[:space:]]+exception[[:space:]]+''([^'']+)''[[:space:]]+'
            || v_pattern, 'gi') as hit(parts)
        where hit.parts[1] = v_message
      ) then
        raise exception 'Unexpected validation boundary in %.',
          v_target.signature using errcode = '23514';
      end if;
    end loop;

    v_expected := pg_catalog.regexp_replace(v_definition, v_pattern,
      'using errcode = ''PT422''', 'gi');
    execute v_expected;

    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    if v_definition is distinct from v_expected
      or v_definition ~* v_pattern
      or v_metadata is distinct from (
        select to_jsonb(p) - 'prosrc' from pg_catalog.pg_proc p
        where p.oid = v_function
      ) then
      raise exception 'Unexpected function or permission change in %.',
        v_target.signature using errcode = '23514';
    end if;
  end loop;
end;
$migration$;
commit;
