import { object, type RecordValue } from './contract.ts';
import { connectionToken } from './connection-contract.ts';
import { createProescV2Client } from './v2-client.ts';
import { type SyncLink } from './sync-observation.ts';

type Admin = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export type InvoiceEvidence = { revision: string; scopes: Map<string, RecordValue[]> };
export const invoiceScope = (link: SyncLink) => `${link.unitId}:${link.dueDate.slice(0, 7)}`;

/** No financial writes. Failed/incomplete scopes never become negative payment evidence. */
export async function collectInvoiceEvidence(
  admin: Admin, actorId: string, links: SyncLink[], transport: typeof fetch, signal: AbortSignal,
): Promise<InvoiceEvidence> {
  const empty = (): InvoiceEvidence => ({ revision: '', scopes: new Map() });
  if (!links.length || signal.aborted) return empty();
  const credential = async () => {
    const result = await admin.rpc('proesc_connection_service', {
      p_action: 'credential', p_actor_id: actorId, p_payload: { version: 'v2' },
    });
    if (result.error) throw new Error('V2_UNAVAILABLE');
    const saved = object(result.data);
    const token = connectionToken('v2', saved.token);
    if (typeof saved.revision !== 'string' || !saved.revision) throw new Error('V2_UNAVAILABLE');
    return { token, revision: saved.revision,
      wafHeader: typeof saved.wafHeader === 'string' ? saved.wafHeader : undefined };
  };
  try {
    const saved = await credential();
    // Reserve most of the 95-second worker lease for the existing writes/finish.
    const budget = AbortSignal.any([signal, AbortSignal.timeout(35000)]);
    const client = createProescV2Client({ ...saved, transport, signal: budget });
    const tasks = [...new Map(links.map((link) => [invoiceScope(link), link])).entries()];
    const scopes = new Map<string, RecordValue[]>();
    let position = 0;
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (position < tasks.length && !budget.aborted) {
        const [key, link] = tasks[position++];
        const month = link.dueDate.slice(0, 7);
        const [year, monthNumber] = month.split('-').map(Number);
        const filters = { unitId: link.unitId, start: month, end: month };
        const rows: RecordValue[] = [];
        const wanted = new Set(links.filter((item) => invoiceScope(item) === key).map((item) => item.externalKey));
        let count = 0;
        try {
          for (let page = 1; page <= 250 && !budget.aborted; page++) {
            const result = await client.readPage('invoices', filters, { year, month: monthNumber, page });
            count += result.records.length;
            if (count > 20000) break;
            rows.push(...result.records.filter((row) => wanted.has(String(row.invoice_id))));
            if (result.nextCursor === null) {
              if (!budget.aborted) scopes.set(key, rows);
              break;
            }
          }
        } catch { /* Failed scopes retain no partially collected evidence. */ }
      }
    }));
    if (signal.aborted) return empty();
    const current = await credential();
    if (current.revision !== saved.revision || current.token !== saved.token
      || current.wafHeader !== saved.wafHeader) return empty();
    return { revision: saved.revision, scopes };
  } catch { return empty(); }
}
