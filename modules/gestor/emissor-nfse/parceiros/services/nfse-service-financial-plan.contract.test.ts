import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfsePartnerServices } from './nfse-partner-services.service-core';
import { parseNfseServiceFinancialPlan, parseNfseServiceFinancialPreview } from './nfse-service-financial-plan.contract';
import { nfsePartnerServiceDefinition } from './nfse-partner-services.contract';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), month: '2026-11', environment: 'HOMOLOGACAO' as const };
const plan = { installments: 3, firstDueDate: '2026-11-30', categoryId: id(3), monthlyInterestPercent: 2, penaltyPercent: 1,
  discountType: 'PERCENTUAL' as const, discountValue: 5, discountDaysBeforeDue: 0, periodicity: 'MENSAL_CALENDARIO' as const, issueBolePix: true };
const preview = { versao: 1, input: {}, quantidadeParcelas: 3, totalParcelas: 100, totalTaxas: 0, totalNominal: 100, totalComDesconto: 95,
  parcelas: [33.34, 33.33, 33.33].map((valor, index) => ({ ordem: index + 1, numero: index + 1, papel: 'PARCELA', valor,
    dataVencimento: '2026-11-30', valorComDesconto: index ? 31.66 : 31.68, financialTerms: { nominalAmount: valor, dueDate: '2026-11-30',
      discount: { type: 'percentage', value: 5, validUntil: '2026-11-30' }, penalty: { type: 'percentage', value: 1, startsOn: '2026-12-01' },
      interest: { type: 'monthly-percentage', value: 2, startsOn: '2026-12-01' } } })) };

test('financial preview transports the approved fiscal scope/total and returns only the canonical plan and schedule', async () => {
  const canonical = { financialPlan: { ...plan, previewToken: 'bound-token' }, token: 'bound-token', preview };
  const service = createNfsePartnerServices(async (name, args) => {
    assert.equal(name, 'preview_nfse_service_financial_plan_secure');
    assert.equal(args.p_polo_id, scope.poloId); assert.equal(args.p_partner_id, id(4)); assert.equal(args.p_amount, '100.00');
    assert.equal(args.p_service_description, 'Serviço de 01/11/2026 ATÉ 30/11/2026'); assert.deepEqual(args.p_financial_plan, plan);
    return { version: 1, scope, data: canonical };
  });
  const result = await service.previewFinancialPlan(scope, id(4), '100.00', 'Serviço de 01/11/2026 ATÉ 30/11/2026', plan);
  assert.equal(result.preview.parcelas[0].valor, 33.34); assert.equal(result.financialPlan.previewToken, result.token);
  const definition = nfsePartnerServiceDefinition({ requestId: id(5), partnerId: id(4), modelId: id(6), modelVersion: 1,
    serviceDate: '2026-11-12', serviceDescription: 'Serviço sintético.', amount: '100.00', generateReceivable: true,
    existingReceivableId: null, dueDate: plan.firstDueDate, categoryId: plan.categoryId, financialPlan: result.financialPlan });
  assert.deepEqual(definition.financialPlan, result.financialPlan);
});

test('financial preview rejects invalid token, fees, inconsistent installments and invalid plan inputs', () => {
  const canonical = { financialPlan: { ...plan, previewToken: 'bound-token' }, token: 'bound-token', preview };
  assert.throws(() => parseNfseServiceFinancialPreview({ ...canonical, token: 'foreign-token' }));
  for (const change of [{ totalTaxas: 10 }, { quantidadeParcelas: 2 }, { parcelas: preview.parcelas.slice(1) },
    { parcelas: [{ ...preview.parcelas[0], papel: 'MATRICULA' }, ...preview.parcelas.slice(1)] }]) {
    assert.throws(() => parseNfseServiceFinancialPreview({ ...canonical, preview: { ...preview, ...change } }));
  }
  for (const change of [{ installments: 0 }, { installments: 61 }, { categoryId: '' }, { monthlyInterestPercent: 100 },
    { penaltyPercent: -1 }, { discountDaysBeforeDue: 61 }, { issueBolePix: 'true' }]) {
    assert.throws(() => parseNfseServiceFinancialPlan({ ...plan, ...change }));
  }
});
