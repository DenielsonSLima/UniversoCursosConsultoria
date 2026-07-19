import React from 'react';
import { Settings2 } from 'lucide-react';
import { DiarioTemplate } from '../diarios.service';

interface DiarioTextSettingsProps {
  form: DiarioTemplate;
  setForm: React.Dispatch<React.SetStateAction<DiarioTemplate>>;
}

const DiarioTextSettings: React.FC<DiarioTextSettingsProps> = ({ form, setForm }) => (
  <section className="space-y-6 animate-fadeIn">
    <div className="mb-4 flex items-center gap-2">
      <Settings2 size={20} className="text-blue-600" />
      <h5 className="text-lg font-black text-[#001a33]">Textos institucionais</h5>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 md:p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Cabeçalho das páginas</span>
          <textarea
            value={form.cabecalho}
            onChange={(event) => setForm({ ...form, cabecalho: event.target.value })}
            className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Rodapé</span>
          <textarea
            value={form.rodape}
            onChange={(event) => setForm({ ...form, rodape: event.target.value })}
            className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>
      <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 border-t border-slate-200 pt-5">
        <span>
          <span className="block text-sm font-bold text-slate-700">Incluir instruções normativas</span>
          <span className="text-xs text-slate-500">Acrescenta orientações de preenchimento antes da contracapa.</span>
        </span>
        <input
          type="checkbox"
          checked={form.imprimirInstrucoes}
          onChange={(event) => setForm({ ...form, imprimirInstrucoes: event.target.checked })}
          className="h-5 w-5 accent-blue-600"
        />
      </label>
    </div>
  </section>
);

export default DiarioTextSettings;
