// File: modules/gestor/parceiros/components/formularioparceiros/pj/ParceiroPJForm.tsx
// Formulário completo de Pessoa Jurídica (Empresa / Convenio) — Layout de Página Única

import React, { useState } from 'react';
import {
  Building, MapPin, Phone, Mail, Save, X, FileText, User,
  AlertCircle, CheckCircle2, Handshake, Upload, Loader2, Search, Plus
} from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';

interface ParceiroPJFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const PRESET_CATEGORIES = [
  'CONVÊNIO DE ESTÁGIO',
  'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
  'FACULDADE PARCEIRA / AFILIADO',
  'PREFEITURA / ÓRGÃO PÚBLICO',
  'ONG / ASSOCIAÇÃO',
  'SINDICATO',
  'FORNECEDOR',
  'EMPRESA PRIVADA',
];

const ParceiroPJForm: React.FC<ParceiroPJFormProps> = ({ onCancel, onSave }) => {
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
  
  // Custom Category States
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('CONVÊNIO DE ESTÁGIO');

  const [formData, setFormData] = useState({
    // Empresa
    polo: 'geral',
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    tipoPj: '',
    tipoConvenio: '',
    foto: '',

    // Contato / Representante
    responsavelNome: '',
    responsavelCpf: '',
    responsavelCargo: '',
    responsavelEmail: '',
    responsavelTelefone: '',

    // Endereço & Contato Geral
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    email: '',
    telefone: '',
    observacoes: '',
  });

  const maskCNPJ = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCPF = (v: string) => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
  const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData(prev => ({ ...prev, foto: url }));
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao fazer upload da logo: ${err.message || err}`);
    } finally {
      setIsUploadingLogo(false);
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
        logradouro: logradouroCompleto ? logradouroCompleto.toUpperCase() : prev.logradouro,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue = value;
    if (type === 'text' || type === 'textarea' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (name !== 'email' && name !== 'responsavelEmail') {
        finalValue = value.toUpperCase();
      }
    }
    if (name === 'cnpj') finalValue = maskCNPJ(finalValue);
    if (name === 'responsavelCpf') finalValue = maskCPF(finalValue);
    if (name === 'cep') finalValue = maskCEP(finalValue);
    if (name === 'telefone' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
    setFormData(prev => ({ ...prev, [name]: finalValue }));
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
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || '',
        }));
      }
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = showCustomCategory ? customCategory.trim().toUpperCase() : selectedCategory;
    
    if (onSave) onSave({
      ...formData,
      nome: formData.razaoSocial,
      nomeCompleto: formData.razaoSocial,
      cpf_cnpj: formData.cnpj,
      cpf: formData.cnpj,
      endereco: formData.logradouro,
      contato1: formData.telefone,
      observacao: formData.observacoes,
      tipoPj: finalCategory,      // unificado para compatibilidade
      tipoConvenio: finalCategory, // unificado para compatibilidade
      responsavelCargo: formData.responsavelCargo,
      foto: formData.foto
    });
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-slate-700 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
  const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';
  const sectionTitleCls = 'text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2';

  return (
    <div className="animate-fadeIn max-h-[85vh] overflow-y-auto px-1 pr-3">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-5 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Parceiro PJ</h3>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Empresa, Prefeitura ou Entidade</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* ══════════════ SEÇÃO 1: DADOS DA EMPRESA ══════════════ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm">
          <div className={sectionTitleCls}>
            <Building size={16} />
            <span>Dados da Empresa / Entidade</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>CNPJ <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={handleChange}
                  maxLength={18}
                  className={`${inputCls} font-mono flex-grow`}
                  placeholder="00.000.000/0000-00"
                  required
                />
                <button
                  type="button"
                  onClick={consultarCNPJ}
                  disabled={isSearchingCnpj || formData.cnpj.replace(/\D/g, '').length !== 14}
                  className="px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
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
              <label className={labelCls}>Polo/Unidade Vínculo</label>
              <select name="polo" value={formData.polo} onChange={handleChange} className={inputCls}>
                <option value="geral">Geral (Todos os Polos)</option>
                <option value="matriz">Matriz — Aracaju</option>
                <option value="estancia">Polo Estância</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Logo da Empresa / Parceira</label>
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="h-16 w-28 bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                  {formData.foto ? (
                    <img src={formData.foto} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <Building className="text-slate-350" size={24} />
                  )}
                </div>
                <div className="flex-grow space-y-2">
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold uppercase cursor-pointer transition-colors border border-slate-200 shadow-sm">
                    {isUploadingLogo ? (
                      <>
                        <Loader2 className="animate-spin text-slate-500" size={14} />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        <span>Upload da Logo</span>
                      </>
                    )}
                    <input 
                      type="file" 
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                  </label>
                  {formData.foto && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, foto: '' }))}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-widest block mx-auto text-center"
                    >
                      Remover Logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Razão Social <span className="text-red-500">*</span></label>
              <input type="text" name="razaoSocial" value={formData.razaoSocial} onChange={handleChange}
                className={inputCls} placeholder="Razão Social Completa" required />
            </div>

            <div>
              <label className={labelCls}>Nome Fantasia</label>
              <input type="text" name="nomeFantasia" value={formData.nomeFantasia} onChange={handleChange}
                className={inputCls} placeholder="Nome Fantasia" />
            </div>

            <div>
              <label className={labelCls}>Classificação / Tipo de Parceria</label>
              <div className="flex gap-2">
                {!showCustomCategory ? (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={`${inputCls} flex-grow`}
                  >
                    {PRESET_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value.toUpperCase())}
                    placeholder="DIGITE O TIPO DE PARCERIA (EX: AFILIADO EAD)"
                    className={`${inputCls} flex-grow`}
                    required
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomCategory(!showCustomCategory);
                    setCustomCategory('');
                  }}
                  className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center shadow-sm"
                  title={showCustomCategory ? "Escolher da lista existente" : "Cadastrar novo tipo de parceria"}
                >
                  {showCustomCategory ? <X size={16} /> : <Plus size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════ SEÇÃO 2: ENDEREÇO & CONTATO GERAL ══════════════ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm">
          <div className={sectionTitleCls}>
            <MapPin size={16} />
            <span>Endereço e Contato Institucional</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className={labelCls}>CEP</label>
              <input type="text" name="cep" value={formData.cep} onChange={handleChange} onBlur={handleCepBlur}
                maxLength={9} className={inputCls} placeholder="00000-000" />
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Logradouro</label>
              <input type="text" name="logradouro" value={formData.logradouro} onChange={handleChange}
                className={inputCls} placeholder="Rua / Avenida" />
            </div>

            <div>
              <label className={labelCls}>Número</label>
              <input type="text" name="numero" value={formData.numero} onChange={handleChange}
                className={inputCls} placeholder="123" />
            </div>

            <div>
              <label className={labelCls}>Complemento</label>
              <input type="text" name="complemento" value={formData.complemento} onChange={handleChange}
                className={inputCls} placeholder="Sala, Andar..." />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Bairro</label>
              <input type="text" name="bairro" value={formData.bairro} onChange={handleChange}
                className={inputCls} placeholder="Bairro" />
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Cidade</label>
              <input type="text" name="cidade" value={formData.cidade} onChange={handleChange}
                className={inputCls} placeholder="Nome da cidade" />
            </div>

            <div>
              <label className={labelCls}>UF</label>
              <select name="uf" value={formData.uf} onChange={handleChange} className={inputCls}>
                <option value="">UF</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>E-mail Geral / Institucional</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                className={inputCls} placeholder="contato@empresa.com" />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Telefone Comercial Principal</label>
              <input type="text" name="telefone" value={formData.telefone} onChange={handleChange}
                maxLength={15} className={inputCls} placeholder="(00) 0000-0000" />
            </div>

            <div className="md:col-span-4">
              <label className={labelCls}><FileText size={12} className="inline mr-1" />Observações da Parceria</label>
              <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-slate-600 outline-none transition-all resize-none" placeholder="Condições, validade, observações de convênio..." />
            </div>
          </div>
        </div>

        {/* ══════════════ SEÇÃO 3: CONTATO / REPRESENTANTE LEGAL ══════════════ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm">
          <div className={sectionTitleCls}>
            <User size={16} />
            <span>Contato / Representante Legal</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>Nome do Representante / Contato</label>
              <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={handleChange}
                className={inputCls} placeholder="Nome completo do contato da empresa" />
            </div>

            <div>
              <label className={labelCls}>CPF do Representante / Contato</label>
              <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={handleChange}
                maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" />
            </div>

            <div>
              <label className={labelCls}>Cargo / Função</label>
              <input type="text" name="responsavelCargo" value={formData.responsavelCargo} onChange={handleChange}
                className={inputCls} placeholder="Ex: Diretor(a), Representante Legal, Coordenador(a)..." />
            </div>

            <div>
              <label className={labelCls}>E-mail do Representante / Contato</label>
              <input type="email" name="responsavelEmail" value={formData.responsavelEmail} onChange={handleChange}
                className={inputCls} placeholder="contato.responsavel@empresa.com" />
            </div>

            <div>
              <label className={labelCls}>Telefone do Representante / Contato</label>
              <input type="text" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={handleChange}
                maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-slate-900/20 transition-all"
          >
            <Save size={16} /> Salvar Parceiro PJ
          </button>
        </div>
      </form>
    </div>
  );
};

export default ParceiroPJForm;
