import { supabase } from '../../../../lib/supabase';
import { readPdvWorkstationId, rememberPdvWorkstationId } from '../../configuracoes/impressoras/printer.service';
import { printPdfBlob } from '../../secretaria/shared/pdf-blob-print';
import type { PdvPrintJob, PdvReceipt, PreparedPdvReceipt } from './pdv-receipt.types';

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw Object.assign(new Error(error.message || 'Não foi possível preparar o comprovante.'), { code: error.code });
    if (!data || typeof data !== 'object') throw new Error('O comprovante não está disponível.');
    return data as T;
  } finally { clearTimeout(timeout); }
}

export async function preparePdvReceipt(receivableId: string): Promise<PreparedPdvReceipt> {
  let receipt = await call<PdvReceipt>('prepare_pdv_receipt', {
    p_receivable_id: receivableId, p_printer_id: null, p_workstation_id: null,
  });
  let workstationId = readPdvWorkstationId(receipt.poloId);
  if (workstationId) {
    try {
      receipt = await call<PdvReceipt>('prepare_pdv_receipt', {
        p_receivable_id: receivableId, p_printer_id: null, p_workstation_id: workstationId,
      });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== '42501') throw error;
      // A browser may retain a station belonging to a previous signed-in actor.
      // Reauthorize the default receipt before clearing that stale locator.
      receipt = await call<PdvReceipt>('prepare_pdv_receipt', {
        p_receivable_id: receivableId, p_printer_id: null, p_workstation_id: null,
      });
      rememberPdvWorkstationId(receipt.poloId, null);
      workstationId = null;
    }
  }
  const { createPdvReceiptPdf } = await import('./pdv-receipt.pdf');
  return { receipt, workstationId, ...await createPdvReceiptPdf(receipt) };
}

export type PdvPrintOutcome = 'DIALOG_OPENED' | 'ACCEPTED' | 'UNKNOWN';
interface PrintDependencies {
  rpc: typeof call;
  print: typeof printPdfBlob;
  requestId: () => string;
}
const dependencies: PrintDependencies = { rpc: call, print: printPdfBlob, requestId: () => crypto.randomUUID() };

// Select fields in a fixed order: JSON key order and transient print state must
// not affect equality. Every displayed identity/amount/date remains canonical;
// this comparison never recalculates money or changes the prepared PDF Blob.
const printableReceiptContract = (receipt: PdvReceipt) => ({
  version: receipt.version, id: receipt.id, number: receipt.number,
  receivableId: receipt.receivableId, poloId: receipt.poloId, issuedAt: receipt.issuedAt,
  totalCents: receipt.totalCents, totalDisplay: receipt.totalDisplay,
  paidAt: receipt.paidAt, paidAtDisplay: receipt.paidAtDisplay,
  paymentMethod: receipt.paymentMethod, description: receipt.description,
  payer: {
    name: receipt.payer.name, documentMasked: receipt.payer.documentMasked ?? null,
    documentLabel: receipt.payer.documentLabel ?? null,
    enrollmentNumber: receipt.payer.enrollmentNumber ?? null,
  },
  issuer: {
    id: receipt.issuer.id, name: receipt.issuer.name, cnpj: receipt.issuer.cnpj,
    address: receipt.issuer.address, number: receipt.issuer.number,
    complement: receipt.issuer.complement, neighborhood: receipt.issuer.neighborhood,
    city: receipt.issuer.city, state: receipt.issuer.state, postalCode: receipt.issuer.postalCode,
    phone: receipt.issuer.phone, email: receipt.issuer.email,
    isHeadquarters: receipt.issuer.isHeadquarters, logoUrl: receipt.issuer.logoUrl,
  },
  template: {
    version: receipt.template.version, widthMm: receipt.template.widthMm,
    marginMm: receipt.template.marginMm, fontSize: receipt.template.fontSize,
    showLogo: receipt.template.showLogo, footer: receipt.template.footer,
    source: receipt.template.source,
  },
});

/** An uncertain submission never creates another job or retries the print silently. */
export async function printPreparedPdvReceipt(
  prepared: PreparedPdvReceipt,
  options: { automatic?: boolean; reprintReason?: string } = {},
  io: PrintDependencies = dependencies,
): Promise<PdvPrintOutcome> {
  if (options.automatic || prepared.receipt.transport !== 'BROWSER') {
    throw new Error('A impressão automática depende de configurar e testar a impressora. Use a impressão pelo navegador.');
  }
  const reprint = options.reprintReason?.trim();
  if (reprint && (reprint.length < 5 || reprint.length > 240)) throw new Error('Informe o motivo da reimpressão (5 a 240 caracteres).');
  const job = await io.rpc<PdvPrintJob>('prepare_pdv_print_job', {
    p_receipt_id: prepared.receipt.id, p_workstation_id: prepared.workstationId,
    p_printer_id: prepared.receipt.printerId, p_purpose: reprint ? 'REPRINT' : 'MANUAL',
    p_reason: reprint || null, p_request_id: io.requestId(),
  });
  if (!job.canDispatch) return 'UNKNOWN';
  if (job.transport !== 'BROWSER'
    || JSON.stringify(printableReceiptContract(job.receipt)) !== JSON.stringify(printableReceiptContract(prepared.receipt))) {
    throw new Error('Os dados ou a configuração do comprovante mudaram. Prepare o comprovante novamente antes de imprimir.');
  }
  const claimed = await io.rpc<{ id: string; token?: string; status: string; canDispatch: boolean }>('claim_pdv_print_job', {
    p_job_id: job.id, p_request_id: io.requestId(),
  });
  if (claimed.status !== 'CLAIMED' || !claimed.token || claimed.canDispatch !== true) return 'UNKNOWN';
  let outcome: 'DIALOG_CLOSED' | 'UNKNOWN';
  try {
    await io.print(prepared.blob, { title: `Comprovante ${prepared.receipt.number}`, requireAfterPrint: true });
    outcome = 'DIALOG_CLOSED';
  } catch {
    // Even a lost browser response cannot prove that paper was not printed.
    outcome = 'UNKNOWN';
  }
  try {
    const result = await io.rpc<{ status: string }>('complete_pdv_print_job', {
      p_job_id: job.id, p_token: claimed.token, p_result: outcome,
    });
    if (result.status === 'UNKNOWN') return 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
  return outcome === 'DIALOG_CLOSED' ? 'DIALOG_OPENED' : 'UNKNOWN';
}

export function openPreparedPdvReceipt(prepared: PreparedPdvReceipt) {
  const url = URL.createObjectURL(prepared.blob);
  const opened = window.open(url, '_blank');
  if (!opened) { URL.revokeObjectURL(url); throw new Error('Permita abrir o comprovante neste navegador.'); }
  opened.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
}
