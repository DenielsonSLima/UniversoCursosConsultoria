import React from 'react';
import { Building2, Check, Lock, Mail, Phone, Shield, User } from 'lucide-react';
import { NovoUsuarioFormData } from '../usuarios.types';

interface CompanyOption {
  id: string;
  nomeFantasia: string;
  cidade: string;
  uf: string;
}

interface UserIdentitySectionsProps {
  formData: NovoUsuarioFormData;
  isEditing: boolean;
  contextId: string;
  companies: CompanyOption[];
  passwordStrength: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleAllPolos: () => void;
  onTogglePolo: (id: string) => void;
}

const strengthColor = (score: number) => {
  if (score <= 2) return 'bg-red-500';
  if (score <= 3) return 'bg-yellow-500';
  return 'bg-emerald-500';
};

const strengthLabel = (score: number) => {
  if (score <= 2) return 'Fraca';
  if (score <= 3) return 'Média';
  return 'Forte';
};

const UserIdentitySections: React.FC<UserIdentitySectionsProps> = ({
  formData,
  isEditing,
  contextId,
  companies,
  passwordStrength,
  onChange,
  onToggleAllPolos,
  onTogglePolo,
}) => (
  <>
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-6 text-blue-600">
        <User size={20} />
        <h4 className="text-sm font-black uppercase tracking-wider">Dados Pessoais</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome</label>
          <input type="text" name="nome" value={formData.nome} onChange={onChange} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all" placeholder="Primeiro nome" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sobrenome</label>
          <input type="text" name="sobrenome" value={formData.sobrenome} onChange={onChange} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all" placeholder="Sobrenome completo" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
          <input type="text" name="cpf" value={formData.cpf} onChange={onChange} maxLength={14} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-mono focus:border-blue-500 outline-none transition-all" placeholder="000.000.000-00" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Data de Nascimento</label>
          <input type="date" name="dataNascimento" value={formData.dataNascimento} onChange={onChange} required={!isEditing} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone / WhatsApp</label>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="tel" name="telefone" value={formData.telefone} onChange={onChange} maxLength={15} required className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all" placeholder="(00) 00000-0000" />
          </div>
        </div>
      </div>
    </section>

    <section className="mb-10">
      <div className="flex items-center gap-2 mb-6 text-blue-600 border-t border-slate-100 pt-8">
        <Shield size={20} />
        <h4 className="text-sm font-black uppercase tracking-wider">Acesso e Segurança</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="md:col-span-2 space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail Corporativo (Login)</label>
          {isEditing && <p className="text-[10px] text-slate-400">O login não pode ser alterado por esta tela.</p>}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="email" name="email" value={formData.email} onChange={onChange} required readOnly={isEditing} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all read-only:cursor-not-allowed read-only:text-slate-500" placeholder="usuario@universo.com" />
          </div>
        </div>
        {!isEditing && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="password" name="senha" value={formData.senha} onChange={onChange} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all" placeholder="••••••••" />
              </div>
              {formData.senha && (
                <div className="flex items-center gap-2 mt-2 px-1">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${strengthColor(passwordStrength)}`} style={{ width: `${(passwordStrength / 5) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">{strengthLabel(passwordStrength)}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Confirmar Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="password" name="confirmarSenha" value={formData.confirmarSenha} onChange={onChange} className={`w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-xl text-[#001a33] outline-none transition-all ${formData.confirmarSenha && formData.senha !== formData.confirmarSenha ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'}`} placeholder="••••••••" />
              </div>
              {formData.confirmarSenha && formData.senha !== formData.confirmarSenha && <p className="text-[10px] text-red-500 font-bold ml-1 mt-1">As senhas não conferem</p>}
            </div>
          </>
        )}
      </div>
    </section>

    <section className="mb-10">
      <div className="flex items-center gap-2 mb-6 text-blue-600 border-t border-slate-100 pt-8">
        <Building2 size={20} />
        <h4 className="text-sm font-black uppercase tracking-wider">Unidades Permitidas</h4>
      </div>
      <button type="button" onClick={onToggleAllPolos} disabled={contextId !== 'global'} className={`mb-4 flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${formData.todosPolos ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}>
        <span>
          <span className="block text-xs font-black uppercase tracking-widest">Todos os polos</span>
          <span className="mt-1 block text-[11px] font-semibold text-slate-500">{contextId === 'global' ? 'Acesso dinâmico a todas as unidades ativas, incluindo polos criados depois.' : 'Disponível somente no grupo global/multiunidade.'}</span>
        </span>
        {formData.todosPolos && <span className="rounded-full bg-blue-500 p-1 text-white"><Check size={12} /></span>}
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map(company => (
          <div key={company.id} onClick={() => onTogglePolo(company.id)} className={`rounded-xl border p-4 flex items-center justify-between transition-all duration-200 ${formData.todosPolos ? 'cursor-not-allowed bg-slate-50 border-slate-100 opacity-60' : 'cursor-pointer'} ${formData.polosAcesso.includes(company.id) ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-200'}`}>
            <div>
              <p className={`text-xs font-black uppercase tracking-tight ${formData.polosAcesso.includes(company.id) ? 'text-blue-800' : 'text-slate-700'}`}>{company.nomeFantasia}</p>
              <p className="text-[10px] text-slate-500">{company.cidade}/{company.uf}</p>
            </div>
            {formData.polosAcesso.includes(company.id) && <div className="bg-blue-500 text-white p-1 rounded-full"><Check size={12} /></div>}
          </div>
        ))}
      </div>
      {!formData.todosPolos && (
        <p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500">
          O acesso restrito inclui somente os polos marcados. Novos polos não serão adicionados automaticamente.
        </p>
      )}
    </section>
  </>
);

export default UserIdentitySections;
