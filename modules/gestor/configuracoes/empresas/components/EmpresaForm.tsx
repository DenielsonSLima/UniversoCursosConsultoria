
import React, { useState } from 'react';
import { Upload, Save, X, Building, MapPin, Phone, Mail, FileText } from 'lucide-react';

interface EmpresaFormProps {
  initialData?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const EmpresaForm: React.FC<EmpresaFormProps> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState(initialData || {
    nomeFantasia: '',
    razaoSocial: '',
    cnpj: '',
    inscricaoMunicipal: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    telefone: '',
    email: '',
    site: '',
    tipo: 'Filial'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 animate-fadeIn">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">
            {initialData ? 'Editar Unidade' : 'Nova Unidade'}
          </h3>
          <p className="text-slate-500 text-sm">Preencha os dados cadastrais do polo.</p>
        </div>
        <button 
          type="button" 
          onClick={onCancel}
          className="p-2 rounded-full bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Coluna da Logo */}
        <div className="lg:col-span-1">
          <label className="block text-xs font-bold text-[#001a33] uppercase tracking-wider mb-2">Logotipo da Unidade</label>
          <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center text-center p-6 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer group">
            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 group-hover:text-blue-500 mb-4 transition-colors">
              <Upload size={24} />
            </div>
            <p className="text-sm font-bold text-[#001a33]">Clique para enviar</p>
            <p className="text-xs text-slate-400 mt-1">Recomendado: 500x500px (PNG)</p>
          </div>
        </div>

        {/* Coluna dos Campos */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Dados Gerais */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-blue-600">
              <Building size={18} />
              <h4 className="text-sm font-black uppercase tracking-wider">Identificação</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Fantasia</label>
                <input 
                  type="text" 
                  name="nomeFantasia"
                  value={formData.nomeFantasia}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all"
                  placeholder="Ex: Universo Cursos - Polo Japoatã"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Razão Social</label>
                <input 
                  type="text" 
                  name="razaoSocial"
                  value={formData.razaoSocial}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CNPJ</label>
                <input 
                  type="text" 
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Unidade</label>
                <select 
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all cursor-pointer"
                >
                  <option value="Matriz">Matriz</option>
                  <option value="Filial">Filial</option>
                </select>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-blue-600 border-t border-slate-100 pt-6">
              <MapPin size={18} />
              <h4 className="text-sm font-black uppercase tracking-wider">Localização</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CEP</label>
                <input 
                  type="text" 
                  name="cep"
                  value={formData.cep}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Endereço</label>
                <input 
                  type="text" 
                  name="endereco"
                  value={formData.endereco}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Número</label>
                <input 
                  type="text" 
                  name="numero"
                  value={formData.numero}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bairro</label>
                <input 
                  type="text" 
                  name="bairro"
                  value={formData.bairro}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
               <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cidade</label>
                <input 
                  type="text" 
                  name="cidade"
                  value={formData.cidade}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
               <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estado (UF)</label>
                <input 
                  type="text" 
                  name="uf"
                  value={formData.uf}
                  onChange={handleChange}
                  maxLength={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all uppercase"
                />
              </div>
            </div>
          </div>

          {/* Contato */}
          <div>
            <div className="flex items-center gap-2 mb-4 text-blue-600 border-t border-slate-100 pt-6">
              <Phone size={18} />
              <h4 className="text-sm font-black uppercase tracking-wider">Contato</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone / WhatsApp</label>
                <input 
                  type="text" 
                  name="telefone"
                  value={formData.telefone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail Institucional</label>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-100">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-8 py-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          className="px-8 py-4 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 transition-all transform active:scale-95 flex items-center gap-2"
        >
          <Save size={18} />
          Salvar Dados
        </button>
      </div>
    </form>
  );
};

export default EmpresaForm;
