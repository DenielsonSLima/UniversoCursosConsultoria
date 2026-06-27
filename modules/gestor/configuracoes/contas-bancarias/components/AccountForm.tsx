
import React, { useState } from 'react';
import { Save, X, Building, User, Hash, CreditCard } from 'lucide-react';

interface AccountFormProps {
  initialData?: any;
  companyId: string;
  companies: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
}

const AccountForm: React.FC<AccountFormProps> = ({ initialData, companyId, companies, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    banco: '',
    titular: '',
    agencia: '',
    conta: '',
    tipo: 'Corrente',
    ...initialData,
    poloId: initialData?.poloId || companyId,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, poloId: formData.poloId || companyId, companyId: formData.poloId || companyId });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl animate-fadeIn">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
        <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">
          {initialData ? 'Editar Conta' : 'Nova Conta Bancária'}
        </h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-red-500 transition-colors">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Banco e Tipo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
              <Building size={14} className="text-blue-500" /> Instituição Financeira
            </label>
            <input 
              type="text" 
              name="banco"
              value={formData.banco}
              onChange={handleChange}
              placeholder="Ex: Banco do Brasil, Nubank..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={14} className="text-blue-500" /> Tipo de Conta
            </label>
            <select 
              name="tipo"
              value={formData.tipo}
              onChange={handleChange}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700 cursor-pointer"
            >
              <option value="Corrente">Conta Corrente</option>
              <option value="Poupanca">Conta Poupança</option>
              <option value="Pagamento">Conta de Pagamento</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
            <Building size={14} className="text-blue-500" /> Exibir / usar no polo
          </label>
          <select
            name="poloId"
            value={formData.poloId}
            onChange={handleChange}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700 cursor-pointer"
            required
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.isMatriz ? 'Matriz' : 'Polo'} - {company.nomeFantasia}
                {company.cidade ? ` (${company.cidade}/${company.estado || ''})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Titular */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
            <User size={14} className="text-blue-500" /> Titular da Conta
          </label>
          <input 
            type="text" 
            name="titular"
            value={formData.titular}
            onChange={handleChange}
            placeholder="Nome completo ou Razão Social"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
            required
          />
        </div>

        {/* Agência e Conta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
              <Hash size={14} className="text-blue-500" /> Agência
            </label>
            <input 
              type="text" 
              name="agencia"
              value={formData.agencia}
              onChange={handleChange}
              placeholder="0000"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
              <Hash size={14} className="text-blue-500" /> Número da Conta
            </label>
            <input 
              type="text" 
              name="conta"
              value={formData.conta}
              onChange={handleChange}
              placeholder="00000-0"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
              required
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onCancel}
            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            className="px-6 py-3 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            <Save size={16} /> Salvar Conta
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccountForm;
