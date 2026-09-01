export interface ExplicitReceivableIssuanceInput<T> {
  receivableId: string;
  requestId: string;
  authorize: (receivableId: string, requestId: string) => Promise<void>;
  sync: (receivableId: string) => Promise<T>;
}

export const syncAfterExplicitReceivableIssuanceAuthorization = async <T>(
  input: ExplicitReceivableIssuanceInput<T>,
): Promise<T> => {
  await input.authorize(input.receivableId, input.requestId);
  return input.sync(input.receivableId);
};

export const createReceivableIssuanceRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('O navegador não oferece um identificador seguro para a emissão.');
  }
  return globalThis.crypto.randomUUID();
};
