import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const base = resolve(process.cwd(), 'modules/gestor/gestao/tecnicos/detalhes/components/financeiro');
const dialog = readFileSync(resolve(base, 'FinanceiroCicloManualDialog.tsx'), 'utf8');
const service = readFileSync(resolve(base, 'matricula-tecnica-ciclo-manual.service.ts'), 'utf8');
const destination = readFileSync(resolve(base, 'matricula-tecnica-ciclo-manual-destination.ts'), 'utf8');

// Executa o próprio guard do componente, sem copiar sua implementação.
const navigationBody = dialog.split('const goToStep = (nextStep: WizardStep) => {')[1]?.split('\n  };')[0];
assert.ok(navigationBody, 'guard de navegação ausente');
const navigate = new Function('pending', 'previewReady', 'positiveAmounts', 'step', 'setStep', 'nextStep', navigationBody);

test('Voltar permite corrigir erro da prévia; avançar e emitir continuam bloqueados', () => {
  let step = 3;
  const setStep = (value: number) => { step = value; };
  navigate(false, false, false, step, setStep, 2);
  assert.equal(step, 2);
  navigate(false, false, false, step, setStep, 3);
  assert.equal(step, 2);
  navigate(false, true, false, step, setStep, 3);
  assert.equal(step, 2);
  navigate(false, true, true, step, setStep, 3);
  assert.equal(step, 3);
  navigate(true, true, true, step, setStep, 2);
  assert.equal(step, 3);
});

test('mudança ociosa C1 para C2 reinicia datas e confirmação sem reaproveitar edição C1', () => {
  assert.match(dialog, /const \[cycleNumber, setCycleNumber\] = useState\(requestedCycleNumber\)/);
  assert.match(dialog, /const revisionContext = `\$\{row\.matriculaId\}:\$\{cycleNumber\}:\$\{dateSource\}:\$\{individualDate\}`/);
  const transitionBody = dialog.split('if (pending || !cycleIdentityChanged) return;')[1]?.split('}, [pending, cycleIdentityChanged')[0];
  assert.ok(transitionBody, 'transição do ciclo não preserva a emissão pendente');
  for (const operation of [
    'setCycleNumber(requestedCycleNumber)', 'setStep(1)',
    "setDateSource(requestedCycleNumber === 2 ? 'INDIVIDUAL' : 'TURMA')",
    "setIndividualDate(row.cicloManual.primeiroVencimentoSugerido ?? '')",
    'setExternalHistoryConfirmed(false)', 'setIssuanceSnapshot(null)', 'lastPreviewRef.current = null',
  ]) assert.ok(transitionBody.includes(operation), `reset ausente: ${operation}`);
  assert.match(dialog, /const previewEnabled = !pending && !cycleIdentityChanged/);
});

test('cliente exige emissão histórica comprovada para aceitar título pago', () => {
  assert.match(service, /isIssuedCycleReceivable\(item, Number\(cycle\.numero\)\)/);
  assert.match(destination, /item\.status === 'PAGO' && item\.emissaoHistoricaComprovada === true/);
  assert.match(destination, /item\.emissaoBanese === 'EMITIDO'/);
  assert.doesNotMatch(service, /\["PENDENTE", "VENCIDO", "PAGO"\]\.includes/);
});
