import { object, ProescError, type Cursor, type Filters } from './contract.ts';
import { connectionToken } from './connection-contract.ts';
import { connectionRpc } from './connections.ts';
import { createProescV1Client, type ProescV1AccountingQuery } from './v1-client.ts';
import { createProescV2Client } from './v2-client.ts';

export const PROESC_OPERATION_VERSION = Object.freeze({
  legacy_configuration: 'v1', legacy_accounting: 'v1', people: 'v2', invoices: 'v2',
} as const);
type Operation = { operation: 'legacy_configuration' }
  | { operation: 'legacy_accounting'; query: ProescV1AccountingQuery }
  | { operation: 'people' | 'invoices'; filters: Filters; cursor: Cursor };

/** A finalidade escolhe a versão; falhas nunca trocam a fonte ou a credencial. */
export async function readProescOperation(
  admin: Parameters<typeof connectionRpc>[0], actorId: string, request: Operation, transport: typeof fetch = fetch,
) {
  if (!Object.hasOwn(PROESC_OPERATION_VERSION, request.operation)) throw new ProescError('Operação Proesc não permitida.');
  const version = PROESC_OPERATION_VERSION[request.operation];
  const credential = await connectionRpc(admin, actorId, version, 'credential');
  const token = connectionToken(version, credential.token);
  if (typeof credential.revision !== 'string' || !credential.revision) throw new ProescError('Conexão indisponível.', 409);
  const result = await (async () => {
    if (request.operation === 'legacy_configuration' || request.operation === 'legacy_accounting') {
      const client = createProescV1Client({ token, transport });
      return request.operation === 'legacy_configuration' ? client.configurationData() : client.accountingData(request.query);
    }
    const client = createProescV2Client({ token, wafHeader: typeof credential.wafHeader === 'string'
      ? credential.wafHeader : undefined, transport });
    return client.readPage(request.operation, request.filters, request.cursor);
  })();
  const current = object(await connectionRpc(admin, actorId, version, 'credential'));
  if (current.revision !== credential.revision || current.token !== credential.token
    || current.wafHeader !== credential.wafHeader) {
    throw new ProescError('A conexão mudou durante a consulta. Consulte novamente.', 409);
  }
  return { version, operation: request.operation, result };
}
