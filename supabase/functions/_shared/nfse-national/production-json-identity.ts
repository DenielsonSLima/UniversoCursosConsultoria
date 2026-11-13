/** JSON is a routing hint only. Authorization still requires the complete,
 * semantically identical signed DPS inside the authorized fiscal XML. */
export function productionDpsJsonIdentityMatches(envelope: Record<string, unknown>, expectedDpsId: string): boolean {
  const key = envelope.chaveAcesso;
  const noteId = typeof key === 'string' && /^\d{50}$/.test(key) ? `NFS${key}` : undefined;
  return ['idDps', 'idDPS'].filter(name => Object.hasOwn(envelope, name)).every(name => {
    const value = envelope[name];
    return value === expectedDpsId || noteId !== undefined && value === noteId;
  });
}
