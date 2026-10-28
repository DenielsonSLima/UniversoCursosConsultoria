export interface AlunoEadCertificateModel {
  id: string;
  [key: string]: unknown;
}

export const ALUNO_CERTIFICATE_MODEL_UNAVAILABLE =
  'O modelo deste certificado não está disponível. Tente novamente ou avise a secretaria.';
export const ALUNO_CERTIFICATE_MODEL_LOAD_ERROR =
  'Não foi possível carregar o modelo do certificado. Tente novamente.';

export const parseAlunoEadCertificateModel = (value: unknown): AlunoEadCertificateModel => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof (value as AlunoEadCertificateModel).id !== 'string'
    || !(value as AlunoEadCertificateModel).id.trim()) {
    throw new Error(ALUNO_CERTIFICATE_MODEL_UNAVAILABLE);
  }
  return value as AlunoEadCertificateModel;
};

type FetchModel = (certificateId: string, signal: AbortSignal) => Promise<unknown>;

export const alunoCertificateModelQueryOptions = (
  alunoId: string | undefined,
  certificateId: string | undefined,
  fetchModel: FetchModel,
  allowed = true,
) => ({
  queryKey: ['aluno-ead-certificate-model', alunoId || '', certificateId || ''],
  enabled: allowed && Boolean(alunoId && certificateId),
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    if (!alunoId || !certificateId || !allowed) throw new Error(ALUNO_CERTIFICATE_MODEL_LOAD_ERROR);
    return parseAlunoEadCertificateModel(await fetchModel(certificateId, signal));
  },
  retry: false as const,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

interface ModelQueryState {
  data?: AlunoEadCertificateModel;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
}

export const alunoCertificateModelState = (enabled: boolean, query: ModelQueryState) => {
  const loading = enabled && (query.isFetching || query.isPending);
  let error = '';
  if (enabled && !loading && query.isError) {
    const reason = query.error as { code?: string; message?: string } | null;
    error = reason?.code === 'P0002' || reason?.message === ALUNO_CERTIFICATE_MODEL_UNAVAILABLE
      ? ALUNO_CERTIFICATE_MODEL_UNAVAILABLE : ALUNO_CERTIFICATE_MODEL_LOAD_ERROR;
  }
  return {
    eadCertificateModel: enabled && !loading && !error ? query.data : undefined,
    certificateModelLoading: loading,
    certificateModelError: error,
  };
};

interface CertificateActionInput {
  hasCertificate: boolean;
  modelLoading: boolean;
  modelError: string;
  pdfReady: boolean;
  pdfLoading: boolean;
  pdfError: string;
  printing: boolean;
}

export const getAlunoCertificateActions = (state: CertificateActionInput) => {
  if (!state.hasCertificate) return { disabled: true, busy: false, label: 'Baixar PDF' };
  if (state.modelError || state.pdfError) return { disabled: true, busy: false, label: 'PDF indisponível' };
  if (state.modelLoading) return { disabled: true, busy: true, label: 'Carregando modelo' };
  if (state.printing) return { disabled: true, busy: true, label: 'Imprimindo' };
  if (state.pdfLoading) return { disabled: true, busy: true, label: 'Gerando PDF' };
  return { disabled: !state.pdfReady, busy: false, label: state.pdfReady ? 'Baixar PDF' : 'PDF indisponível' };
};
