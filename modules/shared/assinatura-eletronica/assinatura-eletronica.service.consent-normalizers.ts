import type { ElectronicSignatureConsentTerm } from "./assinatura-eletronica.contract";
import {
  ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS,
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
} from "./assinatura-eletronica.contract";
import { normalizeLegalSection } from "./assinatura-eletronica.service.preview-normalizers";
import {
  assertExactKeys,
  firstRpcRecord,
  normalizeRequiredSha256,
  requiredBoundedString,
  requiredInteger,
} from "./assinatura-eletronica.service.shared";

export const normalizeConsentTerm = (
  value: unknown,
): ElectronicSignatureConsentTerm => {
  const source = firstRpcRecord(
    value,
    "O termo de aceite retornou um formato inválido.",
  );
  assertExactKeys(
    source,
    [
      "termId",
      "version",
      "versionLabel",
      "title",
      "confirmationMessage",
      "sections",
      "sha256",
    ],
    "O termo de aceite",
  );
  const version = requiredInteger(
    source.version,
    "A versão do termo de aceite",
  );
  if (version < 1) throw new Error("A versão do termo de aceite é inválida.");
  if (
    !Array.isArray(source.sections) ||
    source.sections.length !== ELECTRONIC_SIGNATURE_LEGAL_SECTION_IDS.length
  ) {
    throw new Error(
      "O termo de aceite deve conter os cinco blocos jurídicos canônicos.",
    );
  }
  const sections = source.sections.map(normalizeLegalSection);
  if (
    sections.reduce((total, section) => total + section.body.length, 0) >
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.legalSectionsBodyTotal
  ) {
    throw new Error(
      "O conteúdo total do termo de aceite excedeu o limite autorizado.",
    );
  }
  return {
    termId: requiredBoundedString(
      source.termId,
      "O identificador do termo de aceite",
      160,
    ),
    version,
    versionLabel: requiredBoundedString(
      source.versionLabel,
      "A versão exibida do termo de aceite",
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.versionLabel,
    ),
    title: requiredBoundedString(
      source.title,
      "O título do termo de aceite",
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.name,
    ),
    confirmationMessage: requiredBoundedString(
      source.confirmationMessage,
      "A confirmação do termo de aceite",
      ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.confirmationMessage,
    ),
    sections,
    sha256: normalizeRequiredSha256(source.sha256, "O hash do termo de aceite"),
  };
};
