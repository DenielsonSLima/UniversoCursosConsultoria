import React from 'react';
import { GraduationCap, Percent } from 'lucide-react';

interface TechnicalAcademicSettingsProps {
  frequenciaMinimaPercent: number;
  mediaMinima: number;
  onChange: (patch: { frequenciaMinimaPercent?: number; mediaMinima?: number }) => void;
  disabled?: boolean;
}

const TechnicalAcademicSettings: React.FC<TechnicalAcademicSettingsProps> = ({
  frequenciaMinimaPercent,
  mediaMinima,
  onChange,
  disabled = false,
}) => (
  <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
        Regras acadêmicas da turma
      </p>
      <p className="mt-1 text-xs text-indigo-900/70">
        A frequência é calculada pelas horas de cada aula. As regras ficam bloqueadas após o primeiro lançamento.
      </p>
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="space-y-2 text-xs font-bold uppercase text-indigo-700">
        <span className="flex items-center gap-2"><Percent size={14} /> Frequência mínima</span>
        <div className="relative">
          <input
            type="number"
            min={75}
            max={100}
            step={0.01}
            value={frequenciaMinimaPercent}
            disabled={disabled}
            onChange={(event) => onChange({ frequenciaMinimaPercent: Number(event.target.value) })}
            className="w-full rounded-xl border border-indigo-100 bg-white p-3 pr-10 text-slate-700 outline-none focus:border-indigo-500 disabled:bg-slate-100"
          />
          <span className="absolute right-4 top-3 text-slate-400">%</span>
        </div>
      </label>
      <label className="space-y-2 text-xs font-bold uppercase text-indigo-700">
        <span className="flex items-center gap-2"><GraduationCap size={14} /> Média mínima</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={mediaMinima}
          disabled={disabled}
          onChange={(event) => onChange({ mediaMinima: Number(event.target.value) })}
          className="w-full rounded-xl border border-indigo-100 bg-white p-3 text-slate-700 outline-none focus:border-indigo-500 disabled:bg-slate-100"
        />
      </label>
    </div>
  </section>
);

export default TechnicalAcademicSettings;
