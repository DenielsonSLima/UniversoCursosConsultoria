import type { NfseScope } from '../../emissor-nfse/types/nfse.types';
import { NfseContractError } from '../../emissor-nfse/services/nfse.errors';
import { integer, money, record, string, nullableString, oneOf, boolean } from '../../emissor-nfse/services/nfse.validation';

export type NfseAccountingMode = 'POLO' | 'GERAL';
export interface NfseAccountingRow {
  id: string; number: string; accessKey: string; emittedAt: string;
  poloId: string; poloName: string; recipientName: string | null; recipientDocument: string | null;
  serviceDate: string | null; competenceDate: string | null;
  nationalServiceCode: string | null; nbsCode: string | null;
  amount: string | null; issAmount: string | null; issRetention: string | null;
  state: string; origin: string | null; xmlAvailable: boolean;
}
export interface NfseAccountingCodeTotal { code: string | null; count: number; amount: string | null }
export interface NfseAccountingPoloTotal { poloId: string; poloName: string; count: number; amount: string | null }
export type NfseAccountingSummary = ({ kind: 'CODE' | 'NBS' } & NfseAccountingCodeTotal) | ({ kind: 'POLO' } & NfseAccountingPoloTotal);
export interface NfseAccountingReport {
  scope: NfseScope; mode: NfseAccountingMode; dateFrom: string; dateTo: string; generatedAt: string;
  pages: NfseAccountingRow[][]; totalItems: number; totalAmount: string | null;
  summaryPages: NfseAccountingSummary[][]; byCode: NfseAccountingCodeTotal[]; byNbs: NfseAccountingCodeTotal[]; byPolo: NfseAccountingPoloTotal[]; unitsDescription: string;
}
export function accountingDate(value: unknown): string {
  const text = string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T12:00:00Z`))
    || new Date(`${text}T12:00:00Z`).toISOString().slice(0, 10) !== text) throw new NfseContractError();
  return text;
}
const dateOrNull = (value: unknown) => value === null ? null : accountingDate(value);
const timestamp = (value: unknown) => {
  const text = string(value); if (!Number.isFinite(Date.parse(text))) throw new NfseContractError(); return text;
};
export function parseNfseAccountingReport(value: unknown, scope: NfseScope): NfseAccountingReport {
  const data = record(value);
  const mode = oneOf(data.mode, ['POLO', 'GERAL'] as const);
  const dateFrom = accountingDate(data.dateFrom), dateTo = accountingDate(data.dateTo);
  if (dateFrom > dateTo || !Array.isArray(data.pages) || data.pages.length > 1250
    || !Array.isArray(data.byCode) || !Array.isArray(data.byNbs) || !Array.isArray(data.byPolo)) throw new NfseContractError();
  const pages = data.pages.map(page => {
    if (!Array.isArray(page) || page.length === 0 || page.length > 8) throw new NfseContractError();
    return page.map(value => {
      const row = record(value);
      const number = string(row.number), accessKey = string(row.accessKey), state = string(row.state);
      if (!/^\d{1,15}$/.test(number) || !/^\d{50}$/.test(accessKey) || state === 'CANCELLED') throw new NfseContractError();
      return { id: string(row.id), number, accessKey, state, emittedAt: timestamp(row.emittedAt),
        poloId: string(row.poloId), poloName: string(row.poloName),
        recipientName: nullableString(row.recipientName), recipientDocument: nullableString(row.recipientDocument),
        serviceDate: dateOrNull(row.serviceDate), competenceDate: dateOrNull(row.competenceDate),
        nationalServiceCode: nullableString(row.nationalServiceCode), nbsCode: nullableString(row.nbsCode),
        amount: money(row.amount), issAmount: money(row.issAmount), issRetention: nullableString(row.issRetention),
        origin: nullableString(row.origin), xmlAvailable: boolean(row.xmlAvailable) };
    });
  });
  const rows = pages.flat(); const totalItems = integer(data.totalItems);
  if (rows.length !== totalItems || rows.length > 10000 || new Set(rows.map(r => r.id)).size !== rows.length
    || new Set(rows.map(r => r.accessKey)).size !== rows.length
    || (mode === 'POLO' && rows.some(r => r.poloId !== scope.poloId))) throw new NfseContractError();
  const byCode = data.byCode.map(value => { const row = record(value);
    return { code: nullableString(row.code), count: integer(row.count), amount: money(row.amount) }; });
  const byNbs = data.byNbs.map(value => { const row = record(value);
    return { code: nullableString(row.code), count: integer(row.count), amount: money(row.amount) }; });
  const byPolo = data.byPolo.map(value => { const row = record(value);
    return { poloId: string(row.poloId), poloName: string(row.poloName), count: integer(row.count), amount: money(row.amount) }; });
  if (byPolo.length === 0 || new Set(byPolo.map(p => p.poloId)).size !== byPolo.length
    || new Set(byCode.map(c => c.code)).size !== byCode.length
    || rows.some(r => !byPolo.some(p => p.poloId === r.poloId))
    || (mode === 'POLO' && (byPolo.length !== 1 || byPolo[0].poloId !== scope.poloId))) throw new NfseContractError();
  if (!Array.isArray(data.summaryPages) || data.summaryPages.length > 1500) throw new NfseContractError();
  const summaryPages = data.summaryPages.map(page => {
    if (!Array.isArray(page) || page.length === 0 || page.length > 12) throw new NfseContractError();
    return page.map(value => {
      const row = record(value), kind = oneOf(row.kind, ['CODE', 'NBS', 'POLO'] as const);
      if (kind === 'CODE' || kind === 'NBS') return { kind, code: nullableString(row.code), count: integer(row.count), amount: money(row.amount) };
      if (mode !== 'GERAL') throw new NfseContractError();
      return { kind, poloId: string(row.poloId), poloName: string(row.poloName), count: integer(row.count), amount: money(row.amount) };
    });
  });
  const expectedSummaries = [...byCode.map(c => ({ kind: 'CODE', ...c })), ...byNbs.map(c => ({ kind: 'NBS', ...c })), ...(mode === 'GERAL' ? byPolo.map(p => ({ kind: 'POLO', ...p })) : [])];
  if (JSON.stringify(summaryPages.flat()) !== JSON.stringify(expectedSummaries)) throw new NfseContractError();
  return { scope, mode, dateFrom, dateTo, generatedAt: timestamp(data.generatedAt), pages, totalItems,
    totalAmount: money(data.totalAmount), summaryPages, byCode, byNbs, byPolo, unitsDescription: string(data.unitsDescription) };
}
