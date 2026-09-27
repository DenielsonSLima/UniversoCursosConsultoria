import { supabase } from '../../../../lib/supabase';
import type { PdvPrinter, PdvPrinterSettings, PdvWorkstation, SavePdvPrinterInput } from './printer.types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stationKey = (poloId: string) => `universo:pdv-workstation:${poloId}`;

/** This persisted ID is a locator only; every RPC authorizes the actual actor and polo. */
export function readPdvWorkstationId(poloId: string): string | null {
  try {
    const value = localStorage.getItem(stationKey(poloId));
    return value && uuid.test(value) ? value : null;
  } catch { return null; }
}
export function rememberPdvWorkstationId(poloId: string, workstationId: string | null) {
  try {
    if (workstationId && uuid.test(workstationId)) localStorage.setItem(stationKey(poloId), workstationId);
    else localStorage.removeItem(stationKey(poloId));
  } catch { /* Settings remain usable when browser persistence is unavailable. */ }
}

async function call<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (controller.signal.aborted) throw new Error('A consulta demorou mais que o esperado. Tente novamente.');
    if (error) throw new Error(error.message || 'Não foi possível consultar a configuração de impressoras.');
    if (!data || typeof data !== 'object') throw new Error('A configuração de impressoras não está disponível.');
    return data as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export const pdvPrinterService = {
  async getSettings(poloId: string, workstationId: string | null, signal?: AbortSignal) {
    const data = await call<PdvPrinterSettings>('get_pdv_printer_settings', {
      p_polo_id: poloId, p_workstation_id: workstationId,
    }, signal);
    if (data.version !== 1 || data.context !== 'OUTROS_CREDITOS'
      || !Array.isArray(data.printers) || !Array.isArray(data.workstations)) {
      throw new Error('A versão da configuração de impressoras não é compatível.');
    }
    return data;
  },
  registerWorkstation(poloId: string, name: string, requestId: string) {
    return call<PdvWorkstation>('register_pdv_workstation', {
      p_polo_id: poloId, p_name: name.trim(), p_request_id: requestId,
    });
  },
  savePrinter(input: SavePdvPrinterInput, requestId: string) {
    return call<PdvPrinter>('save_pdv_printer', { p_input: input, p_request_id: requestId });
  },
};
