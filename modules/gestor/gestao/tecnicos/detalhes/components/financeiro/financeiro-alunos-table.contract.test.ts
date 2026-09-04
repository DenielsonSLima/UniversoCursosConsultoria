import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const baseDir = resolve(
  process.cwd(),
  'modules/gestor/gestao/tecnicos/detalhes/components/financeiro',
);
const table = readFileSync(resolve(baseDir, 'FinanceiroAlunosTable.tsx'), 'utf8');
const list = readFileSync(resolve(baseDir, 'FinanceiroAlunosList.tsx'), 'utf8');
const carnet = readFileSync(resolve(baseDir, 'FinanceiroAlunoCarneAction.tsx'), 'utf8');
const catalogTypes = readFileSync(resolve(
  process.cwd(),
  'modules/gestor/secretaria/carnes-alunos/carnes-alunos.types.ts',
), 'utf8');

test('a tabela combina CPF e matrícula sob o nome e remove a coluna redundante', () => {
  assert.match(table, /CPF: \{formatStudentDocument\(row\.alunoCpf\)\} · Matrícula:/);
  assert.doesNotMatch(table, /<th[^>]*>Matrícula<\/th>/);
  assert.match(table, /colSpan=\{5\}/);
  assert.match(table, /data-student-band=/);
  assert.match(list, /row\.alunoCpf\.replace/);
  assert.match(list, /Aluno \/ CPF \/ Matrícula/);
});

test('o carnê usa a matrícula exata e somente o compositor documental existente', () => {
  assert.match(catalogTypes, /enrollmentId\?: string/);
  assert.match(carnet, /enrollmentId: row\.matriculaId/);
  assert.match(carnet, /carnesAlunosService\.listGroups/);
  assert.match(carnet, /carnesAlunosService\.prepareDocument/);
  assert.match(carnet, /CarnesDocumentPreviewModal/);
  assert.match(carnet, /group\.documentType !== 'carnet'/);
  assert.match(carnet, /const inFlightRef = useRef\(false\)/);
  assert.match(carnet, /if \(blocked \|\| inFlightRef\.current\) return;/);
  assert.match(carnet, /inFlightRef\.current = true;/);
  assert.doesNotMatch(carnet, /functions\.invoke|banese-cnab240-api|\.insert\(|\.update\(/);
});

test('o carnê bloqueia emissão incompleta e expõe ação acessível', () => {
  assert.match(carnet, /generatedCycle\.emitidosBanese !== generatedCycle\.quantidadeItens/);
  assert.match(carnet, /generatedCycle\.pendentesEmissao > 0/);
  assert.match(carnet, /generatedCycle\.emRevisao > 0/);
  assert.match(carnet, /aria-label=\{`Gerar carnê de \$\{row\.alunoNome\}`\}/);
});
