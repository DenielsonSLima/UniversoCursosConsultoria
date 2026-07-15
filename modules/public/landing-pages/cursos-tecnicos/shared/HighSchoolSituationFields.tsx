import React from 'react';
import { GraduationCap } from 'lucide-react';
import type { TechnicalEnrollmentFormValues } from '../technicalLanding.types';

interface HighSchoolSituationFieldsProps {
  value: TechnicalEnrollmentFormValues;
  onChange: (patch: Partial<TechnicalEnrollmentFormValues>) => void;
  disabled?: boolean;
  acceptsConcurrent: boolean;
  acceptsSubsequent: boolean;
  minimumHighSchoolGrade: 2 | 3;
}

const inputClassName = 'min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

const HighSchoolSituationFields: React.FC<HighSchoolSituationFieldsProps> = ({
  value,
  onChange,
  disabled = false,
  acceptsConcurrent,
  acceptsSubsequent,
  minimumHighSchoolGrade,
}) => {
  const isCompleted = value.highSchoolSituation === 'CONCLUIDO';
  const isStudying = value.highSchoolSituation === 'CURSANDO_2_ANO'
    || value.highSchoolSituation === 'CURSANDO_3_ANO';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[#001a33]">
        <GraduationCap size={18} className="text-blue-600" />
        <h3 className="text-sm font-black uppercase tracking-wider">Situação do Ensino Médio</h3>
      </div>

      <label className="block">
        <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Situação atual</span>
        <select
          required
          disabled={disabled}
          value={value.highSchoolSituation}
          onChange={(event) => onChange({
            highSchoolSituation: event.target.value as TechnicalEnrollmentFormValues['highSchoolSituation'],
            completionYear: '',
            expectedCompletionYear: '',
          })}
          className={inputClassName}
        >
          <option value="">Selecione...</option>
          {acceptsConcurrent && minimumHighSchoolGrade <= 2 ? (
            <option value="CURSANDO_2_ANO">Estou cursando a 2ª série</option>
          ) : null}
          {acceptsConcurrent ? <option value="CURSANDO_3_ANO">Estou cursando a 3ª série</option> : null}
          {acceptsSubsequent ? <option value="CONCLUIDO">Já concluí o Ensino Médio</option> : null}
        </select>
      </label>

      {value.highSchoolSituation ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              {isCompleted ? 'Escola onde concluiu' : 'Escola onde estuda'}
            </span>
            <input
              required
              disabled={disabled}
              value={value.schoolName}
              onChange={(event) => onChange({ schoolName: event.target.value.toLocaleUpperCase('pt-BR') })}
              placeholder="Nome completo da escola"
              className={inputClassName}
            />
          </label>

          {isCompleted ? (
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Ano de conclusão</span>
              <input
                required
                disabled={disabled}
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={value.completionYear}
                onChange={(event) => onChange({ completionYear: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="Ex.: 2024"
                className={inputClassName}
              />
            </label>
          ) : null}

          {isStudying ? (
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Previsão de conclusão</span>
              <input
                required
                disabled={disabled}
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={value.expectedCompletionYear}
                onChange={(event) => onChange({ expectedCompletionYear: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="Ex.: 2027"
                className={inputClassName}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default HighSchoolSituationFields;
