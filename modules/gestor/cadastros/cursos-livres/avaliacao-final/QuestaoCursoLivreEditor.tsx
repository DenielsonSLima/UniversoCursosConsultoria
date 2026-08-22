import React from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { QuestaoCursoLivreGestao } from './avaliacao-curso-livre.types';

interface QuestaoCursoLivreEditorProps {
  index: number;
  question: QuestaoCursoLivreGestao;
  onChange: (question: QuestaoCursoLivreGestao) => void;
  onRemove: () => void;
}

const optionLetter = (index: number) => String.fromCharCode(65 + index);
const MAX_OPTIONS = 8;

const QuestaoCursoLivreEditor: React.FC<QuestaoCursoLivreEditorProps> = ({
  index,
  question,
  onChange,
  onRemove,
}) => {
  const updateOption = (optionIndex: number, value: string) => {
    onChange({
      ...question,
      opcoes: question.opcoes.map((option, currentIndex) => currentIndex === optionIndex ? value : option),
    });
  };

  const removeOption = (optionIndex: number) => {
    if (question.opcoes.length <= 2) return;
    const nextOptions = question.opcoes.filter((_, currentIndex) => currentIndex !== optionIndex);
    const nextCorrect = question.respostaCorreta === optionIndex
      ? 0
      : question.respostaCorreta > optionIndex
        ? question.respostaCorreta - 1
        : question.respostaCorreta;
    onChange({ ...question, opcoes: nextOptions, respostaCorreta: nextCorrect });
  };

  const addOption = () => {
    if (question.opcoes.length >= MAX_OPTIONS) return;
    onChange({ ...question, opcoes: [...question.opcoes, ''] });
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xs font-black text-amber-700">
            {index + 1}
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Questão do banco</p>
            <p className="text-[10px] font-semibold text-slate-400">Marque a alternativa correta somente na área de gestão.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600">
            <input
              type="checkbox"
              checked={question.ativa}
              onChange={(event) => onChange({ ...question, ativa: event.target.checked })}
              className="h-4 w-4 accent-amber-600"
            />
            Ativa
          </label>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover questão ${index + 1}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-500 transition hover:bg-rose-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Enunciado</span>
          <textarea
            value={question.enunciado}
            onChange={(event) => onChange({ ...question, enunciado: event.target.value })}
            rows={3}
            maxLength={2_000}
            placeholder="Digite uma pergunta objetiva e completa."
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-relaxed text-slate-700 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alternativas</legend>
          {question.opcoes.map((option, optionIndex) => {
            const isCorrect = question.respostaCorreta === optionIndex;
            return (
              <div key={`${question.id || index}-option-${optionIndex}`} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-2 transition ${isCorrect ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/50'}`}>
                <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-white text-xs font-black text-slate-500 shadow-sm">
                  <input
                    type="radio"
                    name={`correct-${question.id || index}`}
                    checked={isCorrect}
                    onChange={() => onChange({ ...question, respostaCorreta: optionIndex })}
                    className="sr-only"
                  />
                  {isCorrect ? <CheckCircle2 size={17} className="text-emerald-600" /> : optionLetter(optionIndex)}
                </label>
                <input
                  type="text"
                  value={option}
                  maxLength={600}
                  onChange={(event) => updateOption(optionIndex, event.target.value)}
                  aria-label={`Alternativa ${optionLetter(optionIndex)} da questão ${index + 1}`}
                  placeholder={`Alternativa ${optionLetter(optionIndex)}`}
                  className="min-w-0 bg-transparent px-2 py-2 text-sm font-semibold text-slate-700 outline-none"
                />
                <button
                  type="button"
                  disabled={question.opcoes.length <= 2}
                  onClick={() => removeOption(optionIndex)}
                  aria-label={`Remover alternativa ${optionLetter(optionIndex)}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addOption}
            disabled={question.opcoes.length >= MAX_OPTIONS}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-amber-300 px-3 text-[10px] font-black uppercase tracking-wide text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            <Plus size={14} /> Alternativa
          </button>
        </fieldset>
      </div>
    </article>
  );
};

export default QuestaoCursoLivreEditor;
