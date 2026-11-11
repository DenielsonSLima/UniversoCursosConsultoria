export interface PilotScope { poloId: string; contextKey: string; environment: 'HOMOLOGACAO'; month: string }
export interface PilotCommand {
  scope: PilotScope; action: 'PREVIEW' | 'ISSUE' | 'RECONCILE'; requestId: string;
  previewId?: string; confirmed?: true; recipientPartnerId?: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parsePilotCommand(value: unknown): PilotCommand {
  if (!object(value) || Object.keys(value).some(key => !['scope','action','requestId','previewId','confirmed','recipientPartnerId'].includes(key))
    || !object(value.scope) || Object.keys(value.scope).some(key => !['poloId','contextKey','environment','month'].includes(key))
    || !uuid.test(String(value.scope.poloId)) || !uuid.test(String(value.scope.contextKey))
    || value.scope.environment !== 'HOMOLOGACAO' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(value.scope.month))
    || !uuid.test(String(value.requestId)) || !['PREVIEW','ISSUE','RECONCILE'].includes(String(value.action))) {
    throw new Error('INVALID_PILOT_COMMAND');
  }
  if (value.recipientPartnerId !== undefined && (value.action !== 'PREVIEW' || !uuid.test(String(value.recipientPartnerId)))) throw new Error('INVALID_PILOT_COMMAND');
  if (value.action === 'PREVIEW' ? value.previewId !== undefined || value.confirmed !== undefined
    : !uuid.test(String(value.previewId)) || (value.action === 'ISSUE' ? value.confirmed !== true : value.confirmed !== undefined)) {
    throw new Error('INVALID_PILOT_COMMAND');
  }
  return value as unknown as PilotCommand;
}

export async function readPilotCommand(req: Request): Promise<PilotCommand> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !req.body
    || Number(req.headers.get('content-length')) > 4096) throw new Error('INVALID_PILOT_COMMAND');
  const reader = req.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 4096) throw new Error('INVALID_PILOT_COMMAND'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parsePilotCommand(JSON.parse(new globalThis.TextDecoder().decode(bytes)));
}
