export const DIARY_PDF_SEMANTIC_MANIFEST_SOURCE = 'UNIVERSO_DIARIO_PDF_V1' as const;

/**
 * Manifesto produzido no mesmo ciclo que gera os bytes do Diário. O backend
 * deve receber este valor do exportador confiável, nunca recalculá-lo a partir
 * de uma escolha do navegador.
 */
export interface DiaryPdfSemanticManifest {
  schemaVersion: 1;
  source: typeof DIARY_PDF_SEMANTIC_MANIFEST_SOURCE;
  semanticTarget: 'DIARIO_LAST_CONTENT_PAGE';
  pageCount: number;
  targetPageIndex: number;
  instructionsPageIndex: number | null;
}

export const createDiaryPdfSemanticManifest = ({
  pageCount,
  targetPageIndex,
  instructionsPageIndex,
}: Pick<
  DiaryPdfSemanticManifest,
  'pageCount' | 'targetPageIndex' | 'instructionsPageIndex'
>): DiaryPdfSemanticManifest => {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('O manifesto do Diário possui quantidade de páginas inválida.');
  }
  if (
    !Number.isInteger(targetPageIndex)
    || targetPageIndex < 0
    || targetPageIndex >= pageCount
  ) {
    throw new Error('O manifesto do Diário possui página de assinatura inválida.');
  }
  if (instructionsPageIndex === null) {
    if (targetPageIndex !== pageCount - 1) {
      throw new Error('A última página de conteúdo precisa encerrar o Diário sem instruções.');
    }
  } else if (
    !Number.isInteger(instructionsPageIndex)
    || instructionsPageIndex !== pageCount - 1
    || targetPageIndex !== instructionsPageIndex - 1
  ) {
    throw new Error('A folha de instruções precisa suceder a última página de conteúdo do Diário.');
  }
  return {
    schemaVersion: 1,
    source: DIARY_PDF_SEMANTIC_MANIFEST_SOURCE,
    semanticTarget: 'DIARIO_LAST_CONTENT_PAGE',
    pageCount,
    targetPageIndex,
    instructionsPageIndex,
  };
};

export const resolveDiarySignaturePageIndex = ({
  pageCount,
  manifest,
}: {
  pageCount: number;
  manifest: DiaryPdfSemanticManifest;
}) => {
  if (
    manifest?.schemaVersion !== 1
    || manifest.source !== DIARY_PDF_SEMANTIC_MANIFEST_SOURCE
    || manifest.semanticTarget !== 'DIARIO_LAST_CONTENT_PAGE'
  ) {
    throw new Error('O manifesto semântico do Diário é inválido.');
  }
  const normalized = createDiaryPdfSemanticManifest(manifest);
  if (normalized.pageCount !== pageCount) {
    throw new Error('O manifesto semântico diverge da quantidade de páginas do PDF original.');
  }
  return normalized.targetPageIndex;
};
