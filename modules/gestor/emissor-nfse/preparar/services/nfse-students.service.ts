import { supabase } from '../../../../../lib/supabase';
import { withAuthDeadline } from '../../../../login/auth-request';
import { mapNfseTransportError } from '../../services/nfse.errors';
import { createNfseReceiptReader } from './nfse-students.contract';

/** Financial read only; independent of fiscal preparation/provider availability. */
export const readNfseReceiptStudents = createNfseReceiptReader(async (name, args, signal) => {
  const { data, error } = await withAuthDeadline(
    requestSignal => supabase.rpc(name, args).retry(false).abortSignal(requestSignal),
    { signal, timeoutMs: 20_000 },
  );
  if (error) throw mapNfseTransportError(error);
  return data;
});
