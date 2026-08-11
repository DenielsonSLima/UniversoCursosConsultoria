import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [service, hooks, keys, enrollmentUi, confirmationUi, formatters, livreAlunos, especializacaoAlunos] = await Promise.all([
  readSource('./presencial-financeiro-unico.service.ts'),
  readSource('./hooks/usePlanoFinanceiroUnico.ts'),
  readSource('./keys.ts'),
  readSource('./components/TurmaPlanoFinanceiroUnicoAlunos.tsx'),
  readSource('./components/ConfirmarPlanoFinanceiroUnicoModal.tsx'),
  readSource('./formatters.ts'),
  readSource('../livres/detalhes/components/TurmaAlunos.tsx'),
  readSource('../especializacao/detalhes/components/TurmaAlunos.tsx'),
]);

test('consulta o plano único oficial e confirma a matrícula pela RPC dedicada', () => {
  assert.match(service, /\.rpc\('obter_plano_financeiro_unico_turma_secure'/);
  assert.match(service, /\.rpc\(\s*'matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure'/);
  assert.match(service, /p_request_id: input\.requestId/);
  assert.match(service, /p_turma_id: input\.turmaId/);
  assert.match(service, /p_aluno_id: input\.alunoId/);
  assert.match(service, /p_expected_revisao: input\.expectedRevisao/);
  assert.match(service, /p_expected_fingerprint: input\.expectedFingerprint/);
  assert.match(service, /search_gestao_available_students/);
});

test('reconcilia o plano e as matrículas nas chaves específicas da turma', () => {
  assert.match(keys, /\['turma-plano-financeiro-unico', turmaId\]/);
  assert.match(keys, /\['turma-plano-financeiro-unico', turmaId, 'alunos'\]/);
  assert.match(hooks, /academicLifecycleKeys\.alunos\(input\.turmaId\)/);
  assert.match(hooks, /academicLifecycleKeys\.movimentacoes\(input\.turmaId\)/);
});

test('a confirmação só exibe o plano existente e usa quantidade dinâmica de parcelas', () => {
  assert.match(enrollmentUi, /createPlanoFinanceiroUnicoRequestId\(\)/);
  assert.match(enrollmentUi, /expectedRevisao: regra\.revisao/);
  assert.match(enrollmentUi, /expectedFingerprint: regra\.fingerprint/);
  assert.match(confirmationUi, /\{regra\.qtdParcelas\}x no boleto/);
  assert.match(confirmationUi, /não há uma quantidade fixa/i);
  assert.doesNotMatch(confirmationUi, /4x no boleto/);
});

test('valores do plano usam formatação brasileira com duas casas', () => {
  assert.match(formatters, /currency:\s*'BRL'/);
  assert.match(formatters, /minimumFractionDigits:\s*2/);
  assert.match(formatters, /maximumFractionDigits:\s*2/);
  assert.match(confirmationUi, /formatCurrencyBRL/);
});

test('não oferece ações acadêmicas que apagariam ou transfeririam parcelas já geradas', () => {
  assert.match(enrollmentUi, /movimentação, transferência e remoção de matrícula não estão disponíveis/i);
  assert.match(enrollmentUi, /<TurmaAlunosTable[\s\S]*readOnly/s);
});

test('Livre e Especialização apontam para a interface própria, sem reexportar TurmaAlunos técnico', () => {
  for (const source of [livreAlunos, especializacaoAlunos]) {
    assert.match(source, /TurmaPlanoFinanceiroUnicoAlunos/);
    assert.doesNotMatch(source, /tecnicos\/detalhes\/components\/TurmaAlunos/);
  }
});
