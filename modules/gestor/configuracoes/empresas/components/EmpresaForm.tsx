import React, { useState, useRef } from 'react';
import { Upload, Save, X, Building, MapPin, Phone, Mail, FileText, RefreshCw, Search, Loader2, AlertCircle } from 'lucide-react';
import { empresasService } from '../empresas.service';

interface EmpresaFormProps {
  initialData?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const EmpresaForm: React.FC<EmpresaFormProps> = ({ initialData, onSave, onCancel }) => {
  const maskCNPJ = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
  const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');

  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        nomeFantasia: initialData.nomeFantasia || '',
        razaoSocial: initialData.razaoSocial || '',
        cnpj: initialData.cnpj ? maskCNPJ(initialData.cnpj) : '',
        inscricaoMunicipal: initialData.inscricaoMunicipal || '',
        cep: initialData.cep ? maskCEP(initialData.cep) : '',
        endereco: initialData.endereco || '',
        numero: initialData.numero || '',
        complemento: initialData.complemento || '',
        bairro: initialData.bairro || '',
        cidade: initialData.cidade || '',
        uf: initialData.uf || '',
        telefone: initialData.telefone ? maskPhone(initialData.telefone) : '',
        email: initialData.email || '',
        site: initialData.site || '',
        tipo: initialData.tipo || 'Filial',
        logoUrl: initialData.logoUrl || '',
        id: initialData.id
      };
    }
    return {
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
      tipo: 'Filial',
      logoUrl: ''
    };
  });

  const [uploading, setUploading] = useState(false);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const publicUrl = await empresasService.uploadLogo(file);
      setFormData(prev => ({ ...prev, logoUrl: publicUrl }));
    } catch (error: any) {
      alert(`Erro ao fazer upload da logo: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const consultarCNPJ = async () => {
    const cleanCnpj = formData.cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      setCnpjError('O CNPJ deve conter 14 dígitos.');
      return;
    }
    
    setIsSearchingCnpj(true);
    setCnpjError('');
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!res.ok) {
        throw new Error('CNPJ não encontrado ou indisponível.');
      }
      const data = await res.json();
      
      const logradouroCompleto = [data.descricao_tipo_de_logradouro, data.logradouro]
        .filter(Boolean)
        .join(' ');

      let phoneVal = '';
      if (data.ddd_telefone_1) {
        phoneVal = data.ddd_telefone_1;
      } else if (data.ddd_telefone_2) {
        phoneVal = data.ddd_telefone_2;
      }
      
      if (phoneVal && /^\d+$/.test(phoneVal)) {
        if (phoneVal.length === 10) {
          phoneVal = `(${phoneVal.substring(0, 2)}) ${phoneVal.substring(2, 6)}-${phoneVal.substring(6)}`;
        } else if (phoneVal.length === 11) {
          phoneVal = `(${phoneVal.substring(0, 2)}) ${phoneVal.substring(2, 7)}-${phoneVal.substring(7)}`;
        }
      }

      setFormData(prev => ({
        ...prev,
        razaoSocial: (data.razao_social || '').toUpperCase(),
        nomeFantasia: (data.nome_fantasia || '').toUpperCase(),
        cep: data.cep ? maskCEP(data.cep) : prev.cep,
        endereco: logradouroCompleto ? logradouroCompleto.toUpperCase() : prev.endereco,
        numero: (data.numero || '').toUpperCase(),
        complemento: (data.complemento || '').toUpperCase(),
        bairro: (data.bairro || '').toUpperCase(),
        cidade: (data.municipio || '').toUpperCase(),
        uf: (data.uf || '').toUpperCase(),
        email: (data.email || '').toLowerCase(),
        telefone: phoneVal ? maskPhone(phoneVal) : prev.telefone,
      }));
    } catch (err: any) {
      console.error(err);
      setCnpjError('CNPJ não encontrado ou erro na busca.');
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          endereco: (data.logradouro || '').toUpperCase(),
          bairro: (data.bairro || '').toUpperCase(),
          cidade: (data.localidade || '').toUpperCase(),
          uf: (data.uf || '').toUpperCase(),
        }));
      }
    } catch (err) {
      console.error('Erro ao consultar CEP:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (e.target.tagName === 'INPUT') {
      const type = (e.target as HTMLInputElement).type;
      if (type === 'text') {
        if (name !== 'email' && name !== 'logoUrl' && name !== 'site') {
          finalValue = value.toUpperCase();
        }
      }
    }

    if (name === 'cnpj') finalValue = maskCNPJ(finalValue);
    if (name === 'cep') finalValue = maskCEP(finalValue);
    if (name === 'telefone') finalValue = maskPhone(finalValue);

    setFormData(prev => ({ ...prev, [name]: finalValue }));
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
          <input 
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/png, image/jpeg, image/jpg"
            onChange={handleLogoChange}
          />
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center text-center p-6 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden"
          >
            {uploading ? (
              <div className="flex flex-col items-center">
                <RefreshCw size={32} className="animate-spin text-blue-500 mb-2" />
                <p className="text-sm font-bold text-slate-500">Enviando imagem...</p>
              </div>
            ) : formData.logoUrl ? (
              <>
                <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain p-4 bg-white rounded-2xl" />
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity">
                  <Upload size={24} className="mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider">Alterar Logotipo</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 group-hover:text-blue-500 mb-4 transition-colors">
                  <Upload size={24} />
                </div>
                <p className="text-sm font-bold text-[#001a33]">Clique para enviar</p>
                <p className="text-xs text-slate-400 mt-1">Recomendado: 500x500px (PNG)</p>
              </>
            )}
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
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    maxLength={18}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all font-mono"
                    placeholder="00.000.000/0000-00"
                  />
                  <button
                    type="button"
                    onClick={consultarCNPJ}
                    disabled={isSearchingCnpj || formData.cnpj.replace(/\D/g, '').length !== 14}
                    className="px-4 bg-slate-900 hover:bg-[#001a33] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                    title="Consultar dados da empresa na Receita Federal"
                  >
                    {isSearchingCnpj ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Search size={14} />
                    )}
                    <span>Consultar</span>
                  </button>
                </div>
                {cnpjError && (
                  <p className="text-[11px] font-bold text-red-500 mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn">
                    <AlertCircle size={10} />
                    {cnpjError}
                  </p>
                )}
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
                  onBlur={handleCepBlur}
                  maxLength={9}
                  placeholder="00000-000"
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
                  maxLength={15}
                  placeholder="(00) 00000-0000"
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
