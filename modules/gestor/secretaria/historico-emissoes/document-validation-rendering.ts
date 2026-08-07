import type { EmissionLog } from './historico-emissoes.types';

export const isPublicDocumentValidationEnabled = (emission: EmissionLog) => (
  emission.validacao_publica
  ?? emission.dados_emissao?.validationPublic
  ?? true
);

export const hasExplicitQrCodeField = (templateConfig: any) => (
  Array.isArray(templateConfig?.absoluteFields)
  && templateConfig.absoluteFields.some(
    (field: any) => field?.type === 'qrcode',
  )
);

