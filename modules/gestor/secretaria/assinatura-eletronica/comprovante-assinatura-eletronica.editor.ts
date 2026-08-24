import {
  ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS,
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
  type ElectronicSignatureDocumentEditor,
  type ElectronicSignatureLegalSection,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  legacyPreparedSignatureStamp,
  prepareGlobalSignatureStamp,
  prepareSignatureStamp,
} from "./comprovante-assinatura-eletronica.editor-stamp.ts";
import { prepareWatermark } from "./comprovante-assinatura-eletronica.editor-watermark.ts";
import type { ElectronicSignatureReceiptPresentation } from "./comprovante-assinatura-eletronica.types.ts";
import {
  asEditorRecord,
  assertEditorText,
  assertExactEditorKeys,
  assertString,
} from "./comprovante-assinatura-eletronica.validation-helpers.ts";

export const prepareEditor = (source: unknown): ElectronicSignatureDocumentEditor => {
  const editor = asEditorRecord(source, "O editor do comprovante");
  const rawSchemaVersion = editor.schemaVersion;
  if (
    rawSchemaVersion !== 1 && rawSchemaVersion !== 2 &&
    rawSchemaVersion !== 3 &&
    rawSchemaVersion !== 4 &&
    rawSchemaVersion !== 5
  ) {
    throw new Error("A versão do editor do comprovante não é suportada.");
  }
  const schemaVersion = rawSchemaVersion;
  assertExactEditorKeys(
    editor,
    schemaVersion >= 3
      ? ["schemaVersion", "pages", "signatureStamp"]
      : ["schemaVersion", "pages"],
    "O editor do comprovante",
  );
  if (!Array.isArray(editor.pages) || editor.pages.length !== 2) {
    throw new Error(
      `O editor do comprovante deve conter exatamente duas paginas no schema ${schemaVersion}.`,
    );
  }
  const page1 = asEditorRecord(editor.pages[0], "A pagina 1 do editor");
  const page2 = asEditorRecord(editor.pages[1], "A pagina 2 do editor");
  assertExactEditorKeys(
    page1,
    schemaVersion === 4 || schemaVersion === 5
      ? ["page", "template"]
      : ["page", "template", "watermark"],
    "A pagina 1 do editor",
  );
  assertExactEditorKeys(
    page2,
    schemaVersion === 4 || schemaVersion === 5
      ? ["page", "template", "sections"]
      : ["page", "template", "sections", "watermark"],
    "A pagina 2 do editor",
  );
  if (page1.page !== 1 || page1.template !== "EVIDENCE") {
    throw new Error("A pagina 1 deve usar o modelo canonico de evidencias.");
  }
  if (page2.page !== 2 || page2.template !== "LEGAL_TEXTS") {
    throw new Error(
      "A pagina 2 deve usar o modelo canonico de textos juridicos.",
    );
  }
  if (
    !Array.isArray(page2.sections) ||
    page2.sections.length !== ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS.length
  ) {
    throw new Error(
      "A pagina 2 deve conter os cinco blocos juridicos canonicos.",
    );
  }
  const sections = page2.sections.map(
    (value, index): ElectronicSignatureLegalSection => {
      const section = asEditorRecord(value, `O bloco juridico ${index + 1}`);
      assertExactEditorKeys(
        section,
        ["id", "title", "body"],
        `O bloco juridico ${index + 1}`,
      );
      const expectedId = ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS[index];
      if (section.id !== expectedId) {
        throw new Error(
          "A ordem dos blocos juridicos do comprovante e invalida.",
        );
      }
      return {
        id: expectedId,
        title: assertEditorText(
          section.title,
          `O titulo do bloco juridico ${index + 1}`,
          ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionTitle,
        ),
        body: assertEditorText(
          section.body,
          `O texto do bloco juridico ${index + 1}`,
          ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionBody,
        ),
      };
    },
  );
  if (
    sections.reduce((total, section) => total + section.body.length, 0) >
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionsBodyTotal
  ) {
    throw new Error(
      "O conjunto de textos juridicos excede a area segura do comprovante.",
    );
  }
  if (
    schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3
  ) {
    prepareWatermark(page1.watermark, 1, schemaVersion);
    prepareWatermark(page2.watermark, 2, schemaVersion);
  }
  return {
    schemaVersion: 5,
    pages: [
      {
        page: 1,
        template: "EVIDENCE",
      },
      {
        page: 2,
        template: "LEGAL_TEXTS",
        sections,
      },
    ],
    signatureStamp: schemaVersion === 5
      ? prepareGlobalSignatureStamp(editor.signatureStamp)
      : schemaVersion === 3 || schemaVersion === 4
      ? legacyPreparedSignatureStamp(
        prepareSignatureStamp(editor.signatureStamp, schemaVersion),
      )
      : legacyPreparedSignatureStamp(),
  };
};

export const preparePresentation = (
  source: ElectronicSignatureReceiptPresentation,
): ElectronicSignatureReceiptPresentation => ({
  policyName: assertEditorText(
    source?.policyName,
    "O nome da política",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.name,
  ),
  policyVersionLabel: assertString(
    source?.policyVersionLabel,
    "A versão da política",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.versionLabel,
  ),
  confirmationMessage: assertEditorText(
    source?.confirmationMessage,
    "A mensagem de confirmação",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.confirmationMessage,
  ),
  receiptTitle: assertEditorText(
    source?.receiptTitle,
    "O título do comprovante",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptTitle,
  ),
  receiptMessage: assertEditorText(
    source?.receiptMessage,
    "A mensagem do comprovante",
    ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptMessage,
  ),
  editor: prepareEditor(source?.editor),
});


