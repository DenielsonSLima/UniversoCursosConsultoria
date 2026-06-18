// File: modules/gestor/parceiros/components/formularioparceiros/professor/ParceiroProfessorForm.tsx
// Formulário completo de Professor em 4 etapas (Wizard)

import React, { useState, useEffect } from 'react';
import {
  User, MapPin, Phone, Mail, Save, X, AlertCircle, FileText,
  GraduationCap, Briefcase, DollarSign, ChevronRight, ChevronLeft,
  CheckCircle2, Shield, Plus, Camera, Upload, Loader2
} from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { parceirosService } from '../../../parceiros.service';

interface ParceiroProfessorFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const STEPS = [
  { id: 1, label: 'Dados Pessoais', icon: User, color: 'purple' },
  { id: 2, label: 'Formação', icon: GraduationCap, color: 'indigo' },
  { id: 3, label: 'Financeiro', icon: DollarSign, color: 'emerald' },
  { id: 4, label: 'Endereço & Contato', icon: MapPin, color: 'violet' },
];

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const PRESET_TITULACOES = ['GRADUAÇÃO', 'ESPECIALIZAÇÃO', 'MESTRADO', 'DOUTORADO', 'PÓS-DOUTORADO'];
const REGISTROS = ['CRM','COREN','CRO','CRN','CRP','CRF','CREA','CRC','OAB','CREFITO','Não possui'];
const PRESET_VINCULOS = ['CLT', 'PJ', 'AUTÔNOMO', 'VOLUNTÁRIO', 'CONTRATO'];
const BANCOS = [
  'Banco do Brasil', 'Caixa Econômica Federal', 'Bradesco', 'Itaú', 'Santander',
  'Nubank', 'Inter', 'Sicoob', 'Sicredi', 'BTG Pactual', 'Outro'
];

const ParceiroProfessorForm: React.FC<ParceiroProfessorFormProps> = ({ onCancel, onSave }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [polosList, setPolosList] = useState<any[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  useEffect(() => {
    const fetchPolos = async () => {
      try {
        const data = await parceirosService.getPolos();
        setPolosList(data);
      } catch (err) {
        console.error('Erro ao buscar polos:', err);
      }
    };
    fetchPolos();
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData(prev => ({ ...prev, foto: url }));
    } catch (err: any) {
      alert('Erro ao enviar foto: ' + (err.message || err));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Dynamic category states
  const [showCustomTitulacao, setShowCustomTitulacao] = useState(false);
  const [customTitulacao, setCustomTitulacao] = useState('');
  const [selectedTitulacao, setSelectedTitulacao] = useState('');

  const [showCustomVinculo, setShowCustomVinculo] = useState(false);
  const [customVinculo, setCustomVinculo] = useState('');
  const [selectedVinculo, setSelectedVinculo] = useState('');

  const [formData, setFormData] = useState({
    // Step 1 — Dados Pessoais
    polo: 'matriz',
    poloIds: [] as string[],
    foto: '',
    nomeCompleto: '',
    cpf: '',
    dataNascimento: '',
    sexo: '',
    rg: '',
    orgaoEmissor: '',

    // Step 2 — Formação Acadêmica
    titulacao: '',
    areaFormacao: '',
    instituicaoFormacao: '',
    especialidade: '',
    registroProfissional: '',
    numeroRegistro: '',

    // Step 3 — Financeiro & Vínculo
    tipoVinculo: '',
    chavePix: '',
    banco: '',
    agencia: '',
    conta: '',
    tipoConta: 'Corrente',

    // Step 4 — Endereço & Contato
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    email: '',
    contato1: '',
    contato2: '',
    observacao: '',
  });

  const maskCPF = (v: string) => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
  const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');
  const maskDate = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\/\d{4})\d+?$/,'$1');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue = value;
    if (type === 'text' || type === 'textarea' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (name !== 'email') {
        finalValue = value.toUpperCase();
      }
    }
    if (name === 'cpf') finalValue = maskCPF(finalValue);
    if (name === 'cep') finalValue = maskCEP(finalValue);
    if (name === 'contato1' || name === 'contato2') finalValue = maskPhone(finalValue);
    if (name === 'dataNascimento') finalValue = maskDate(finalValue);
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
          endereco: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || '',
        }));
      }
    } catch {}
  };

  const stepValid = () => {
    if (currentStep === 1) return formData.nomeCompleto.trim() !== '' && formData.cpf.length === 14;
    if (currentStep === 4) return formData.email.trim() !== '' && formData.contato1.length >= 14;
    return true;
  };

  const handleNext = () => { if (stepValid() && currentStep < 4) setCurrentStep(s => s + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(s => s - 1); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitulacao = showCustomTitulacao ? customTitulacao.trim().toUpperCase() : selectedTitulacao;
    const finalVinculo = showCustomVinculo ? customVinculo.trim().toUpperCase() : selectedVinculo;
    if (onSave) onSave({
      ...formData,
      titulacao: finalTitulacao,
      tipoVinculo: finalVinculo,
    });
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-purple-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
  const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-5 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Professor</h3>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Cadastro completo de vínculo docente</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-100 z-0" />
        {STEPS.map((step) => {
          const Icon = step.icon;
          const done = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <div key={step.id} className="flex flex-col items-center gap-2 z-10 flex-1">
              <button
                type="button"
                onClick={() => done && setCurrentStep(step.id)}
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  done ? 'bg-emerald-500 border-emerald-500 text-white cursor-pointer' :
                  active ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/30' :
                  'bg-white border-slate-200 text-slate-400 cursor-default'
                }`}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={16} />}
              </button>
              <span className={`text-[9px] font-black uppercase tracking-wider text-center leading-tight ${
                active ? 'text-purple-600' : done ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit}>
        {/* ══════════════ STEP 1: DADOS PESSOAIS ══════════════ */}
        {currentStep === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-purple-600 border-b border-slate-100 pb-2 mb-5">
              <User size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Dados Pessoais & Identificação</h4>
            </div>

            {/* Foto Upload */}
            <div className="flex flex-col md:flex-row gap-6 items-center bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-5">
              <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 relative overflow-hidden group shrink-0">
                {formData.foto ? (
                  <img src={formData.foto} alt="Prévia da Foto" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <User size={40} />
                  </div>
                )}
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                    <Loader2 size={24} className="animate-spin" />
                  </div>
                )}
              </div>
              <div className="space-y-2 text-left w-full">
                <h5 className="text-sm font-bold text-[#001a33] uppercase">Foto do Professor</h5>
                <p className="text-xs text-slate-400">Envie uma foto recente de identificação (JPG, PNG).</p>
                <div className="flex gap-2">
                  <label className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-purple-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-purple-600/10">
                    <Upload size={14} />
                    Selecionar Foto
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
                  </label>
                  {formData.foto && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, foto: '' }))}
                      className="px-4 py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-colors"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Polo Multi-select */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5">Polos / Unidades Vinculadas (Selecione um ou mais) <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-3 mt-2">
                {polosList.length > 0 ? (
                  polosList.map((poloItem) => {
                    const isSelected = formData.poloIds.includes(poloItem.id);
                    return (
                      <button
                        type="button"
                        key={poloItem.id}
                        onClick={() => {
                          const isAlreadySelected = formData.poloIds.includes(poloItem.id);
                          let newPoloIds = [];
                          if (isAlreadySelected) {
                            newPoloIds = formData.poloIds.filter(id => id !== poloItem.id);
                          } else {
                            newPoloIds = [...formData.poloIds, poloItem.id];
                          }
                          const firstPolo = newPoloIds[0] || '';
                          const poloKey = firstPolo === '44444444-4444-4444-4444-444444444444' 
                            ? 'matriz' 
                            : (firstPolo === '55555555-5555-5555-5555-555555555555' ? 'estancia' : 'matriz');
                          
                          setFormData(prev => ({
                            ...prev,
                            poloIds: newPoloIds,
                            polo: poloKey
                          }));
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/10'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {poloItem.nome}
                      </button>
                    );
                  })
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const isAlreadySelected = formData.poloIds.includes('44444444-4444-4444-4444-444444444444');
                        let newPoloIds = isAlreadySelected 
                          ? formData.poloIds.filter(id => id !== '44444444-4444-4444-4444-444444444444')
                          : [...formData.poloIds, '44444444-4444-4444-4444-444444444444'];
                        setFormData(prev => ({ ...prev, poloIds: newPoloIds, polo: 'matriz' }));
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                        formData.poloIds.includes('44444444-4444-4444-4444-444444444444')
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Matriz — Aracaju
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const isAlreadySelected = formData.poloIds.includes('55555555-5555-5555-5555-555555555555');
                        let newPoloIds = isAlreadySelected 
                          ? formData.poloIds.filter(id => id !== '55555555-5555-5555-5555-555555555555')
                          : [...formData.poloIds, '55555555-5555-5555-5555-555555555555'];
                        setFormData(prev => ({ ...prev, poloIds: newPoloIds, polo: 'estancia' }));
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                        formData.poloIds.includes('55555555-5555-5555-5555-555555555555')
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Polo Estância
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

              <div className="md:col-span-2">
                <label className={labelCls}>Nome Completo <span className="text-red-500">*</span></label>
                <input type="text" name="nomeCompleto" value={formData.nomeCompleto} onChange={handleChange}
                  className={inputCls} placeholder="Ex: Dr. Roberto Santos" required />
              </div>

              <div>
                <label className={labelCls}>CPF <span className="text-red-500">*</span></label>
                <input type="text" name="cpf" value={formData.cpf} onChange={handleChange}
                  maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" required />
              </div>

              <div>
                <label className={labelCls}>Data de Nascimento</label>
                <input type="text" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange}
                  maxLength={10} className={inputCls} placeholder="DD/MM/AAAA" />
              </div>

              <div>
                <label className={labelCls}>Sexo</label>
                <select name="sexo" value={formData.sexo} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  <option value="MASCULINO">MASCULINO</option>
                  <option value="FEMININO">FEMININO</option>
                  <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                  <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>RG</label>
                <input type="text" name="rg" value={formData.rg} onChange={handleChange}
                  className={inputCls} placeholder="Número do RG" />
              </div>

              <div>
                <label className={labelCls}>Órgão Emissor</label>
                <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor} onChange={handleChange}
                  className={inputCls} placeholder="SSP/SE" />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 2: FORMAÇÃO ══════════════ */}
        {currentStep === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-indigo-600 border-b border-slate-100 pb-2 mb-5">
              <GraduationCap size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Formação Acadêmica & Registro Profissional</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>Titulação <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {!showCustomTitulacao ? (
                    <select
                      value={selectedTitulacao}
                      onChange={(e) => setSelectedTitulacao(e.target.value)}
                      className={`${inputCls} flex-grow`}
                    >
                      <option value="">Selecione a titulação...</option>
                      {PRESET_TITULACOES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={customTitulacao}
                      onChange={(e) => setCustomTitulacao(e.target.value.toUpperCase())}
                      placeholder="EX: TECNOLÓLOGO, LICENCIATURA..."
                      className={`${inputCls} flex-grow`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowCustomTitulacao(!showCustomTitulacao); setCustomTitulacao(''); }}
                    className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center shadow-sm"
                    title={showCustomTitulacao ? 'Escolher da lista' : 'Informar outra titulação'}
                  >
                    {showCustomTitulacao ? <X size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls}>Área de Formação <span className="text-red-500">*</span></label>
                <input type="text" name="areaFormacao" value={formData.areaFormacao} onChange={handleChange}
                  className={inputCls} placeholder="Ex: Enfermagem, Administração..." />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Instituição de Formação</label>
                <input type="text" name="instituicaoFormacao" value={formData.instituicaoFormacao} onChange={handleChange}
                  className={inputCls} placeholder="Nome da universidade / faculdade" />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Especialidade / Disciplinas que Leciona</label>
                <input type="text" name="especialidade" value={formData.especialidade} onChange={handleChange}
                  className={inputCls} placeholder="Ex: Anatomia, Microbiologia, Gestão..." />
              </div>

              <div>
                <label className={labelCls}>Conselho / Registro Profissional</label>
                <select name="registroProfissional" value={formData.registroProfissional} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  {REGISTROS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Número do Registro</label>
                <input type="text" name="numeroRegistro" value={formData.numeroRegistro} onChange={handleChange}
                  className={inputCls} placeholder="Ex: COREN-SE 123456" />
              </div>
            </div>

            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 flex items-start gap-3">
              <AlertCircle size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-indigo-700 font-medium">
                Para cursos na área da saúde (Enfermagem, Radiologia, etc.), o registro profissional ativo no respectivo conselho é obrigatório para ministrar aulas práticas.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 3: FINANCEIRO ══════════════ */}
        {currentStep === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-emerald-600 border-b border-slate-100 pb-2 mb-5">
              <DollarSign size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Tipo de Vínculo & Dados para Pagamento</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}>Tipo de Vínculo <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {!showCustomVinculo ? (
                    <select
                      value={selectedVinculo}
                      onChange={(e) => setSelectedVinculo(e.target.value)}
                      className={`${inputCls} flex-grow`}
                    >
                      <option value="">Selecione...</option>
                      {PRESET_VINCULOS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={customVinculo}
                      onChange={(e) => setCustomVinculo(e.target.value.toUpperCase())}
                      placeholder="DESCREVA O TIPO DE VÍNCULO"
                      className={`${inputCls} flex-grow`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowCustomVinculo(!showCustomVinculo); setCustomVinculo(''); }}
                    className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center shadow-sm"
                    title={showCustomVinculo ? 'Escolher da lista' : 'Informar outro tipo de vínculo'}
                  >
                    {showCustomVinculo ? <X size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="h-px bg-slate-100 my-2" />
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Dados para pagamento (PIX ou Transferência)</p>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Chave PIX</label>
                <input type="text" name="chavePix" value={formData.chavePix} onChange={handleChange}
                  className={inputCls} placeholder="CPF, telefone, e-mail ou chave aleatória" />
              </div>

              <div className="md:col-span-2">
                <div className="h-px bg-slate-100 my-1" />
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Ou dados bancários</p>
              </div>

              <div>
                <label className={labelCls}>Banco</label>
                <select name="banco" value={formData.banco} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione o banco...</option>
                  {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Tipo de Conta</label>
                <select name="tipoConta" value={formData.tipoConta} onChange={handleChange} className={inputCls}>
                  <option value="Corrente">Corrente</option>
                  <option value="Poupança">Poupança</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Agência</label>
                <input type="text" name="agencia" value={formData.agencia} onChange={handleChange}
                  className={inputCls} placeholder="0000" />
              </div>

              <div>
                <label className={labelCls}>Número da Conta</label>
                <input type="text" name="conta" value={formData.conta} onChange={handleChange}
                  className={inputCls} placeholder="00000-0" />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 4: ENDEREÇO & CONTATO ══════════════ */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center gap-2 text-violet-600 border-b border-slate-100 pb-2 mb-5">
              <MapPin size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Endereço Completo</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className={labelCls}>CEP</label>
                <input type="text" name="cep" value={formData.cep} onChange={handleChange} onBlur={handleCepBlur}
                  maxLength={9} className={inputCls} placeholder="00000-000" />
              </div>

              <div className="md:col-span-3">
                <label className={labelCls}>Endereço</label>
                <input type="text" name="endereco" value={formData.endereco} onChange={handleChange}
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
                  className={inputCls} placeholder="Apto, Bloco..." />
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
            </div>

            <div className="flex items-center gap-2 text-violet-600 border-b border-slate-100 pb-2">
              <Phone size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Contato e Acesso</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}><Mail size={12} className="inline mr-1" />E-mail <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={formData.email} onChange={handleChange}
                  className={inputCls} placeholder="professor@email.com" required />
                <p className="text-[10px] text-slate-400 mt-1 ml-0.5 flex items-center gap-1">
                  <AlertCircle size={10} />O acesso ao portal do professor será enviado para este e-mail.
                </p>
              </div>

              <div>
                <label className={labelCls}>Celular / WhatsApp <span className="text-red-500">*</span></label>
                <input type="tel" name="contato1" value={formData.contato1} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 00000-0000" required />
              </div>

              <div>
                <label className={labelCls}>Telefone Secundário</label>
                <input type="tel" name="contato2" value={formData.contato2} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div>
              <label className={labelCls}><FileText size={12} className="inline mr-1" />Observações Internas</label>
              <textarea name="observacao" value={formData.observacao} onChange={handleChange} rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-violet-400 outline-none transition-all resize-none" placeholder="Disponibilidade de horários, restrições, etc..." />
            </div>
          </div>
        )}

        {/* Navegação */}
        <div className="flex justify-between gap-3 pt-6 mt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={currentStep === 1 ? onCancel : handleBack}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={16} />
            {currentStep === 1 ? 'Cancelar' : 'Voltar'}
          </button>

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!stepValid()}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-purple-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-purple-700 shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próximo <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-purple-900 shadow-lg shadow-purple-900/20 transition-all"
            >
              <Save size={16} /> Salvar Professor
            </button>
          )}
        </div>

        {/* Progresso */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Etapa {currentStep} de 4</span>
            <span>{Math.round((currentStep / 4) * 100)}% concluído</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>
      </form>
    </div>
  );
};

export default ParceiroProfessorForm;
