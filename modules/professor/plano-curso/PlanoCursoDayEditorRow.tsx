import React from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import type { PlanoCursoAula } from '../../shared/plano-curso/plano-curso.types';
import type { PlanoCursoDiaEditor } from './plano-curso-day-editor';
import PlanoCursoTextArea from './PlanoCursoTextArea';

interface Props {
  canEdit: boolean;
  content: string;
  day: PlanoCursoDiaEditor;
  aulas: PlanoCursoAula[];
  dayNumber: number;
  isLegacyMerged: boolean;
  isMutating: boolean;
  onContentChange: (dataAula: string, value: string) => void;
}

const PlanoCursoDayEditorRow: React.FC<Props> = ({
  canEdit,
  content,
  day,
  aulas,
  dayNumber,
  isLegacyMerged,
  isMutating,
  onContentChange,
}) => {
  const inputId = `conteudo-${day.dataAula}`;
  return (
    <article className='min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5'>
      <header className='mb-4 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <p className='text-xs font-medium text-slate-500'>Dia letivo {dayNumber}</p>
          <h4 className='mt-1 flex items-center gap-2 text-base font-semibold text-[#001a33]'>
            <CalendarDays size={17} className='text-blue-600' />
            {day.dataExibicao}
          </h4>
        </div>
        {day.aulaIds.length > 1 && (
          <p className='rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700'>
            {day.aulaIds.length} aulas nesta data
          </p>
        )}
      </header>
      <div className='mb-4 space-y-2 border-l-2 border-slate-200 pl-3'>
        {aulas.map((aula) => (
          <div key={aula.aulaId}>
            <p className='break-words text-[13px] font-medium text-slate-700'>{aula.titulo}</p>
            <p className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500'>
              <Clock3 size={13} aria-hidden='true' />
              {aula.horaInicio && aula.horaFim && <span>{aula.horaInicio} às {aula.horaFim}</span>}
              <span>{aula.cargaHoraria.toLocaleString('pt-BR')} h</span>
            </p>
          </div>
        ))}
      </div>
      <label htmlFor={inputId} className='mb-2 block text-[13px] font-medium text-[#001a33]'>
        Conteúdo programático do dia
      </label>
      {canEdit
        ? (
          <PlanoCursoTextArea
            id={inputId}
            value={content}
            onChange={(event) => onContentChange(day.dataAula, event.target.value)}
            disabled={isMutating}
            maxLength={8_000}
            aria-describedby={`${inputId}-help ${inputId}-count`}
            placeholder='Prepare o conteúdo que será trabalhado nesta data'
          />
        )
        : (
          <div className='whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[13px] leading-6 text-slate-700'>
            {content || <span className='text-slate-500'>Não informado.</span>}
          </div>
        )}
      {canEdit && (
        <div className='mt-2 flex flex-wrap items-start justify-between gap-2 text-xs leading-5'>
          <p
            id={`${inputId}-help`}
            className={isLegacyMerged ? 'text-amber-800' : 'text-slate-500'}
          >
            {isLegacyMerged
              ? 'Textos anteriores foram reunidos para leitura. Ao editar, o novo texto será aplicado ao dia inteiro.'
              : 'Este conteúdo vale para todas as aulas previstas nesta data.'}
          </p>
          <span id={`${inputId}-count`} className='shrink-0 text-slate-500'>
            {content.length.toLocaleString('pt-BR')}/8.000 caracteres
          </span>
        </div>
      )}
    </article>
  );
};

export default React.memo(PlanoCursoDayEditorRow);
