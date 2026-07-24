export type BanesePixState = 'available' | 'sandbox-unavailable' | 'pending';

export const baneseBoletoDocumentQueryKey = (
  receivableId: string,
  pixState: BanesePixState,
) => ['banese-boleto-document', receivableId, pixState] as const;
