import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const baseDir = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(resolve(baseDir, file), 'utf8');

const formSource = read('TurmaTecnicoForm.tsx');
const constantsSource = read('turma-tecnico-form.constants.ts');
const validationSource = read('turma-tecnico-form.validation.ts');
const financialStepSource = read('TurmaTecnicoFinanceiroStep.tsx');
const authorizationStepSource = read('TurmaTecnicoAutorizacaoStep.tsx');
const financialPreviewServiceSource = read('turma-tecnico-financeiro-preview.service.ts');
const dataStepSource = read('TurmaTecnicoDadosStep.tsx');
const enrollmentSettingsSource = read('../TechnicalEnrollmentSettings.tsx');
const gestaoServiceSource = read('../../../gestao.service.ts');

test('formulário técnico fica isolado em pasta própria e usa cinco etapas', () => {
  assert.equal(existsSync(resolve(baseDir, '../TurmaTecnicoForm.tsx')), false);
  assert.match(formSource, /TURMA_TECNICO_STEPS/);
  assert.match(formSource, /TurmaTecnicoStepper/);
  assert.match(formSource, /TurmaTecnicoDadosStep/);
  assert.match(formSource, /TurmaTecnicoFinanceiroStep/);
  assert.match(formSource, /TurmaTecnicoAutorizacaoStep/);
  assert.match(formSource, /TurmaTecnicoReviewStep/);
  assert.match(formSource, /'Avançar'/);
  assert.match(formSource, /'Voltar'/);
  for (const step of ['TURMA', 'INSCRICOES', 'FINANCEIRO', 'AUTORIZACAO', 'REVISAO']) {
    assert.match(constantsSource, new RegExp(`id: '${step}'`));
  }
});

test('etapa financeira cobre regra flexível e matrícula inicial opcional', () => {
  assert.match(financialStepSource, /Gerar cobrança de matrícula/);
  assert.match(financialStepSource, /checked=\{formData\.cobrarMatricula\}/);
  assert.match(financialStepSource, /cobrarMatricula: enabled/);
  assert.match(financialStepSource, /cobrarRematricula/);
  assert.match(financialStepSource, /qtdParcelas/);
  assert.match(financialStepSource, /descontoPontualidade/);
  assert.match(financialStepSource, /jurosAtraso/);
  assert.match(financialStepSource, /multaAtrasoPercentual/);
  assert.match(financialStepSource, /instrucaoBoletoCarne/);
  assert.match(financialStepSource, /Exemplos automáticos da mensalidade/);
  assert.match(financialStepSource, /Pagamento até o vencimento/);
  assert.match(financialStepSource, /Pagamento com 30 dias de atraso/);
  assert.match(financialStepSource, /Composição financeira do curso/);
  assert.match(financialStepSource, /Total nominal do curso/);
  assert.match(financialStepSource, /divididas em 2 ciclos/);
  assert.match(financialStepSource, /mensalidades antes e/);
  assert.match(financialPreviewServiceSource, /totalCurso: totalPrimeiroCiclo \+ totalMensalidadesSegundoCiclo/);
  assert.match(financialStepSource, /inputMode="numeric"/);
  assert.match(financialStepSource, /parseCurrencyBRLInput/);
  assert.match(financialStepSource, /Array\.from\(\{ length: 31 \}/);
  assert.match(formSource, /showEnrollmentPaymentRule=\{false\}/);
  assert.match(enrollmentSettingsSource, /showEnrollmentPaymentRule/);
  assert.doesNotMatch(enrollmentSettingsSource, /Limite de alunos online/i);
  assert.doesNotMatch(financialStepSource, /Liberar próximas cobranças após cada baixa/i);
  assert.doesNotMatch(financialStepSource, /sequência financeira continua sendo gerada pelo backend/i);
  assert.doesNotMatch(financialStepSource, /\bbackend\b|\bservidor\b/i);
});

test('data inicial sugere 24 meses e mantém o fim previsto editável', () => {
  assert.match(dataStepSource, /addMonthsToISODate\(event\.target\.value, 24\)/);
  assert.match(dataStepSource, /primeiroVencimentoPadrao: event\.target\.value/);
  assert.match(dataStepSource, /Sugerido em 24 meses; você pode alterar\./);
  assert.match(dataStepSource, /onChange\(\{ dataPrevisaoTermino: event\.target\.value \}\)/);
});

test('primeiro vencimento e código de condição individual são obrigatórios e protegidos', () => {
  assert.match(financialStepSource, /Primeiro vencimento/);
  assert.match(financialStepSource, /primeiroVencimentoPadrao/);
  assert.match(validationSource, /formData\.primeiroVencimentoPadrao/);
  assert.match(validationSource, /formData\.codigoCondicaoIndividual/);
  assert.match(validationSource, /confirmarCodigoCondicaoIndividual/);
  assert.match(authorizationStepSource, /Proteção de condições individuais/);
  assert.match(authorizationStepSource, /type=\{showCode \? 'text' : 'password'\}/);
  assert.match(authorizationStepSource, /não poderá ser consultado/i);
  assert.doesNotMatch(authorizationStepSource, /localStorage|sessionStorage/);
});

test('defaults e validação refletem o contrato financeiro atual', () => {
  assert.match(constantsSource, /cobrarMatricula: true/);
  assert.match(constantsSource, /valorMatricula: 150/);
  assert.match(constantsSource, /cobrarRematricula: true/);
  assert.match(constantsSource, /valorRematricula: 150/);
  assert.match(constantsSource, /qtdParcelas: 12/);
  assert.match(constantsSource, /valorParcela: 279\.9/);
  assert.match(constantsSource, /descontoPontualidade: 19\.9/);
  assert.match(constantsSource, /jurosAtraso: 1/);
  assert.match(constantsSource, /multaAtrasoPercentual: 2/);
  assert.match(validationSource, /formData\.qtdParcelas > 60/);
  assert.match(validationSource, /instructionLength < 1 \|\| instructionLength > 180/);
  assert.match(validationSource, /formData\.cobrarMatricula/);
});

test('criação transacional envia intenção, vencimento e hash é tratado somente no backend', () => {
  for (const column of [
    'cobrar_matricula',
    'cobrar_rematricula',
    'multa_atraso_percentual',
    'aplicar_desconto_matricula',
    'aplicar_multa_juros_matricula',
    'aplicar_desconto_mensalidade',
    'aplicar_multa_juros_mensalidade',
    'aplicar_desconto_rematricula',
    'aplicar_multa_juros_rematricula',
    'instrucao_boleto_carne',
    'primeiro_vencimento_padrao',
  ]) assert.match(gestaoServiceSource, new RegExp(column));
  assert.match(gestaoServiceSource, /criar_turma_tecnica_com_codigo_condicao_secure/);
  assert.match(gestaoServiceSource, /p_codigo: turma\.codigoCondicaoIndividual/);
  assert.doesNotMatch(gestaoServiceSource, /codigo_hash|crypt\(/);
  assert.match(formSource, /multaAtraso: 0/);
  assert.match(formSource, /sincronizarAsaasFuturo: false/);
  assert.match(formSource, /gerarCobrancasFuturas: formData\.origemFinanceira !== 'LEGADO'/);
  assert.match(financialPreviewServiceSource, /Promise\.all/);
  assert.match(financialPreviewServiceSource, /calculate_gestao_technical_financial_preview/);
  assert.match(financialPreviewServiceSource, /build_gestao_financial_schedule/);
  assert.doesNotMatch(financialStepSource, /Asaas|calculate_gestao|valor_com_atraso/);
});
