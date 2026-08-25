export const professorActivePolosFreshnessOptions = {
  refetchOnMount: 'always' as const,
  staleTime: 0,
};

interface ProfessorAccessGateInput {
  hasCurrentPolo: boolean;
  isError: boolean;
  isFetchedAfterMount: boolean;
  isSuccess: boolean;
}

export type ProfessorAccessGate = 'authorized' | 'checking' | 'connection-error';

export const resolveProfessorAccessGate = ({
  hasCurrentPolo,
  isError,
  isFetchedAfterMount,
  isSuccess,
}: ProfessorAccessGateInput): ProfessorAccessGate => {
  if (isError && isFetchedAfterMount) return 'connection-error';
  if (!isSuccess || !isFetchedAfterMount || !hasCurrentPolo) return 'checking';
  return 'authorized';
};
