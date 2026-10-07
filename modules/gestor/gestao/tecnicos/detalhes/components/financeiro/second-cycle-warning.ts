export interface OpenCycleCharge {
  id: string;
  descricao: string;
  valor: string;
  valorPago: string | null;
  vencimento: string;
  status: string;
}

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const decimal = (value: unknown) => (
  (typeof value === 'string' || typeof value === 'number')
  && /^\d+(\.\d+)?$/.test(String(value)) && Number.isFinite(Number(value))
);
const validDate = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value
);

// Use the statement's canonical statuses and amounts; never infer payment from dates.
export const readOpenCycleCharges = (value: unknown, matriculaId: string): OpenCycleCharge[] => {
  const invalid = () => new Error('Não foi possível conferir todas as parcelas desta matrícula. Atualize e tente novamente.');
  if (!record(value) || value.matriculaId !== matriculaId || !Array.isArray(value.recebiveis)) throw invalid();
  const ids = new Set<string>();
  const charges: OpenCycleCharge[] = [];
  for (const item of value.recebiveis) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || !['PENDENTE', 'VENCIDO', 'PARCIAL', 'PAGO', 'CANCELADO'].includes(String(item.status))) throw invalid();
    ids.add(item.id);
    if (item.status === 'PAGO' || item.status === 'CANCELADO') continue;
    if (typeof item.descricao !== 'string' || !item.descricao.trim()
      || !decimal(item.valor) || !validDate(item.data_vencimento)
      || (item.valor_pago != null && !decimal(item.valor_pago))) throw invalid();
    charges.push({
      id: item.id, descricao: item.descricao, valor: String(item.valor),
      valorPago: item.valor_pago == null ? null : String(item.valor_pago),
      vencimento: item.data_vencimento, status: String(item.status),
    });
  }
  return charges.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id));
};

export interface SecondCycleWarningState {
  charges: OpenCycleCharge[] | null;
  busy: boolean;
  error: string | null;
  changed: boolean;
}

// A confirmation is valid only for the displayed snapshot and this mounted dialog.
export const createSecondCycleWarning = (input: {
  read: () => Promise<OpenCycleCharge[]>;
  onConfirm: () => void | Promise<void>;
  onChange: (state: SecondCycleWarningState) => void;
}) => {
  let active = true;
  let inFlight = false;
  let state: SecondCycleWarningState = { charges: null, busy: false, error: null, changed: false };
  const update = (next: Partial<SecondCycleWarningState>) => {
    state = { ...state, ...next };
    if (active) input.onChange(state);
  };
  const read = async (confirm: boolean) => {
    if (!active || inFlight || (confirm && (!state.charges || state.error))) return;
    inFlight = true;
    update({ busy: true, error: null });
    try {
      const charges = await input.read();
      if (!active) return;
      if (confirm && JSON.stringify(charges) === JSON.stringify(state.charges)) {
        await input.onConfirm();
        // Require a fresh acknowledgement for any retry, including ambiguous results.
        update({ charges: null });
      } else {
        update({ charges, changed: confirm });
      }
    } catch (error) {
      update({ charges: null, error: error instanceof Error ? error.message : 'Falha ao consultar as parcelas. Tente novamente.' });
    } finally {
      inFlight = false;
      update({ busy: false });
    }
  };
  return {
    load: () => read(false),
    confirm: () => read(true),
    dispose: () => { active = false; },
  };
};
