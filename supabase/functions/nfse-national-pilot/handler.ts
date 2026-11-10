import { buildNationalDps } from '../_shared/nfse-national/dps.ts';
import type { NationalDpsInput } from '../_shared/nfse-national/dps.types.ts';
import type { NationalPilotResult } from '../_shared/nfse-national/pilot.types.ts';
import { readPilotCommand, type PilotCommand } from './contract.ts';

export interface PilotLedgerRow {
  previewId: string; expiresAt: string; state: string; dispatch: boolean;
  fiscalInput: NationalDpsInput; preview: Record<string, unknown>;
  result: Record<string, unknown> | null; configurationVersion: number; certificateFingerprint: string;
}
export interface PilotHandlerDependencies {
  authorize(req: Request, command: PilotCommand): Promise<string>;
  preview(command: PilotCommand, actor: string): Promise<{ row: PilotLedgerRow; available: boolean; reason: string | null }>;
  ledger(command: PilotCommand, actor: string, action: 'CLAIM' | 'READ' | 'FINISH', input?: unknown): Promise<PilotLedgerRow>;
  execute(command: PilotCommand, actor: string, row: PilotLedgerRow, reconcile: boolean): Promise<NationalPilotResult>;
  rateLimited(req: Request): boolean;
  respond(req: Request, body: unknown, status: number): Response;
}
/** Reads may use a renewed A1 for the same issuer. A new dispatch keeps the reviewed version. */
export function pilotCredentialChangeCode(row: PilotLedgerRow,
  current: { configurationVersion: number; certificate: { fingerprint: string }; issuer: { cnpj: string } },
  reconcile: boolean): string | null {
  if (row.fiscalInput.issuer.taxId.type !== 'CNPJ' || current.issuer.cnpj !== row.fiscalInput.issuer.taxId.value) {
    return 'PILOT_ISSUER_CHANGED';
  }
  if (!reconcile && (current.configurationVersion !== row.configurationVersion ||
    current.certificate.fingerprint !== row.certificateFingerprint)) return 'PILOT_CONFIGURATION_CHANGED';
  return null;
}
const resultMessage = (result: NationalPilotResult) => {
  if (result.state === 'AUTHORIZED') return 'Nota de teste autorizada em homologação. Não comprova adequação fiscal de produção.';
  if (result.state === 'REJECTED') return `Teste rejeitado pela SEFIN: ${result.codes.join(', ')}.`;
  if (result.state === 'BLOCKED') return `Teste bloqueado antes da transmissão (${result.code}).`;
  return `Resultado ainda não confirmado (${result.code}). Consulte esta mesma DPS antes de qualquer nova tentativa.`;
};
function publicResult(row: PilotLedgerRow) {
  const result = row.result || {};
  return { state: ['AUTHORIZED','REJECTED','BLOCKED'].includes(row.state) ? row.state : 'AWAITING_CONFIRMATION',
    attemptId: row.previewId, message: typeof result.message === 'string' ? result.message
      : 'Consulte o resultado desta mesma DPS; nenhum reenvio automático será executado.',
    ...(typeof result.number === 'string' ? { number: result.number } : {}),
    ...(typeof result.accessKey === 'string' ? { accessKey: result.accessKey } : {}) };
}
/** Browser sends intent only; both preview and issue are server-owned, isolated technical data. */
export function createPilotHandler(deps: PilotHandlerDependencies) {
  return async (req: Request) => {
    if (req.method !== 'POST') return deps.respond(req, { error: 'METHOD_NOT_ALLOWED' }, 405);
    if (deps.rateLimited(req)) return deps.respond(req, { error: 'RATE_LIMITED' }, 429);
    let command: PilotCommand;
    try { command = await readPilotCommand(req); }
    catch { return deps.respond(req, { error: 'INVALID_PILOT_COMMAND' }, 400); }
    let actor: string;
    try { actor = await deps.authorize(req, command); }
    catch { return deps.respond(req, { error: 'PILOT_SCOPE_DENIED' }, 403); }
    const respond = (data: unknown) => deps.respond(req, { version: 1, scope: command.scope, data }, 200);
    try {
      if (command.action === 'PREVIEW') {
        const { row, available, reason } = await deps.preview(command, actor);
        return respond({ previewId: row.previewId, expiresAt: row.expiresAt,
          payload: row.preview, capability: { available, reason } });
      }
      let row = await deps.ledger(command, actor, command.action === 'ISSUE' ? 'CLAIM' : 'READ');
      if (['AUTHORIZED','REJECTED','BLOCKED'].includes(row.state)) return respond(publicResult(row));
      if (command.action === 'RECONCILE' && row.state === 'PREVIEWED') {
        return respond({ state: 'BLOCKED', attemptId: row.previewId,
          message: 'Este piloto ainda não foi enviado. Revise a prévia e confirme o teste.' });
      }
      // A replay never starts another POST. A lost CLAIM/response is recovered by GET only.
      const reconcile = command.action === 'RECONCILE' || !row.dispatch;
      let result = await deps.execute(command, actor, row, reconcile);
      const dpsId = buildNationalDps(row.fiscalInput).referenceId;
      // A read-only recovery cannot prove that a prior leased POST was never sent.
      // Keep it recoverable, including while the original dispatch is still in flight.
      if (reconcile && result.state === 'BLOCKED') {
        result = { state: 'AWAITING_CONFIRMATION', dpsId, code: result.code };
      }
      row = await deps.ledger(command, actor, 'FINISH', { ...result, dpsId, message: resultMessage(result) });
      return respond(publicResult(row));
    } catch {
      // SQL/provider exceptions may contain identity or secrets. Do not echo or log them.
      return deps.respond(req, { error: command.action === 'PREVIEW' ? 'PILOT_PREVIEW_UNAVAILABLE' : 'PILOT_RESULT_UNCONFIRMED' }, 503);
    }
  };
}
