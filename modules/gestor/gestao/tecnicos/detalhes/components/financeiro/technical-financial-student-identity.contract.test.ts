import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const baseDir = resolve(
  process.cwd(),
  'modules/gestor/gestao/tecnicos/detalhes/components/financeiro',
);
const parser = readFileSync(
  resolve(baseDir, 'matricula-tecnica-financeiro.service.ts'),
  'utf8',
);
const types = readFileSync(
  resolve(baseDir, 'matricula-tecnica-financeiro.types.ts'),
  'utf8',
);
const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260904010100_project_student_cpf_in_technical_financial_workspace.sql',
), 'utf8');

test('o CPF integra a projeção financeira canônica da matrícula', () => {
  assert.match(migration, /student\.cpf_cnpj/);
  assert.match(migration, /'alunoCpf', v_row\.aluno_cpf/);
  assert.match(types, /alunoCpf: string/);
  assert.match(parser, /typeof value\.alunoCpf !== 'string'/);
});
