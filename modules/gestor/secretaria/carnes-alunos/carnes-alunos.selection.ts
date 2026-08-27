import type {
  BaneseDocumentGroup,
  BaneseDocumentRequest,
  BaneseDocumentRequestCounts,
} from './carnes-alunos.types';

export const MAX_CARNET_REQUESTS = 6;
export const MAX_BOLETO_REQUESTS = 20;
export const MAX_ESTIMATED_DOCUMENT_PAGES = 80;
export const MAX_VECTOR_PDF_BYTES = 24 * 1024 * 1024;
export const DOCUMENT_GROUPS_PAGE_SIZE = 20;

const uniqueGroups = (groups: BaneseDocumentGroup[]) => {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
};

export const addDocumentGroup = (
  current: BaneseDocumentGroup[],
  group: BaneseDocumentGroup,
  single = false,
): BaneseDocumentGroup[] => {
  if (single) return current.some((item) => item.id === group.id) ? [] : [group];
  return current.some((item) => item.id === group.id)
    ? current
    : [...current, group];
};

export const toggleDocumentGroup = (
  current: BaneseDocumentGroup[],
  group: BaneseDocumentGroup,
  single = false,
): BaneseDocumentGroup[] => {
  if (single) return current.some((item) => item.id === group.id) ? [] : [group];
  return current.some((item) => item.id === group.id)
    ? current.filter((item) => item.id !== group.id)
    : [...current, group];
};

export const addDocumentGroupsAtomically = (
  current: BaneseDocumentGroup[],
  additions: BaneseDocumentGroup[],
): BaneseDocumentGroup[] => {
  const next = uniqueGroups([...current, ...additions]);
  assertDocumentGenerationLimits(next);
  return next;
};

export const removeDocumentGroups = (
  current: BaneseDocumentGroup[],
  removals: BaneseDocumentGroup[],
): BaneseDocumentGroup[] => {
  const removalIds = new Set(removals.map((group) => group.id));
  return current.filter((group) => !removalIds.has(group.id));
};

export const resetsSelectionWhenCriteriaChange = (mode: 'individual' | 'batch' | 'custom') => (
  mode !== 'custom'
);

export const countDocumentRequests = (
  groups: BaneseDocumentGroup[],
): BaneseDocumentRequestCounts => {
  let carnetRequests = 0;
  let boletoRequests = 0;
  let estimatedPages = 0;
  uniqueGroups(groups).forEach((group) => {
    if (group.documentType === 'carnet') {
      carnetRequests += 1;
      estimatedPages += Math.ceil(group.installmentCount / 2);
    } else {
      boletoRequests += group.receivableIds.length;
      estimatedPages += group.receivableIds.length;
    }
  });
  return {
    carnetRequests,
    boletoRequests,
    totalRequests: carnetRequests + boletoRequests,
    estimatedPages,
  };
};

export const assertVectorPdfByteLimit = (receivedBytes: number) => {
  if (!Number.isSafeInteger(receivedBytes) || receivedBytes < 0) {
    throw new Error('O volume recebido dos documentos Banese é inválido.');
  }
  if (receivedBytes > MAX_VECTOR_PDF_BYTES) {
    throw new Error(
      'Os PDFs deste lote ultrapassam 24 MiB. Divida a seleção em lotes menores e tente novamente.',
    );
  }
  return receivedBytes;
};

export const assertDocumentGenerationLimits = (
  groups: BaneseDocumentGroup[],
): BaneseDocumentRequestCounts => {
  if (!groups.length) {
    throw new Error('Selecione ao menos uma matrícula para preparar os documentos.');
  }
  if (uniqueGroups(groups).length !== groups.length) {
    throw new Error('A seleção possui uma matrícula duplicada.');
  }
  const counts = countDocumentRequests(groups);
  if (counts.carnetRequests > MAX_CARNET_REQUESTS) {
    throw new Error(
      `Selecione no máximo ${MAX_CARNET_REQUESTS} carnês por geração. Divida este lote e tente novamente.`,
    );
  }
  if (counts.boletoRequests > MAX_BOLETO_REQUESTS) {
    throw new Error(
      `Selecione no máximo ${MAX_BOLETO_REQUESTS} boletos por geração. Divida este lote e tente novamente.`,
    );
  }
  if (counts.estimatedPages > MAX_ESTIMATED_DOCUMENT_PAGES) {
    throw new Error(
      `Este lote pode gerar mais de ${MAX_ESTIMATED_DOCUMENT_PAGES} páginas. Divida a seleção em lotes menores e tente novamente.`,
    );
  }
  return counts;
};

export const buildDocumentRequests = (
  groups: BaneseDocumentGroup[],
): BaneseDocumentRequest[] => {
  assertDocumentGenerationLimits(groups);
  const requests = groups.flatMap<BaneseDocumentRequest>((group) => (
    group.documentType === 'carnet'
      ? [{
          groupId: group.id,
          receivableId: group.representativeReceivableId,
          functionName: 'banese-carnet-document',
        }]
      : group.receivableIds.map((receivableId) => ({
          groupId: group.id,
          receivableId,
          functionName: 'banese-boleto-document',
        }))
  ));
  const ids = requests.map((request) => request.receivableId);
  if (new Set(ids).size !== ids.length) {
    throw new Error('A seleção contém o mesmo título Banese em mais de um grupo.');
  }
  return requests;
};
