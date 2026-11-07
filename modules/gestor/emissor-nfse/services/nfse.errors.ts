export class NfseUnavailableError extends Error {
  readonly code = 'NFSE_NOT_AVAILABLE';
  constructor() {
    super('A integração de NFS-e está em preparação. As operações serão liberadas após a configuração e validação do serviço.');
    this.name = 'NfseUnavailableError';
  }
}

export class NfseContractError extends Error {
  readonly code = 'NFSE_INVALID_RESPONSE';
  constructor() {
    super('Não foi possível validar os dados da NFS-e para esta unidade. Atualize a consulta antes de continuar.');
    this.name = 'NfseContractError';
  }
}

export class NfseAccessError extends Error {
  readonly code = 'NFSE_ACCESS_DENIED';
  constructor() {
    super('Seu acesso não permite esta operação de NFS-e no contexto selecionado.');
    this.name = 'NfseAccessError';
  }
}

export function mapNfseTransportError(error: unknown): Error {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'PGRST202' || code === '42883') return new NfseUnavailableError();
  if (code === '42501' || code === 'PGRST301') return new NfseAccessError();
  if (error instanceof Error && error.name === 'AbortError') return error;
  // Never expose raw SQL/provider payloads or credentials in interface/logs.
  return new Error('Não foi possível consultar a NFS-e. Tente novamente.');
}
