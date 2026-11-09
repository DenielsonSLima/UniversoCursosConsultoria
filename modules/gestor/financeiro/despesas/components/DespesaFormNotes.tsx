import React from 'react';
import { Paperclip, Trash2, UploadCloud } from 'lucide-react';

interface Props {
  anexo: File | null;
  anexoErro: string;
  anexoInputRef: React.RefObject<HTMLInputElement | null>;
  handleAnexo: (file?: File) => void;
  clearAnexo: () => void;
  observacao: string;
  setObservacao: (value: string) => void;
}

export default function DespesaFormNotes(props: Props) {
  return <>
    <div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Observação</label>
      <textarea placeholder="Detalhes adicionais (opcional)..." value={props.observacao} onChange={(event) => props.setObservacao(event.target.value)} rows={2}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-rose-500" />
    </div>
    <div className="md:col-span-2">
      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400"><Paperclip size={11} className="mr-1 inline" />Foto ou PDF</label>
      <input ref={props.anexoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => props.handleAnexo(event.target.files?.[0])} className="hidden" />
      {props.anexo ? <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
        <Paperclip size={17} className="text-blue-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-700">{props.anexo.name}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{(props.anexo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB · Armazenamento privado</p></div>
        <button type="button" onClick={props.clearAnexo} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-600" title="Remover anexo"><Trash2 size={16} /></button>
      </div> : <button type="button" onClick={() => props.anexoInputRef.current?.click()}
        className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-left hover:border-blue-300 hover:bg-blue-50">
        <UploadCloud size={17} className="text-slate-400 group-hover:text-blue-600" /><div><p className="text-xs font-black text-slate-600">Anexar comprovante ou documento</p><p className="mt-0.5 text-[10px] font-medium text-slate-400">PDF, JPG, PNG ou WEBP · até 10 MB</p></div>
      </button>}
      {props.anexoErro && <p className="mt-1.5 text-[10px] font-bold text-rose-600">{props.anexoErro}</p>}
    </div>

  </>;
}
