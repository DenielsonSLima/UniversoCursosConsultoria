import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const coreMigration = readFileSync(new URL(
  '../migrations/20260927221000_create_caixa_workspace_v2_company_core.sql',
  import.meta.url,
), 'utf8');
const wrapperMigration = readFileSync(new URL(
  '../migrations/20260927222000_expose_caixa_workspace_v2_secure.sql',
  import.meta.url,
), 'utf8');
const quantityMigration = readFileSync(new URL(
  '../migrations/20260927233000_fix_caixa_workspace_v2_quantity_semantics.sql',
  import.meta.url,
), 'utf8');

const coreStart = coreMigration.indexOf(
  'CREATE OR REPLACE FUNCTION internal_contas.get_caixa_workspace_v2_company_core(',
);
const coreEnd = coreMigration.indexOf('$function$;', coreStart);
const core = coreMigration.slice(coreStart, coreEnd);
const wrapperStart = wrapperMigration.indexOf(
  'CREATE OR REPLACE FUNCTION public.get_caixa_workspace_v2_secure(',
);
const wrapperEnd = wrapperMigration.indexOf('$function$;', wrapperStart);
const wrapper = wrapperMigration.slice(wrapperStart, wrapperEnd);

test('core company-scoped preserva o cálculo canônico e fica privado', () => {
  assert.ok(coreStart >= 0 && coreEnd > coreStart);
  assert.match(core, /p_company_id uuid,[\s\S]*p_polo_id uuid DEFAULT NULL/);
  assert.match(core, /STABLE[\s\S]*SECURITY INVOKER[\s\S]*SET search_path TO ''/);
  assert.match(core, /'empresa_id', p_company_id/);
  for (const source of ['conta.polo_id', 'despesa.polo_id', 'rateio.polo_id']) {
    assert.match(core, new RegExp(
      `source_polo\\.id = ${source.replace('.', '\\.')}[\\s\\S]*source_polo\\.company_id = p_company_id`,
    ));
  }
  assert.match(core, /conta\.despesa_lancamento_id IS NULL/);
  assert.match(core, /conta\.emprestimo_parcela_id IS NULL/);
  assert.match(core, /despesa\.rateio_modo = 'SEM_RATEIO'/);
  assert.match(core, /despesa\.rateio_modo IN \('TODOS', 'SELECIONADOS'\)/);
  assert.match(core, /rateio\.company_id = p_company_id/);
  assert.match(core, /parent_polo\.id = despesa\.polo_id[\s\S]*parent_polo\.company_id = p_company_id/);
  assert.match(core, /'RATEIO:' \|\| rateio\.id::text/);
  assert.match(core, /greatest\(obrigacao\.valor_programado - CASE/);
  assert.match(core, /count\(DISTINCT chave\)/);
  assert.match(core, /pg_catalog\.bool_and\(paga_no_corte\)/);
  assert.match(coreMigration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(coreMigration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO postgres/);
});

test('wrapper autoriza antes da leitura e só delega ao core privado', () => {
  assert.ok(wrapperStart >= 0 && wrapperEnd > wrapperStart);
  assert.match(wrapper, /RETURNS jsonb[\s\S]*STABLE[\s\S]*SECURITY DEFINER/);
  assert.match(wrapper, /SET search_path TO ''/);
  assert.match(wrapper, /coalesce\(auth\.jwt\(\) ->> 'role', ''\) = 'service_role'/);
  assert.match(wrapper, /auth\.uid\(\) IS NULL[\s\S]*public\.is_gestor\(\)/);
  assert.match(wrapper, /gestor_has_any_global_module\(ARRAY\['caixa'\]\)/);
  assert.match(wrapper, /allPolos\/is_gestor_global é hoje administrador global do sistema/);
  assert.match(wrapper, /gestor_has_any_global_module\(ARRAY\['financeiro'\]\)[\s\S]*gestor_has_effective_financeiro_tab\('despesas'\)/);
  assert.match(wrapper, /gestor_has_any_module_for_polo\(ARRAY\['caixa'\], p_polo_id\)/);
  assert.match(wrapper, /ARRAY\['financeiro'\], p_polo_id[\s\S]*gestor_has_effective_financeiro_tab\('despesas'\)/);
  assert.match(wrapper, /authorized_polo\.company_id = p_company_id[\s\S]*authorized_polo\.status = 'ativo'/);
  const delegateAt = wrapper.indexOf('internal_contas.get_caixa_workspace_v2_company_core(');
  assert.ok(wrapper.indexOf('auth.uid() IS NULL') < delegateAt);
  assert.ok(wrapper.indexOf('authorized_polo.company_id = p_company_id') < delegateAt);
  assert.doesNotMatch(wrapper, /FROM public\.(?:contas_pagar|despesas_lancamentos)/);
  assert.doesNotMatch(wrapper, /get_caixa_workspace_v2_core\(/);
});

test('ACL pública é mínima e não expõe core nem anon', () => {
  assert.match(wrapperMigration, /REVOKE ALL ON FUNCTION public\.get_caixa_workspace_v2_secure\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(wrapperMigration, /GRANT EXECUTE ON FUNCTION public\.get_caixa_workspace_v2_secure\([\s\S]*TO authenticated, service_role/);
  assert.doesNotMatch(wrapperMigration, /GRANT EXECUTE[\s\S]*TO anon/);
  assert.match(wrapperMigration, /ALTER FUNCTION public\.get_caixa_workspace_v2_secure\([\s\S]*OWNER TO postgres/);
});

test('correção separa linha econômica da contagem física do título', () => {
  assert.match(quantityMigration, /'RATEIO:' \|\| rateio\.id::text,[\s\S]*'DESPESA:' \|\| despesa\.id::text/);
  assert.match(quantityMigration, /count\(DISTINCT chave_titulo\)/);
  assert.match(quantityMigration, /GROUP BY chave_titulo/);
  assert.match(quantityMigration, /'unidade_quantidade', 'TITULO_FISICO_SEM_DUPLICACAO'/);
  assert.match(quantityMigration, /'criterio_quantidade', 'TITULO_TOTALMENTE_PAGO_NO_CORTE'/);
});
