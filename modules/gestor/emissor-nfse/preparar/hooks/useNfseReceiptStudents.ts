import { useQuery } from '@tanstack/react-query';
import { NfseContractError } from '../../services/nfse.errors';
import { isNfseReceiptScopeValid } from '../services/nfse-students.contract';
import { readNfseReceiptStudents } from '../services/nfse-students.service';
import { nfseStudentKeys } from '../queries/nfse-students.keys';
import { defaultNfseReceiptFilters, type NfseReceiptFilters, type NfseReceiptScope } from '../types/nfse-students.types';

const options = { retry: false, staleTime: 15_000, gcTime: 0, refetchOnWindowFocus: true } as const;
const required = (scope: NfseReceiptScope | null) => {
  if (!isNfseReceiptScopeValid(scope)) throw new NfseContractError();
  return scope;
};

export function useNfseReceiptGroups(scope: NfseReceiptScope | null, filters: NfseReceiptFilters, enabled: boolean) {
  return useQuery({
    ...options, queryKey: nfseStudentKeys.groups(scope, filters),
    enabled: enabled && isNfseReceiptScopeValid(scope),
    queryFn: ({ signal }) => readNfseReceiptStudents(required(scope), filters, [], true, signal),
  });
}

export function useNfseReceiptSelection(scope: NfseReceiptScope | null, ids: string[], enabled: boolean) {
  return useQuery({
    ...options, queryKey: nfseStudentKeys.selection(scope, ids),
    enabled: enabled && isNfseReceiptScopeValid(scope),
    queryFn: ({ signal }) => readNfseReceiptStudents(required(scope), defaultNfseReceiptFilters(), ids, false, signal),
  });
}
