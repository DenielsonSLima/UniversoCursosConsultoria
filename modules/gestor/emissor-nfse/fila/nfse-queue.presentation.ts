const blockingLabels: Record<string, string> = {
  FISCAL_CONFIGURATION_NOT_VALIDATED: 'Validar a configuração fiscal do estabelecimento.',
  RECIPIENT_CONFIRMATION_REQUIRED: 'Confirmar quem é o tomador do serviço.',
  COMPETENCE_REQUIRED: 'Informar a competência fiscal.',
  SERVICE_DATE_REQUIRED: 'Informar a data da prestação.',
  PROVIDER_NOT_ENABLED: 'Integração fiscal aguardando homologação.',
  SOURCE_REVALIDATION_REQUIRED: 'Conferir os recebimentos antes da transmissão.',
  ISSUER_DOCUMENT_REQUIRED: 'Completar o CNPJ do estabelecimento.',
  RECIPIENT_DOCUMENT_REQUIRED: 'Completar o documento do tomador.',
};

export const nfseQueueBlockingLabel = (code: string) => blockingLabels[code] || 'Conferência fiscal pendente.';
