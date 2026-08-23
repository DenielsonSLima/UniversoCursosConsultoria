import type { ElectronicSignatureAdministrationPresentation } from "./assinatura-eletronica.contract";
import { ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS } from "./assinatura-eletronica.contract";
import { normalizeEditor } from "./assinatura-eletronica.service.editor-normalizers";
import { normalizePreviewIdentity } from "./assinatura-eletronica.service.preview-normalizers";
import {
  asNullableString,
  asRecord,
  firstRpcRecord,
  RECEIPT_FIELD_IDS,
  requiredBoolean,
  requiredBoundedString,
  requiredNumber,
  requiredString,
} from "./assinatura-eletronica.service.shared";

export const normalizeAdministration = (
  value: unknown,
): ElectronicSignatureAdministrationPresentation => {
  const source = firstRpcRecord(
    value,
    "A configuração de assinatura eletrônica retornou um formato inválido.",
  );
  const policy = asRecord(
    source.policy,
    "A política de assinatura eletrônica não foi encontrada.",
  );
  const certificate = asRecord(
    source.certificate,
    "A apresentação do comprovante não foi encontrada.",
  );
  if (!Array.isArray(policy.receiptFields)) {
    throw new Error(
      "Os campos do comprovante não foram informados pelo serviço autorizado.",
    );
  }
  const receiptFields = policy.receiptFields.map((field) => {
    const item = asRecord(field, "Campo de comprovante inválido.");
    const id = requiredString(
      item.id,
      "O identificador do campo do comprovante",
    );
    if (!RECEIPT_FIELD_IDS.includes(id as typeof RECEIPT_FIELD_IDS[number])) {
      throw new Error("Campo de comprovante não reconhecido.");
    }
    return {
      id: id as typeof RECEIPT_FIELD_IDS[number],
      label: requiredString(item.label, "O rótulo do campo do comprovante"),
      description: requiredString(
        item.description,
        "A descrição do campo do comprovante",
      ),
    };
  });
  if (
    receiptFields.length !== RECEIPT_FIELD_IDS.length ||
    receiptFields.some((field, index) => field.id !== RECEIPT_FIELD_IDS[index])
  ) {
    throw new Error(
      "A estrutura de campos do comprovante não corresponde ao contrato autorizado.",
    );
  }

  return {
    poloId: asNullableString(source.polo_id ?? source.poloId),
    version: requiredNumber(source.version, "A versão da configuração"),
    enabled: requiredBoolean(source.enabled, "A habilitação da configuração"),
    legalStatusLabel: requiredString(
      source.legal_status_label ?? source.legalStatusLabel,
      "O status jurídico",
    ),
    certificate: {
      statusLabel: requiredString(
        certificate.statusLabel ?? certificate.status_label,
        "O status do comprovante",
      ),
      description: requiredString(
        certificate.description,
        "A descrição do comprovante",
      ),
    },
    previewIdentity: normalizePreviewIdentity(
      source.previewIdentity ?? source.preview_identity,
    ),
    policy: {
      documentType: requiredString(
        policy.documentType ?? policy.document_type,
        "O tipo do modelo",
      ),
      name: requiredBoundedString(
        policy.name,
        "O nome da política",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.name,
      ),
      versionLabel: requiredBoundedString(
        policy.versionLabel ?? policy.version_label,
        "A versão exibida",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.versionLabel,
      ),
      confirmationMessage: requiredBoundedString(
        policy.confirmationMessage ?? policy.confirmation_message,
        "A mensagem de confirmação",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.confirmationMessage,
      ),
      receiptTitle: requiredBoundedString(
        policy.receiptTitle ?? policy.receipt_title,
        "O título do comprovante",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptTitle,
      ),
      receiptMessage: requiredBoundedString(
        policy.receiptMessage ?? policy.receipt_message,
        "A mensagem do comprovante",
        ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS.receiptMessage,
      ),
      receiptFields,
      editor: normalizeEditor(policy.editor),
    },
  };
};
