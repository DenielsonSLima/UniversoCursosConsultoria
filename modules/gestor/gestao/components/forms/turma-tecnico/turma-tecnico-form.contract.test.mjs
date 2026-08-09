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
const enrollmentSettingsSource = read('../TechnicalEnrollmentSettings.tsx');
const gestaoServiceSource = read('../../../gestao.service.ts');

test('formulário técnico fica isolado em pasta própria e usa quatro etapas', () => {
  assert.equal(existsSync(resolve(baseDir, '../TurmaTecnicoForm.tsx')), false);
  assert.match(formSource, /TURMA_TECNICO_STEPS/);
  assert.match(formSource, /TurmaTecnicoStepper/);
  assert.match(formSource, /TurmaTecnicoDadosStep/);
  assert.match(formSource, /TurmaTecnicoFinanceiroStep/);
  assert.match(formSource, /TurmaTecnicoReviewStep/);
  assert.match(formSource, /'Avançar'/);
  assert.match(formSource, /'Voltar'/);
  for (const step of ['TURMA', 'INSCRICOES', 'FINANCEIRO', 'REVISAO']) {
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
  assert.match(financialStepSource, /Array\.from\(\{ length: 31 \}/);
  assert.match(formSource, /showEnrollmentPaymentRule=\{false\}/);
  assert.match(enrollmentSettingsSource, /showEnrollmentPaymentRule/);
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

test('insert envia toda a intenção e deixa cálculo monetário para o backend', () => {
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
  ]) assert.match(gestaoServiceSource, new RegExp(column));
  assert.match(formSource, /multaAtraso: 0/);
  assert.match(formSource, /sincronizarAsaasFuturo: false/);
  assert.doesNotMatch(financialStepSource, /Asaas|calculate_gestao|valor_com_atraso/);
});
