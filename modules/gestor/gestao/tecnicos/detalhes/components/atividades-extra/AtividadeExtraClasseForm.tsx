import React from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  AtividadeExtraClasseFormState,
  DisciplinaOption,
} from './atividadesExtraClasse.types';
import { formatAtividadeHoras } from './atividadesExtraClasse.utils';

interface AtividadeExtraClasseFormProps {
  createPending: boolean;
  disciplinaIdRestrita?: string | null;
  disciplinaSelecionada: DisciplinaOption | null;
  disciplinas: DisciplinaOption[];
  disabled?: boolean;
  form: AtividadeExtraClasseFormState;
  onSubmit: () => void;
  setForm: React.Dispatch<React.SetStateAction<AtividadeExtraClasseFormState>>;
}

const AtividadeExtraClasseForm: React.FC<AtividadeExtraClasseFormProps> = ({
  createPending,
  disciplinaIdRestrita,
  disciplinaSelecionada,
  disciplinas,
  disabled = false,
  form,
  onSubmit,
  setForm,
}) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center gap-2">
      <Plus size={16} className="text-emerald-600" />
      <h4 className="text-xs font-black uppercase tracking-widest text-[#001a33]">Nova atividade</h4>
    </div>

    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {!disciplinaIdRestrita && (
        <select
          value={form.disciplinaId}
          onChange={(event) => setForm((prev) => ({ ...prev, disciplinaId: event.target.value }))}
          disabled={disabled}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-emerald-500"
        >
          <option value="">Selecione a disciplina...</option>
          {disciplinas.map((disciplina) => (
            <option key={disciplina.id} value={disciplina.id}>
              {disciplina.nome}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        value={form.titulo}
        onChange={(event) => setForm((prev) => ({ ...prev, titulo: event.target.value }))}
        disabled={disabled}
        placeholder="Título da atividade"
        className={`${disciplinaIdRestrita ? 'lg:col-span-5' : 'lg:col-span-4'} rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500`}
      />
      <input
        type="text"
        value={form.tema}
        onChange={(event) => setForm((prev) => ({ ...prev, tema: event.target.value }))}
        disabled={disabled}
        placeholder="Tema"
        className="lg:col-span-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500"
      />
      <input
        type="number"
        min="0"
        step="0.5"
        value={form.horas}
        onChange={(event) => setForm((prev) => ({ ...prev, horas: event.target.value }))}
        disabled={disabled}
        placeholder="Hrs"
        className="lg:col-span-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-black text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500"
      />
      <input
        type="date"
        value={form.prazoEntrega}
        onChange={(event) => setForm((prev) => ({ ...prev, prazoEntrega: event.target.value }))}
        disabled={disabled}
        className="lg:col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-emerald-500"
      />
      <input
        type="url"
        value={form.videoUrl}
        onChange={(event) => setForm((prev) => ({ ...prev, videoUrl: event.target.value }))}
        disabled={disabled}
        placeholder="Link do vídeo"
        className="lg:col-span-4 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500"
      />
      <textarea
        value={form.texto}
        onChange={(event) => setForm((prev) => ({ ...prev, texto: event.target.value }))}
        disabled={disabled}
        placeholder="Texto, orientações e enunciado"
        rows={4}
        className="lg:col-span-8 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500"
      />
      <textarea
        value={form.perguntas}
        onChange={(event) => setForm((prev) => ({ ...prev, perguntas: event.target.value }))}
        disabled={disabled}
        placeholder="Perguntas para resposta, uma por linha"
        rows={4}
        className="lg:col-span-4 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500"
      />
    </div>

    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] font-bold text-slate-500">
        {disciplinaSelecionada
          ? `${disciplinaSelecionada.nome} • carga oficial ${formatAtividadeHoras(disciplinaSelecionada.cargaHoraria)}h`
          : 'Selecione uma disciplina para publicar.'}
      </p>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || createPending}
        className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {createPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        Publicar atividade
      </button>
    </div>
  </div>
);

export default AtividadeExtraClasseForm;
