import {
  ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract";

export type ElectronicSignatureStampLockedFieldId =
  | "canonicalLabel"
  | "signerName"
  | "signerCpfMasked"
  | "signedAt"
  | "signatureHash"
  | "verificationUrl"
  | "signatureQrCode";

export interface ElectronicSignatureStampLockedField {
  id: ElectronicSignatureStampLockedFieldId;
  label: string;
  value: string;
  kind: "TEXT" | "DERIVED_QR";
  locked: true;
  description?: string;
}

export const getElectronicSignatureStampLockedFields = (
  canonicalLabel: string,
): readonly ElectronicSignatureStampLockedField[] =>
  [
    {
      id: "canonicalLabel",
      label: "Declaração canônica",
      value: canonicalLabel,
      kind: "TEXT",
      locked: true,
    },
    {
      id: "signerName",
      label: "Nome completo do assinante",
      value: ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signerName,
      kind: "TEXT",
      locked: true,
    },
    {
      id: "signerCpfMasked",
      label: "CPF mascarado do assinante",
      value: ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signerCpfMasked,
      kind: "TEXT",
      locked: true,
      description: "O PDF público nunca exibe o CPF completo.",
    },
    {
      id: "signedAt",
      label: "Data, hora, segundos e fuso",
      value: ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signedAt,
      kind: "TEXT",
      locked: true,
    },
    {
      id: "signatureHash",
      label: "Hash individual da assinatura",
      value: ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signatureHash,
      kind: "TEXT",
      locked: true,
      description: "Identifica este ato de assinatura, não apenas o documento.",
    },
    {
      id: "verificationUrl",
      label: "URL verificadora individual",
      value: ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.verificationUrl,
      kind: "TEXT",
      locked: true,
    },
    {
      id: "signatureQrCode",
      label: "QR Code individual · lado direito",
      value: "GERADO_A_PARTIR_DA_URL_VERIFICADORA",
      kind: "DERIVED_QR",
      locked: true,
      description:
        "Aponta para a validação pública desta assinatura específica.",
    },
  ] as const;
