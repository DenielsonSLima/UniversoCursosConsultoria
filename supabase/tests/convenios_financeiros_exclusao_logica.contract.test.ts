import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const migration = (name: string) => readFileSync(
  resolve(root, 'supabase/migrations', name),
  'utf8',
);
const archive = migration('20261003160000_convenios_financeiros_exclusao_logica.sql');
const reads = migration('20261003160001_convenios_financeiros_leituras_ativas.sql');

const functionBody = (source: string, name: string) => {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir.`);
  const end = source.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve ter corpo delimitado.`);
  return source.slice(start, end);
};

test('exclusão é lógica, idempotente e preserva a trilha do cadastro', () => {
  const body = functionBody(archive, 'excluir_convenio_financeiro_secure');
  assert.match(body, /p_request_id uuid,[\s\S]*p_polo_id uuid,[\s\S]*p_convenio_id uuid/);
  assert.match(body, /SET status = 'ARQUIVADO'/);
  assert.doesNotMatch(body, /DELETE FROM public\.convenios_financeiros/);
  assert.match(archive, /'ARQUIVAR_CONVENIO'/);
  assert.match(body, /INSERT INTO public\.convenios_financeiros_operacoes_requisicoes/);
  assert.match(body, /'competencia_ids', to_jsonb\(v_competencia_ids\)/);
  assert.match(body, /jsonb_set\(v_replay\.resultado, '\{replayed\}'/);
});

test('autorização precede replay e falha fechada para identidade nula', () => {
  const body = functionBody(archive, 'excluir_convenio_financeiro_secure');
  const authorization = body.indexOf("coalesce(auth.role(), '') <> 'service_role'");
  const identity = body.indexOf('auth.uid() IS NULL');
  const replay = body.indexOf('SELECT operacao.*');
  assert.ok(authorization >= 0 && identity > authorization && replay > identity);
  assert.match(body, /is_financeiro_for_polo\(p_polo_id\)/);
  assert.match(body, /gestor_has_effective_financeiro_tab\('convenios'\)/);
  assert.match(body, /v_replay\.actor_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(archive, /FROM PUBLIC, anon;[\s\S]*TO authenticated, service_role/);
});

test('travas seguem mês, request e raiz e os filhos serializam com o arquivamento', () => {
  const body = functionBody(archive, 'excluir_convenio_financeiro_secure');
  const monthLock = body.indexOf('PERFORM mes.id');
  const requestLock = body.indexOf('pg_advisory_xact_lock');
  const rootLock = body.indexOf('SELECT convenio.*', requestLock);
  assert.ok(monthLock >= 0 && monthLock < requestLock && requestLock < rootLock);
  assert.match(body, /ORDER BY mes\.id[\s\S]*FOR UPDATE/);
  const guard = functionBody(archive, 'convenios_financeiros_bloquear_mutacao_arquivado');
  assert.match(guard, /FOR KEY SHARE/);
  assert.match(guard, /v_status IS DISTINCT FROM 'ATIVO'/);
  for (const table of ['competencias', 'creditos', 'despesas']) {
    assert.match(archive, new RegExp(`convenios_financeiros_${table}_archive_guard`));
  }
});

test('zero atual não basta: qualquer competência ou histórico bloqueia', () => {
  const body = functionBody(archive, 'excluir_convenio_financeiro_secure');
  assert.match(body, /cardinality\(v_competencia_ids\) <> 1/);
  assert.match(body, /v_mes\.status <> 'ABERTO'/);
  assert.match(body, /v_mes\.saldo_inicial <> 0/);
  assert.match(body, /v_mes\.creditos_fechamento IS NOT NULL/);
  assert.match(body, /v_mes\.competencia_anterior_id IS NOT NULL/);
  assert.match(body, /sucessora\.competencia_anterior_id = v_mes\.id/);
  assert.match(body, /FROM public\.convenios_financeiros_creditos/);
  assert.match(body, /FROM public\.convenios_financeiros_despesas/);
  assert.match(body, /v_operacoes <> 1/);
  assert.match(body, /operacao\.operacao = 'CRIAR_CONVENIO'/);
});

test('listas, Caixa e detalhe normal não projetam convênios arquivados', () => {
  assert.equal((reads.match(/convenio\.status = 'ATIVO'/g) || []).length, 3);
  const detail = functionBody(reads, 'obter_convenio_financeiro_mes_secure');
  assert.match(detail, /v_convenio_status IS DISTINCT FROM 'ATIVO'/);
  assert.match(detail, /USING ERRCODE = 'P0002'/);
  assert.match(reads, /count\(DISTINCT base\.convenio_id\)/);
  assert.match(reads, /get_caixa_convenios_resumo_secure/);
});
