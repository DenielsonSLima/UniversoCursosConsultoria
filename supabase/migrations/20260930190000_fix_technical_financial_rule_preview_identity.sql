begin;

do $guard$
declare
  v_oid pg_catalog.oid := 'public.prever_regra_financeira_turma_tecnica_secure(uuid,jsonb)'::pg_catalog.regprocedure;
  v_definition text;
  v_security_definer boolean;
  v_volatility "char";
  v_parallel "char";
  v_config text[];
  v_owner text;
  v_acl text[];
begin
  select p.prosecdef, p.provolatile, p.proparallel, p.proconfig,
      pg_catalog.pg_get_userbyid(p.proowner), pg_catalog.pg_get_functiondef(p.oid)
    into v_security_definer, v_volatility, v_parallel, v_config,
      v_owner, v_definition
  from pg_catalog.pg_proc p where p.oid = v_oid;
  select pg_catalog.array_agg(
      (case when acl.grantee = 0 then 'PUBLIC'
        else pg_catalog.pg_get_userbyid(acl.grantee) end)
        || ':' || acl.privilege_type || ':' || acl.is_grantable::text
      order by case when acl.grantee = 0 then 'PUBLIC'
        else pg_catalog.pg_get_userbyid(acl.grantee) end)
    into v_acl
  from pg_catalog.pg_proc p
  cross join lateral pg_catalog.aclexplode(p.proacl) acl
  where p.oid = v_oid;

  if pg_catalog.md5(v_definition) <> 'c754225812d2d924beecef825961b710'
    or position(
      'internal_academic.validate_technical_financial_rule_input' in
      v_definition) = 0
    or position(
      'internal_academic.technical_financial_rule_fingerprint_v3' in
      v_definition) = 0
    or position(
      'internal_academic.render_technical_financial_rule' in v_definition) = 0
    or position('''preview'', true' in v_definition) = 0
    or position(
      'return v_rendered || jsonb_build_object(''curso''' in v_definition) = 0
    or v_security_definer is distinct from true
    or v_volatility is distinct from 's'
    or v_parallel is distinct from 'u'
    or v_config is distinct from array['search_path=""']::text[]
    or v_owner is distinct from 'postgres'
    or v_acl is distinct from array[
      'authenticated:EXECUTE:false',
      'postgres:EXECUTE:false',
      'service_role:EXECUTE:false'
    ]::text[]
  then
    raise exception 'Canonical technical financial preview drifted; migration aborted.';
  end if;
end;
$guard$;

-- A prévia já carregava a identidade dentro de `identidade`, porém o contrato
-- público também exige os aliases de compatibilidade no topo. Sem eles, o
-- servidor respondia 200 e o cliente rejeitava a resposta, permanecendo em
-- "Aguardando cálculo".
create or replace function public.prever_regra_financeira_turma_tecnica_secure(
  p_turma_id uuid,
  p_regra jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_rule jsonb;
  v_first_due date;
  v_rendered jsonb;
  v_total numeric;
  v_fingerprint text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501';
  end if;

  select
    class.data_inicio,
    class.primeiro_vencimento_padrao,
    class.regra_financeira_revisao
  into v_turma
  from public.turmas class
  where class.id = p_turma_id;

  if not found then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;

  v_rule := internal_academic.validate_technical_financial_rule_input(p_regra);
  v_first_due := coalesce(
    v_turma.primeiro_vencimento_padrao,
    v_turma.data_inicio,
    (pg_catalog.timezone('America/Maceio', now()))::date
  );
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v3(
    v_turma.data_inicio,
    v_turma.primeiro_vencimento_padrao,
    v_rule
  );
  v_rendered := internal_academic.render_technical_financial_rule(
    v_rule,
    v_first_due,
    jsonb_build_object(
      'preview', true,
      'turmaRevisao', v_turma.regra_financeira_revisao,
      'turmaFingerprint', v_fingerprint,
      'overrideRevisao', null,
      'overrideFingerprint', null,
      'efetivaFingerprint', v_fingerprint
    ),
    'PREVIEW'
  );
  v_total :=
    case
      when (v_rule ->> 'cobrarMatricula')::boolean
        then (v_rule ->> 'valorMatricula')::numeric
      else 0
    end
    + ((v_rule ->> 'qtdMensalidades')::integer * (v_rule ->> 'valorMensalidade')::numeric)
    + case
      when (v_rule ->> 'cobrarRematricula')::boolean
        then (v_rule ->> 'valorRematricula')::numeric
          + ((v_rule ->> 'qtdMensalidades')::integer * (v_rule ->> 'valorMensalidade')::numeric)
      else 0
    end;

  return v_rendered || jsonb_build_object(
    'revisao', v_turma.regra_financeira_revisao,
    'fingerprint', v_fingerprint,
    'curso', jsonb_build_object(
      'totalCiclos', case
        when (v_rule ->> 'cobrarRematricula')::boolean then 2
        else 1
      end,
      'totalMensalidades', (v_rule ->> 'qtdMensalidades')::integer
        * case when (v_rule ->> 'cobrarRematricula')::boolean then 2 else 1 end,
      'totalNominal', pg_catalog.to_char(v_total, 'FM999999990.00')
    )
  );
end;
$function$;

revoke all on function public.prever_regra_financeira_turma_tecnica_secure(
  uuid, jsonb
) from public, anon;
grant execute on function public.prever_regra_financeira_turma_tecnica_secure(
  uuid, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
