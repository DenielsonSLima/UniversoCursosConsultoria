import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTermsDefaults, buildTermsInput, initialTermsForm, termsFormError } from './renegociacoes.terms-form.ts';
import type { RenegociacaoPolicyDefaults } from './renegociacoes.types.ts';

const defaults: RenegociacaoPolicyDefaults = {
  origin: 'TURMA', punctualDiscount: { kind: 'FIXED_CENTS', amountCents: 1000 },
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE', basisPoints: 100 }, penalty: { kind: 'PERCENTAGE', basisPoints: 200 },
};
const form = () => ({ ...initialTermsForm(), targetNegotiated: '300,00', firstDueDate: '2026-11-10' });

test('total-alvo e desconto comercial são alternativas exclusivas no contrato, sem cálculo local', () => {
  const input = buildTermsInput(form(), defaults, ['rec-1'], '2026-10-03');
  assert.equal(input?.terms.targetNegotiatedCents, 30000);
  assert.equal(Object.hasOwn(input!.terms, 'commercialDiscountCents'), false);
  const adjustments = buildTermsInput({ ...form(), amountMode: 'ADJUSTMENTS', commercialDiscount: '30,00' }, defaults, ['rec-1']);
  assert.equal(adjustments?.terms.commercialDiscountCents, 3000);
  assert.equal(Object.hasOwn(adjustments!.terms, 'targetNegotiatedCents'), false);
  assert.equal(Object.hasOwn(input!.terms, 'amountMode'), false);
});

test('mensal não envia intervalo e dias fixos respeitam 1..365', () => {
  assert.equal(Object.hasOwn(buildTermsInput(form(), defaults, ['rec-1'])!.terms, 'intervalDays'), false);
  for (const intervalDays of ['0', '366', '1.5', '']) {
    assert.match(termsFormError({ ...form(), cadence: 'FIXED_DAYS', intervalDays }, defaults)!, /1 a 365/);
  }
  const input = buildTermsInput({ ...form(), cadence: 'FIXED_DAYS', intervalDays: '45' }, defaults, ['rec-1']);
  assert.equal(input?.terms.intervalDays, 45);
});

test('entrada integral envia zero parcelas e não exige vencimento do saldo inexistente', () => {
  const input = buildTermsInput({ ...form(), installmentCount: '0', downPayment: '300,00', firstDueDate: '' }, defaults, ['rec-1']);
  assert.equal(input?.terms.installmentCount, 0);
  assert.equal(input?.terms.downPaymentCents, 30000);
  assert.equal(Object.hasOwn(input!.terms, 'firstDueDate'), false);
  for (const installmentCount of ['61', '-1', '1.2', '']) {
    assert.equal(buildTermsInput({ ...form(), installmentCount }, defaults, ['rec-1']), null);
  }
  assert.ok(buildTermsInput({ ...form(), installmentCount: '60' }, defaults, ['rec-1']));
});

test('refetch atualiza herança, preserva personalizações e nunca envia juros herdados como override', () => {
  const custom = { ...form(), customInterest: true, monthlyInterest: '1,37', customPenalty: true, penalty: '2,45' };
  const nextDefaults = { ...defaults, punctualDiscount: { ...defaults.punctualDiscount, amountCents: 2000 } };
  const next = applyTermsDefaults(custom, nextDefaults);
  assert.equal(next.monthlyInterest, '1,37');
  assert.equal(next.penalty, '2,45');
  assert.equal(next.punctualDiscount, '20,00');
  assert.deepEqual(buildTermsInput(next, nextDefaults, ['rec-1'])?.policyOverrides, {
    monthlyInterestBasisPoints: 137, penalty: { kind: 'PERCENTAGE', basisPoints: 245 },
  });
  assert.equal(applyTermsDefaults({ ...next, customInterest: false }, defaults).monthlyInterest, '1');
  assert.equal(buildTermsInput(form(), defaults, ['rec-1'])?.policyOverrides.monthlyInterestBasisPoints, undefined);
});
