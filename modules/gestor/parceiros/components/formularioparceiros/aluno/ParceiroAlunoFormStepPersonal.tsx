import type React from 'react';
import { Accessibility, Loader2, Upload, User } from 'lucide-react';

import {
  ESTADOS_CIVIS,
  formatPoloOption,
  INPUT_CLS,
  LABEL_CLS,
  PCD_TIPOS,
  sectionHeaderCls,
} from './parceiro-aluno-form.constants';
import type { AlunoFormStepProps, PoloOption } from './parceiro-aluno-form.types';
import { RACA_COR_OPTIONS } from '../../../utils/parceiros.constants';

interface PersonalStepProps extends AlunoFormStepProps {
  polos: PoloOption[];
  isUploadingPhoto: boolean;
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
}

const ParceiroAlunoFormStepPersonal: React.FC<PersonalStepProps> = ({
  formData,
  polos,
  isUploadingPhoto,
  onChange,
  onPhotoUpload,
  onRemovePhoto,
}) => (
  <div className="space-y-5 ">
    <div className={sectionHeaderCls('blue')}>
      <User size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Dados Pessoais & Vínculo</h4>
    </div>

    <div className="flex flex-col md:flex-row gap-6 items-center bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-5">
      <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 relative overflow-hidden group shrink-0">
        {formData.foto ? (
          <img src={formData.foto} alt="Prévia da Foto" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <User size={40} />
          </div>
        )}
        {isUploadingPhoto && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
      </div>
      <div className="space-y-2 text-left w-full">
        <h5 className="text-sm font-bold text-[#001a33] uppercase">Foto do Aluno</h5>
        <p className="text-xs text-slate-400">Envie uma foto recente de identificação (JPG, PNG).</p>
        <div className="flex gap-2">
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/10">
            <Upload size={14} />
            Selecionar Foto
            <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} disabled={isUploadingPhoto} />
          </label>
          {formData.foto && (
            <button
              type="button"
              onClick={onRemovePhoto}
              className="px-4 py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-colors"
            >
              Remover
            </button>
          )}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div>
        <label className={LABEL_CLS}>Polo/Unidade <span className="text-red-500">*</span></label>
        <select name="poloId" value={formData.poloId} onChange={onChange} className={INPUT_CLS}>
          {polos.length === 0 && <option value={formData.poloId}>Carregando polos...</option>}
          {polos.map((polo) => (
            <option key={polo.id} value={polo.id}>{formatPoloOption(polo)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Status do Aluno <span className="text-red-500">*</span></label>
        <select name="status" value={formData.status} onChange={onChange} className={INPUT_CLS} required>
          <option value="ATIVO">ATIVO</option>
          <option value="INATIVO">INATIVO</option>
          <option value="TRANCADO">TRANCADO</option>
          <option value="CONCLUÍDO">CONCLUÍDO</option>
          <option value="DESISTENTE">DESISTENTE</option>
        </select>
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Nome Completo <span className="text-red-500">*</span></label>
        <input type="text" name="nomeCompleto" value={formData.nomeCompleto} onChange={onChange}
          className={INPUT_CLS} placeholder="Ex: Maria da Silva Santos" required />
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Nome Social (Opcional)</label>
        <input type="text" name="nomeSocial" value={formData.nomeSocial} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome pelo qual prefere ser chamado(a)" />
      </div>

      <div>
        <label className={LABEL_CLS}>CPF <span className="text-red-500">*</span></label>
        <input type="text" name="cpf" value={formData.cpf} onChange={onChange}
          maxLength={14} className={`${INPUT_CLS} font-mono`} placeholder="000.000.000-00" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Data de Nascimento <span className="text-red-500">*</span></label>
        <input type="text" name="dataNascimento" value={formData.dataNascimento} onChange={onChange}
          maxLength={10} className={INPUT_CLS} placeholder="DD/MM/AAAA" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Sexo <span className="text-red-500">*</span></label>
        <select name="sexo" value={formData.sexo} onChange={onChange} className={INPUT_CLS} required>
          <option value="">Selecione...</option>
          <option value="MASCULINO">MASCULINO</option>
          <option value="FEMININO">FEMININO</option>
          <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
          <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Raça/Cor</label>
        <select name="racaCor" value={formData.racaCor} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione...</option>
          {RACA_COR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Estado Civil</label>
        <select name="estadoCivil" value={formData.estadoCivil} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione...</option>
          {ESTADOS_CIVIS.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Nacionalidade</label>
        <input type="text" name="nacionalidade" value={formData.nacionalidade} onChange={onChange}
          className={INPUT_CLS} placeholder="Brasileira" />
      </div>

      <div>
        <label className={LABEL_CLS}>Naturalidade (Cidade/UF)</label>
        <input type="text" name="naturalidade" value={formData.naturalidade} onChange={onChange}
          className={INPUT_CLS} placeholder="Ex: Aracaju/SE" />
      </div>
    </div>

    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
      <div className="flex items-center gap-3 mb-3">
        <input type="checkbox" id="pcd" name="pcd" checked={formData.pcd}
          onChange={onChange} className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
        <label htmlFor="pcd" className="flex items-center gap-2 text-sm font-bold text-[#001a33] cursor-pointer">
          <Accessibility size={16} className="text-blue-500" />
          Pessoa com Deficiência (PcD)
        </label>
      </div>
      {formData.pcd && (
        <div className="mt-2">
          <label className={LABEL_CLS}>Tipo de Deficiência</label>
          <select name="pcdTipo" value={formData.pcdTipo} onChange={onChange} className={INPUT_CLS}>
            <option value="">Selecione...</option>
            {PCD_TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
        </div>
      )}
    </div>
  </div>
);

export default ParceiroAlunoFormStepPersonal;
