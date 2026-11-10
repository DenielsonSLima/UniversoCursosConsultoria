import React, { useEffect, useState } from 'react';
import { ClipboardCheck, CornerDownRight, Loader2, Save } from 'lucide-react';
import { getSuggestedClassScheduleForHoursChange, TurmaGradeTheme } from './turma-grade-ui';
import InstitutionalSelect from '../../../../../../shared/components/InstitutionalSelect';
import type { TurmaAulaPlanejada } from '../../turma-grade.types';
import { getAulaOrigemOptions } from './turma-grade-aula-origem';

const FIELD_LABEL_CLASS = 'text-[9px] font-black uppercase tracking-wider text-slate-500';

interface TurmaGradePlanejamentoFormProps {
  aulas: TurmaAulaPlanejada[];
  disciplinaId: string;
  theme: TurmaGradeTheme;
  titulo: string;
  data: string;
  horas: string;
  horaInicio: string;
  horaFim: string;
  isExtraClasse: boolean;
  isSaving: boolean;
  onTituloChange: (value: string) => void;
  onDataChange: (value: string) => void;
  onHorasChange: (value: string) => void;
  onHoraInicioChange: (value: string) => void;
  onHoraFimChange: (value: string) => void;
  onExtraClasseChange: (value: boolean) => void;
  onAddPlanejamento: (aulaOrigemId?: string) => void;
}

const TurmaGradePlanejamentoForm: React.FC<TurmaGradePlanejamentoFormProps> = ({
  aulas, disciplinaId, theme, titulo, data, horas, horaInicio, horaFim, isExtraClasse, isSaving,
  onTituloChange, onDataChange, onHorasChange, onHoraInicioChange, onHoraFimChange,
  onExtraClasseChange, onAddPlanejamento,
}) => {
  const [aulaOrigemId, setAulaOrigemId] = useState('');
  const aulaOrigemOptions = getAulaOrigemOptions(aulas);
  const origemValida = aulaOrigemOptions.some((option) => option.value === aulaOrigemId);
  useEffect(() => {
    if (!isExtraClasse) setAulaOrigemId('');
  }, [isExtraClasse]);
  const addPlanejamento = () => onAddPlanejamento(isExtraClasse ? aulaOrigemId : undefined);
  const handleHoursChange = (value: string) => {
    const suggestedSchedule = getSuggestedClassScheduleForHoursChange({
      previousHours: horas,
      nextHours: value,
      horaInicio,
      horaFim,
      isExtraClasse,
    });

    onHorasChange(value);
    if (!suggestedSchedule) return;
    onHoraInicioChange(suggestedSchedule.horaInicio);
    onHoraFimChange(suggestedSchedule.horaFim);
  };

  return (
    <div className="mt-3 pl-4 flex items-end gap-2 flex-wrap">
      <CornerDownRight size={14} className={`${theme.text} mb-3 shrink-0`} />
      <div className="flex shrink-0 flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>Tipo</span>
        <label
          className={`flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${isExtraClasse ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'}`}
          title="Marcar como atividade extra-classe para os alunos responderem no portal"
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={isExtraClasse}
            onChange={(event) => onExtraClasseChange(event.target.checked)}
          />
          <ClipboardCheck size={14} /> {isExtraClasse ? 'Extra-classe ativa' : 'Marcar extra-classe'}
        </label>
      </div>
      {isExtraClasse && (
        <div className="flex min-w-[230px] flex-1 flex-col gap-1">
          <label htmlFor={`turma-aula-origem-${disciplinaId}`} className="text-xs font-medium text-slate-600">Aula de origem</label>
          <InstitutionalSelect
            id={`turma-aula-origem-${disciplinaId}`}
            ariaLabel="Aula de origem da atividade extra-classe"
            value={aulaOrigemId}
            onValueChange={setAulaOrigemId}
            options={aulaOrigemOptions}
            placeholder="Selecione a aula complementada..."
            disabled={isSaving}
            required
          />
          {aulas.length === 0 && <p className="text-xs text-amber-700">Planeje uma aula antes de cadastrar seu complemento.</p>}
        </div>
      )}
      <label htmlFor={`turma-titulo-input-${disciplinaId}`} className="flex min-w-[190px] flex-1 flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>
          {isExtraClasse ? 'Tema da atividade' : 'Conteúdo da aula (opcional)'}
        </span>
        <input
          id={`turma-titulo-input-${disciplinaId}`}
          type="text"
          placeholder={isExtraClasse ? 'Tema da atividade extra-classe...' : 'Conteúdo da aula (opcional)'}
          className={`w-full text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-3 py-2.5 transition-colors font-medium text-slate-700 placeholder-slate-400`}
          value={titulo}
          onChange={(event) => onTituloChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') document.getElementById(`turma-data-input-${disciplinaId}`)?.focus();
          }}
          maxLength={1000}
          title={isExtraClasse ? undefined : 'Opcional: deixe em branco para o professor preencher no diário'}
          aria-label={isExtraClasse ? 'Tema da atividade extra-classe' : 'Conteúdo programático opcional da aula'}
        />
      </label>
      <label htmlFor={`turma-data-input-${disciplinaId}`} className="flex w-36 shrink-0 flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>{isExtraClasse ? 'Prazo de entrega' : 'Data da aula'}</span>
        <input
          id={`turma-data-input-${disciplinaId}`}
          type="date"
          className={`w-full text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-3 py-2.5 transition-colors font-medium text-slate-700`}
          value={data}
          onChange={(event) => onDataChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const nextInputId = isExtraClasse
                ? `turma-horas-input-${disciplinaId}`
                : `turma-hora-inicio-input-${disciplinaId}`;
              document.getElementById(nextInputId)?.focus();
            }
          }}
          aria-label={isExtraClasse ? 'Prazo de entrega' : 'Data da aula'}
        />
      </label>
      {!isExtraClasse && (
        <label htmlFor={`turma-hora-inicio-input-${disciplinaId}`} className="flex w-[88px] shrink-0 flex-col gap-1">
          <span className={FIELD_LABEL_CLASS}>Início</span>
          <input
            id={`turma-hora-inicio-input-${disciplinaId}`}
            type="time"
            className={`w-full text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-2 py-2.5 transition-colors text-center font-semibold text-slate-700`}
            value={horaInicio}
            onChange={(event) => onHoraInicioChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') document.getElementById(`turma-hora-fim-input-${disciplinaId}`)?.focus();
            }}
            title="Opcional: informe início e fim juntos"
            aria-label="Hora de início da aula"
          />
        </label>
      )}
      {!isExtraClasse && (
        <label htmlFor={`turma-hora-fim-input-${disciplinaId}`} className="flex w-[88px] shrink-0 flex-col gap-1">
          <span className={FIELD_LABEL_CLASS}>Fim</span>
          <input
            id={`turma-hora-fim-input-${disciplinaId}`}
            type="time"
            className={`w-full text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-2 py-2.5 transition-colors text-center font-semibold text-slate-700`}
            value={horaFim}
            onChange={(event) => onHoraFimChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') document.getElementById(`turma-horas-input-${disciplinaId}`)?.focus();
            }}
            title="Opcional: informe início e fim juntos"
            aria-label="Hora de fim da aula"
          />
        </label>
      )}
      <label htmlFor={`turma-horas-input-${disciplinaId}`} className="flex w-28 shrink-0 flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>{isExtraClasse ? 'Carga da atividade' : 'Carga horária do dia'}</span>
        <input
          id={`turma-horas-input-${disciplinaId}`}
          type="number"
          placeholder="Horas"
          min="0.1"
          step="0.1"
          inputMode="decimal"
          className={`w-full text-xs bg-white border border-slate-200 rounded-xl outline-none ${theme.focusBorder} px-2 py-2.5 transition-colors text-center font-bold text-slate-700 placeholder-slate-400`}
          value={horas}
          onChange={(event) => handleHoursChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addPlanejamento();
          }}
          aria-label={isExtraClasse ? 'Carga horária da atividade' : 'Carga horária da aula no dia'}
        />
      </label>
      {!isExtraClasse && Number(horas.replace(',', '.')) === 8 && (
        <span className="mb-1.5 shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-blue-700">
          Manhã 4h + tarde 4h
        </span>
      )}
      <button
        type="button"
        onClick={addPlanejamento}
        className={`min-h-[38px] px-4 py-2.5 ${theme.bg} ${theme.text} rounded-xl ${theme.hoverBg} hover:text-white transition-colors border ${theme.border} flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest`}
        disabled={isSaving || !horas.trim() || !data.trim() || (isExtraClasse && (!titulo.trim() || !origemValida))}
        aria-label={isExtraClasse ? 'Criar atividade extra-classe' : 'Planejar horário da aula'}
      >
        {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {isExtraClasse ? 'Criar atividade' : 'Planejar horário'}
      </button>
    </div>
  );
};

export default TurmaGradePlanejamentoForm;
