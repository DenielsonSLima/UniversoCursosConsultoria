import { jsPDF } from "jspdf";

import type { DiarioPdfRenderableData } from "./diario-pdf.contract.ts";
import { assertValidDiarioPdfAcademicSnapshot } from "./diario-pdf.contract.ts";
import {
  createDiaryPdfSemanticManifest,
  type DiaryPdfSemanticManifest,
} from "../../../../../../shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts";
import {
  resolveInstitution,
  validateResolvedAssets,
  type DiarioPdfResolvedAssets,
} from "./diario-pdf-assets.ts";
import { drawBackCover, drawCover } from "./diario-pdf-cover-pages.ts";
import { resolveBackCoverSignatureSlots } from "./diario-pdf-back-cover-fields.ts";
import {
  drawContentPages,
  drawFrequencyPages,
  drawInstructions,
  drawResultPages,
} from "./diario-pdf-pages.ts";

export type {
  DiarioPdfResolvedAssets,
  DiarioPdfTrustedQrAsset,
  DiarioPdfValidationEndpoint,
} from "./diario-pdf-assets.ts";

type DiarioPrintDocumentProps = DiarioPdfRenderableData;

export interface BuiltDiarioPdfWithManifest {
  /** Mantido somente para a prévia web; o Edge deve persistir `bytes`. */
  pdf: jsPDF;
  bytes: Uint8Array;
  sha256: string;
  manifest: DiaryPdfSemanticManifest;
}

const buildDiarioPdfInternal = (
  props: DiarioPrintDocumentProps,
  resolvedAssets: DiarioPdfResolvedAssets,
) => {
  const isBlank = props.exportMode === "EM_BRANCO";
  const validationCode = props.validationCode?.trim() || "";
  if (
    !isBlank && props.template.imprimirValidacaoContracapa && !validationCode
  ) {
    throw new Error(
      "O código canônico do Diário não foi confirmado. Nenhum PDF foi gerado.",
    );
  }
  const {
    logo,
    watermark,
    backCoverBackground,
    backCoverImages,
    qrCode,
    validationUrl,
  } = validateResolvedAssets(props, resolvedAssets);
  const institution = resolveInstitution(props, resolvedAssets.institution);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: `Diário de Classe - ${props.disciplina.nome}`,
    subject: `${props.turma.cursoNome || "Curso"} - ${
      props.turma.codigo || props.turma.nome || "Turma"
    }`,
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });

  drawCover(pdf, props, logo, watermark);
  let backCoverPageIndex: number | null = null;
  if (!isBlank && props.template.imprimirValidacaoContracapa) {
    backCoverPageIndex = drawBackCover(
      pdf,
      props,
      watermark,
      backCoverBackground,
      backCoverImages,
      qrCode,
      validationUrl,
    );
  }
  drawFrequencyPages(pdf, props, logo, watermark, institution);
  drawResultPages(pdf, props, logo, watermark, institution);
  drawContentPages(
    pdf,
    props,
    logo,
    watermark,
    institution,
  );
  if (props.template.imprimirInstrucoes) {
    drawInstructions(pdf, props, logo, watermark, institution);
  }

  return { pdf, backCoverPageIndex };
};

export const composeDiarioPdfWithManifest = async (
  props: DiarioPrintDocumentProps,
  assets: DiarioPdfResolvedAssets,
): Promise<BuiltDiarioPdfWithManifest> => {
  const snapshot = assertValidDiarioPdfAcademicSnapshot(props);
  const built = buildDiarioPdfInternal(snapshot, assets);
  if (built.backCoverPageIndex === null) {
    throw new Error(
      "O Diário não possui a página 2 de contracapa apta a receber os carimbos.",
    );
  }
  // O artefato original precisa ser reproduzível em retries concorrentes da
  // Edge. O jsPDF gera ID e CreationDate variáveis por padrão; ambos são
  // derivados exclusivamente do snapshot congelado antes de serializar.
  built.pdf.setFileId(
    `${snapshot.source.academicRevisionSha256.slice(0, 16)}${
      snapshot.templateSource.sha256.slice(0, 16)
    }`.toUpperCase(),
  );
  built.pdf.setCreationDate(new Date(snapshot.generatedAt));
  const bytes = new Uint8Array(built.pdf.output("arraybuffer"));
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  );
  const sha256 = [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    pdf: built.pdf,
    bytes,
    sha256,
    manifest: createDiaryPdfSemanticManifest({
      schemaVersion: 2,
      pageCount: built.pdf.getNumberOfPages(),
      targetPageIndex: built.backCoverPageIndex,
      backCoverPageIndex: built.backCoverPageIndex,
      instructionsPageIndex: props.template.imprimirInstrucoes
        ? built.pdf.getNumberOfPages() - 1
        : null,
      signatureSlots: resolveBackCoverSignatureSlots(snapshot),
    }),
  };
};

export const composeDiarioPdf = async (
  props: DiarioPrintDocumentProps,
  assets: DiarioPdfResolvedAssets,
) => (await buildDiarioPdfInternal(props, assets)).pdf;
