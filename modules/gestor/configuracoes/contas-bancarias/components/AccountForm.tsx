
import React, { useState } from 'react';
import { Save, X, Building, User, Hash, CreditCard, MapPin, WalletCards } from 'lucide-react';

interface AccountFormProps {
  initialData?: any;
  companyId: string;
  companies: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
}

const AccountForm: React.FC<AccountFormProps> = ({ initialData, companyId, companies, onSave, onCancel }) => {
  const ownerCompany = companies.find((company) => company.id === companyId);
  const [formData, setFormData] = useState({
    banco: '',
    titular: '',
    agencia: '',
    conta: '',
    tipo: 'Corrente',
    ...initialData,
    poloId: companyId,
    polosUso: initialData?.polosUso?.length ? initialData.polosUso : [companyId],
  });
  const isCaixa = formData.tipo === 'Caixa' || formData.natureza === 'CAIXA_INTERNO';
  const canShare = ownerCompany?.isMatriz && !isCaixa;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      poloId: companyId,
      companyId,
      polosUso: isCaixa
        ? [companyId]
        : Array.from(new Set([companyId, ...formData.polosUso])),
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const togglePolo = (poloId: string) => {
    if (poloId === companyId) return;
    setFormData((current) => ({
      ...current,
      polosUso: current.polosUso.includes(poloId)
        ? current.polosUso.filter((id: string) => id !== poloId)
        : [...current.polosUso, poloId],
    }));
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
              required={!isCaixa}
              disabled={isCaixa}
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
              <option value="Caixa">Caixa da Unidade</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
            <MapPin size={14} className="text-blue-500" /> Unidade titular
          </label>
          <p className="mt-2 text-sm font-black text-[#001a33]">
            {ownerCompany?.isMatriz ? 'Matriz' : 'Polo'} — {ownerCompany?.nomeFantasia}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {ownerCompany?.cidade}{ownerCompany?.estado ? `/${ownerCompany.estado}` : ''}
          </p>
        </div>

        {canShare && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                <Building size={14} className="text-blue-500" /> Polos autorizados a usar a conta
              </label>
              <p className="mt-1 text-xs font-medium text-slate-500">
                A conta continua pertencendo à Matriz; marque os polos que poderão usá-la em recebimentos e pagamentos.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {companies.filter((company) => company.ativo).map((company) => {
                const checked = company.id === companyId || formData.polosUso.includes(company.id);
                return (
                  <label
                    key={company.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={company.id === companyId}
                      onChange={() => togglePolo(company.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      <span className="block text-xs font-black text-[#001a33]">
                        {company.isMatriz ? 'Matriz' : 'Polo'} — {company.nomeFantasia}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">
                        {company.cidade}/{company.estado}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {isCaixa && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <WalletCards size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <p className="text-xs font-semibold leading-relaxed text-emerald-800">
              O Caixa é individual desta unidade. Banco, titular e identificadores são definidos automaticamente pelo sistema.
            </p>
          </div>
        )}

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
            required={!isCaixa}
            disabled={isCaixa}
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
              required={!isCaixa}
              disabled={isCaixa}
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
              required={!isCaixa}
              disabled={isCaixa}
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
