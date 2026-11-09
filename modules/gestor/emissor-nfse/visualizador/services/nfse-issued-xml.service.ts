import { NFSE_BACKEND_ENABLED } from '../../services/nfse.runtime';
import { mapNfseTransportError } from '../../services/nfse.errors';
import { createNfseIssuedArtifactService, type IssuedNfseIdentity } from './nfse-issued-xml.service-core';
import type { NfseScope } from '../../types/nfse.types';

export const readNfseIssuedArtifact = createNfseIssuedArtifactService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapNfseTransportError(error);
  return data;
}, NFSE_BACKEND_ENABLED);

export const readNfseIssuedXml = async (scope: NfseScope, document: IssuedNfseIdentity, signal?: AbortSignal) =>
  (await readNfseIssuedArtifact(scope, document, signal)).document;
