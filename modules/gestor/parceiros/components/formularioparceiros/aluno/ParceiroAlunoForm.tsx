
// File: modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx

import React, { useState } from 'react';
import { User, MapPin, Phone, Mail, Save, X, AlertCircle, FileText, CheckCircle2, BookOpen } from 'lucide-react';

interface ParceiroAlunoFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const ParceiroAlunoForm: React.FC<ParceiroAlunoFormProps> = ({ onCancel, onSave }) => {
  const [showMatriculaModal, setShowMatriculaModal] = useState(false);
  const [formData, setFormData] = useState({
    // Dados Pessoais
    polo: 'matriz',
    nomeCompleto: '',
    cpf: '',
    
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
    console.log('Dados do Aluno:', formData);
    setShowMatriculaModal(true);
  };
  
  const handleFinalize = (matricularAgora: boolean) => {
    if (onSave) onSave({ ...formData, matricularAgora });
    setShowMatriculaModal(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fadeIn">
      
      {/* Header do Formulário */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">
            Novo Aluno (Parceiro)
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
              placeholder="Ex: João da Silva"
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
          <h4 className="text-xs font-black uppercase tracking-wider">Contatos</h4>
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
              placeholder="exemplo@email.com"
              required
            />
            <p className="text-[10px] text-slate-400 flex items-center gap-1 pl-1">
              <AlertCircle size={10} /> O boleto e acesso serão enviados para este e-mail.
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
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone Recado (Opcional)</label>
            <input 
              type="tel" 
              name="contato2"
              value={formData.contato2}
              onChange={handleChange}
              maxLength={15}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] focus:border-blue-500 outline-none transition-all"
              placeholder="(00) 00000-0000"
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
            placeholder="Observações adicionais internas..."
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
          <Save size={16} /> Salvar Aluno
        </button>
      </div>

      {/* Modal de Confirmação para Matrícula */}
      {showMatriculaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl relative border border-slate-100">
             <button 
               type="button" 
               onClick={() => setShowMatriculaModal(false)}
               className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
             >
                <X size={20} />
             </button>
             
             <div className="flex flex-col items-center text-center">
               <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
                 <CheckCircle2 size={40} />
               </div>
               <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight mb-2">
                 Cadastro Finalizado
               </h3>
               <p className="text-slate-500 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
                 O aluno <strong>{formData.nomeCompleto || 'novo'}</strong> foi cadastrado com sucesso. Deseja prosseguir com a matrícula do aluno em alguma turma agora?
               </p>
               
               <div className="flex flex-col gap-3 w-full">
                 <button
                   type="button"
                   onClick={() => handleFinalize(true)}
                   className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold rounded-xl uppercase tracking-wider text-sm transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                 >
                   <BookOpen size={18} /> Sim, Matricular Agora
                 </button>
                 <button
                   type="button"
                   onClick={() => handleFinalize(false)}
                   className="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl uppercase tracking-wider text-sm transition-colors border border-slate-200"
                 >
                   Não, Concluir Cadastro
                 </button>
               </div>
             </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default ParceiroAlunoForm;
