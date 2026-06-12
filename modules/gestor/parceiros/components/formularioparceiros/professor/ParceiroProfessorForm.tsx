
// File: modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx

import React, { useState } from 'react';
import { User, MapPin, Phone, Mail, Save, X, AlertCircle, Briefcase, FileText } from 'lucide-react';

interface ParceiroProfessorFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const ParceiroProfessorForm: React.FC<ParceiroProfessorFormProps> = ({ onCancel, onSave }) => {
  const [formData, setFormData] = useState<any>({
    // Dados Pessoais
    polo: 'matriz',
    nomeCompleto: '',
    cpf: '',
    
    // Dados Profissionais (Diferença para o aluno)
    especialidade: '',
    
    // Endereço
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',

    // Contato
    email: '',
    contato1: '',
    contato2: '',

    // Outros
    observacao: ''
  });

  // Funções de Máscara
  const maskCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const maskCEP = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{3})\d+?$/, '$1');
  };

  const maskPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (name === 'cpf') finalValue = maskCPF(value);
    if (name === 'cep') finalValue = maskCEP(value);
    if (name === 'contato1' || name === 'contato2') finalValue = maskPhone(value);

    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Dados do Professor:', formData);
    if (onSave) onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fadeIn">
      
      {/* Header do Formulário */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">
            Novo Professor (Parceiro)
          </h3>
          <p className="text-slate-500 text-sm font-medium">Preencha os dados completos para o vínculo.</p>
        </div>
        {onCancel && (
          <button 
            type="button" 
            onClick={onCancel}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Seção 1: Dados Pessoais */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600 border-b border-slate-50 pb-2">
          <User size={18} />
          <h4 className="text-xs font-black uppercase tracking-wider">Dados Pessoais & Vínculo</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Polo/Unidade <span className="text-red-500">*</span></label>
            <select 
              name="polo"
              value={formData.polo || 'matriz'}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all cursor-pointer"
            >
              <option value="matriz">Matriz - Aracaju</option>
              <option value="estancia">Polo Estância</option>
            </select>
          </div>

          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Completo <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="nomeCompleto"
              value={formData.nomeCompleto}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
              placeholder="Ex: Dr. Roberto Santos"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="cpf"
              value={formData.cpf}
              onChange={handleChange}
              maxLength={14}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-mono focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
              placeholder="000.000.000-00"
              required
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Endereço */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600 border-b border-slate-50 pb-2">
          <MapPin size={18} />
          <h4 className="text-xs font-black uppercase tracking-wider">Endereço Completo</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">CEP <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="cep"
              value={formData.cep}
              onChange={handleChange}
              maxLength={9}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="00000-000"
              required
            />
          </div>

          <div className="md:col-span-3 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Endereço (Rua/Av) <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="endereco"
              value={formData.endereco}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="Nome da rua"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Número <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="numero"
              value={formData.numero}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="123"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Complemento</label>
            <input 
              type="text" 
              name="complemento"
              value={formData.complemento}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="Apto, Bloco..."
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Bairro <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="bairro"
              value={formData.bairro}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="Bairro"
              required
            />
          </div>

          <div className="md:col-span-3 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Cidade <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="cidade"
              value={formData.cidade}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="Nome da cidade"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">UF <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              name="uf"
              value={formData.uf}
              onChange={handleChange}
              maxLength={2}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all uppercase text-center"
              placeholder="SE"
              required
            />
          </div>
        </div>
      </div>

      {/* Seção 3: Contatos */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600 border-b border-slate-50 pb-2">
          <Phone size={18} />
          <h4 className="text-xs font-black uppercase tracking-wider">Contatos e Acesso</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex items-center gap-2">
              <Mail size={14} /> E-mail Válido <span className="text-red-500">*</span>
            </label>
            <input 
              type="email" 
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="professor@email.com"
              required
            />
            <p className="text-[10px] text-slate-400 flex items-center gap-1 pl-1">
              <AlertCircle size={10} /> O acesso ao portal do professor será enviado para este e-mail.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Celular / WhatsApp (Principal) <span className="text-red-500">*</span></label>
            <input 
              type="tel" 
              name="contato1"
              value={formData.contato1}
              onChange={handleChange}
              maxLength={15}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="(00) 00000-0000"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Especialidade (Opcional)</label>
            <input 
              type="text" 
              name="especialidade"
              value={formData.especialidade}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="Ex: Enfermagem, Administração..."
            />
          </div>
        </div>
      </div>

      {/* Seção 4: Observações */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600 border-b border-slate-50 pb-2">
          <FileText size={18} />
          <h4 className="text-xs font-black uppercase tracking-wider">Observações (Opcional)</h4>
        </div>
        <div>
          <textarea 
            name="observacao"
            value={formData.observacao}
            onChange={handleChange}
            rows={4}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all resize-none"
            placeholder="Observações adicionais ou notas internas..."
          ></textarea>
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          className="px-8 py-3 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Save size={16} /> Salvar Professor
        </button>
      </div>
    </form>
  );
};

export default ParceiroProfessorForm;
