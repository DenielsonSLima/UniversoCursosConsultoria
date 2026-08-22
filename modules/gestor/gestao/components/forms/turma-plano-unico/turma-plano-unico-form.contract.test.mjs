import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const baseDir = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(resolve(baseDir, file), 'utf8');

const formSource = read('TurmaPlanoUnicoForm.tsx');
const constantsSource = read('turma-plano-unico-form.constants.ts');
const financialStepSource = read('steps/TurmaPlanoUnicoFinanceiroStep.tsx');
const reviewStepSource = read('steps/TurmaPlanoUnicoReviewStep.tsx');
const previewHookSource = read('useTurmaPlanoUnicoPreview.ts');
const currencyInputSource = read('CurrencyInput.tsx');
const validationSource = read('turma-plano-unico-form.validation.ts');
const livreFormSource = read('../TurmaLivreForm.tsx');
const especializacaoFormSource = read('../TurmaEspecializacaoForm.tsx');

test('Livre e Especialização usam um módulo próprio de abertura em etapas', () => {
  assert.equal(existsSync(resolve(baseDir, '../TurmaPlanoUnicoForm.tsx')), false);
  assert.match(livreFormSource, /TurmaPlanoUnicoForm/);
  assert.match(especializacaoFormSource, /TurmaPlanoUnicoForm/);
  assert.doesNotMatch(livreFormSource, /TurmaPresencialForm/);
  assert.doesNotMatch(especializacaoFormSource, /TurmaPresencialForm/);
  for (const step of ['TURMA', 'PLANO_FINANCEIRO', 'REVISAO']) {
    assert.match(constantsSource, new RegExp(`id: '${step}'`));
  }
});

test('o plano é variável por turma e não expõe regras de matrícula ou rematrícula', () => {
  assert.match(financialStepSource, /Número de parcelas/);
  assert.match(financialStepSource, /min="1"/);
  assert.match(financialStepSource, /max="60"/);
  assert.match(financialStepSource, /quatro parcelas é apenas um exemplo/i);
  assert.doesNotMatch(constantsSource, /qtdParcelas:\s*4/);
  assert.doesNotMatch(financialStepSource, /matr[ií]cula|rematr[ií]cula/i);
  assert.doesNotMatch(formSource, /TurmaTecnico|turma-tecnico/);
});

test('parcelas, datas e centavos vêm exclusivamente da prévia do servidor', () => {
  assert.match(previewHookSource, /previewTurmaPlan/);
  assert.match(previewHookSource, /isSettling:\s*input !== rawInput/);
  assert.match(formSource, /previewQuery\.data/);
  assert.match(formSource, /previewPending = previewQuery\.isSettling \|\| previewQuery\.isFetching/);
  assert.match(formSource, /activeStep\.id !== 'TURMA' && previewPending/);
  assert.ok((formSource.match(/previewPending/g) || []).length >= 6);
  assert.match(financialStepSource, /preview\?\.cronograma/);
  assert.match(reviewStepSource, /preview\?\.cronograma/);
  assert.doesNotMatch(formSource, /buildInstallmentSchedule|getDiaVencimento/);
  assert.doesNotMatch(financialStepSource, /buildInstallmentSchedule|getDiaVencimento/);
  assert.doesNotMatch(reviewStepSource, /buildInstallmentSchedule|getDiaVencimento/);
});

test('a submissão envia somente o contrato do plano financeiro único e bloqueia o checkout online legado', () => {
  for (const field of [
    'valorTotal',
    'qtdParcelas',
    'primeiroVencimento',
    'diaVencimento',
    'descontoPontualidade',
    'jurosAtrasoPercentual',
    'multaAtraso',
  ]) assert.match(formSource, new RegExp(`${field}:`));
  assert.match(formSource, /planoFinanceiroUnico/);
  assert.match(formSource, /permitirInscricoesOnline: false/);
  assert.match(validationSource, /formData\.qtdParcelas > 60/);
  assert.match(financialStepSource, /ajuste de centavos/i);
});

test('campos monetários usam real brasileiro com duas casas decimais', () => {
  assert.match(financialStepSource, /<CurrencyInput/);
  assert.match(currencyInputSource, /formatCurrencyBRL/);
  assert.match(currencyInputSource, /minimumFractionDigits:\s*2/);
  assert.match(currencyInputSource, /maximumFractionDigits:\s*2/);
});
