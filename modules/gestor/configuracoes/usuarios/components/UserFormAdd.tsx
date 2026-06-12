
import React, { useState, useEffect } from 'react';
import { 
  Save, X, User, Shield, Lock, Mail, Building2, Check, AlertTriangle, 
  LayoutDashboard, Handshake, UserPlus, Briefcase, FileText, ShoppingCart, 
  TrendingUp, BookOpen, BarChart, Settings
} from 'lucide-react';
import { empresasService } from '../../empresas/empresas.service';

interface UserFormAddProps {
  onSave: (data: any) => void;
  onCancel: () => void;
}

const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'parceiros', label: 'Parceiros', icon: <Handshake size={18} /> },
  { id: 'cadastros', label: 'Cadastros', icon: <UserPlus size={18} /> },
  { id: 'gestao', label: 'Gestão', icon: <Briefcase size={18} /> },
  { id: 'secretaria', label: 'Secretaria', icon: <FileText size={18} /> },
  { id: 'caixa', label: 'Caixa', icon: <ShoppingCart size={18} /> },
  { id: 'financeiro', label: 'Financeiro', icon: <TrendingUp size={18} /> },
  { id: 'biblioteca', label: 'Biblioteca', icon: <BookOpen size={18} /> },
  { id: 'relatorios', label: 'Relatórios', icon: <BarChart size={18} /> },
  { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
];

const UserFormAdd: React.FC<UserFormAddProps> = ({ onSave, onCancel }) => {
  const [step, setStep] = useState(1);
  const [companies, setCompanies] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    cpf: '',
    dataNascimento: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    polosAcesso: [] as string[],
    permissoes: [] as string[]
  });

  const [passwordStrength, setPasswordStrength] = useState(0);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    const data = await empresasService.getAll();
    setCompanies(data);
  };

  // Formatadores
  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const checkPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length > 6) score += 1;
    if (pass.length > 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    setPasswordStrength(score);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, [name]: formatCPF(value) }));
    } else if (name === 'senha') {
      setFormData(prev => ({ ...prev, [name]: value }));
      checkPasswordStrength(value);
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const togglePolo = (id: string) => {
    setFormData(prev => {
      const current = prev.polosAcesso;
      if (current.includes(id)) return { ...prev, polosAcesso: current.filter(p => p !== id) };
      return { ...prev, polosAcesso: [...current, id] };
    });
  };

  const togglePermission = (id: string) => {
    setFormData(prev => {
      const current = prev.permissoes;
      if (current.includes(id)) return { ...prev, permissoes: current.filter(p => p !== id) };
      return { ...prev, permissoes: [...current, id] };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.senha !== formData.confirmarSenha) {
      alert("As senhas não coincidem!");
      return;
    }
    onSave(formData);
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 2) return 'bg-red-500';
    if (passwordStrength <= 3) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const getStrengthLabel = () => {
    if (passwordStrength <= 2) return 'Fraca';
    if (passwordStrength <= 3) return 'Média';
    return 'Forte';
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col h-full animate-fadeIn">
      
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Usuário</h3>
          <p className="text-slate-500 text-sm">Preencha as informações para conceder acesso ao sistema.</p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        
        {/* Seção 1: Dados Pessoais */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-6 text-blue-600">
            <User size={20} />
            <h4 className="text-sm font-black uppercase tracking-wider">Dados Pessoais</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome</label>
              <input 
                type="text" name="nome" value={formData.nome} onChange={handleChange} required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all"
                placeholder="Primeiro nome"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sobrenome</label>
              <input 
                type="text" name="sobrenome" value={formData.sobrenome} onChange={handleChange} required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all"
                placeholder="Sobrenome completo"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
              <input 
                type="text" name="cpf" value={formData.cpf} onChange={handleChange} maxLength={14} required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-mono focus:border-blue-500 outline-none transition-all"
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Data de Nascimento</label>
              <input 
                type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange} required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </section>

        {/* Seção 2: Contato e Segurança */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-6 text-blue-600 border-t border-slate-100 pt-8">
            <Shield size={20} />
            <h4 className="text-sm font-black uppercase tracking-wider">Acesso e Segurança</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail Corporativo (Login)</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" name="email" value={formData.email} onChange={handleChange} required
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
                  placeholder="usuario@universo.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" name="senha" value={formData.senha} onChange={handleChange} required
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              {/* Medidor de Força */}
              {formData.senha && (
                <div className="flex items-center gap-2 mt-2 px-1">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${getStrengthColor()}`} style={{ width: `${(passwordStrength / 5) * 100}%` }}></div>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">{getStrengthLabel()}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Confirmar Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" name="confirmarSenha" value={formData.confirmarSenha} onChange={handleChange} required
                  className={`w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-xl text-[#001a33] outline-none transition-all ${
                    formData.confirmarSenha && formData.senha !== formData.confirmarSenha 
                    ? 'border-red-300 focus:border-red-500' 
                    : 'border-slate-200 focus:border-blue-500'
                  }`}
                  placeholder="••••••••"
                />
              </div>
              {formData.confirmarSenha && formData.senha !== formData.confirmarSenha && (
                <p className="text-[10px] text-red-500 font-bold ml-1 mt-1">As senhas não conferem</p>
              )}
            </div>
          </div>
        </section>

        {/* Seção 3: Polos de Acesso */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-6 text-blue-600 border-t border-slate-100 pt-8">
            <Building2 size={20} />
            <h4 className="text-sm font-black uppercase tracking-wider">Unidades Permitidas</h4>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map(company => (
              <div 
                key={company.id}
                onClick={() => togglePolo(company.id)}
                className={`cursor-pointer rounded-xl border p-4 flex items-center justify-between transition-all duration-200 ${
                  formData.polosAcesso.includes(company.id)
                    ? 'bg-blue-50 border-blue-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-blue-200'
                }`}
              >
                <div>
                  <p className={`text-xs font-black uppercase tracking-tight ${formData.polosAcesso.includes(company.id) ? 'text-blue-800' : 'text-slate-700'}`}>
                    {company.nomeFantasia}
                  </p>
                  <p className="text-[10px] text-slate-500">{company.cidade}/{company.uf}</p>
                </div>
                {formData.polosAcesso.includes(company.id) && (
                  <div className="bg-blue-500 text-white p-1 rounded-full">
                    <Check size={12} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Seção 4: Permissões de Módulo */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-6 text-blue-600 border-t border-slate-100 pt-8">
            <Lock size={20} />
            <h4 className="text-sm font-black uppercase tracking-wider">Permissões de Módulo</h4>
          </div>

          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 mb-6 flex gap-3">
             <AlertTriangle className="text-yellow-600 shrink-0" size={20} />
             <div>
               <p className="text-xs font-bold text-yellow-800 uppercase mb-1">Atenção</p>
               <p className="text-xs text-yellow-700 leading-relaxed">
                 O usuário só conseguirá acessar os módulos selecionados abaixo. Caso tente acessar uma área não permitida, o sistema exibirá uma mensagem de "Acesso Negado".
               </p>
             </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {MODULES.map(module => (
              <div 
                key={module.id}
                onClick={() => togglePermission(module.id)}
                className={`cursor-pointer rounded-xl border p-4 flex flex-col items-center justify-center text-center gap-2 transition-all duration-200 h-32 ${
                  formData.permissoes.includes(module.id)
                    ? 'bg-[#001a33] border-[#001a33] text-white shadow-lg'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className={`${formData.permissoes.includes(module.id) ? 'text-blue-400' : 'text-slate-300'}`}>
                  {module.icon}
                </div>
                <p className="text-xs font-bold uppercase tracking-widest">
                  {module.label}
                </p>
                {formData.permissoes.includes(module.id) && (
                   <span className="text-[9px] bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded-full font-medium">
                     Liberado
                   </span>
                )}
              </div>
            ))}
          </div>
        </section>

      </form>

      {/* Footer Actions */}
      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-8 py-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button 
          onClick={handleSubmit}
          className="px-8 py-4 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Save size={18} />
          Salvar Usuário
        </button>
      </div>
    </div>
  );
};

export default UserFormAdd;
