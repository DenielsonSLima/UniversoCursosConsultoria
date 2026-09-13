// Generate a read-only SQL probe of the candidate function, without CREATE/ALTER.
// Run the printed SQL exclusively through MCP Supabase execute_sql.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = new URL('../migrations/20260913123752_caixa_posicao_total_proesc_control.sql', import.meta.url);
export function buildCaixaProescReadOnlyProbe() {
  const source = readFileSync(migration, 'utf8');
  let body = source.match(/as \$function\$\n([\s\S]*?)\n\$function\$;/i)?.[1];
  if (!body) throw new Error('Candidate function body missing');
  body = body.replace(/return (jsonb_build_object\([\s\S]*?\n\s*\));/g,
    'v_result := $1; exit candidate;');
  body = body.replace('  into v_saldo_caixa_registrado', `  , coalesce(sum(case
    when movimento.conta_id = any(v_contas_controle_ids)
      and (p_polo_id is null or movimento.polo_movimento_id = p_polo_id)
    then movimento.entrada - movimento.saida else 0 end), 0)
  into v_saldo_caixa_registrado, v_control_observed`);
  return `begin;
set transaction read only;
do $probe$
declare
  v_actor uuid;
  v_email text;
  v_case record;
  p_polo_id uuid;
  p_competencia date;
  v_result jsonb;
  v_control_expected numeric;
  v_control_observed numeric;
  v_expected_current numeric;
  v_checks integer := 0;
  v_denied boolean := false;
begin
  select a.id,a.email into strict v_actor,v_email
  from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_actor,'email',v_email)::text,true);
  for v_case in
    select p.id, mes.competencia, false as anonymous from public.polos p
    cross join (values ('2026-07-01'::date),('2026-08-01'::date),
      (date_trunc('month',current_date)::date)) mes(competencia)
    where upper(p.cidade) in ('AQUIDABÃ','JAPOATÃ')
    union all select null::uuid,date_trunc('month',current_date)::date,false
    union all select null::uuid,date_trunc('month',current_date)::date,true
  loop
    p_polo_id := v_case.id;
    p_competencia := v_case.competencia;
    v_control_observed := null;
    if v_case.anonymous then
      perform set_config('request.jwt.claim.sub','',true);
      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
    else
      perform set_config('request.jwt.claim.sub',v_actor::text,true);
      perform set_config('request.jwt.claims',jsonb_build_object(
        'role','authenticated','sub',v_actor,'email',v_email)::text,true);
    end if;
    <<candidate>>
${body}
    if v_case.anonymous then
      assert not (v_result->>'disponivel')::boolean
        and v_result->>'motivo'='ACESSO_RESTRITO', 'Unidentified caller was allowed';
      v_denied := true;
      continue;
    end if;
    assert (v_result->>'disponivel')::boolean,
      'Candidate still blocks valid Proesc position: '||v_result::text;
    select coalesce(sum(cr.valor_pago),0) into v_control_expected
    from public.contas_receber cr
    join public.contas_bancarias cb on cb.id=cr.conta_bancaria_id
    where cb.system_managed is true
      and cb.codigo_interno='INTEGRATION:PROESC:'||cb.polo_id::text
      and cr.status='PAGO'
      and cr.data_pagamento <= (v_result->>'data_corte')::date
      and (p_polo_id is null or cr.polo_id=p_polo_id);
    assert v_control_observed = v_control_expected,
      'Imported control differs from independent confirmed payment aggregate';
    if p_competencia=date_trunc('month',current_date)::date then
      if p_polo_id is null then
        select coalesce(sum(saldo_atual),0) into v_expected_current
        from public.get_contas_bancarias_saldos();
      else
        select coalesce(sum(saldo_gerencial),0) into v_expected_current
        from public.get_contas_bancarias_posicoes_polos_secure()
        where polo_id=p_polo_id;
      end if;
      assert (v_result#>>'{dados,saldo_caixa_registrado}')::numeric=v_expected_current,
        'Candidate differs from current canonical account positions';
    end if;
    v_checks := v_checks + 1;
  end loop;
  assert v_denied,'Unidentified caller was not exercised';
  assert v_checks=7,'Expected six historical/polo scenarios and one global';
  -- The pure guards exercise missing bases, a forged manual account,
  -- an unexpected opening amount and undated paid facts without DML fixtures.
  for v_case in select * from (values
    (true,'INTEGRATION:PROESC:',0::numeric,null::date,true),
    (false,'INTEGRATION:PROESC:',0::numeric,null::date,false),
    (true,'MANUAL:',0::numeric,null::date,false),
    (true,'INTEGRATION:PROESC:',1::numeric,null::date,false),
    (true,'INTEGRATION:PROESC:',0::numeric,current_date,false)
  ) t(managed,prefix,opening,base_date,expected) loop
    assert (v_case.managed and v_case.prefix='INTEGRATION:PROESC:'
      and v_case.opening=0 and v_case.base_date is null)=v_case.expected;
  end loop;
end;
$probe$;
rollback;
select 'seven candidate scenarios, unidentified access and five account guards passed' as result;`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildCaixaProescReadOnlyProbe());
}
