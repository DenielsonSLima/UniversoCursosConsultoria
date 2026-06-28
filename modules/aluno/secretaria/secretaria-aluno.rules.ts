import {
  AlunoSecretariaEligibility,
  AlunoSecretariaMatricula,
  AlunoSecretariaSolicitacaoTipo,
} from './secretaria-aluno.types';

const ACTIVE_STATUS = 'ATIVO';
const ACTIVE_CLASS_STATUS = 'EM_ANDAMENTO';
const ONLINE_MODALITIES = new Set(['EAD', 'LIVRE', 'ESPECIALIZACAO']);
const TECHNICAL_HISTORY_STATUSES = new Set([
  'ATIVO',
  'CONCLUIDO',
  'CANCELADO',
  'TRANCADO',
  'DESISTENTE',
  'TRANSFERIDO',
]);

export const normalizeAlunoSecretariaText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

export const getAlunoSecretariaModalidade = (matricula?: AlunoSecretariaMatricula | null) => {
  const modalidade = normalizeAlunoSecretariaText(matricula?.turmas?.cursos?.modalidade);
  if (modalidade === 'TECNICO') return 'TECNICO';
  if (modalidade === 'EAD') return 'EAD';
  if (modalidade === 'LIVRE') return 'LIVRE';
  if (modalidade === 'ESPECIALIZACAO') return 'ESPECIALIZACAO';
  return modalidade || 'OUTROS';
};

export const isAlunoSecretariaTechnical = (matricula?: AlunoSecretariaMatricula | null) =>
  getAlunoSecretariaModalidade(matricula) === 'TECNICO';

export const isAlunoSecretariaOnline = (matricula?: AlunoSecretariaMatricula | null) =>
  ONLINE_MODALITIES.has(getAlunoSecretariaModalidade(matricula));

export const isAlunoSecretariaActiveEnrollment = (matricula?: AlunoSecretariaMatricula | null) =>
  normalizeAlunoSecretariaText(matricula?.status) === ACTIVE_STATUS;

export const isAlunoSecretariaActiveClass = (matricula?: AlunoSecretariaMatricula | null) =>
  normalizeAlunoSecretariaText(matricula?.turmas?.status) === ACTIVE_CLASS_STATUS;

export const isAlunoSecretariaActiveTechnical = (matricula?: AlunoSecretariaMatricula | null) =>
  isAlunoSecretariaTechnical(matricula) &&
  isAlunoSecretariaActiveEnrollment(matricula) &&
  isAlunoSecretariaActiveClass(matricula);

export const isAlunoSecretariaHistoricalTechnical = (matricula?: AlunoSecretariaMatricula | null) =>
  isAlunoSecretariaTechnical(matricula) &&
  TECHNICAL_HISTORY_STATUSES.has(normalizeAlunoSecretariaText(matricula?.status));

export const buildAlunoSecretariaEligibility = (
  matriculas: AlunoSecretariaMatricula[]
): AlunoSecretariaEligibility => {
  const sorted = [...(matriculas || [])];
  const activeAny = sorted.find(isAlunoSecretariaActiveEnrollment) || null;
  const activeTechnical = sorted.find(isAlunoSecretariaActiveTechnical) || null;
  const historicalTechnical = sorted.find(isAlunoSecretariaHistoricalTechnical) || null;
  const onlineEnrollments = sorted.filter(isAlunoSecretariaOnline);
  const declarationEnrollment = activeTechnical || activeAny;
  const primaryEnrollment = declarationEnrollment || historicalTechnical || sorted[0] || null;
  const hasAnyTechnicalEnrollment = sorted.some(isAlunoSecretariaTechnical);
  const hasOnlineOnlyAccess = onlineEnrollments.length > 0 && !hasAnyTechnicalEnrollment;

  const canEmitStudentCard = Boolean(activeTechnical);
  const canEmitInternshipBadge = Boolean(activeTechnical);
  const canEmitBulletin = Boolean(activeTechnical);
  const canEmitEnrollmentDeclaration = Boolean(declarationEnrollment);
  const canEmitIrpf = Boolean(historicalTechnical);
  const canRequestHistory = Boolean(historicalTechnical);
  const canRequestIrpf = Boolean(historicalTechnical);
  const canRequestTransfer = Boolean(activeTechnical);

  const allowedRequests: AlunoSecretariaSolicitacaoTipo[] = [];
  if (canRequestHistory) allowedRequests.push('Histórico Escolar');
  if (canRequestIrpf) allowedRequests.push('Declaração IRPF');
  if (canRequestTransfer) allowedRequests.push('Transferência');

  const blockedSummary = hasOnlineOnlyAccess
    ? 'Cursos EAD, livres e especializações não liberam carteirinha, crachá, boletim técnico, transferência ou IRPF nesta secretaria.'
    : !hasAnyTechnicalEnrollment
      ? 'Nenhuma matrícula técnica foi localizada para liberar documentos acadêmicos restritos.'
      : !activeTechnical
        ? 'Há vínculo técnico histórico, mas documentos de vínculo ativo exigem matrícula ativa em turma em andamento.'
        : '';

  return {
    hasOnlineOnlyAccess,
    hasAnyTechnicalEnrollment,
    hasActiveTechnicalEnrollment: Boolean(activeTechnical),
    hasHistoricalTechnicalEnrollment: Boolean(historicalTechnical),
    canEmitStudentCard,
    canEmitInternshipBadge,
    canEmitBulletin,
    canEmitEnrollmentDeclaration,
    canEmitIrpf,
    canRequestHistory,
    canRequestIrpf,
    canRequestTransfer,
    primaryEnrollment,
    technicalIdentityEnrollment: activeTechnical,
    bulletinEnrollment: activeTechnical,
    declarationEnrollment,
    irpfEnrollment: historicalTechnical,
    requestEnrollment: historicalTechnical || activeTechnical || primaryEnrollment,
    allowedRequests,
    blockedSummary,
  };
};
