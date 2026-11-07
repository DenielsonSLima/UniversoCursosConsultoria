import { polosService, type Polo } from '../../polos/polos.service';
import { getNfseAccess } from '../../../emissor-nfse/access/nfse-access.service';
import type { NfseAccessIdentity } from '../../../emissor-nfse/access/nfse-access.contract';

export type NfsePolo = Pick<Polo, 'nome' | 'cnpj' | 'cidade' | 'estado' | 'status' | 'is_matriz'> & { id: string };

// Read the existing authorized catalogue. No second company registration is created.
export const nfsePolosService = {
  async list(identity: NfseAccessIdentity, signal?: AbortSignal): Promise<NfsePolo[]> {
    const access = await getNfseAccess(identity, signal);
    if (!access.allowed || signal?.aborted) throw new Error('Acesso NFS-e não autorizado.');
    const polos = await polosService.getAll();
    return polos.filter((polo): polo is Polo & { id: string } => Boolean(polo.id))
      .map(({ id, nome, cnpj, cidade, estado, status, is_matriz }) => ({
        id, nome, cnpj, cidade, estado, status, is_matriz,
      }));
  },
};
