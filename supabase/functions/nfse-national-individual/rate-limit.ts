import type { IndividualCommand } from './contract.ts';

type Limit = (key: string, requests: number, windowMs: number) => boolean;
const minute = 60_000;

/** Cheap IP protection applies before parsing/authentication. The extra margin
 * above the read budget leaves room for the existing eight fiscal commands. */
export function individualEntryRateLimited(ip: string, limit: Limit): boolean {
  return limit(`nfse-individual-entry:${ip}`, 256, minute);
}

/** Called only after parsing and authorization. Actor is the verified identity,
 * never a body field. Observation budgets cannot spend the fiscal command quota. */
export function individualCommandRateLimited(
  ip: string, command: IndividualCommand, actor: string, limit: Limit,
): boolean {
  if (command.action !== 'OBSERVE' && command.action !== 'OBSERVE_CANCEL') {
    return limit(`nfse-individual:${ip}`, 8, minute);
  }
  const scope = command.scope;
  const identity = [actor, scope.contextKey, scope.poloId, scope.environment, scope.month].join(':');
  return limit(`nfse-individual-observe-ip:${ip}`, 240, minute)
    || limit(`nfse-individual-observe-actor:${identity}`, 120, minute);
}
