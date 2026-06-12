// File: modules/gestor/parceiros/components/formularioparceiros/pf/ParceiroPFForm.tsx

import React, { useState } from 'react';
import { User, MapPin, Phone, Mail, Save, X, FileText } from 'lucide-react';

interface ParceiroPFFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const ParceiroPFForm: React.FC<ParceiroPFFormProps> = ({ onCancel, onSave }) => {
  const [formData, setFormData] = useState<any>({
    polo: 'matriz',
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    observacoes: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-8">
      {/* Dados Principais */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-emerald-700">
          <User size={20} />
          <h3 className="font-bold uppercase tracking-wide text-sm">Dados da Pessoa Física</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Polo/Unidade</label>
            <select name="polo" value={formData.polo} onChange={handleChange as any} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-slate-700">
              <option value="matriz">Matriz - Aracaju</option>
              <option value="estancia">Polo Estância</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome Completo</label>
            <input type="text" name="nome" value={formData.nome} onChange={handleChange} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Nome completo" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CPF</label>
            <input type="text" name="cpf" value={formData.cpf} onChange={handleChange} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="000.000.000-00" />
          </div>
        </div>
      </section>

      {/* Contato */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-emerald-700">
          <Phone size={20} />
          <h3 className="font-bold uppercase tracking-wide text-sm">Contato</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Telefone/WhatsApp</label>
            <input type="text" name="telefone" value={formData.telefone} onChange={handleChange} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="(00) 00000-0000" />
          </div>
        </div>
      </section>

      {/* Observações */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-emerald-700">
          <FileText size={20} />
          <h3 className="font-bold uppercase tracking-wide text-sm">Observações</h3>
        </div>
        <div>
           <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows={4} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 resize-none" placeholder="Observações adicionais ou notas internas..." />
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
        <button onClick={onCancel} className="px-6 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors uppercase tracking-wider">
          Cancelar
        </button>
        <button onClick={() => onSave && onSave(formData)} className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-600/30 uppercase tracking-wider">
          <Save size={18} />
          Salvar
        </button>
      </div>
    </div>
  );
};

export default ParceiroPFForm;
