import React, { useId, useState } from 'react';
import { Building2, CalendarDays, Check, ChevronDown, Clock3, Layers3, LockKeyhole, MapPin, Users2 } from 'lucide-react';
import type { StatusTurma, Turno } from '../../../gestao.types';
import type {
  TurmaTecnicoCourseOption,
  TurmaTecnicoFormData,
  TurmaTecnicoIdentity,
  TurmaTecnicoPoloOption,
} from './turma-tecnico-form.types';
import { addMonthsToISODate } from './turma-tecnico-form.utils';

interface TurmaTecnicoDadosStepProps {
  cursos: TurmaTecnicoCourseOption[];
  formData: TurmaTecnicoFormData;
  identity: TurmaTecnicoIdentity;
  initialStatus: StatusTurma;
  polos: TurmaTecnicoPoloOption[];
  polosError: string;
  selectedPolo?: TurmaTecnicoPoloOption;
  selectedPoloId?: string;
  onChange: (patch: Partial<TurmaTecnicoFormData>) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

const TurmaTecnicoDadosStep: React.FC<TurmaTecnicoDadosStepProps> = ({
  cursos,
  formData,
  identity,
  initialStatus,
  polos,
  polosError,
  selectedPolo,
  selectedPoloId,
  onChange,
}) => {
  const [isCourseMenuOpen, setIsCourseMenuOpen] = useState(false);
  const courseLabelId = useId();
  const courseMenuId = useId();
  const selectedCourse = cursos.find((course) => course.id === formData.cursoId);

  const selectCourse = (cursoId: string) => {
    onChange({ cursoId });
    setIsCourseMenuOpen(false);
  };

  const handleCourseMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !isCourseMenuOpen) return;
    event.preventDefault();
    event.stopPropagation();
    setIsCourseMenuOpen(false);
  };

  return (
    <section aria-labelledby="turma-step-title" className="space-y-6">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Etapa 1</p>
      <h4 id="turma-step-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Identificação da turma</h4>
      <p className="mt-1 text-xs font-medium text-slate-500">Defina a base acadêmica e o calendário. Nome e código serão montados automaticamente.</p>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="relative space-y-2" onKeyDown={handleCourseMenuKeyDown}>
        <span id={courseLabelId} className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]">
          <Layers3 size={15} className="text-emerald-600" /> Curso técnico
        </span>
        <button
          type="button"
          aria-labelledby={courseLabelId}
          aria-controls={isCourseMenuOpen ? courseMenuId : undefined}
          aria-expanded={isCourseMenuOpen}
          disabled={cursos.length === 0}
          onClick={() => setIsCourseMenuOpen((isOpen) => !isOpen)}
          className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}
        >
          <span className={selectedCourse ? 'truncate' : 'text-slate-500'}>{selectedCourse?.nome || 'Selecione o curso...'}</span>
          <ChevronDown aria-hidden="true" size={18} className={`shrink-0 text-slate-400 transition-transform ${isCourseMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {isCourseMenuOpen ? (
          <div id={courseMenuId} aria-labelledby={courseLabelId} className="absolute inset-x-0 z-20 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
            <div className="max-h-56 overflow-y-auto">
              {cursos.map((course) => {
                const isSelected = course.id === formData.cursoId;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => selectCourse(course.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${isSelected ? 'bg-emerald-50 text-[#001a33]' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span>{course.nome}</span>
                    {isSelected ? <Check aria-hidden="true" size={16} className="shrink-0 text-emerald-600" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {selectedPoloId ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <MapPin size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700/70">Polo atual</p>
              <p className="mt-0.5 truncate text-sm font-black uppercase text-[#001a33]">
                {selectedPolo ? `${selectedPolo.nomeFantasia || selectedPolo.nome || 'Polo'} (${selectedPolo.cidade})` : 'Carregando polo...'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]">
            <Building2 size={15} className="text-emerald-600" /> Polo / unidade
          </span>
          <select className={inputClass} value={formData.poloId} onChange={(event) => onChange({ poloId: event.target.value })}>
            <option value="">Selecione o polo...</option>
            {polos.map((polo) => (
              <option key={polo.id} value={polo.id}>{polo.nomeFantasia || polo.nome} ({polo.cidade})</option>
            ))}
          </select>
        </label>
      )}
    </div>

    {polosError ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{polosError}</p> : null}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Clock3 size={14} /> Turno</span>
        <select className={inputClass} value={formData.turno} onChange={(event) => onChange({ turno: event.target.value as Turno })}>
          <option value="MATUTINO">Matutino</option>
          <option value="VESPERTINO">Vespertino</option>
          <option value="NOTURNO">Noturno</option>
          <option value="INTEGRAL">Integral</option>
        </select>
      </label>
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarDays size={14} /> Início</span>
        <input
          type="date"
          className={inputClass}
          value={formData.dataInicio}
          onChange={(event) => onChange({
            dataInicio: event.target.value,
            dataPrevisaoTermino: addMonthsToISODate(event.target.value, 24),
            primeiroVencimentoPadrao: event.target.value,
          })}
        />
      </label>
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarDays size={14} /> Fim previsto</span>
        <input type="date" className={inputClass} value={formData.dataPrevisaoTermino} onChange={(event) => onChange({ dataPrevisaoTermino: event.target.value })} />
        <span className="block text-[10px] font-medium leading-relaxed text-slate-400">Sugerido em 24 meses; você pode alterar.</span>
      </label>
      <label className="space-y-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Users2 size={14} /> Vagas totais</span>
        <input type="number" min={1} className={inputClass} value={formData.vagasTotais} onChange={(event) => onChange({ vagasTotais: Number(event.target.value) })} />
      </label>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <LockKeyhole size={13} />
        <span className="text-[10px] font-black uppercase tracking-[0.18em]">Prévia automática</span>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400">Nome da turma</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{identity.nome || 'Preencha curso, polo, início e turno'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-black tracking-wide text-[#001a33]">{identity.codigo || '—'}</span>
          <span className="rounded-lg bg-emerald-100 px-3 py-2 text-[10px] font-black uppercase text-emerald-700">{initialStatus.replaceAll('_', ' ')}</span>
        </div>
      </div>
    </div>
    </section>
  );
};

export default TurmaTecnicoDadosStep;
