import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { alunoCertificateModelQueryOptions, alunoCertificateModelState } from '../eadCertificateModel';

const fetchModel = async (certificateId: string, signal: AbortSignal) => {
  const { data, error } = await supabase
    .rpc('get_aluno_ead_certificate_model', { p_certificado_id: certificateId })
    .abortSignal(signal);
  if (error) throw error;
  return data;
};

export const useAlunoEadCertificateModel = (
  alunoId: string | undefined,
  certificateId: string | undefined,
  enabled: boolean,
) => {
  const options = alunoCertificateModelQueryOptions(alunoId, certificateId, fetchModel, enabled);
  const query = useQuery(options);
  return {
    ...alunoCertificateModelState(options.enabled, query),
    retryCertificateModel: () => query.refetch(),
  };
};
