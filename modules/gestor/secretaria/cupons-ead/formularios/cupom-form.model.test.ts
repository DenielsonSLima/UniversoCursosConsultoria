import assert from 'node:assert/strict';
import test from 'node:test';
import { createCupomForm, cupomFormToDraft, toLocalDateTime, validateCupomForm } from './cupom-form.model.ts';
import type { EadCoupon } from '../../../../ead/cupons/coupons-management.types.ts';

const now = new Date('2026-11-16T12:00:00.000Z');
const validForm = () => ({ ...createCupomForm(null, now), code: 'EAD50' });

test('cadastro preserva campos configuráveis e normaliza código sem calcular desconto no cliente', () => {
  const form = { ...validForm(), code: ' ead50 ', perStudentLimit: '3', totalLimit: '120' };
  assert.equal(validateCupomForm(form), null);
  const result = cupomFormToDraft(form);
  assert.equal(result.code, 'EAD50');
  assert.equal(result.discountPercent, 50);
  assert.equal(result.totalLimit, 120);
  assert.equal(result.perStudentLimit, 3);
  assert.equal(result.startsAt, now.toISOString());
  assert.deepEqual(result.courseIds, []);
  assert.equal('payableAmount' in result, false);
  assert.equal('discountAmount' in result, false);
});

test('gratuidade, total ilimitado e cursos selecionados mantêm IDs canônicos únicos', () => {
  const form = { ...validForm(), discountPercent: '100' as const, unlimited: true, totalLimit: '', allCourses: false,
    courseIds: ['curso-ficticio-a', 'curso-ficticio-b', 'curso-ficticio-a'] };
  const result = cupomFormToDraft(form);
  assert.equal(result.discountPercent, 100);
  assert.equal(result.totalLimit, null);
  assert.deepEqual(result.courseIds, ['curso-ficticio-a', 'curso-ficticio-b']);
});

test('todos os cursos elimina vínculos antigos do payload e desativação permanece explícita', () => {
  const result = cupomFormToDraft({ ...validForm(), allCourses: true, courseIds: ['antigo'], active: false });
  assert.deepEqual(result.courseIds, []);
  assert.equal(result.active, false);
});

test('edição preserva versão do servidor e configuração com total ilimitado', () => {
  const coupon: EadCoupon = { ...cupomFormToDraft(validForm()), id: 'cupom-ficticio', poloId: 'polo-ficticio',
    totalLimit: null, discountPercent: 100, allCourses: false, courseIds: ['curso-ficticio'], reservedCount: 0,
    confirmedCount: 1, createdAt: now.toISOString(), updatedAt: '2026-11-16T12:05:00.123Z' };
  const form = createCupomForm(coupon);
  assert.equal(form.unlimited, true);
  const draft = cupomFormToDraft(form, coupon.id, coupon.updatedAt);
  assert.equal(draft.id, coupon.id);
  assert.equal(draft.updatedAt, coupon.updatedAt);
  assert.equal(draft.totalLimit, null);
  assert.deepEqual(draft.courseIds, coupon.courseIds);
});

test('rejeita código fora do contrato, benefício inesperado e curso selecionado vazio', () => {
  for (const code of ['AB', '_ABC', '___', 'EAD 50', 'A'.repeat(41)]) {
    assert.match(validateCupomForm({ ...validForm(), code })!, /código/);
  }
  assert.match(validateCupomForm({ ...validForm(), discountPercent: '25' as '50' })!, /benefício/);
  assert.match(validateCupomForm({ ...validForm(), allCourses: false, courseIds: [] })!, /Selecione ao menos/);
});

test('limites exigem inteiros positivos e não aceitam decimal, negativo ou infinito', () => {
  for (const value of ['0', '-1', '1.5', 'Infinity', '9007199254740992', '']) {
    assert.match(validateCupomForm({ ...validForm(), totalLimit: value })!, /quantidade total/);
    assert.match(validateCupomForm({ ...validForm(), perStudentLimit: value })!, /cada aluno/);
  }
});

test('validade rejeita datas ausentes, inválidas, invertidas e iguais', () => {
  assert.match(validateCupomForm({ ...validForm(), startsAt: '' })!, /início e o fim/);
  assert.match(validateCupomForm({ ...validForm(), endsAt: 'inválida' })!, /início e o fim/);
  const form = validForm();
  assert.match(validateCupomForm({ ...form, endsAt: form.startsAt })!, /posterior/);
  assert.throws(() => cupomFormToDraft({ ...form, endsAt: toLocalDateTime(new Date(now.getTime() - 60_000)) }), /posterior/);
});

test('datas locais fazem roundtrip e seleção editada não altera objeto do servidor', () => {
  assert.equal(new Date(toLocalDateTime(now)).toISOString(), now.toISOString());
  assert.equal(toLocalDateTime('inválida'), '');
  const ids = ['curso-ficticio'];
  const coupon = { ...cupomFormToDraft(validForm()), courseIds: ids } as EadCoupon;
  createCupomForm(coupon).courseIds.push('outro');
  assert.deepEqual(ids, ['curso-ficticio']);
});
