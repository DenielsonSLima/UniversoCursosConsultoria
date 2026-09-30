import React from 'react';
import { AlertCircle, GraduationCap } from 'lucide-react';
import {
  PRESET_TITULACOES,
  REGISTROS,
  type ProfessorFormData,
} from './professor-form.model';

interface ProfessorEducationStepProps {
  formData: ProfessorFormData;
  inputCls: string;
  labelCls: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}

const ProfessorEducationStep: React.FC<ProfessorEducationStepProps> = ({
  formData,
  inputCls,
  labelCls,
  onChange,
}) => (
  <div className="space-y-5">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-indigo-600">
      <GraduationCap size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Formação acadêmica e registro profissional</h4>
    </div>

    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div>
        <label className={labelCls}>Titulação</label>
        <select name="titulacao" value={formData.titulacao} onChange={onChange} className={inputCls}>
          <option value="">Selecione a titulação...</option>
          {PRESET_TITULACOES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Área de formação</label>
        <input type="text" name="areaFormacao" value={formData.areaFormacao} onChange={onChange} className={inputCls} placeholder="Ex: Enfermagem, Administração..." />
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Instituição de formação</label>
        <input type="text" name="instituicaoFormacao" value={formData.instituicaoFormacao} onChange={onChange} className={inputCls} placeholder="Nome da universidade / faculdade" />
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Especialidade / disciplinas que leciona</label>
        <input type="text" name="especialidade" value={formData.especialidade} onChange={onChange} className={inputCls} placeholder="Ex: Anatomia, Microbiologia, Gestão..." />
      </div>
      <div>
        <label className={labelCls}>Conselho / registro profissional</label>
        <select name="registroProfissional" value={formData.registroProfissional} onChange={onChange} className={inputCls}>
          <option value="">Selecione...</option>
          {REGISTROS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Número do registro</label>
        <input type="text" name="numeroRegistro" value={formData.numeroRegistro} onChange={onChange} className={inputCls} placeholder="Ex: COREN-SE 123456" />
      </div>
    </div>

    <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-indigo-400" />
      <p className="text-xs font-medium text-indigo-700">
        Para aulas práticas na área da saúde, confira o registro profissional ativo antes da alocação do docente.
      </p>
    </div>
  </div>
);

export default ProfessorEducationStep;
