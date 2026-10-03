import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCandidateAmount,
  formatCandidateCharges,
  formatPolicyPercentage,
  isMissingRenegociacaoRpc,
  parseCandidateItems,
  parsePreview,
  parseProposalDetail,
  parseProposalPage,
  parseReadiness,
  renegociacaoPolicyInheritedLabel,
} from './renegociacoes.model.ts';
import { buildDiscardRpcArgs, buildPreviewRpcArgs, buildSaveRpcArgs } from './renegociacoes.payloads.ts';

const defaults = {
  origin: 'MATRICULA',
  punctualDiscount: { kind: 'FIXED_CENTS', amountCents: 1500 },
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE', basisPoints: 100 },
  penalty: { kind: 'PERCENTAGE', basisPoints: 200 },
};

const eligible = {
  receivableId: '11111111-1111-4111-8111-111111111111',
  number: 1,
  label: 'Mensalidade 1',
  dueDate: '2026-09-10',
  status: 'PENDENTE',
  overdue: true,
  lateDays: 23,
  principalCents: 10000,
  interestCents: 100,
  penaltyCents: 200,
  debtCents: 10300,
  policyKind: 'PLANO_UNICO',
  sourceSystem: 'LOCAL',
  eligibility: { eligible: true, code: 'ELIGIBLE', reason: 'Elegível' },
};

const buildPreviewPayload = () => ({
  version: 1,
  asOf: '2026-10-03',
  identity: { poloId: 'polo', alunoId: 'aluno', matriculaId: 'matricula', turmaId: 'turma' },
  selection: { receivableIds: [eligible.receivableId], itemCount: 1, overdueCount: 1, futureCount: 0 },
  sourceItems: [
    { ...eligible, position: 1, openAmountCents: 10000, sourceFingerprint: 'source', sourcePolicySnapshot: {} },
  ],
  policySnapshot: {
    kind: 'PLANO_UNICO',
    defaults,
    effective: {
      punctualDiscount: defaults.punctualDiscount,
      monthlyInterest: defaults.monthlyInterest,
      penalty: defaults.penalty,
    },
    provenance: { punctualDiscount: 'HERDADO', monthlyInterest: 'HERDADO', penalty: 'HERDADO' },
    differsFromDefault: false,
  },
  calculationSnapshot: { server: true },
  totals: {
    principalCents: 10000,
    accruedInterestCents: 100,
    accruedPenaltyCents: 200,
    grossDebtCents: 10300,
    waivedInterestCents: 0,
    waivedPenaltyCents: 0,
    commercialDiscountCents: 300,
    negotiatedCents: 10000,
    downPaymentCents: 1000,
    financedCents: 9000,
  },
  schedule: {
    installmentCount: 2,
    firstDueDate: '2026-11-10',
    entries: [
      { sequence: 0, kind: 'DOWN_PAYMENT', dueDate: '2026-10-03', amountCents: 1000 },
      { sequence: 1, kind: 'INSTALLMENT', dueDate: '2026-11-10', amountCents: 4500 },
      { sequence: 2, kind: 'INSTALLMENT', dueDate: '2026-12-10', amountCents: 4500 },
    ],
  },
  requiresApproval: true,
  approvalReasons: ['COMMERCIAL_DISCOUNT'],
  selectionFingerprint: 'selection',
  policyFingerprint: 'policy',
  calculationFingerprint: 'calculation',
  proposalFingerprint: 'proposal',
});

test('mantém item bloqueado visível sem inventar montantes zero', () => {
  const result = parseCandidateItems({
    version: 1,
    asOf: '2026-10-03',
    identity: { poloId: 'polo', alunoId: 'aluno', matriculaId: 'matricula', turmaId: 'turma' },
    policyDefaults: defaults,
    items: [
      eligible,
      {
        ...eligible,
        receivableId: '22222222-2222-4222-8222-222222222222',
        principalCents: null,
        interestCents: null,
        penaltyCents: null,
        debtCents: null,
        eligibility: { eligible: false, code: 'PARTIAL_PAYMENT', reason: 'Pagamento parcial' },
      },
    ],
  });
  assert.equal(result.items[0]?.debtCents, 10300);
  assert.equal(result.items[1]?.debtCents, null);
  assert.equal(result.items[1]?.eligibility.code, 'PARTIAL_PAYMENT');
});

test('falha fechado quando item elegível omite valor financeiro', () => {
  assert.throws(
    () =>
      parseCandidateItems({
        version: 1,
        asOf: '2026-10-03',
        identity: { poloId: 'polo', alunoId: 'aluno', matriculaId: 'matricula', turmaId: 'turma' },
        policyDefaults: defaults,
        items: [{ ...eligible, debtCents: null }],
      }),
    /saldo da parcela inválido/,
  );
});

test('normaliza preview canônico sem recalcular totais ou cronograma', () => {
  const preview = parsePreview(buildPreviewPayload());
  assert.equal(preview.totals.negotiatedCents, 10000);
  assert.deepEqual(
    preview.schedule.entries.map((item) => item.amountCents),
    [1000, 4500, 4500],
  );
  assert.equal(preview.requiresApproval, true);
});

test('preserva cronograma v2, termos bancários e regra de 60 dias recebidos do cálculo oficial', () => {
  const base = buildPreviewPayload();
  const payload = { ...base, version: 2,
    policySnapshot: { ...base.policySnapshot, receiptPolicy: { daysAfterDue: 60, instruction: 'Não receber após 60 dias do vencimento.' } },
    schedule: { ...base.schedule, cadence: 'FIXED_DAYS', intervalDays: 45,
      entries: base.schedule.entries.map((entry) => ({ ...entry, financialTerms: { nominalAmount: entry.amountCents / 100, dueDate: entry.dueDate } })) },
  };
  const result = parsePreview(payload);
  assert.equal(result.schedule.cadence, 'FIXED_DAYS');
  assert.equal(result.schedule.intervalDays, 45);
  assert.deepEqual(result.schedule.entries, payload.schedule.entries);
  assert.deepEqual(result.policySnapshot.receiptPolicy, payload.policySnapshot.receiptPolicy);
  assert.throws(() => parsePreview({ ...payload, schedule: { ...payload.schedule, cadence: 'FORTNIGHTLY' } }), /frequência.*inválida/);
});

test('readiness só habilita ativação pelas capabilities operacionais retornadas', () => {
  const available = parseReadiness({ applied: true, version: 2, rulesReady: true, capabilities: {
    activateProposal: true, cancelSourceTitles: true, issueReplacementTitles: true, getActivation: true,
  }, lifecycleStatuses: ['PROPOSED', 'ACTIVATING', 'ACTIVE', 'REVIEW_REQUIRED'] });
  assert.equal(available.availability === 'AVAILABLE' && available.capabilities.activate, true);
  const absent = parseReadiness({ applied: true, capabilities: {} });
  assert.equal(absent.availability === 'AVAILABLE' && absent.capabilities.activate, false);
  assert.equal(absent.availability === 'AVAILABLE' && absent.capabilities.getActivation, false);
});

test('aprovação customizada depende de capability booleana do backend, sem inferência de cargo ou ativação', () => {
  const row = {
    id: 'agreement', lifecycleStatus: 'PROPOSED', version: 2,
    poloId: 'polo', alunoId: 'aluno', matriculaId: 'matricula', turmaId: 'turma', studentName: 'Aluno sintético',
    sourcePrincipalCents: 10000, sourceOpenCents: 10000, negotiatedCents: 9000, asOf: '2026-10-03',
    selectionFingerprint: 'selection', policyFingerprint: 'policy', calculationFingerprint: 'calculation', proposalFingerprint: 'proposal',
  };
  const parse = (canApproveCustomTerms: unknown) => parseProposalPage({ rows: [{ ...row,
    capabilities: { canActivate: true, canApproveCustomTerms } }] }).rows[0].capabilities;
  assert.equal(parse(true).canApproveCustomTerms, true);
  for (const value of [false, undefined, null, 'true', 1]) {
    assert.equal(parse(value).canApproveCustomTerms, false);
    assert.equal(parse(value).canActivate, true, 'canActivate não concede aprovação por si só');
  }
});

test('falha fechado quando metadados de aprovação vêm ausentes ou malformados', () => {
  assert.throws(
    () => parsePreview({ ...buildPreviewPayload(), requiresApproval: 'false' }),
    /exigência de aprovação da simulação inválida/,
  );
  assert.throws(
    () => parsePreview({ ...buildPreviewPayload(), approvalReasons: [false] }),
    /motivos de aprovação da simulação inválidos/,
  );
  assert.throws(
    () => parseProposalDetail({ canonicalSnapshot: { requiresApproval: false, approvalReasons: null } }),
    /motivos de aprovação da proposta inválidos/,
  );
});

test('não apresenta política desconhecida como herdada', () => {
  const payload = buildPreviewPayload();
  payload.policySnapshot.provenance.penalty = 'DESCONHECIDA';
  assert.throws(() => parsePreview(payload), /proveniência das condições financeiras inválida/);
});

test('payload de preview e save repete exatamente condições, data-base e CAS', () => {
  const previewInput = {
    receivableIds: [eligible.receivableId],
    terms: { commercialDiscountCents: 300, downPaymentCents: 1000, installmentCount: 2, firstDueDate: '2026-11-10' },
    policyOverrides: { monthlyInterestBasisPoints: 120, waivedPenaltyCents: 200 },
    asOf: '2026-10-03',
  };
  const previewArgs = buildPreviewRpcArgs(previewInput);
  const saveArgs = buildSaveRpcArgs({
    ...previewInput,
    requestId: '33333333-3333-4333-8333-333333333333',
    expectedProposalFingerprint: 'proposal',
    submit: true,
    reason: ' Condição aprovada ',
  });
  assert.equal(saveArgs.p_terms, previewArgs.p_terms);
  assert.equal(saveArgs.p_policy_overrides, previewArgs.p_policy_overrides);
  assert.equal(saveArgs.p_as_of, previewArgs.p_as_of);
  assert.equal(saveArgs.p_expected_proposal_fingerprint, 'proposal');
  assert.equal(saveArgs.p_reason, 'Condição aprovada');
  assert.deepEqual(Object.keys(saveArgs).sort(), [
    'p_as_of',
    'p_expected_proposal_fingerprint',
    'p_policy_overrides',
    'p_reason',
    'p_receivable_ids',
    'p_request_id',
    'p_submit',
    'p_terms',
  ]);
});

test('descarte envia versão e fingerprint para concorrência otimista', () => {
  const args = buildDiscardRpcArgs({
    requestId: '44444444-4444-4444-8444-444444444444',
    agreementId: '55555555-5555-4555-8555-555555555555',
    expectedVersion: 7,
    expectedFingerprint: 'fingerprint-7',
    reason: ' Duplicidade ',
  });
  assert.equal(args.p_expected_version, 7);
  assert.equal(args.p_expected_fingerprint, 'fingerprint-7');
  assert.equal(args.p_reason, 'Duplicidade');
});

test('somente PGRST202 representa ambiente ainda não preparado', () => {
  assert.equal(isMissingRenegociacaoRpc({ code: 'PGRST202' }), true);
  assert.equal(isMissingRenegociacaoRpc({ code: '42501' }), false);
  assert.throws(() => parseReadiness({ applied: false }), /disponibilidade/);
});

test('apresentação preserva ausência, origem e percentual canônico', () => {
  assert.equal(formatCandidateAmount(null), 'Não calculado');
  assert.equal(formatCandidateCharges(null, 0), 'Não calculado');
  assert.equal(formatCandidateAmount(0), 'R$ 0,00');
  assert.equal(renegociacaoPolicyInheritedLabel('MATRICULA'), 'Herdado da matrícula');
  assert.equal(renegociacaoPolicyInheritedLabel('TURMA'), 'Herdado da turma');
  assert.equal(formatPolicyPercentage({ basisPoints: 123, percent: 1.2345 }), '1,2345%');
});
