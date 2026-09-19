import type React from 'react';
import { Camera, Loader2, User } from 'lucide-react';

import { formatCpf } from '../../../../../../lib/documentFormatters';
import { RACA_COR_OPTIONS } from '../../../utils/parceiros.constants';
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
  <div id="aluno-pessoais" className="flex flex-col md:flex-row gap-5 scroll-mt-28">
    <div className="flex flex-col items-start md:items-center gap-2 shrink-0">
      <div className="aspect-[3/4] w-24 rounded-xl bg-slate-100 border border-slate-200 relative overflow-hidden group">
        {formData.foto ? (
          <img src={formData.foto} alt="Aluno" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <User size={36} />
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
          <label className="inline-flex min-h-11 items-center text-xs font-medium text-blue-600 hover:underline cursor-pointer focus-within:ring-2 focus-within:ring-blue-500">
            Alterar Foto
            <input type="file" accept="image/*" className="sr-only" onChange={onPhotoUpload} disabled={isUploadingPhoto} />
          </label>
          {formData.foto && (
            <button type="button" onClick={onRemovePhoto} className="min-h-11 text-xs font-medium text-red-600 hover:underline">
              Remover
            </button>
          )}
        </div>
      )}
    </div>

    <div className="min-w-0 flex-1 space-y-4">
      <h4 className="text-base font-semibold text-[#001a33] border-b border-slate-100 pb-3">Dados pessoais</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isEditing ? (
          <>
            <div className="md:col-span-2 space-y-1.5">
              <label htmlFor="aluno-nome" className="block text-xs font-medium text-slate-600">Nome Completo</label>
              <input id="aluno-nome" type="text" name="nome" value={formData.nome || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-blue-500 outline-none" />
            </div>
            <div className="md:col-span-1 space-y-1.5">
              <label htmlFor="aluno-nomeSocial" className="block text-xs font-medium text-slate-600">Nome social</label>
              <input id="aluno-nomeSocial" type="text" name="nomeSocial" value={formData.nomeSocial || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:border-blue-500 outline-none" placeholder="Informe, se houver" aria-describedby="aluno-nome-social-ajuda" />
              <div className="flex items-center justify-between gap-2">
                <p id="aluno-nome-social-ajuda" className="text-xs text-slate-500">Preencha apenas quando houver nome social.</p>
                <button type="button" onClick={onUseFullName} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-blue-600 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500">
                  Copiar nome
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aluno-cpf" className="block text-xs font-medium text-slate-600">CPF</label>
              <input id="aluno-cpf" type="text" name="cpf" value={formData.cpf || ''} onChange={onChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aluno-dataNascimento" className="block text-xs font-medium text-slate-600">Nascimento</label>
              <input id="aluno-dataNascimento" type="text" name="dataNascimento" value={formData.dataNascimento || ''} onChange={onChange} maxLength={10} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" placeholder="DD/MM/AAAA" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aluno-sexo" className="block text-xs font-medium text-slate-600">Sexo</label>
              <select id="aluno-sexo" name="sexo" value={formData.sexo || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
                <option value="">Selecione...</option>
                {formData.sexo && !['MASCULINO', 'FEMININO', 'NÃO-BINÁRIO', 'PREFIRO NÃO INFORMAR'].includes(formData.sexo) && <option value={formData.sexo}>{formData.sexo}</option>}
                <option value="MASCULINO">MASCULINO</option>
                <option value="FEMININO">FEMININO</option>
                <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aluno-racaCor" className="block text-xs font-medium text-slate-600">Raça/Cor</label>
              <select id="aluno-racaCor" name="racaCor" value={formData.racaCor || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
                <option value="">Selecione...</option>
                {RACA_COR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aluno-status" className="block text-xs font-medium text-slate-600">Situação do cadastro</label>
              <select id="aluno-status" name="status" aria-describedby="aluno-status-ajuda" value={formData.status || 'ATIVO'} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-medium">
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
                <option value="TRANCADO">TRANCADO</option>
                <option value="CONCLUÍDO">CONCLUÍDO</option>
                <option value="DESISTENTE">DESISTENTE</option>
              </select>
              <p id="aluno-status-ajuda" className="text-xs text-slate-500">Situação da pessoa no cadastro. O vínculo acadêmico é gerenciado em Matrículas.</p>
            </div>
          </>
        ) : (
          <>
            <div className="md:col-span-2"><ParceiroAlunoDisplayField label="Nome Completo" value={formData.nome} /></div>
            <ParceiroAlunoDisplayField label="Nome Social" value={formData.nomeSocial} />
            <ParceiroAlunoDisplayField label="CPF" value={formatCpf(formData.cpf)} />
            <ParceiroAlunoDisplayField label="Data de Nascimento" value={formData.dataNascimento} />
            <ParceiroAlunoDisplayField label="Sexo" value={formData.sexo} />
            <ParceiroAlunoDisplayField label="Raça/Cor" value={formData.racaCor} />
            <ParceiroAlunoDisplayField label="Situação do cadastro" value={formData.status || 'ATIVO'} />
          </>
        )}
      </div>
    </div>
  </div>
);

export default ParceiroAlunoPersonalSection;
