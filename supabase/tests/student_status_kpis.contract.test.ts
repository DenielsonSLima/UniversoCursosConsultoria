import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../migrations/20260826213350_create_student_status_kpis.sql', import.meta.url),
  'utf8',
);

test('RPC separa cadastro, matrícula e aluno distinto com matrícula ativa', () => {
  assert.match(migration, /cadastros_alunos_ativos bigint/);
  assert.match(migration, /matriculas_ativas bigint/);
  assert.match(migration, /alunos_com_matricula_ativa bigint/);
  assert.match(migration, /from enrollment_scope where status = 'ATIVO'/);
  assert.match(migration, /count\(distinct aluno_id\)[\s\S]*where status = 'ATIVO'/);
  assert.doesNotMatch(migration, /where status in \('ATIVO', 'PENDENTE'\)/);
});

test('escopo acadêmico usa turma e cadastro multipolo usa parceiro', () => {
  assert.match(migration, /class\.polo_id = p_polo_id/);
  assert.match(migration, /partner\.polo_id = p_polo_id/);
  assert.match(migration, /p_polo_id = any\(coalesce\(partner\.polo_ids/);
  assert.match(migration, /p_include_global[\s\S]*partner\.polo_id is null[\s\S]*partner\.tipo <> 'Aluno'/);
});

test('atraso é calculado no banco e exclui título já pago', () => {
  assert.match(migration, /parcelas_em_atraso bigint/);
  assert.match(migration, /receivable\.data_pagamento is null/);
  assert.match(migration, /receivable\.status = 'VENCIDO'/);
  assert.match(migration, /receivable\.status = 'PENDENTE'[\s\S]*timezone\('America\/Maceio', now\(\)\)/);
});

test('RPC exige consumidor, permissão específica, polo autorizado e grants mínimos', () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /p_consumer text/);
  assert.match(migration, /v_consumer = 'PARCEIROS'/);
  assert.match(migration, /v_consumer = 'FINANCEIRO'/);
  assert.doesNotMatch(migration, /v_consumer = 'DASHBOARD'/);
  assert.match(migration, /public\.gestor_has_module\('parceiros'\)/);
  assert.match(migration, /public\.gestor_has_financeiro_tab\('resumo'\)/);
  assert.match(migration, /public\.is_gestor_for_polo\(p_polo_id\)/);
  assert.match(migration, /public\.gestor_has_all_polos\(\)/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated, service_role/i);
});

test('não ativos incluem todo cadastro diferente de ATIVO e matrículas exigem ATIVO estrito', () => {
  assert.match(migration, /tipo = 'Aluno'[\s\S]*status is distinct from 'ATIVO'/);
  assert.match(migration, /tipo = 'Professor'[\s\S]*status is distinct from 'ATIVO'/);
  assert.match(migration, /from enrollment_scope where status = 'ATIVO'/);
  assert.doesNotMatch(migration, /CANCELADO/);
});
