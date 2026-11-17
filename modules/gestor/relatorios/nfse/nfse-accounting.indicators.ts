import { NfseContractError } from '../../emissor-nfse/services/nfse.errors';
import { integer, money, record, string, nullableString, oneOf } from '../../emissor-nfse/services/nfse.validation';
import type { NfseAccountingRow, NfseAccountingPoloTotal } from './nfse-accounting.types';
export const taxKeys = ['ISS','PIS','COFINS','SOCIAL','IRRF','CP','CBS','IBS'] as const;
export type TaxKey = typeof taxKeys[number];
export interface NfseTaxIndicator {
  key: TaxKey; amount: string | null; informedCount: number; zeroCount: number;
  retainedCount: number; notRetainedCount: number; unknownRetentionCount: number;
}
export interface NfsePoloStatus {
  poloId: string; poloName: string; poloCity: string | null; poloState: string | null;
  total: number; valid: number; cancelled: number; rejected: number; pending: number; other: number;
}
export function statusCategory(row: NfseAccountingRow): 'valid' | 'cancelled' | 'rejected' | 'pending' | 'other' {
  if (row.validForTotals) return 'valid';
  if (row.state === 'CANCELLED') return 'cancelled';
  if (['REJECTED','BLOCKED'].includes(row.state)) return 'rejected';
  if (['PROCESSING','AWAITING_CONFIRMATION'].includes(row.state)) return 'pending';
  return 'other';
}
export function parseIndicators(value: unknown, validItems: number): NfseTaxIndicator[] {
  if (!Array.isArray(value) || value.length !== taxKeys.length) throw new NfseContractError();
  return value.map((item, index) => {
    const r=record(item), key=oneOf(r.key,taxKeys), amount=money(r.amount);
    const counts={informedCount:integer(r.informedCount),zeroCount:integer(r.zeroCount),retainedCount:integer(r.retainedCount),
      notRetainedCount:integer(r.notRetainedCount),unknownRetentionCount:integer(r.unknownRetentionCount)};
    if(key!==taxKeys[index] || counts.informedCount>validItems || counts.zeroCount>counts.informedCount
      || counts.retainedCount+counts.notRetainedCount+counts.unknownRetentionCount!==validItems
      || (amount!==null && (!validItems || counts.informedCount!==validItems))
      || (validItems>0 && counts.informedCount===validItems && amount===null)) throw new NfseContractError();
    return {key,amount,...counts};
  });
}
export function parsePoloStatuses(value: unknown, polos: NfseAccountingPoloTotal[], rows: NfseAccountingRow[]): NfsePoloStatus[] {
  if (!Array.isArray(value) || value.length!==polos.length) throw new NfseContractError();
  return value.map((item,index)=>{
    const r=record(item),polo=polos[index];
    const data={poloId:string(r.poloId),poloName:string(r.poloName),poloCity:nullableString(r.poloCity),poloState:nullableString(r.poloState),
      total:integer(r.total),valid:integer(r.valid),cancelled:integer(r.cancelled),rejected:integer(r.rejected),pending:integer(r.pending),other:integer(r.other)};
    const unitRows=rows.filter(row=>row.poloId===polo.poloId);
    if(data.poloId!==polo.poloId || data.poloName!==polo.poloName || data.poloCity!==polo.poloCity || data.poloState!==polo.poloState
      || data.total!==unitRows.length || data.valid!==polo.count) throw new NfseContractError();
    for(const category of ['valid','cancelled','rejected','pending','other'] as const)
      if(data[category]!==unitRows.filter(row=>statusCategory(row)===category).length) throw new NfseContractError();
    return data;
  });
}
