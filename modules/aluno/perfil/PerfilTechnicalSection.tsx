import React from 'react';
import { GraduationCap, IdCard } from 'lucide-react';
import { TECHNICAL_DOCUMENT_TYPE_OPTIONS } from '../../shared/utils/technicalEnrollmentRequirements';
import { type PerfilDadosForm } from './usePerfilDadosForm';

type Props = {
  editing: boolean;
  form: PerfilDadosForm;
};

const selectClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white';
const inputClassName = selectClassName;
const readOnlyClassName = 'rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850';

const PerfilTechnicalSection: React.FC<Props> = ({ editing, form }) => (
  <div className="border-t border-slate-100 pt-4">
    <h4 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#001a33]">
      <IdCard size={14} className="text-blue-500" /> Dados complementares para cursos técnicos
    </h4>
    <p className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[10px] font-semibold leading-relaxed text-blue-800">
      Para curso técnico com inscrição online, estes dados são obrigatórios antes do pagamento: CIN/CNH/RG, número do documento, nome da mãe e responsável financeiro.
    </p>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tipo de documento</label>
        {editing ? (
          <select value={form.tipoDocumento} onChange={(event) => form.setTipoDocumento(event.target.value)} className={selectClassName}>
            {TECHNICAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <p className={readOnlyClassName}>{form.tipoDocumento || '—'}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Número do documento</label>
        {editing ? (
          <input value={form.rg} placeholder="RG, CIN ou CNH" onChange={(event) => form.setRg(event.target.value)} className={inputClassName} />
        ) : (
          <p className={readOnlyClassName}>{form.rg || '—'}</p>
        )}
      </div>

      {form.supplementalFields.map((field) => (
        <div key={field.label} className="space-y-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{field.label}</label>
          {editing ? (
            <input value={field.value} placeholder={field.placeholder} onChange={(event) => field.setter(event.target.value)} className={inputClassName} />
          ) : (
            <p className={readOnlyClassName}>{field.value || '—'}</p>
          )}
        </div>
      ))}

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Sexo</label>
        {editing ? (
          <select value={form.sexo} onChange={(event) => form.setSexo(event.target.value)} className={selectClassName}>
            <option value="">Selecione...</option>
            <option value="MASCULINO">MASCULINO</option>
            <option value="FEMININO">FEMININO</option>
            <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
            <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
          </select>
        ) : (
          <p className={readOnlyClassName}>{form.sexo || '—'}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Estado civil</label>
        {editing ? (
          <select value={form.estadoCivil} onChange={(event) => form.setEstadoCivil(event.target.value)} className={selectClassName}>
            <option value="">Selecione...</option>
            {['SOLTEIRO(A)', 'CASADO(A)', 'DIVORCIADO(A)', 'VIÚVO(A)', 'UNIÃO ESTÁVEL', 'SEPARADO(A)'].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        ) : (
          <p className={readOnlyClassName}>{form.estadoCivil || '—'}</p>
        )}
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          <GraduationCap size={12} /> Escolaridade anterior
        </label>
        {editing ? (
          <select value={form.escolaridadeAnterior} onChange={(event) => form.setEscolaridadeAnterior(event.target.value)} className={selectClassName}>
            <option value="">Selecione...</option>
            <option value="ENSINO MÉDIO COMPLETO">ENSINO MÉDIO COMPLETO</option>
            <option value="ENSINO MÉDIO INCOMPLETO">ENSINO MÉDIO INCOMPLETO</option>
            <option value="ENSINO SUPERIOR COMPLETO">ENSINO SUPERIOR COMPLETO</option>
            <option value="ENSINO SUPERIOR INCOMPLETO">ENSINO SUPERIOR INCOMPLETO</option>
            <option value="PÓS-GRADUAÇÃO">PÓS-GRADUAÇÃO</option>
          </select>
        ) : (
          <p className={readOnlyClassName}>{form.escolaridadeAnterior || '—'}</p>
        )}
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Parentesco do responsável</label>
        {editing ? (
          <select value={form.responsavelParentesco} onChange={(event) => form.setResponsavelParentesco(event.target.value)} className={selectClassName}>
            <option value="">Selecione...</option>
            {['MÃE', 'PAI', 'AVÓ/AVÔ', 'TIO(A)', 'IRMÃO/IRMÃ', 'TUTOR(A) LEGAL', 'CÔNJUGE', 'OUTRO'].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        ) : (
          <p className={readOnlyClassName}>{form.responsavelParentesco || '—'}</p>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
        <input type="checkbox" disabled={!editing} checked={form.responsavelFinanceiro} onChange={(event) => form.setResponsavelFinanceiro(event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
        <span className="text-xs font-bold text-slate-650">
          Declaro o responsável financeiro da matrícula. Se nenhum terceiro for informado, o próprio aluno assume as cobranças.
        </span>
      </label>
    </div>
  </div>
);

export default PerfilTechnicalSection;
