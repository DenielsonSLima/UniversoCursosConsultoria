import { queryProesc, type Cursor, type Filters, type Resource } from './contract.ts';
import { v2Headers } from './connection-contract.ts';

/** V2 é somente leitura. URLs de paginação externas nunca são seguidas. */
export function createProescV2Client(options: { token: string; wafHeader?: string; transport?: typeof fetch }) {
  const headers = v2Headers(options.token, options.wafHeader);
  const transport = options.transport ?? fetch;
  const authenticated: typeof fetch = (input, init) => transport(input, {
    ...init, method: 'GET', redirect: 'error', headers,
  });
  return {
    readPage(resource: Resource, filters: Filters, cursor: Cursor) {
      return queryProesc(options.token, resource, filters, cursor, authenticated);
    },
  };
}
