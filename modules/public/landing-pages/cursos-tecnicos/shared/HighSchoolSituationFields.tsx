import React from 'react';
import { Building2, Calendar, GraduationCap } from 'lucide-react';
import type { TechnicalEnrollmentFormValues } from '../technicalLanding.types';

interface HighSchoolSituationFieldsProps {
  value: TechnicalEnrollmentFormValues;
  onChange: (patch: Partial<TechnicalEnrollmentFormValues>) => void;
  disabled?: boolean;
  acceptsConcurrent: boolean;
  acceptsSubsequent: boolean;
  minimumHighSchoolGrade: 2 | 3;
}

const inputClassName =
  'min-h-12 w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 text-xs font-bold text-slate-800 outline-none transition-all duration-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

const HighSchoolSituationFields: React.FC<HighSchoolSituationFieldsProps> = ({
  value,
  onChange,
  disabled = false,
  acceptsConcurrent,
  acceptsSubsequent,
  minimumHighSchoolGrade,
}) => {
  const isCompleted = value.highSchoolSituation === 'CONCLUIDO';
  const isStudying =
    value.highSchoolSituation === 'CURSANDO_2_ANO' || value.highSchoolSituation === 'CURSANDO_3_ANO';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 text-[#001a33]">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100/80 text-blue-600">
          <GraduationCap size={18} />
        </div>
        <h3 className="text-xs font-black uppercase tracking-wider">Situação do Ensino Médio</h3>
      </div>

      <label className="block">
        <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
          Situação Escolar Atual
        </span>
        <select
          required
          disabled={disabled}
          value={value.highSchoolSituation}
          onChange={(event) =>
            onChange({
              highSchoolSituation: event.target.value as TechnicalEnrollmentFormValues['highSchoolSituation'],
              completionYear: '',
              expectedCompletionYear: '',
            })
          }
          className={inputClassName}
        >
          <option value="">Selecione sua situação escolar...</option>
          {acceptsConcurrent && minimumHighSchoolGrade <= 2 ? (
            <option value="CURSANDO_2_ANO">Estou cursando a 2ª série do Ensino Médio</option>
          ) : null}
          {acceptsConcurrent ? (
            <option value="CURSANDO_3_ANO">Estou cursando a 3ª série do Ensino Médio</option>
          ) : null}
          {acceptsSubsequent ? (
            <option value="CONCLUIDO">Já concluí o Ensino Médio integralmente</option>
          ) : null}
        </select>
      </label>

      {value.highSchoolSituation ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <Building2 size={12} className="text-blue-600" />
              {isCompleted ? 'Escola onde concluiu' : 'Escola onde cursa atualmente'}
            </span>
            <input
              required
              disabled={disabled}
              value={value.schoolName}
              onChange={(event) => onChange({ schoolName: event.target.value.toLocaleUpperCase('pt-BR') })}
              placeholder="Nome oficial e completo da instituição escolar"
              className={inputClassName}
            />
          </label>

          {isCompleted ? (
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Calendar size={12} className="text-blue-600" />
                Ano de conclusão
              </span>
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
              <span className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Calendar size={12} className="text-blue-600" />
                Previsão de conclusão
              </span>
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
