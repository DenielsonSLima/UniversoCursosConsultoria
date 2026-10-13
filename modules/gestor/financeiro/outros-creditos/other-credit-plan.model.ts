import { parseCurrencyInput, today } from './outros-creditos.presentation';
import type { OtherCreditPlan, OtherCreditPlanInput, OtherCreditPlanProgress, OtherCreditPlanReceivable } from './other-credit-plan.types';
import type { OtherCreditPlanCreationAttempt } from './other-credit-plan-attempt';

export type OtherCreditPlanFeeForm = { enabled: boolean; value: string; dueDate: string };
export type OtherCreditPlanForm = {
  partnerId: string;
  description: string;
  categoryId: string;
  quantity: string;
  value: string;
  firstDueDate: string;
  interest: string;
  penalty: string;
  discountType: 'FIXO' | 'PERCENTUAL';
  discount: string;
  discountDays: string;
  enrollment: OtherCreditPlanFeeForm;
  reenrollment: OtherCreditPlanFeeForm;
};

export const initialOtherCreditPlanForm = (): OtherCreditPlanForm => ({
  partnerId: '', description: '', categoryId: '', quantity: '1', value: '', firstDueDate: today(),
  interest: '0', penalty: '0', discountType: 'FIXO', discount: '', discountDays: '0',
  enrollment: { enabled: false, value: '', dueDate: today() },
  reenrollment: { enabled: false, value: '', dueDate: today() },
});

const percentage = (value: string) => Number(value.replace(',', '.') || 0);
export const toOtherCreditPlanInput = (form: OtherCreditPlanForm): OtherCreditPlanInput => ({
  clienteId: form.partnerId,
  descricao: form.description.trim(),
  categoriaFinanceiraId: form.categoryId || undefined,
  quantidadeParcelas: Number(form.quantity),
  valorParcela: parseCurrencyInput(form.value),
  primeiroVencimento: form.firstDueDate,
  jurosMensalPercentual: percentage(form.interest),
  multaPercentual: percentage(form.penalty),
  descontoTipo: form.discountType,
  descontoValor: form.discountType === 'FIXO' ? parseCurrencyInput(form.discount) : percentage(form.discount),
  descontoDiasAntecedencia: Number(form.discountDays),
  matricula: form.enrollment.enabled
    ? { valor: parseCurrencyInput(form.enrollment.value), vencimento: form.enrollment.dueDate } : null,
  rematricula: form.reenrollment.enabled
    ? { valor: parseCurrencyInput(form.reenrollment.value), vencimento: form.reenrollment.dueDate } : null,
});

export function validateOtherCreditPlanInput(input: OtherCreditPlanInput, poloId?: string | null) {
  if (!poloId) return 'Selecione uma unidade no topo do portal.';
  if (!input.clienteId) return 'Selecione o pagador cadastrado.';
  if (!input.descricao) return 'Informe a descrição do carnê.';
  if (!Number.isInteger(input.quantidadeParcelas) || input.quantidadeParcelas < 1 || input.quantidadeParcelas > 60) {
    return 'Informe de 1 a 60 parcelas.';
  }
  if (!Number.isFinite(input.valorParcela) || input.valorParcela <= 0) return 'Informe um valor por parcela maior que zero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.primeiroVencimento)) return 'Informe o primeiro vencimento.';
  if ([input.jurosMensalPercentual, input.multaPercentual].some(value => !Number.isFinite(value) || value < 0 || value >= 100)) {
    return 'Juros e multa devem ficar entre 0 e 99,999999%.';
  }
  if (!Number.isFinite(input.descontoValor) || input.descontoValor < 0
    || (input.descontoTipo === 'PERCENTUAL' && input.descontoValor >= 100)
    || (input.descontoTipo === 'FIXO' && input.descontoValor >= input.valorParcela)) {
    return 'Informe um desconto menor que o valor da parcela ou que 100%.';
  }
  if (!Number.isInteger(input.descontoDiasAntecedencia) || input.descontoDiasAntecedencia < 0 || input.descontoDiasAntecedencia > 60) {
    return 'A antecedência do desconto deve ficar entre 0 e 60 dias.';
  }
  for (const fee of [input.matricula, input.rematricula]) {
    if (fee && (!Number.isFinite(fee.valor) || fee.valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fee.vencimento))) {
      return 'Informe valor positivo e vencimento para cada taxa habilitada.';
    }
  }
  return null;
}

const closedStatuses = new Set(['PAGO', 'CANCELADO', 'ESTORNADO', 'DEVOLVIDO']);
export function otherCreditPlanEmissionState(item: OtherCreditPlanReceivable) {
  if (closedStatuses.has(item.status || '')) return 'closed';
  if (item.status === 'SUSPENSO' || item.gateway_status?.toUpperCase() === 'CREATING'
    || /AMBIGUOUS|REVIEW|PENDING|SUBMITTING|IN_PROGRESS|CREATING/.test(item.gateway_submission_status || '')) return 'review';
  if (item.gateway_payment_id && item.gateway_provider === 'banese_card') return 'issued';
  if (item.gateway_submission_status === 'API_REGISTERED' || item.gateway_boleto_nosso_numero) return 'review';
  return 'pending';
}

const canonicalInputFields: Array<keyof OtherCreditPlanInput> = [
  'clienteId', 'descricao', 'categoriaFinanceiraId', 'quantidadeParcelas', 'valorParcela',
  'primeiroVencimento', 'jurosMensalPercentual', 'multaPercentual', 'descontoTipo',
  'descontoValor', 'descontoDiasAntecedencia',
];
export function otherCreditPlanInputsEqual(left: OtherCreditPlanInput, right: OtherCreditPlanInput) {
  if (canonicalInputFields.some(key => (left[key] ?? null) !== (right[key] ?? null))) return false;
  return (['matricula', 'rematricula'] as const).every(key => {
    const leftFee = left[key];
    const rightFee = right[key];
    if (!leftFee || !rightFee) return leftFee === rightFee;
    return leftFee.valor === rightFee.valor && leftFee.vencimento === rightFee.vencimento;
  });
}

export async function recoverOrCreateOtherCreditPlan(
  attempt: OtherCreditPlanCreationAttempt,
  read: (id: string) => Promise<OtherCreditPlan>,
  create: (requestId: string, poloId: string, input: OtherCreditPlanInput) => Promise<OtherCreditPlan>,
) {
  if (attempt.phase === 'uncertain') {
    let existing: OtherCreditPlan;
    try {
      existing = await read(attempt.requestId);
    } catch {
      // A failed read cannot authorize another key; the same RPC intent remains idempotent.
      return create(attempt.requestId, attempt.poloId, attempt.input);
    }
    if (existing.plano.id !== attempt.requestId || existing.plano.polo_id !== attempt.poloId
      || !otherCreditPlanInputsEqual(existing.plano.input, attempt.input)) {
      throw new Error('O carnê encontrado diverge deste pedido. A tentativa foi preservada para conferência.');
    }
    return existing;
  }
  return create(attempt.requestId, attempt.poloId, attempt.input);
}

const recoverableBankReview = (item: OtherCreditPlanReceivable) => otherCreditPlanEmissionState(item) === 'review'
  && ['PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'].includes(item.status || '')
  && item.gateway_provider === 'banese_card' && Boolean(item.gateway_boleto_nosso_numero)
  && ['API_AMBIGUOUS', 'API_REGISTERED'].includes(item.gateway_submission_status || '');

export async function refreshOtherCreditPlanSequentially(
  planId: string,
  read: (id: string) => Promise<OtherCreditPlan>,
  refresh: (id: string) => Promise<unknown>,
  onProgress: (progress: OtherCreditPlanProgress) => void,
) {
  let plan = await read(planId);
  const candidates = plan.receivables.filter(recoverableBankReview).map(item => item.id);
  onProgress({ done: 0, total: candidates.length });
  let done = 0;
  for (const id of candidates) {
    const current = plan.receivables.find(item => item.id === id);
    if (!current || !recoverableBankReview(current)) continue;
    await refresh(id);
    plan = await read(planId);
    const updated = plan.receivables.find(item => item.id === id);
    if (!updated || !['issued', 'closed'].includes(otherCreditPlanEmissionState(updated))) {
      throw new Error('A consulta bancária ainda não confirmou esta cobrança. Aguarde e atualize o carnê antes de continuar.');
    }
    done += 1;
    onProgress({ done, total: candidates.length });
  }
  return plan;
}

export async function issueOtherCreditPlanSequentially(
  planId: string,
  read: (id: string) => Promise<OtherCreditPlan>,
  issue: (id: string) => Promise<unknown>,
  onProgress: (progress: OtherCreditPlanProgress) => void,
) {
  let plan = await read(planId);
  const total = plan.receivables.filter(item => otherCreditPlanEmissionState(item) !== 'closed').length;
  const progress = () => onProgress({ total, done: plan.receivables.filter(item => otherCreditPlanEmissionState(item) === 'issued').length });
  progress();
  while (true) {
    const review = plan.receivables.find(item => otherCreditPlanEmissionState(item) === 'review');
    if (review) throw new Error('Uma cobrança precisa de conferência bancária. Atualize o carnê antes de continuar a emissão.');
    const next = plan.receivables.find(item => otherCreditPlanEmissionState(item) === 'pending');
    if (!next) return plan;
    await issue(next.id);
    plan = await read(planId);
    const updated = plan.receivables.find(item => item.id === next.id);
    if (!updated || !['issued', 'closed'].includes(otherCreditPlanEmissionState(updated))) {
      throw new Error('A emissão desta cobrança ainda não foi confirmada. Atualize o carnê para conferir antes de continuar.');
    }
    progress();
  }
}
