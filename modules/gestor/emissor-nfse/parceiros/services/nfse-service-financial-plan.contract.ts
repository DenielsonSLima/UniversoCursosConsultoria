import { NfseContractError } from '../../services/nfse.errors';
import { boolean, integer, list, oneOf, record, string } from '../../services/nfse.validation';
import type { NfseServiceFinancialPlan, NfseServiceFinancialPreview } from '../types/nfse-partner-services.types';

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : (() => { throw new NfseContractError(); })();
const date = (value: unknown) => { const text = string(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new NfseContractError(); return text; };
export function parseNfseServiceFinancialPlan(value: unknown): NfseServiceFinancialPlan {
  const p = record(value), installments = integer(p.installments, 1), categoryId = string(p.categoryId);
  if (installments > 60 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) throw new NfseContractError();
  const monthlyInterestPercent = number(p.monthlyInterestPercent), penaltyPercent = number(p.penaltyPercent);
  const discountValue = number(p.discountValue), discountDaysBeforeDue = integer(p.discountDaysBeforeDue);
  const discountType = oneOf(p.discountType, ['FIXO', 'PERCENTUAL']);
  if (monthlyInterestPercent >= 100 || penaltyPercent >= 100 || discountDaysBeforeDue > 60
    || (discountType === 'PERCENTUAL' && discountValue >= 100)) throw new NfseContractError();
  return { installments, firstDueDate: date(p.firstDueDate), categoryId, monthlyInterestPercent, penaltyPercent,
    discountType, discountValue, discountDaysBeforeDue, periodicity: oneOf(p.periodicity, ['MENSAL_CALENDARIO', 'DIAS_CORRIDOS_30']),
    issueBolePix: boolean(p.issueBolePix), ...(p.previewToken === undefined ? {} : { previewToken: string(p.previewToken) }) };
}
export function parseNfseServiceFinancialPreview(value: unknown): NfseServiceFinancialPreview {
  const result = record(value), financialPlan = parseNfseServiceFinancialPlan(result.financialPlan), token = string(result.token);
  const p = record(result.preview);
  if (p.versao !== 1 || p.quantidadeParcelas !== financialPlan.installments || financialPlan.previewToken !== token) throw new NfseContractError();
  const totalParcelas = number(p.totalParcelas), totalTaxas = number(p.totalTaxas), totalNominal = number(p.totalNominal), totalComDesconto = number(p.totalComDesconto);
  if (totalTaxas !== 0 || totalNominal <= 0 || totalComDesconto > totalNominal) throw new NfseContractError();
  const parcelas = list(p.parcelas, value => {
    const item = record(value), terms = record(item.financialTerms);
    const parseTerm = (value: unknown, kind: 'discount' | 'penalty' | 'interest') => {
      if (value === null) return null;
      const term = record(value), type = string(term.type), amount = number(term.value);
      if (!(kind === 'interest' ? ['daily-fixed', 'monthly-percentage'] : ['fixed', 'percentage']).includes(type)) throw new NfseContractError();
      return kind === 'discount' ? { type, value: amount, validUntil: date(term.validUntil) } : { type, value: amount, startsOn: date(term.startsOn) };
    };
    return { ordem: integer(item.ordem, 1), papel: oneOf(item.papel, ['PARCELA']), numero: integer(item.numero, 1), valor: number(item.valor),
      dataVencimento: date(item.dataVencimento), valorComDesconto: number(item.valorComDesconto), financialTerms: {
        nominalAmount: number(terms.nominalAmount), dueDate: date(terms.dueDate), discount: parseTerm(terms.discount, 'discount'),
        penalty: parseTerm(terms.penalty, 'penalty'), interest: parseTerm(terms.interest, 'interest') } };
  });
  if (parcelas.length !== financialPlan.installments || parcelas.some((p, index) => p.numero !== index + 1 || p.valor <= 0)) throw new NfseContractError();
  // Terms and schedule are supplied by the canonical engine; the client only validates their shape.
  return { financialPlan, token, preview: { versao: 1, input: record(p.input), quantidadeParcelas: financialPlan.installments,
    totalParcelas, totalTaxas, totalNominal, totalComDesconto, parcelas } as NfseServiceFinancialPreview['preview'] };
}
