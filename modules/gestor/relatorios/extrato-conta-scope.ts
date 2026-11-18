/** UI scope resolution never grants access: the RPC independently checks global permission. */
export function resolveExtratoPoloId(tipo: string, isGlobal: boolean, wholeAccount: boolean, poloId?: string | null): string | null {
  return tipo === 'EXTRATO_CONTA' && isGlobal && wholeAccount ? null : poloId || null;
}
export const extratoScopeLabel = (poloId: string | null) => poloId ? 'Somente este polo' : 'Toda a conta · todos os polos';
