import type React from 'react';
import { Camera, Loader2, User } from 'lucide-react';

import { formatCpf } from '../../../../../../lib/documentFormatters';
import ParceiroAlunoDisplayField from './ParceiroAlunoDisplayField';

interface PersonalSectionProps {
  formData: any;
  isEditing: boolean;
  isUploadingPhoto: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
  onUseFullName: () => void;
}

const ParceiroAlunoPersonalSection: React.FC<PersonalSectionProps> = ({
  formData,
  isEditing,
  isUploadingPhoto,
  onChange,
  onPhotoUpload,
  onRemovePhoto,
  onUseFullName,
}) => (
  <div className="flex flex-col md:flex-row gap-8 pt-4">
    <div className="flex flex-col items-center gap-4 shrink-0">
      <div className="w-40 h-40 rounded-full bg-slate-100 border-4 border-white shadow-lg relative overflow-hidden group">
        {formData.foto ? (
          <img src={formData.foto} alt="Aluno" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <User size={64} />
          </div>
        )}
        {isEditing && !isUploadingPhoto && (
          <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            <Camera className="text-white" size={32} />
            <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} />
          </label>
        )}
        {isUploadingPhoto && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center text-white">
            <Loader2 className="animate-spin" size={32} />
          </div>
        )}
      </div>
      {isEditing && (
        <div className="flex gap-3">
          <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:underline cursor-pointer">
            Alterar Foto
            <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} disabled={isUploadingPhoto} />
          </label>
          {formData.foto && (
            <button type="button" onClick={onRemovePhoto} className="text-[10px] font-bold text-red-500 uppercase tracking-wider hover:underline">
              Remover
            </button>
          )}
        </div>
      )}
    </div>

    <div className="flex-1 space-y-6">
      <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Informações Pessoais</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isEditing ? (
          <>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Completo</label>
              <input type="text" name="nome" value={formData.nome || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none" />
            </div>
            <div className="md:col-span-1 space-y-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Social</label>
                <button type="button" onClick={onUseFullName} className="text-[10px] text-blue-600 font-bold uppercase tracking-wider hover:underline bg-blue-50 px-2 py-0.5 rounded">
                  Usar Completo
                </button>
              </div>
              <input type="text" name="nomeSocial" value={formData.nomeSocial || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-700 focus:border-blue-500 outline-none" placeholder="Como prefere ser chamado" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
              <input type="text" name="cpf" value={formData.cpf || ''} onChange={onChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nascimento</label>
              <input type="text" name="dataNascimento" value={formData.dataNascimento || ''} onChange={onChange} maxLength={10} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="DD/MM/AAAA" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sexo</label>
              <select name="sexo" value={formData.sexo || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                <option value="">Selecione...</option>
                <option value="MASCULINO">MASCULINO</option>
                <option value="FEMININO">FEMININO</option>
                <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Status Acadêmico</label>
              <select name="status" value={formData.status || 'ATIVO'} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold">
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
                <option value="TRANCADO">TRANCADO</option>
                <option value="CONCLUÍDO">CONCLUÍDO</option>
                <option value="DESISTENTE">DESISTENTE</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="md:col-span-2"><ParceiroAlunoDisplayField label="Nome Completo" value={formData.nome} /></div>
            <ParceiroAlunoDisplayField label="Nome Social" value={formData.nomeSocial || formData.nome} />
            <ParceiroAlunoDisplayField label="CPF" value={formatCpf(formData.cpf)} />
            <ParceiroAlunoDisplayField label="Data de Nascimento" value={formData.dataNascimento} />
            <ParceiroAlunoDisplayField label="Sexo" value={formData.sexo} />
            <ParceiroAlunoDisplayField label="Status Acadêmico" value={formData.status || 'ATIVO'} />
          </>
        )}
      </div>
    </div>
  </div>
);

export default ParceiroAlunoPersonalSection;
