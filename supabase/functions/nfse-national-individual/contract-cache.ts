import { assessNationalProductionContract, type ProductionContractEvidence } from '../_shared/nfse-national/production-live-contract.ts';

/** Process-local public contract evidence only. No A1 material or request transports.
 * Serialized snapshots bound retained UTF-8 size to 2MiB (at most 4MiB of JS string storage).
 * Oversized/expired contracts take the original uncached path, never a stale fallback.
 */
export function createProductionContractCache(now = Date.now) {
  const entries = new Map<string, { json: string; bytes: number }>();
  let totalBytes = 0;
  const remove = (key: string) => {
    const entry = entries.get(key);
    if (entry) totalBytes -= entry.bytes;
    entries.delete(key);
  };
  const usable = (proof: ProductionContractEvidence) => {
    const age = now() - Date.parse(proof.checkedAt);
    return age >= 0 && age < 60_000 && assessNationalProductionContract(proof, now()).transportAvailable;
  };
  return {
    get(key: string): ProductionContractEvidence | null {
      const entry = entries.get(key);
      if (!entry) return null;
      const proof: ProductionContractEvidence = JSON.parse(entry.json);
      if (!usable(proof)) { remove(key); return null; }
      return proof;
    },
    put(key: string, proof: ProductionContractEvidence): void {
      remove(key);
      if (!usable(proof)) return;
      const json = JSON.stringify(proof), bytes = new TextEncoder().encode(json).byteLength;
      if (bytes > 1024 * 1024) return;
      for (const [id, item] of entries) if (!usable(JSON.parse(item.json))) remove(id);
      while (entries.size >= 16 || totalBytes + bytes > 2 * 1024 * 1024) remove(entries.keys().next().value!);
      entries.set(key, { json, bytes }); totalBytes += bytes;
    },
    invalidate: remove,
  };
}
export const productionContractCache = createProductionContractCache();
