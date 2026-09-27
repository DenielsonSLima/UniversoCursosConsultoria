import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, FileText, Printer, Save } from 'lucide-react';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { ReceiptTemplateEditor } from './ReceiptTemplateEditor';
import type { PdvPrinter, PdvPrinterDraft, PdvPrinterTemplate, PdvPrinterTransport } from './printer.types';

export const defaultPdvPrinterDraft = (): PdvPrinterDraft => ({
  name: '', model: '', transport: 'BROWSER', behavior: 'PERGUNTAR', isDefault: true, active: true,
  template: { widthMm: 80, showLogo: true, footer: '', marginMm: 3, fontSize: 9 },
});
const field = 'mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-[#0b1f4a] outline-none focus:ring-2 focus:ring-blue-600';

export function PrinterEditor({ printer, pending, error, onSave, onClose, onPreview }: {
  printer: PdvPrinter | null;
  pending: boolean;
  error?: string | null;
  onSave: (draft: PdvPrinterDraft, requestId: string) => void;
  onClose: () => void;
  onPreview?: (template: PdvPrinterTemplate) => Promise<void>;
}) {
  const [tab, setTab] = useState<'printer' | 'template'>('printer');
  const [draft, setDraft] = useState<PdvPrinterDraft>(() => printer ? {
    name: printer.name, model: printer.model, transport: printer.transport, behavior: printer.behavior,
    isDefault: printer.isDefault, active: printer.active, template: { ...printer.template },
  } : defaultPdvPrinterDraft());
  const attempt = useRef({ signature: '', id: generateSafeUuid() });
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const automaticReady = printer?.automaticReady === true && draft.transport === printer.transport;
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !draft.name.trim() || (draft.behavior === 'AUTOMATICO' && !automaticReady)) return;
    const normalized = { ...draft, name: draft.name.trim(), model: draft.model.trim() };
    const signature = JSON.stringify(normalized);
    const id = signature === attempt.current.signature ? attempt.current.id : generateSafeUuid();
    attempt.current = { signature, id };
    onSave(normalized, id);
  };
  const preview = async () => {
    if (!onPreview || previewPending) return;
    setPreviewPending(true); setPreviewError(null);
    try { await onPreview(draft.template); }
    catch (failure) { setPreviewError(failure instanceof Error ? failure.message : 'Não foi possível abrir a prévia.'); }
    finally { setPreviewPending(false); }
  };
  return (
    <section aria-labelledby="printer-editor-title" className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Configuração da estação</p><h3 id="printer-editor-title" className="mt-1 text-lg font-bold text-[#0b1f4a]">{printer ? 'Editar impressora' : 'Nova impressora'}</h3></div>
        <button type="button" onClick={onClose} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40"><ArrowLeft size={16} aria-hidden="true" /> Voltar</button>
      </div>
      <div className="flex gap-1 border-b border-slate-100 px-4 pt-2" role="group" aria-label="Seções da impressora">
        {([{ id: 'printer', label: 'Impressora', icon: Printer }, { id: 'template', label: 'Modelo do recibo', icon: FileText }] as const).map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${tab === item.id ? 'border-[#ed1c24] text-[#0b1f4a]' : 'border-transparent text-slate-500'}`}><item.icon size={16} aria-hidden="true" />{item.label}</button>)}
      </div>
      <form onSubmit={save}>
        <fieldset disabled={pending} className="space-y-5 p-5 disabled:opacity-60">
          {tab === 'printer' ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Nome da impressora<input autoFocus required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Caixa da secretaria" className={field} /></label>
              <label className="text-xs font-semibold text-slate-600">Modelo<input maxLength={80} value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} placeholder="Ex.: Epson TM-T20" className={field} /></label>
            </div>
            <label className="block text-xs font-semibold text-slate-600">Conexão
              <select value={draft.transport} onChange={event => setDraft({ ...draft, transport: event.target.value as PdvPrinterTransport, behavior: draft.behavior === 'AUTOMATICO' ? 'PERGUNTAR' : draft.behavior })} className={field}>
                <option value="BROWSER">Diálogo de impressão do navegador</option><option value="QZ_TRAY">Ponte local · QZ Tray</option><option value="EPOS">Epson ePOS · rede</option>
              </select>
            </label>
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">{draft.transport === 'BROWSER' ? 'A impressora é escolhida no diálogo do navegador. Salvar este cadastro não inicia uma impressão.' : 'Este transporte depende de configuração e homologação na estação. O cadastro não confirma conexão com o equipamento.'}</p>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-semibold text-slate-600">Após confirmar o pagamento no PDV</legend>
              {([
                { id: 'PERGUNTAR', title: 'Perguntar', detail: 'Escolher entre imprimir o comprovante ou concluir.' },
                { id: 'AUTOMATICO', title: 'Automático', detail: automaticReady ? 'Enviar uma vez à impressora pronta.' : 'Disponível após homologar o transporte nesta estação.' },
                { id: 'NAO', title: 'Não imprimir', detail: 'Concluir e manter o comprovante disponível.' },
              ] as const).map(option => <label key={option.id} className={`flex min-h-16 items-start gap-3 rounded-xl border p-3 ${draft.behavior === option.id ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200'} ${option.id === 'AUTOMATICO' && !automaticReady ? 'text-slate-400' : 'text-slate-700'}`}>
                <input type="radio" name="pdv-print-behavior" value={option.id} checked={draft.behavior === option.id} disabled={option.id === 'AUTOMATICO' && !automaticReady} onChange={() => setDraft({ ...draft, behavior: option.id })} className="mt-0.5 h-4 w-4 accent-blue-700" />
                <span><span className="block text-sm font-semibold">{option.title}</span><span className="mt-1 block text-xs leading-5">{option.detail}</span></span>
              </label>)}
            </fieldset>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.isDefault} onChange={event => setDraft({ ...draft, isDefault: event.target.checked })} className="h-4 w-4 accent-blue-700" /> Padrão desta estação</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} className="h-4 w-4 accent-blue-700" /> Ativa</label>
            </div>
          </> : <ReceiptTemplateEditor value={draft.template} onChange={template => setDraft({ ...draft, template })} onPreview={onPreview ? () => void preview() : undefined} previewPending={previewPending} />}
          {(error || previewError) && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error || previewError}</p>}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40">Cancelar</button>
          <button type="submit" disabled={pending || !draft.name.trim() || (draft.behavior === 'AUTOMATICO' && !automaticReady)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b1f4a] px-5 py-3 text-sm font-bold text-white hover:bg-[#163768] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-40"><Save size={16} aria-hidden="true" />{pending ? 'Salvando...' : 'Salvar impressora'}</button>
        </div>
      </form>
    </section>
  );
}
