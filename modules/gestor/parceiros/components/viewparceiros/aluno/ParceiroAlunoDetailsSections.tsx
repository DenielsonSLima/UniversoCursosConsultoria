import type React from 'react';

import { formatCpf } from '../../../../../../lib/documentFormatters';
import { TECHNICAL_DOCUMENT_TYPE_OPTIONS } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import ParceiroAlunoDisplayField from './ParceiroAlunoDisplayField';
import { formatDocumentTypeLabel, formatPhoneDisplay } from './parceiro-aluno-dados.utils';

interface DetailsSectionsProps {
  formData: any;
  isEditing: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

const ParceiroAlunoFamilySection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => (
  <div className="space-y-6 pt-6">
    <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Filiação</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome da Mãe</label>
            <input type="text" name="nomeMae" value={formData.nomeMae || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome do Pai</label>
            <input type="text" name="nomePai" value={formData.nomePai || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Nome da Mãe" value={formData.nomeMae} />
          <ParceiroAlunoDisplayField label="Nome do Pai" value={formData.nomePai} />
        </>
      )}
    </div>
  </div>
);

const ParceiroAlunoGuardianSection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => (
  <div className="space-y-6 pt-6">
    <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Responsável legal e financeiro</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEditing ? (
        <>
          <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 cursor-pointer">
            <input type="checkbox" name="responsavelFinanceiro" checked={!!formData.responsavelFinanceiro} onChange={onChange} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>
              <strong className="block text-xs uppercase tracking-wider text-blue-800">Responsável pelos pagamentos</strong>
              <span className="mt-1 block text-xs text-blue-700">Será considerado como pagador na declaração de IRPF.</span>
            </span>
          </label>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome</label>
            <input name="responsavelNome" value={formData.responsavelNome || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
            <input name="responsavelCpf" value={formData.responsavelCpf || ''} onChange={onChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Parentesco</label>
            <input name="responsavelParentesco" value={formData.responsavelParentesco || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone</label>
            <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone || ''} onChange={onChange} maxLength={15} inputMode="tel" placeholder="(00) 00000-0000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
            <input type="email" name="responsavelEmail" value={formData.responsavelEmail || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Responsável" value={formData.responsavelNome} />
          <ParceiroAlunoDisplayField label="CPF" value={formatCpf(formData.responsavelCpf)} />
          <ParceiroAlunoDisplayField label="Parentesco" value={formData.responsavelParentesco} />
          <ParceiroAlunoDisplayField label="Telefone" value={formatPhoneDisplay(formData.responsavelTelefone)} />
          <ParceiroAlunoDisplayField label="E-mail" value={formData.responsavelEmail} />
          <ParceiroAlunoDisplayField label="Responsável financeiro" value={formData.responsavelFinanceiro ? 'SIM' : 'NÃO'} />
        </>
      )}
    </div>
  </div>
);

const ParceiroAlunoDocumentsSection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => (
  <div className="space-y-6 pt-6">
    <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Documentação Civil</h4>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Tipo de documento</label>
            <select name="tipoDocumento" value={formData.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
              {TECHNICAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Número do documento</label>
            <input type="text" name="rg" value={formData.rg || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Órgão Emissor / UF</label>
            <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Título de Eleitor</label>
            <input type="text" name="tituloEleitor" value={formData.tituloEleitor || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nacionalidade</label>
            <input type="text" name="nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Naturalidade</label>
            <input type="text" name="naturalidade" value={formData.naturalidade || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Reservista</label>
            <input type="text" name="reservista" value={formData.reservista || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Tipo de documento" value={formatDocumentTypeLabel(formData.tipoDocumento)} />
          <ParceiroAlunoDisplayField label="Número do documento" value={formData.rg} />
          <ParceiroAlunoDisplayField label="Órgão Emissor / UF" value={formData.orgaoEmissor} />
          <ParceiroAlunoDisplayField label="Título de Eleitor" value={formData.tituloEleitor} />
          <ParceiroAlunoDisplayField label="Nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} />
          <ParceiroAlunoDisplayField label="Naturalidade" value={formData.naturalidade} />
          <ParceiroAlunoDisplayField label="Reservista" value={formData.reservista} />
        </>
      )}
    </div>
  </div>
);

const ParceiroAlunoDetailsSections: React.FC<DetailsSectionsProps> = (props) => (
  <>
    <ParceiroAlunoFamilySection {...props} />
    <ParceiroAlunoGuardianSection {...props} />
    <ParceiroAlunoDocumentsSection {...props} />
  </>
);

export default ParceiroAlunoDetailsSections;
