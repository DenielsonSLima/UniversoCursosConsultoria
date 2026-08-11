import React from 'react';
import { Building2, CalendarDays, Clock3, Layers3, LockKeyhole, MapPin, Users2 } from 'lucide-react';
import type { StatusTurma, Turno } from '../../../../gestao.types';
import type {
  TurmaPlanoUnicoCourseOption,
  TurmaPlanoUnicoFormConfig,
  TurmaPlanoUnicoFormData,
  TurmaPlanoUnicoIdentity,
  TurmaPlanoUnicoPoloOption,
} from '../turma-plano-unico-form.types';
import { getPoloLabel } from '../turma-plano-unico-form.utils';

interface TurmaPlanoUnicoDadosStepProps {
  cursos: TurmaPlanoUnicoCourseOption[];
  config: TurmaPlanoUnicoFormConfig;
  formData: TurmaPlanoUnicoFormData;
  identity: TurmaPlanoUnicoIdentity;
  initialStatus: StatusTurma;
  polos: TurmaPlanoUnicoPoloOption[];
  polosError: string;
  selectedPolo?: TurmaPlanoUnicoPoloOption;
  selectedPoloId?: string;
  onChange: (patch: Partial<TurmaPlanoUnicoFormData>) => void;
}

const TurmaPlanoUnicoDadosStep: React.FC<TurmaPlanoUnicoDadosStepProps> = ({
  cursos,
  config,
  formData,
  identity,
  initialStatus,
  polos,
  polosError,
  selectedPolo,
  selectedPoloId,
  onChange,
}) => {
  const inputClass = `w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-700 outline-none transition ${config.theme.accentFocus}`;

  return (
    <section aria-labelledby="turma-plano-unico-dados-title" className="space-y-6">
      <div>
        <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${config.theme.accentText}`}>Etapa 1</p>
        <h4 id="turma-plano-unico-dados-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Identificação da turma</h4>
        <p className="mt-1 text-xs font-medium text-slate-500">Defina a base acadêmica e o calendário. Nome e código serão montados automaticamente.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]">
            <Layers3 size={15} className={config.theme.accentText} /> {config.courseLabel}
          </span>
          <select className={inputClass} value={formData.cursoId} onChange={(event) => onChange({ cursoId: event.target.value })}>
            <option value="">Selecione o curso...</option>
            {cursos.map((course) => <option key={course.id} value={course.id}>{course.nome}</option>)}
          </select>
        </label>

        {selectedPoloId ? (
          <div className={`rounded-2xl border ${config.theme.accentSoftBorder} ${config.theme.accentSoftBg} px-4 py-3.5`}>
            <div className="flex items-start gap-3">
              <MapPin size={17} className={`mt-0.5 shrink-0 ${config.theme.accentText}`} />
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${config.theme.accentSoftText}`}>Polo atual</p>
                <p className="mt-0.5 truncate text-sm font-black uppercase text-[#001a33]">
                  {selectedPolo ? `${getPoloLabel(selectedPolo)} (${selectedPolo.cidade})` : 'Carregando polo...'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]">
              <Building2 size={15} className={config.theme.accentText} /> Polo / unidade
            </span>
            <select className={inputClass} value={formData.poloId} onChange={(event) => onChange({ poloId: event.target.value })}>
              <option value="">Selecione o polo...</option>
              {polos.map((polo) => (
                <option key={polo.id} value={polo.id}>{getPoloLabel(polo)} ({polo.cidade})</option>
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
              primeiroVencimento: formData.primeiroVencimento || event.target.value,
            })}
          />
        </label>
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><CalendarDays size={14} /> Fim previsto</span>
          <input type="date" className={inputClass} value={formData.dataPrevisaoTermino} onChange={(event) => onChange({ dataPrevisaoTermino: event.target.value })} />
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
            <span className={`rounded-lg ${config.theme.accentSoftBg} px-3 py-2 text-[10px] font-black uppercase ${config.theme.accentSoftText}`}>{initialStatus.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TurmaPlanoUnicoDadosStep;
