import type { NfseApi } from './nfse-api.contract';
import { NfseUnavailableError } from '../services/nfse.errors';

/** No HTTP fiscal transport exists in the browser. Stage 3 supplies a server adapter. */
export const nfseApi: NfseApi = {
  async dispatch() { throw new NfseUnavailableError(); },
  async reconcile() { throw new NfseUnavailableError(); },
};
