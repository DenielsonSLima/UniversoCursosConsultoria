import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260811023659_require_partner_bank_for_financial_loans.sql'),
  'utf8',
);

const functionBody = (name: string) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir na migration.`);
  const end = migration.indexOf('$$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return migration.slice(start, end);
};

test('categoria BANCO e vínculo canônico de parceiro são preservados no empréstimo', () => {
  for (const fragment of [
    "SELECT 'BANCO', 'pj'",
    "lower(btrim(categoria.nome)) = 'banco'",
    'ADD COLUMN IF NOT EXISTS credor_parceiro_id uuid',
    'REFERENCES public.parceiros(id)',
    "'credor_parceiro_id', emprestimo.credor_parceiro_id",
  ]) {
    assert.ok(migration.includes(fragment), `Contrato do banco parceiro ausente: ${fragment}`);
  }
});

test('seletor seguro expõe somente Parceiro PJ ativo da categoria Banco no polo autorizado', () => {
  const body = functionBody('get_financeiro_bancos_por_polo_secure');

  for (const fragment of [
    "public.gestor_has_effective_financeiro_tab('emprestimos')",
    "upper(btrim(coalesce(parceiro.tipo, ''))) = 'PJ'",
    "upper(btrim(coalesce(categoria.nome, ''))) = 'BANCO'",
    'parceiro.polo_ids @> ARRAY[p_polo_id]::uuid[]',
  ]) {
    assert.ok(body.includes(fragment), `Filtro canônico de bancos ausente: ${fragment}`);
  }
});

test('criação canônica autoriza antes de consultar parceiro e bloqueia texto livre no cliente', () => {
  const body = functionBody('criar_emprestimo_financeiro_polo_com_banco_secure');
  const authorization = body.indexOf("IF auth.role() <> 'service_role'");
  const partnerLookup = body.indexOf('SELECT parceiro.nome');

  assert.ok(authorization >= 0, 'A criação deve validar autorização.');
  assert.ok(partnerLookup >= 0, 'A criação deve buscar o parceiro canônico.');
  assert.ok(authorization < partnerLookup, 'A autorização deve ocorrer antes da busca de parceiro.');
  assert.ok(body.includes("'A chave de idempotência já foi usada com outro banco credor.'"));
  assert.ok(body.includes('SET credor_parceiro_id = p_credor_parceiro_id'));
  assert.ok(migration.includes('REVOKE EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_polo_secure('));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.criar_emprestimo_financeiro_polo_com_banco_secure('));
});
