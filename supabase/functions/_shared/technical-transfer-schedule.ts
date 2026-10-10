/** Explicit, immutable admission schedule shared by the portal and issuance boundary. */
export interface TransferScheduleItem {
  itemId: string;
  cicloNumero: 1 | 2;
  tipo: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  ordem: number;
  vencimento: string;
  valor: string;
  descontoPontualidade: string;
  jurosAtrasoPercentual: string;
  multaAtrasoPercentual: string;
}

export interface TransferSchedulePlan {
  versao: 3;
  itens: TransferScheduleItem[];
}

export interface TransferEntrySnapshot extends TransferSchedulePlan {
  requestId: string;
  cicloInicial: 1 | 2;
  maxCiclos: 1 | 2;
  cronogramaFingerprint: string;
}

export const TRANSFER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TRANSFER_FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const amount = (value: unknown): value is string => typeof value === 'string'
  && /^\d{1,7}\.\d{2}$/.test(value) && Number(value) <= 9_999_999.99;
const rate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{1,2}(?:\.\d{1,6})?$/.test(value) && Number(value) < 100;

export const isTransferSchedulePlan = (
  value: unknown,
  maxCycles = 2,
): value is TransferSchedulePlan => {
  if (!record(value) || value.versao !== 3 || ![1, 2].includes(maxCycles)
    || !Array.isArray(value.itens) || value.itens.length > 61 * maxCycles) return false;
  const ids = new Set<string>();
  const orders = new Set<string>();
  const installments = [0, 0];
  const fees = [0, 0];
  return value.itens.every((item: unknown) => {
    if (!record(item) || typeof item.itemId !== 'string' || !TRANSFER_UUID_RE.test(item.itemId)
      || ids.has(item.itemId.toLowerCase()) || !Number.isInteger(item.cicloNumero)
      || Number(item.cicloNumero) < 1 || Number(item.cicloNumero) > maxCycles
      || !Number.isInteger(item.ordem) || Number(item.ordem) < 1 || Number(item.ordem) > 61
      || !validDate(item.vencimento) || !amount(item.valor) || Number(item.valor) <= 0
      || !amount(item.descontoPontualidade) || Number(item.descontoPontualidade) >= Number(item.valor)
      || !rate(item.jurosAtrasoPercentual) || !rate(item.multaAtrasoPercentual)) return false;
    const cycle = Number(item.cicloNumero);
    if (item.tipo !== 'PARCELA' && item.tipo !== (cycle === 1 ? 'MATRICULA' : 'REMATRICULA')) return false;
    const order = `${cycle}:${item.ordem}`;
    if (orders.has(order)) return false;
    ids.add(item.itemId.toLowerCase());
    orders.add(order);
    if (item.tipo === 'PARCELA') installments[cycle - 1]++;
    else fees[cycle - 1]++;
    return installments[cycle - 1] <= 60 && fees[cycle - 1] <= 1;
  });
};

export const isTransferEntrySnapshot = (value: unknown): value is TransferEntrySnapshot => {
  if (!record(value) || ![1, 2].includes(Number(value.maxCiclos))
    || !Number.isInteger(value.maxCiclos) || !isTransferSchedulePlan(value, Number(value.maxCiclos))
    || typeof value.requestId !== 'string' || !TRANSFER_UUID_RE.test(value.requestId)
    || typeof value.cronogramaFingerprint !== 'string'
    || !TRANSFER_FINGERPRINT_RE.test(value.cronogramaFingerprint)) return false;
  const initial = value.itens.length ? Math.min(...value.itens.map((item) => item.cicloNumero)) : 1;
  return value.cicloInicial === initial;
};

export const isFeeOnlyTransferSchedule = (value: unknown, cycle: number): boolean => {
  if (!isTransferEntrySnapshot(value) || ![1, 2].includes(cycle)) return false;
  const items = value.itens.filter((item) => item.cicloNumero === cycle);
  return items.length === 1 && items[0].tipo === (cycle === 1 ? 'MATRICULA' : 'REMATRICULA');
};
