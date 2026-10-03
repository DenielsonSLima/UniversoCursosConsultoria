import type {
  RenegociacaoCandidateGroup,
  RenegociacaoCandidateItem,
  RenegociacaoCandidateItemsResult,
  RenegociacaoCandidatePage,
  RenegociacaoEvent,
  RenegociacaoLifecycleStatus,
  RenegociacaoPenalty,
  RenegociacaoPolicyDefaults,
  RenegociacaoPolicySnapshot,
  RenegociacaoPreview,
  RenegociacaoProposalDetail,
  RenegociacaoProposalPage,
  RenegociacaoProposalSummary,
  RenegociacaoReadiness,
  RenegociacaoSourceItem,
} from './renegociacoes.types';

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : {};
const read = (row: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return undefined;
};
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const nullableText = (value: unknown) => text(value).trim() || null;
const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const strictInteger = (value: unknown, label: string) => {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error(`O servidor retornou ${label} inválido na renegociação.`);
  return parsed;
};
const money = (value: unknown, label: string) => {
  const parsed = strictInteger(value, label);
  if (parsed < 0) throw new Error(`O servidor retornou ${label} negativo na renegociação.`);
  return parsed;
};
const optionalNonNegativeNumber = (value: unknown, label: string) => {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`O servidor retornou ${label} inválido na renegociação.`);
  return parsed;
};
const required = (row: UnknownRecord, label: string, ...keys: string[]) => {
  const value = text(read(row, ...keys)).trim();
  if (!value) throw new Error(`O servidor não retornou ${label} da renegociação.`);
  return value;
};
const array = (row: UnknownRecord, key: string) => {
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`O servidor não retornou ${key} da renegociação.`);
  return value;
};
const approvalMetadata = (row: UnknownRecord, context: string) => {
  if (typeof row.requiresApproval !== 'boolean')
    throw new Error(`O servidor retornou a exigência de aprovação ${context} inválida.`);
  if (!Array.isArray(row.approvalReasons) || row.approvalReasons.some((reason) => typeof reason !== 'string'))
    throw new Error(`O servidor retornou os motivos de aprovação ${context} inválidos.`);
  return { requiresApproval: row.requiresApproval, approvalReasons: row.approvalReasons as string[] };
};

export const unwrapRenegociacaoRpc = (value: unknown) =>
  Array.isArray(value) && value.length === 1 ? value[0] : value;

const parsePenalty = (value: unknown): RenegociacaoPenalty => {
  const row = record(value);
  if (row.kind === 'PERCENTAGE')
    return {
      kind: 'PERCENTAGE',
      basisPoints: strictInteger(row.basisPoints, 'o percentual da multa'),
      percent: optionalNonNegativeNumber(row.percent, 'o percentual exato da multa'),
      unit: text(row.unit) || undefined,
    };
  if (row.kind === 'FIXED_CENTS')
    return { kind: 'FIXED_CENTS', amountCents: money(row.amountCents, 'o valor da multa') };
  throw new Error('O servidor retornou uma regra de multa não reconhecida.');
};

const parsePolicyDefaults = (value: unknown): RenegociacaoPolicyDefaults => {
  const row = record(value);
  const punctual = record(row.punctualDiscount);
  const interest = record(row.monthlyInterest);
  return {
    origin: text(row.origin, 'Regra da turma'),
    punctualDiscount: { kind: 'FIXED_CENTS', amountCents: money(punctual.amountCents, 'o desconto de pontualidade') },
    monthlyInterest: {
      kind: 'MONTHLY_PERCENTAGE',
      basisPoints: strictInteger(interest.basisPoints, 'o juro mensal'),
      percent: optionalNonNegativeNumber(interest.percent, 'o percentual exato dos juros'),
      unit: text(interest.unit) || undefined,
    },
    penalty: parsePenalty(row.penalty),
  };
};

const isLifecycleStatus = (value: unknown): value is RenegociacaoLifecycleStatus =>
  value === 'DRAFT' || value === 'PROPOSED' || value === 'CANCELED';

export const parseReadiness = (value: unknown): RenegociacaoReadiness => {
  const row = record(unwrapRenegociacaoRpc(value));
  if (row.applied !== true) throw new Error('O servidor retornou uma disponibilidade de renegociação inválida.');
  const capabilities = record(row.capabilities);
  const reasons = record(row.unavailableReasons);
  return {
    availability: 'AVAILABLE',
    version: integer(row.version, 1),
    applied: true,
    rulesReady: row.rulesReady === true,
    capabilities: {
      listProposals: capabilities.listProposals === true,
      viewProposal: capabilities.viewProposal === true,
      saveProposal: capabilities.saveProposal === true,
      discardProposal: capabilities.discardProposal === true,
      activate: false,
      cancelSourceTitles: false,
      issueReplacementTitles: false,
    },
    unavailableReasons: Object.fromEntries(
      Object.entries(reasons).filter((item): item is [string, string] => typeof item[1] === 'string'),
    ),
    lifecycleStatuses: Array.isArray(row.lifecycleStatuses)
      ? row.lifecycleStatuses.filter(isLifecycleStatus)
      : ['DRAFT', 'PROPOSED', 'CANCELED'],
  };
};

const parseGroup = (value: unknown): RenegociacaoCandidateGroup => {
  const row = record(value);
  return {
    poloId: required(row, 'o polo', 'poloId'),
    alunoId: required(row, 'o aluno', 'alunoId'),
    alunoNome: required(row, 'o nome do aluno', 'alunoNome'),
    matriculaId: required(row, 'a matrícula', 'matriculaId'),
    matriculaCodigo: nullableText(row.matriculaCodigo),
    turmaId: required(row, 'a turma', 'turmaId'),
    turmaNome: required(row, 'o nome da turma', 'turmaNome'),
    policyKind: text(row.policyKind, 'UNKNOWN'),
    eligibleCount: integer(row.eligibleCount),
    blockedCount: integer(row.blockedCount),
    overdueCount: integer(row.overdueCount),
    futureCount: integer(row.futureCount),
    principalCents: money(row.principalCents, 'o principal'),
    accruedInterestCents: money(row.accruedInterestCents, 'os juros acumulados'),
    accruedPenaltyCents: money(row.accruedPenaltyCents, 'a multa acumulada'),
    grossDebtCents: money(row.grossDebtCents, 'a dívida total'),
    oldestDueDate: nullableText(row.oldestDueDate),
    nextDueDate: nullableText(row.nextDueDate),
  };
};

export const parseCandidatePage = (value: unknown): RenegociacaoCandidatePage => {
  const row = record(unwrapRenegociacaoRpc(value));
  const groups = array(row, 'groups').map(parseGroup);
  return {
    version: integer(row.version, 1),
    asOf: required(row, 'a data-base', 'asOf'),
    groups,
    totalGroups: integer(row.totalGroups, groups.length),
    page: Math.max(1, integer(row.page, 1)),
    pageSize: Math.max(1, integer(row.pageSize, 20)),
  };
};

const parseCandidateItem = (value: unknown): RenegociacaoCandidateItem => {
  const row = record(value);
  const eligibility = record(row.eligibility);
  const eligible = eligibility.eligible === true;
  const candidateMoney = (amount: unknown, label: string) => {
    if (amount == null && !eligible) return null;
    return money(amount, label);
  };
  return {
    receivableId: required(row, 'o identificador da parcela', 'receivableId'),
    number: row.number == null ? null : integer(row.number),
    label: text(row.label, 'Parcela'),
    dueDate: required(row, 'o vencimento', 'dueDate'),
    status: text(row.status, 'PENDENTE'),
    overdue: row.overdue === true,
    lateDays: strictInteger(row.lateDays, 'os dias em atraso'),
    principalCents: candidateMoney(row.principalCents, 'o principal da parcela'),
    interestCents: candidateMoney(row.interestCents, 'os juros da parcela'),
    penaltyCents: candidateMoney(row.penaltyCents, 'a multa da parcela'),
    debtCents: candidateMoney(row.debtCents, 'o saldo da parcela'),
    policyKind: text(row.policyKind, 'UNKNOWN'),
    sourceSystem: text(row.sourceSystem, 'LOCAL'),
    eligibility: {
      eligible,
      code: text(eligibility.code, 'UNKNOWN_POLICY'),
      reason: text(eligibility.reason, 'Elegibilidade não confirmada.'),
    },
  };
};

const parseIdentity = (value: unknown) => {
  const row = record(value);
  return {
    poloId: required(row, 'o polo', 'poloId'),
    alunoId: required(row, 'o aluno', 'alunoId'),
    matriculaId: required(row, 'a matrícula', 'matriculaId'),
    turmaId: required(row, 'a turma', 'turmaId'),
  };
};

export const parseCandidateItems = (value: unknown): RenegociacaoCandidateItemsResult => {
  const row = record(unwrapRenegociacaoRpc(value));
  return {
    version: integer(row.version, 1),
    asOf: required(row, 'a data-base', 'asOf'),
    identity: parseIdentity(row.identity),
    policyDefaults: row.policyDefaults == null ? null : parsePolicyDefaults(row.policyDefaults),
    items: array(row, 'items').map(parseCandidateItem),
  };
};

const parseSourceItem = (value: unknown): RenegociacaoSourceItem => {
  const row = record(value);
  const base = parseCandidateItem({ ...row, label: `Parcela ${integer(row.number)}`, eligibility: { eligible: true } });
  const { label: _label, eligibility: _eligibility, ...item } = base;
  if (
    item.principalCents == null ||
    item.interestCents == null ||
    item.penaltyCents == null ||
    item.debtCents == null
  ) {
    throw new Error('O servidor não retornou os valores dos títulos originais.');
  }
  return {
    ...item,
    principalCents: item.principalCents,
    interestCents: item.interestCents,
    penaltyCents: item.penaltyCents,
    debtCents: item.debtCents,
    position: strictInteger(row.position, 'a posição da parcela'),
    openAmountCents: money(row.openAmountCents, 'o saldo aberto da parcela'),
    sourceFingerprint: required(row, 'a identidade da parcela', 'sourceFingerprint'),
    sourcePolicySnapshot: record(row.sourcePolicySnapshot),
    releasedAt: nullableText(row.releasedAt),
  };
};

const parsePolicySnapshot = (value: unknown): RenegociacaoPolicySnapshot => {
  const row = record(value);
  const effective = record(row.effective);
  const provenance = record(row.provenance);
  const punctual = record(effective.punctualDiscount);
  const interest = record(effective.monthlyInterest);
  const provenanceValue = (key: string) => {
    const value = provenance[key];
    if (value !== 'HERDADO' && value !== 'PROPOSTO')
      throw new Error('O servidor retornou a proveniência das condições financeiras inválida.');
    return value;
  };
  return {
    kind: text(row.kind, 'UNKNOWN'),
    defaults: parsePolicyDefaults(row.defaults),
    effective: {
      punctualDiscount: {
        kind: 'FIXED_CENTS',
        amountCents: money(punctual.amountCents, 'o desconto efetivo de pontualidade'),
      },
      monthlyInterest: {
        kind: 'MONTHLY_PERCENTAGE',
        basisPoints: strictInteger(interest.basisPoints, 'o juro mensal efetivo'),
        percent: optionalNonNegativeNumber(interest.percent, 'o percentual exato dos juros efetivos'),
        unit: text(interest.unit) || undefined,
      },
      penalty: parsePenalty(effective.penalty),
    },
    provenance: {
      punctualDiscount: provenanceValue('punctualDiscount'),
      monthlyInterest: provenanceValue('monthlyInterest'),
      penalty: provenanceValue('penalty'),
    },
    differsFromDefault: row.differsFromDefault === true,
  };
};

export const parsePreview = (value: unknown): RenegociacaoPreview => {
  const row = record(unwrapRenegociacaoRpc(value));
  const totals = record(row.totals);
  const selection = record(row.selection);
  const schedule = record(row.schedule);
  const approval = approvalMetadata(row, 'da simulação');
  const negotiated = money(totals.negotiatedCents ?? totals.negotiatedTotalCents, 'o valor negociado');
  return {
    version: integer(row.version, 1),
    asOf: required(row, 'a data-base da simulação', 'asOf'),
    identity: parseIdentity(row.identity),
    selection: {
      receivableIds: Array.isArray(selection.receivableIds) ? selection.receivableIds.map(String) : [],
      itemCount: integer(selection.itemCount),
      overdueCount: integer(selection.overdueCount),
      futureCount: integer(selection.futureCount),
    },
    sourceItems: array(row, 'sourceItems').map(parseSourceItem),
    policySnapshot: parsePolicySnapshot(row.policySnapshot),
    calculationSnapshot: record(row.calculationSnapshot),
    totals: {
      principalCents: money(totals.principalCents, 'o principal simulado'),
      accruedInterestCents: money(totals.accruedInterestCents, 'os juros simulados'),
      accruedPenaltyCents: money(totals.accruedPenaltyCents, 'a multa simulada'),
      grossDebtCents: money(totals.grossDebtCents, 'a dívida simulada'),
      waivedInterestCents: money(totals.waivedInterestCents, 'o perdão de juros'),
      waivedPenaltyCents: money(totals.waivedPenaltyCents, 'o perdão de multa'),
      commercialDiscountCents: money(totals.commercialDiscountCents, 'o desconto comercial'),
      negotiatedCents: negotiated,
      negotiatedTotalCents:
        totals.negotiatedTotalCents == null ? negotiated : money(totals.negotiatedTotalCents, 'o total negociado'),
      downPaymentCents: money(totals.downPaymentCents, 'a entrada'),
      financedCents: money(totals.financedCents, 'o valor financiado'),
    },
    schedule: {
      installmentCount: integer(schedule.installmentCount),
      firstDueDate: text(schedule.firstDueDate),
      entries: array(schedule, 'entries').map((entry) => {
        const item = record(entry);
        const kind = item.kind === 'DOWN_PAYMENT' ? 'DOWN_PAYMENT' : 'INSTALLMENT';
        return {
          sequence: strictInteger(item.sequence, 'a sequência do cronograma'),
          kind,
          dueDate: required(item, 'a data do cronograma', 'dueDate'),
          amountCents: money(item.amountCents, 'o valor do cronograma'),
        };
      }),
    },
    requiresApproval: approval.requiresApproval,
    approvalReasons: approval.approvalReasons,
    selectionFingerprint: required(row, 'a identidade da seleção', 'selectionFingerprint'),
    policyFingerprint: required(row, 'a identidade das regras', 'policyFingerprint'),
    calculationFingerprint: required(row, 'a identidade do cálculo', 'calculationFingerprint'),
    proposalFingerprint: required(row, 'a identidade da proposta', 'proposalFingerprint'),
  };
};

const parseTotals = (value: unknown) => {
  const totals = record(value);
  const negotiated = money(totals.negotiatedCents ?? totals.negotiatedTotalCents, 'o valor negociado');
  return {
    principalCents: money(totals.principalCents, 'o principal simulado'),
    accruedInterestCents: money(totals.accruedInterestCents, 'os juros simulados'),
    accruedPenaltyCents: money(totals.accruedPenaltyCents, 'a multa simulada'),
    grossDebtCents: money(totals.grossDebtCents, 'a dívida simulada'),
    waivedInterestCents: money(totals.waivedInterestCents, 'o perdão de juros'),
    waivedPenaltyCents: money(totals.waivedPenaltyCents, 'o perdão de multa'),
    commercialDiscountCents: money(totals.commercialDiscountCents, 'o desconto comercial'),
    negotiatedCents: negotiated,
    negotiatedTotalCents:
      totals.negotiatedTotalCents == null ? negotiated : money(totals.negotiatedTotalCents, 'o total negociado'),
    downPaymentCents: money(totals.downPaymentCents, 'a entrada'),
    financedCents: money(totals.financedCents, 'o valor financiado'),
  };
};

const parseSchedule = (value: unknown) => {
  const schedule = record(value);
  return {
    installmentCount: integer(schedule.installmentCount),
    firstDueDate: text(schedule.firstDueDate),
    entries: array(schedule, 'entries').map((entry) => {
      const item = record(entry);
      const kind = item.kind === 'DOWN_PAYMENT' ? ('DOWN_PAYMENT' as const) : ('INSTALLMENT' as const);
      return {
        sequence: strictInteger(item.sequence, 'a sequência do cronograma'),
        kind,
        dueDate: required(item, 'a data do cronograma', 'dueDate'),
        amountCents: money(item.amountCents, 'o valor do cronograma'),
      };
    }),
  };
};

const parseProposal = (value: unknown): RenegociacaoProposalSummary => {
  const row = record(value);
  const capabilities = record(row.capabilities);
  if (!isLifecycleStatus(row.lifecycleStatus)) throw new Error('O servidor retornou uma situação não reconhecida.');
  return {
    id: required(row, 'o acordo', 'id'),
    lifecycleStatus: row.lifecycleStatus,
    version: integer(row.version),
    ...parseIdentity(row),
    studentName: required(row, 'o nome do aluno', 'studentName'),
    className: text(row.className, 'Turma não informada'),
    classCode: nullableText(row.classCode),
    sourceCount: integer(row.sourceCount),
    sourcePrincipalCents: money(row.sourcePrincipalCents, 'o principal original'),
    sourceOpenCents: money(row.sourceOpenCents, 'o saldo original'),
    negotiatedCents: money(row.negotiatedCents, 'o valor negociado'),
    installmentCount: integer(row.installmentCount),
    firstDueDate: text(row.firstDueDate),
    asOf: required(row, 'a data-base da proposta', 'asOf'),
    selectionFingerprint: required(row, 'a identidade da seleção', 'selectionFingerprint'),
    policyFingerprint: required(row, 'a identidade das regras', 'policyFingerprint'),
    calculationFingerprint: required(row, 'a identidade do cálculo', 'calculationFingerprint'),
    proposalFingerprint: required(row, 'a identidade da proposta', 'proposalFingerprint'),
    reason: nullableText(row.reason),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    createdByName: nullableText(row.createdByName),
    canceledReason: nullableText(row.canceledReason),
    capabilities: {
      canDiscard: capabilities.canDiscard === true,
      canActivate: false,
      activationUnavailableReason: text(
        capabilities.activationUnavailableReason,
        'A ativação ficará disponível após a integração bancária.',
      ),
    },
  };
};

export const parseProposalPage = (value: unknown): RenegociacaoProposalPage => {
  const row = record(unwrapRenegociacaoRpc(value));
  const rows = array(row, 'rows').map(parseProposal);
  return {
    rows,
    totalItems: integer(row.totalItems, rows.length),
    page: integer(row.page, 1),
    pageSize: integer(row.pageSize, 20),
    capabilities: record(row.capabilities),
  };
};
const parseEvent = (value: unknown, index: number): RenegociacaoEvent => {
  const row = record(value);
  const rawDetails = row.details ?? row.reason;
  const details = typeof rawDetails === 'string' ? rawDetails : rawDetails == null ? null : JSON.stringify(rawDetails);
  return {
    id: text(row.id, `evento-${index}`),
    type: text(row.type ?? row.eventType, 'EVENT'),
    label: text(row.label ?? row.description, 'Atualização da proposta'),
    occurredAt: text(row.occurredAt ?? row.createdAt),
    actorName: nullableText(row.actorName),
    details,
  };
};
export const parseProposalDetail = (value: unknown): RenegociacaoProposalDetail => {
  const row = record(unwrapRenegociacaoRpc(value));
  const fingerprints = record(row.fingerprints);
  const canonicalSnapshot = record(row.canonicalSnapshot);
  const approval = approvalMetadata(canonicalSnapshot, 'da proposta');
  return {
    proposal: parseProposal(row.proposal),
    sourceItems: array(row, 'sourceItems').map(parseSourceItem),
    terms: record(row.terms),
    policyOverrides: record(row.policyOverrides),
    policySnapshot: parsePolicySnapshot(row.policySnapshot),
    calculationSnapshot: record(row.calculationSnapshot),
    totals: parseTotals(row.totals),
    schedule: parseSchedule(row.schedule),
    fingerprints: {
      selection: required(fingerprints, 'a identidade da seleção', 'selection'),
      policy: required(fingerprints, 'a identidade das regras', 'policy'),
      calculation: required(fingerprints, 'a identidade do cálculo', 'calculation'),
      proposal: required(fingerprints, 'a identidade da proposta', 'proposal'),
    },
    canonicalSnapshot: { ...canonicalSnapshot, ...approval },
    events: array(row, 'events').map(parseEvent),
    capabilities: record(row.capabilities),
  };
};
export const parseMutationResult = (value: unknown) => {
  const row = record(unwrapRenegociacaoRpc(value));
  return { proposal: parseProposal(row.proposal), replayed: row.replayed === true };
};

export {
  formatCents,
  formatRenegociacaoDate,
  formatBasisPoints,
  formatPolicyPercentage,
  formatCandidateAmount,
  formatCandidateCharges,
  renegociacaoPolicyInheritedLabel,
  parseCurrencyToCents,
  formatCentsInput,
  viewLabel,
  createRenegociacaoRequestId,
  isMissingRenegociacaoRpc,
  renegociacaoErrorMessage,
  renegociacaoUnavailableMessage,
} from './renegociacoes.presentation.ts';
