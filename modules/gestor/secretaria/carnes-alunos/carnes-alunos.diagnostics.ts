import type {
  BaneseDocumentDiagnostics,
  BaneseDocumentExclusionReason,
  BaneseDocumentGroupsResponse,
} from './carnes-alunos.types';

const REASONS: Record<BaneseDocumentExclusionReason, string> = {
  OTHER_OR_MISSING_BANK_PROVIDER: 'de outra origem ou sem vínculo com boleto Banese',
  NOT_PAYABLE: 'encerrados ou indisponíveis para pagamento',
  UNSUPPORTED_LAUNCH_TYPE: 'de tipo não aceito neste documento',
  BANK_EVIDENCE_MISSING: 'sem identidade ou condições bancárias confirmadas completas',
  BANK_EVIDENCE_INVALID: 'com dados bancários que precisam de conferência',
  DOCUMENT_GROUP_INCONSISTENT: 'sem composição documental consistente para esta matrícula e turma',
};

export const parseDocumentDiagnostics = (value: unknown): BaneseDocumentDiagnostics | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O catálogo retornou um diagnóstico documental inválido.');
  }
  const row = value as Record<string, unknown>;
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!count(row.inspectedCount) || !count(row.availableCount)
    || typeof row.complete !== 'boolean' || !Array.isArray(row.exclusions)) {
    throw new Error('O catálogo retornou contagens de diagnóstico inválidas.');
  }
  const exclusions = row.exclusions.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('O catálogo retornou um motivo documental inválido.');
    }
    const item = value as Record<string, unknown>;
    if (typeof item.reason !== 'string' || !Object.hasOwn(REASONS, item.reason)
      || !count(item.count) || Number(item.count) === 0) {
      throw new Error('O catálogo retornou um motivo documental inválido.');
    }
    return { reason: item.reason as BaneseDocumentExclusionReason, count: Number(item.count) };
  });
  if (new Set(exclusions.map((item) => item.reason)).size !== exclusions.length
    || exclusions.reduce((total, item) => total + item.count, Number(row.availableCount)) !== row.inspectedCount) {
    throw new Error('O catálogo retornou uma composição de diagnóstico inconsistente.');
  }
  return {
    inspectedCount: Number(row.inspectedCount),
    availableCount: Number(row.availableCount),
    complete: row.complete,
    exclusions,
  };
};

export class EnrollmentDocumentUnavailableError extends Error {}

export const selectEnrollmentDocumentGroup = (
  catalog: BaneseDocumentGroupsResponse,
  enrollmentId: string,
) => {
  if (catalog.total !== 1 || catalog.groups.length !== 1) {
    if (catalog.total !== 0) throw new Error('A matrícula retornou mais de um grupo documental. Revise os títulos antes de gerar.');
    const diagnostics = catalog.diagnostics;
    const details = diagnostics?.exclusions.map(({ reason, count }) => `${count} ${REASONS[reason]}`).join('; ');
    const inspection = diagnostics?.inspectedCount === 0
      ? ' Nenhum lançamento foi encontrado no escopo consultado.'
      : details ? ` Lançamentos excluídos: ${details}.` : ' O catálogo não informou o motivo da indisponibilidade.';
    const limited = diagnostics?.complete === false ? ' A consulta atingiu o limite de inspeção.' : '';
    throw new EnrollmentDocumentUnavailableError(
      `Nenhum boleto Banese disponível para impressão.${inspection}${limited} Consulte o extrato e confira os vínculos e a confirmação bancária. Isso não autoriza gerar o ciclo novamente.`,
    );
  }
  const [group] = catalog.groups;
  if (group.enrollmentId !== enrollmentId) throw new Error('O catálogo retornou documentos de outra matrícula.');
  // The existing service routes 1–2 titles to boleto-document and 3+ to carnet-document.
  return group;
};
