import React from 'react';
import { FileText, LockKeyhole } from 'lucide-react';
import type { PdvPrinterTemplate } from './printer.types';

const input = 'mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0b1f4a] focus:outline-none focus:ring-2 focus:ring-blue-600';

export function ReceiptTemplateEditor({ value, onChange, onPreview, previewPending = false }: {
  value: PdvPrinterTemplate;
  onChange: (value: PdvPrinterTemplate) => void;
  onPreview?: () => void;
  previewPending?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-950">
        <p className="flex items-center gap-2 font-semibold"><LockKeyhole size={16} aria-hidden="true" /> Dados do pagamento protegidos</p>
        <p className="mt-2 text-xs leading-5 text-blue-900/80">Emitente, pagador, número, valor recebido e data vêm do pagamento confirmado. Este modelo altera somente a apresentação.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Largura do papel
          <select value={value.widthMm} onChange={event => onChange({ ...value, widthMm: Number(event.target.value) as 58 | 80 })} className={input}>
            <option value={58}>58 mm</option><option value={80}>80 mm</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Margem (mm)
          <input type="number" min={2} max={6} step={1} required value={value.marginMm} onChange={event => onChange({ ...value, marginMm: Number(event.target.value) })} className={input} />
        </label>
        <label className="text-xs font-semibold text-slate-600">Tamanho da fonte
          <input type="number" min={8} max={12} step={1} required value={value.fontSize} onChange={event => onChange({ ...value, fontSize: Number(event.target.value) })} className={input} />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
        <input type="checkbox" checked={value.showLogo} onChange={event => onChange({ ...value, showLogo: event.target.checked })} className="h-4 w-4 accent-blue-700" /> Exibir logo Universo
      </label>
      <label className="block text-xs font-semibold text-slate-600">Mensagem do rodapé
        <textarea value={value.footer} maxLength={240} rows={3} onChange={event => onChange({ ...value, footer: event.target.value })} placeholder="Ex.: Obrigado pela preferência." className={`${input} resize-y py-3 font-normal`} />
        <span className="mt-1 block text-right text-[11px] font-normal text-slate-500">{value.footer.length}/240</span>
      </label>
      {onPreview && <button type="button" onClick={onPreview} disabled={previewPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#0b1f4a] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40">
        <FileText size={17} aria-hidden="true" /> {previewPending ? 'Preparando prévia...' : 'Prévia do recibo'}
      </button>}
      <p className="text-xs leading-5 text-slate-500">Cada envio preserva a versão utilizada. Alterações valem para os próximos envios.</p>
    </div>
  );
}
