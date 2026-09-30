import React from 'react';
import { CheckCircle2, Loader2, RefreshCw, Upload, User } from 'lucide-react';
import { RACA_COR_OPTIONS } from '../../../utils/parceiros.constants';
import {
  formatPoloLocation,
  type ProfessorFormData,
  type ProfessorPoloOption,
} from './professor-form.model';

interface ProfessorPersonalStepProps {
  formData: ProfessorFormData;
  polosList: ProfessorPoloOption[];
  polosLoading: boolean;
  polosError: string;
  isUploadingPhoto: boolean;
  inputCls: string;
  labelCls: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
  onTogglePolo: (poloId: string) => void;
  onReloadPolos: () => void;
}

const ProfessorPersonalStep: React.FC<ProfessorPersonalStepProps> = ({
  formData,
  polosList,
  polosLoading,
  polosError,
  isUploadingPhoto,
  inputCls,
  labelCls,
  onChange,
  onPhotoUpload,
  onRemovePhoto,
  onTogglePolo,
  onReloadPolos,
}) => (
  <div className="space-y-5">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-purple-600">
      <User size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Dados pessoais e identificação</h4>
    </div>

    <div className="flex flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:flex-row">
      <div className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100">
        {formData.foto ? (
          <img src={formData.foto} alt="Prévia da foto do professor" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <User size={40} />
          </div>
        )}
        {isUploadingPhoto && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
      </div>
      <div className="w-full space-y-2 text-left">
        <h5 className="text-sm font-bold uppercase text-[#001a33]">Foto do professor</h5>
        <p className="text-xs text-slate-400">Opcional. Envie uma foto recente em JPG, PNG ou WEBP.</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-purple-600/10 transition-colors hover:bg-purple-700">
            <Upload size={14} />
            Selecionar foto
            <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} disabled={isUploadingPhoto} />
          </label>
          {formData.foto && (
            <button type="button" onClick={onRemovePhoto} className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-200">
              Remover
            </button>
          )}
        </div>
      </div>
    </div>

    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
        Polos / unidades vinculadas <span className="text-red-500">*</span>
      </legend>
      <p className="mt-1 text-xs text-slate-500">Selecione um ou mais polos. Cada unidade está identificada por cidade e UF.</p>

      {polosLoading && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Carregando polos...
        </div>
      )}

      {!polosLoading && polosError && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{polosError}</span>
          <button type="button" onClick={onReloadPolos} className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      )}

      {!polosLoading && !polosError && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {polosList.map((polo) => {
            const isSelected = formData.poloIds.includes(polo.id);
            return (
              <button
                type="button"
                key={polo.id}
                aria-pressed={isSelected}
                onClick={() => onTogglePolo(polo.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                  isSelected
                    ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-600/10'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black uppercase tracking-wider">{polo.nome}</span>
                  <span className={`mt-1 block text-xs font-medium ${isSelected ? 'text-purple-100' : 'text-slate-500'}`}>
                    {formatPoloLocation(polo)}
                  </span>
                </span>
                {isSelected && <CheckCircle2 size={18} className="shrink-0" />}
              </button>
            );
          })}
          {polosList.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Nenhum polo ativo foi encontrado. Recarregue antes de continuar.
            </div>
          )}
        </div>
      )}
    </fieldset>

    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      <div className="md:col-span-2">
        <label className={labelCls}>Nome completo <span className="text-red-500">*</span></label>
        <input type="text" name="nomeCompleto" value={formData.nomeCompleto} onChange={onChange} className={inputCls} placeholder="Ex: Dra. Ana Santos" aria-required="true" />
      </div>
      <div>
        <label className={labelCls}>CPF <span className="text-red-500">*</span></label>
        <input type="text" name="cpf" value={formData.cpf} onChange={onChange} maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" aria-required="true" inputMode="numeric" />
      </div>
      <div>
        <label className={labelCls}>Data de nascimento</label>
        <input type="text" name="dataNascimento" value={formData.dataNascimento} onChange={onChange} maxLength={10} className={inputCls} placeholder="DD/MM/AAAA" inputMode="numeric" />
      </div>
      <div>
        <label className={labelCls}>Sexo</label>
        <select name="sexo" value={formData.sexo} onChange={onChange} className={inputCls}>
          <option value="">Selecione...</option>
          <option value="MASCULINO">MASCULINO</option>
          <option value="FEMININO">FEMININO</option>
          <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
          <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Raça/cor</label>
        <select name="racaCor" value={formData.racaCor} onChange={onChange} className={inputCls}>
          <option value="">Selecione...</option>
          {RACA_COR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>RG</label>
        <input type="text" name="rg" value={formData.rg} onChange={onChange} className={inputCls} placeholder="Número do RG" />
      </div>
      <div>
        <label className={labelCls}>Órgão emissor</label>
        <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor} onChange={onChange} className={inputCls} placeholder="SSP/SE" />
      </div>
    </div>
  </div>
);

export default ProfessorPersonalStep;
