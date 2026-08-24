import {
  SIGNATURE_STAMP_COORDINATE_SCALE,
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
} from './signature-stamp-placement.ts';

export const DIARY_PDF_SEMANTIC_MANIFEST_SOURCE = 'UNIVERSO_DIARIO_PDF_V1' as const;

export interface DiaryPdfSemanticManifestV1 {
  schemaVersion: 1;
  source: typeof DIARY_PDF_SEMANTIC_MANIFEST_SOURCE;
  semanticTarget: 'DIARIO_LAST_CONTENT_PAGE';
  pageCount: number;
  targetPageIndex: number;
  instructionsPageIndex: number | null;
}

export interface DiaryPdfSignatureSlot {
  role: 'PROFESSOR' | 'COORDENADOR';
  fieldId: 'contracapaAssinaturaProfessor' | 'contracapaAssinaturaCoordenador';
  pageTarget: 'DIARIO_BACK_COVER';
  coordinateSpace: 'PAGE_TOP_LEFT_BP_V1';
  xBp: number;
  yBp: number;
  widthBp: number;
  heightBp: number;
}

export interface DiaryPdfSemanticManifestV2 {
  schemaVersion: 2;
  source: typeof DIARY_PDF_SEMANTIC_MANIFEST_SOURCE;
  semanticTarget: 'DIARIO_BACK_COVER';
  pageCount: number;
  targetPageIndex: number;
  backCoverPageIndex: number;
  instructionsPageIndex: number | null;
  signatureSlots: readonly [DiaryPdfSignatureSlot, DiaryPdfSignatureSlot];
}

export type DiaryPdfSemanticManifest =
  | DiaryPdfSemanticManifestV1
  | DiaryPdfSemanticManifestV2;

type LegacyCreateInput = Pick<
  DiaryPdfSemanticManifestV1,
  'pageCount' | 'targetPageIndex' | 'instructionsPageIndex'
> & { schemaVersion?: 1 };

type BackCoverCreateInput = Pick<
  DiaryPdfSemanticManifestV2,
  'pageCount' | 'targetPageIndex' | 'backCoverPageIndex' |
  'instructionsPageIndex' | 'signatureSlots'
> & { schemaVersion: 2 };

const assertPageCount = (pageCount: number) => {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('O manifesto do Diário possui quantidade de páginas inválida.');
  }
};

const assertInstructionsPage = (pageCount: number, value: number | null) => {
  if (value !== null && (!Number.isInteger(value) || value !== pageCount - 1)) {
    throw new Error('A folha de instruções precisa encerrar o Diário.');
  }
};

const overlaps = (first: DiaryPdfSignatureSlot, second: DiaryPdfSignatureSlot) => (
  first.xBp < second.xBp + second.widthBp
  && first.xBp + first.widthBp > second.xBp
  && first.yBp < second.yBp + second.heightBp
  && first.yBp + first.heightBp > second.yBp
);

const normalizeSignatureSlots = (
  slots: readonly DiaryPdfSignatureSlot[],
): readonly [DiaryPdfSignatureSlot, DiaryPdfSignatureSlot] => {
  const expected = [
    ['PROFESSOR', 'contracapaAssinaturaProfessor'],
    ['COORDENADOR', 'contracapaAssinaturaCoordenador'],
  ] as const;
  if (!Array.isArray(slots) || slots.length !== expected.length) {
    throw new Error('O manifesto precisa congelar os dois campos de assinatura da contracapa.');
  }
  const normalized = slots.map((slot, index): DiaryPdfSignatureSlot => {
    const [role, fieldId] = expected[index];
    if (
      slot?.role !== role || slot.fieldId !== fieldId
      || slot.pageTarget !== 'DIARIO_BACK_COVER'
      || slot.coordinateSpace !== 'PAGE_TOP_LEFT_BP_V1'
      || !Number.isInteger(slot.xBp) || !Number.isInteger(slot.yBp)
      || !Number.isInteger(slot.widthBp) || !Number.isInteger(slot.heightBp)
      || slot.widthBp < SIGNATURE_STAMP_MIN_WIDTH_BP
      || slot.widthBp > SIGNATURE_STAMP_MAX_WIDTH_BP
      || slot.heightBp < SIGNATURE_STAMP_MIN_HEIGHT_BP
      || slot.heightBp > SIGNATURE_STAMP_MAX_HEIGHT_BP
      || slot.xBp < 0 || slot.yBp < 0
      || slot.xBp + slot.widthBp > SIGNATURE_STAMP_COORDINATE_SCALE
      || slot.yBp + slot.heightBp > SIGNATURE_STAMP_COORDINATE_SCALE
    ) throw new Error(`O slot ${role} não corresponde ao campo ${fieldId}.`);
    return { ...slot };
  }) as [DiaryPdfSignatureSlot, DiaryPdfSignatureSlot];
  if (overlaps(normalized[0], normalized[1])) {
    throw new Error('Os slots de assinatura da contracapa não podem se sobrepor.');
  }
  return normalized;
};

export const createDiaryPdfSemanticManifest = (
  input: LegacyCreateInput | BackCoverCreateInput | DiaryPdfSemanticManifest,
): DiaryPdfSemanticManifest => {
  assertPageCount(input.pageCount);
  if (input.schemaVersion === 2) {
    if (
      input.pageCount < 2 || input.targetPageIndex !== 1
      || input.backCoverPageIndex !== 1
    ) throw new Error('A página 2 precisa ser a contracapa assinável do Diário.');
    assertInstructionsPage(input.pageCount, input.instructionsPageIndex);
    return {
      schemaVersion: 2,
      source: DIARY_PDF_SEMANTIC_MANIFEST_SOURCE,
      semanticTarget: 'DIARIO_BACK_COVER',
      pageCount: input.pageCount,
      targetPageIndex: 1,
      backCoverPageIndex: 1,
      instructionsPageIndex: input.instructionsPageIndex,
      signatureSlots: normalizeSignatureSlots(input.signatureSlots),
    };
  }
  if (
    !Number.isInteger(input.targetPageIndex) || input.targetPageIndex < 0
    || input.targetPageIndex >= input.pageCount
  ) throw new Error('O manifesto do Diário possui página de assinatura inválida.');
  if (input.instructionsPageIndex === null) {
    if (input.targetPageIndex !== input.pageCount - 1) {
      throw new Error('A última página de conteúdo precisa encerrar o Diário sem instruções.');
    }
  } else if (
    input.instructionsPageIndex !== input.pageCount - 1
    || input.targetPageIndex !== input.instructionsPageIndex - 1
  ) throw new Error('A folha de instruções precisa suceder a última página de conteúdo do Diário.');
  return {
    schemaVersion: 1,
    source: DIARY_PDF_SEMANTIC_MANIFEST_SOURCE,
    semanticTarget: 'DIARIO_LAST_CONTENT_PAGE',
    pageCount: input.pageCount,
    targetPageIndex: input.targetPageIndex,
    instructionsPageIndex: input.instructionsPageIndex,
  };
};

export const resolveDiarySignaturePageIndex = ({
  pageCount,
  manifest,
}: {
  pageCount: number;
  manifest: DiaryPdfSemanticManifest;
}) => {
  if (manifest?.source !== DIARY_PDF_SEMANTIC_MANIFEST_SOURCE) {
    throw new Error('O manifesto semântico do Diário é inválido.');
  }
  const normalized = createDiaryPdfSemanticManifest(manifest);
  if (normalized.pageCount !== pageCount) {
    throw new Error('O manifesto semântico diverge da quantidade de páginas do PDF original.');
  }
  return normalized.targetPageIndex;
};
