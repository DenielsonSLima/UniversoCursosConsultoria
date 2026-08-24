import { normalizeElectronicSignatureStampTemplate as normalizeSharedTemplate } from "./signature-stamp-template.normalization.ts";
import type { ElectronicSignatureStampTemplateV1 } from "./pdf-document-signature.types.ts";

/**
 * Snapshots históricos do compositor aceitavam exclusivamente o prefixo
 * legado do nome. O editor ativo continua usando o normalizador estrito.
 */
export const normalizeElectronicSignatureStampTemplate = (
  value: unknown,
): ElectronicSignatureStampTemplateV1 =>
  normalizeSharedTemplate(value, {
    allowLegacySignerNameLabel: true,
  }) as ElectronicSignatureStampTemplateV1;
