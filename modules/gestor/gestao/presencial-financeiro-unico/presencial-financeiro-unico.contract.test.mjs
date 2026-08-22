import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [service, hooks, conditionHooks, keys, enrollmentUi, confirmationUi, conditionUi, codeUi, formatters, livreAlunos, especializacaoAlunos] = await Promise.all([
  readSource('./presencial-financeiro-unico.service.ts'),
  readSource('./hooks/usePlanoFinanceiroUnico.ts'),
  readSource('./hooks/useCondicaoPlanoFinanceiroUnico.ts'),
  readSource('./keys.ts'),
  readSource('./components/TurmaPlanoFinanceiroUnicoAlunos.tsx'),
  readSource('./components/ConfirmarPlanoFinanceiroUnicoModal.tsx'),
  readSource('./components/CondicaoPlanoFinanceiroUnicoModal.tsx'),
  readSource('./components/CodigoCondicaoPlanoFinanceiroUnicoCard.tsx'),
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

test('Curso Livre permite herdar, personalizar, vincular sem títulos e gerar depois', () => {
  assert.match(service, /prever_condicao_matricula_plano_financeiro_unico_secure/);
  assert.match(service, /matricular_aluno_plano_financeiro_unico_v2_secure/);
  assert.match(service, /obter_pendencias_plano_financeiro_unico_turma_secure/);
  assert.match(service, /p_gerar_agora: input\.gerarAgora/);
  assert.match(service, /p_ajuste: input\.ajuste/);
  assert.match(service, /response\.operacao !== 'AUTORIZACAO_NEGADA'/);
  assert.match(service, /response\.cobrancaGerada === true/);
  assert.match(conditionUi, /Usar regra da turma/);
  assert.match(conditionUi, /Personalizar para este aluno/);
  assert.match(conditionUi, /Vincular e gerar depois/);
  assert.match(conditionUi, /Financeiro › Receber/);
  assert.match(conditionHooks, /usePendenciasPlanoFinanceiroUnico/);
});

test('condição individual expõe 1 boleto/desconto e preserva cálculo no servidor', () => {
  assert.match(conditionUi, /Quantidade de boletos/);
  assert.match(conditionUi, /Pagamento à vista/);
  assert.match(conditionUi, /Desconto negociado/);
  assert.match(conditionUi, /Juros ao mês/);
  assert.match(conditionUi, /Multa fixa/);
  assert.match(conditionUi, /Calculando no servidor/);
  assert.match(conditionUi, /requiresAuthorization/);
  assert.match(conditionUi, /conditionSignature\(adjustment\)/);
  assert.match(conditionUi, /\{isCustom \? \(\s*<section[\s\S]*Quantidade de boletos/);
  assert.match(conditionUi, /\{requiresAuthorization \? \(\s*<section[\s\S]*Autorização da condição individual/);
  assert.doesNotMatch(conditionUi, /valorTotalNominal\s*-/);
  assert.doesNotMatch(conditionUi, /Math\.(round|floor|ceil)/);
});

test('código de autorização é configurado sem ser exibido', () => {
  assert.match(service, /obter_status_codigo_condicao_individual_plano_unico_secure/);
  assert.match(service, /redefinir_codigo_condicao_individual_plano_unico_secure/);
  assert.match(codeUi, /type="password"/);
  assert.match(codeUi, /O código nunca é exibido/);
  assert.doesNotMatch(codeUi, /value=\{statusQuery\.data\?\.codigo/);
  assert.match(codeUi, /const inFlightRef = useRef\(false\)/);
  assert.match(codeUi, /if \(inFlightRef\.current\) return/);
  assert.match(codeUi, /requestRef\.current\?\.signature === signature/);
  assert.match(codeUi, /requestId: activeRequest\.requestId/);
  assert.match(codeUi, /requestRef\.current = null/);
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
