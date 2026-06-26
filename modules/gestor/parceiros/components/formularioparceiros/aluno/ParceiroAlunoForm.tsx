// File: modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx
// Formulário completo de Aluno em 5 etapas (Wizard) para cursos técnicos

import React, { useState } from 'react';
import {
  User, MapPin, Phone, Mail, Save, X, AlertCircle, FileText,
  CheckCircle2, BookOpen, ChevronRight, ChevronLeft, GraduationCap,
  Shield, Heart, Home, Accessibility, Camera, Upload, Loader2
} from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';

interface ParceiroAlunoFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const STEPS = [
  { id: 1, label: 'Dados Pessoais', icon: User, color: 'blue' },
  { id: 2, label: 'Documentação', icon: Shield, color: 'indigo' },
  { id: 3, label: 'Filiação', icon: Heart, color: 'rose' },
  { id: 4, label: 'Escolaridade', icon: GraduationCap, color: 'emerald' },
  { id: 5, label: 'Endereço & Contato', icon: Home, color: 'violet' },
];

const ESTADOS_CIVIS = ['SOLTEIRO(A)', 'CASADO(A)', 'DIVORCIADO(A)', 'VIÚVO(A)', 'UNIÃO ESTÁVEL', 'SEPARADO(A)'];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const ESCOLARIDADES = ['ENSINO MÉDIO COMPLETO','ENSINO MÉDIO INCOMPLETO','CURSANDO ENSINO MÉDIO','ENSINO SUPERIOR COMPLETO','ENSINO SUPERIOR INCOMPLETO','PÓS-GRADUAÇÃO'];
const PCD_TIPOS = ['FÍSICA','AUDITIVA','VISUAL','INTELECTUAL','MÚLTIPLA','TRANSTORNO DO ESPECTRO AUTISTA (TEA)'];

const ParceiroAlunoForm: React.FC<ParceiroAlunoFormProps> = ({ onCancel, onSave }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showMatriculaModal, setShowMatriculaModal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

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

  const [formData, setFormData] = useState({
    // Step 1 — Dados Pessoais
    polo: 'matriz',
    status: 'ATIVO',
    foto: '',
    nomeCompleto: '',
    nomeSocial: '',
    cpf: '',
    dataNascimento: '',
    sexo: '',
    estadoCivil: '',
    nacionalidade: 'BRASILEIRA',
    naturalidade: '',
    pcd: false,
    pcdTipo: '',

    // Step 2 — Documentação
    tipoDocumento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    rg: '',
    orgaoEmissor: '',
    rgUfEmissao: '',
    rgDataEmissao: '',
    tituloEleitor: '',
    reservista: '',

    // Step 3 — Filiação & Responsável
    nomeMae: '',
    nomePai: '',
    responsavelNome: '',
    responsavelCpf: '',
    responsavelParentesco: '',
    responsavelTelefone: '',
    responsavelEmail: '',
    responsavelFinanceiro: false,

    // Step 4 — Escolaridade
    escolaridadeAnterior: '',
    instituicaoOrigem: '',
    anoConclusaoEnsinoMedio: '',

    // Step 5 — Endereço & Contato
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

  // Máscaras
  const maskCPF = (v: string) => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
  const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');
  const maskDate = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\/\d{4})\d+?$/,'$1');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else {
      if (type === 'text' || type === 'textarea' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (name !== 'email' && name !== 'responsavelEmail') {
          finalValue = value.toUpperCase();
        }
      }
      if (name === 'cpf' || name === 'responsavelCpf') finalValue = maskCPF(finalValue);
      if (name === 'cep') finalValue = maskCEP(finalValue);
      if (name === 'contato1' || name === 'contato2' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
      if (name === 'rgDataEmissao' || name === 'dataNascimento') finalValue = maskDate(finalValue);
    }
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  // Auto-preencher CEP
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

  const isMinor = () => {
    if (!formData.dataNascimento) return false;
    const [d, m, y] = formData.dataNascimento.split('/').map(Number);
    if (!y) return false;
    const birth = new Date(y, m - 1, d);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear() - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    return age < 18;
  };

  const stepValid = () => {
    if (currentStep === 1) return formData.nomeCompleto.trim() !== '' && formData.cpf.length === 14;
    if (currentStep === 5) return formData.email.trim() !== '' && formData.contato1.length >= 14;
    return true;
  };

  const handleNext = () => { if (stepValid() && currentStep < 5) setCurrentStep(s => s + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(s => s - 1); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep === 5) setShowMatriculaModal(true);
  };

  const handleFinalize = (matricularAgora: boolean) => {
    if (onSave) onSave({ ...formData, matricularAgora });
    setShowMatriculaModal(false);
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
  const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';
  const sectionHeaderCls = (color: string) => `flex items-center gap-2 text-${color}-600 border-b border-slate-100 pb-2 mb-5`;

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-5 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Aluno</h3>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Ficha completa para matrícula em cursos técnicos</p>
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
        {STEPS.map((step, idx) => {
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
                  active ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30' :
                  'bg-white border-slate-200 text-slate-400 cursor-default'
                }`}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={16} />}
              </button>
              <span className={`text-[9px] font-black uppercase tracking-wider text-center leading-tight ${
                active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'
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
            <div className={sectionHeaderCls('blue')}>
              <User size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Dados Pessoais & Vínculo</h4>
            </div>

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
                <h5 className="text-sm font-bold text-[#001a33] uppercase">Foto do Aluno</h5>
                <p className="text-xs text-slate-400">Envie uma foto recente de identificação (JPG, PNG).</p>
                <div className="flex gap-2">
                  <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/10">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={labelCls}>Polo/Unidade <span className="text-red-500">*</span></label>
                <select name="polo" value={formData.polo} onChange={handleChange} className={inputCls}>
                  <option value="matriz">Matriz — Aracaju</option>
                  <option value="estancia">Polo Estância</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Status do Aluno <span className="text-red-500">*</span></label>
                <select name="status" value={formData.status} onChange={handleChange} className={inputCls} required>
                  <option value="ATIVO">ATIVO</option>
                  <option value="INATIVO">INATIVO</option>
                  <option value="TRANCADO">TRANCADO</option>
                  <option value="CONCLUÍDO">CONCLUÍDO</option>
                  <option value="DESISTENTE">DESISTENTE</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Nome Completo <span className="text-red-500">*</span></label>
                <input type="text" name="nomeCompleto" value={formData.nomeCompleto} onChange={handleChange}
                  className={inputCls} placeholder="Ex: Maria da Silva Santos" required />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Nome Social (Opcional)</label>
                <input type="text" name="nomeSocial" value={formData.nomeSocial} onChange={handleChange}
                  className={inputCls} placeholder="Nome pelo qual prefere ser chamado(a)" />
              </div>

              <div>
                <label className={labelCls}>CPF <span className="text-red-500">*</span></label>
                <input type="text" name="cpf" value={formData.cpf} onChange={handleChange}
                  maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" required />
              </div>

              <div>
                <label className={labelCls}>Data de Nascimento <span className="text-red-500">*</span></label>
                <input type="text" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange}
                  maxLength={10} className={inputCls} placeholder="DD/MM/AAAA" required />
              </div>

              <div>
                <label className={labelCls}>Sexo <span className="text-red-500">*</span></label>
                <select name="sexo" value={formData.sexo} onChange={handleChange} className={inputCls} required>
                  <option value="">Selecione...</option>
                  <option value="MASCULINO">MASCULINO</option>
                  <option value="FEMININO">FEMININO</option>
                  <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                  <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Estado Civil</label>
                <select name="estadoCivil" value={formData.estadoCivil} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  {ESTADOS_CIVIS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Nacionalidade</label>
                <input type="text" name="nacionalidade" value={formData.nacionalidade} onChange={handleChange}
                  className={inputCls} placeholder="Brasileira" />
              </div>

              <div>
                <label className={labelCls}>Naturalidade (Cidade/UF)</label>
                <input type="text" name="naturalidade" value={formData.naturalidade} onChange={handleChange}
                  className={inputCls} placeholder="Ex: Aracaju/SE" />
              </div>
            </div>

            {/* PcD */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <input type="checkbox" id="pcd" name="pcd" checked={formData.pcd}
                  onChange={handleChange} className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                <label htmlFor="pcd" className="flex items-center gap-2 text-sm font-bold text-[#001a33] cursor-pointer">
                  <Accessibility size={16} className="text-blue-500" />
                  Pessoa com Deficiência (PcD)
                </label>
              </div>
              {formData.pcd && (
                <div className="mt-2">
                  <label className={labelCls}>Tipo de Deficiência</label>
                  <select name="pcdTipo" value={formData.pcdTipo} onChange={handleChange} className={inputCls}>
                    <option value="">Selecione...</option>
                    {PCD_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ STEP 2: DOCUMENTAÇÃO ══════════════ */}
        {currentStep === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className={sectionHeaderCls('indigo')}>
              <Shield size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Documentos de Identificação</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-3">
                <label className={labelCls}>Tipo de Documento de Identificação <span className="text-red-500">*</span></label>
                <select name="tipoDocumento" value={formData.tipoDocumento} onChange={handleChange} className={inputCls}>
                  <option value="CARTEIRA NACIONAL DE IDENTIFICAÇÃO">CARTEIRA NACIONAL DE IDENTIFICAÇÃO (CIN)</option>
                  <option value="CNH">CNH — Carteira Nacional de Habilitação</option>
                  <option value="PASSAPORTE">PASSAPORTE</option>
                  <option value="CARTEIRA PROFISSIONAL">CARTEIRA PROFISSIONAL (CRM, CREA, OAB...)</option>
                  <option value="RG (ANTIGO)">RG — Registro Geral (Antigo)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Número do Documento <span className="text-red-500">*</span></label>
                <input type="text" name="rg" value={formData.rg} onChange={handleChange}
                  className={inputCls} placeholder="Número do documento de identificação" />
              </div>

              <div>
                <label className={labelCls}>Órgão Emissor</label>
                <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor} onChange={handleChange}
                  className={inputCls} placeholder="SSP, IFP, DETRAN..." />
              </div>

              <div>
                <label className={labelCls}>UF Emissão</label>
                <select name="rgUfEmissao" value={formData.rgUfEmissao} onChange={handleChange} className={inputCls}>
                  <option value="">UF</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Data de Emissão do Documento</label>
                <input type="text" name="rgDataEmissao" value={formData.rgDataEmissao} onChange={handleChange}
                  maxLength={10} className={inputCls} placeholder="DD/MM/AAAA" />
              </div>

              <div className="md:col-span-3">
                <div className="h-px bg-slate-100 my-1" />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Título de Eleitor</label>
                <input type="text" name="tituloEleitor" value={formData.tituloEleitor} onChange={handleChange}
                  className={inputCls} placeholder="Número do título" />
                <p className="text-[10px] text-slate-400 mt-1 ml-0.5">Obrigatório para maiores de 18 anos</p>
              </div>

              <div>
                <label className={labelCls}>Certificado de Reservista</label>
                <input type="text" name="reservista" value={formData.reservista} onChange={handleChange}
                  className={inputCls} placeholder="Nº do certificado (homens)" />
              </div>
            </div>

            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 flex items-start gap-3">
              <AlertCircle size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                A <strong>Carteira Nacional de Identificação (CIN)</strong> é o novo documento oficial de identidade no Brasil, em substituição ao antigo RG. Também são aceitos CNH e outros documentos com foto. Os originais serão solicitados no momento da matrícula.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 3: FILIAÇÃO & RESPONSÁVEL ══════════════ */}
        {currentStep === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className={sectionHeaderCls('rose')}>
              <Heart size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Filiação</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>Nome da Mãe <span className="text-red-500">*</span></label>
                <input type="text" name="nomeMae" value={formData.nomeMae} onChange={handleChange}
                  className={inputCls} placeholder="Nome completo da mãe" />
              </div>

              <div>
                <label className={labelCls}>Nome do Pai</label>
                <input type="text" name="nomePai" value={formData.nomePai} onChange={handleChange}
                  className={inputCls} placeholder="Nome completo do pai (opcional)" />
              </div>
            </div>

            {/* Responsável Legal (para menores) */}
            {isMinor() ? (
              <div className="mt-2">
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 flex items-start gap-3 mb-5">
                  <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 font-bold">
                    Aluno menor de idade — Dados do responsável legal são obrigatórios.
                  </p>
                </div>

                <div className={sectionHeaderCls('rose')}>
                  <Shield size={16} />
                  <h4 className="text-xs font-black uppercase tracking-wider">Responsável Legal</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Nome do Responsável <span className="text-red-500">*</span></label>
                    <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={handleChange}
                      className={inputCls} placeholder="Nome completo do responsável" />
                  </div>

                  <div>
                    <label className={labelCls}>CPF do Responsável <span className="text-red-500">*</span></label>
                    <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={handleChange}
                      maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" />
                  </div>

                  <div>
                    <label className={labelCls}>Parentesco <span className="text-red-500">*</span></label>
                    <select name="responsavelParentesco" value={formData.responsavelParentesco} onChange={handleChange} className={inputCls}>
                      <option value="">Selecione...</option>
                      <option value="Mãe">Mãe</option>
                      <option value="Pai">Pai</option>
                      <option value="Avó/Avô">Avó/Avô</option>
                      <option value="Tio(a)">Tio(a)</option>
                      <option value="Irmão/Irmã">Irmão/Irmã</option>
                      <option value="Tutor(a) Legal">Tutor(a) Legal</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelCls}>Telefone do Responsável <span className="text-red-500">*</span></label>
                    <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={handleChange}
                      maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <p className="text-xs text-slate-500 font-medium text-center">
                  Responsável legal não obrigatório para alunos maiores de 18 anos.
                  <br />Caso deseje cadastrar mesmo assim, informe abaixo.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Nome do Responsável (Opcional)</label>
                    <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={handleChange}
                      className={inputCls} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className={labelCls}>CPF do Responsável</label>
                    <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={handleChange}
                      maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className={labelCls}>Parentesco</label>
                    <select name="responsavelParentesco" value={formData.responsavelParentesco} onChange={handleChange} className={inputCls}>
                      <option value="">Selecione...</option>
                      <option value="Cônjuge">Cônjuge</option>
                      <option value="Mãe">Mãe</option>
                      <option value="Pai">Pai</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="responsavelFinanceiro"
                  checked={formData.responsavelFinanceiro}
                  onChange={handleChange}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>
                  <strong className="block text-xs uppercase tracking-wider text-blue-800">Este contato é o responsável financeiro</strong>
                  <span className="mt-1 block text-xs text-blue-700">Pode ser informado mesmo quando o aluno é maior de idade e será usado em cobranças e na declaração de IRPF.</span>
                </span>
              </label>
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                {!isMinor() && (
                  <div>
                    <label className={labelCls}>Telefone do Responsável</label>
                    <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={handleChange}
                      maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>E-mail do Responsável</label>
                  <input type="email" name="responsavelEmail" value={formData.responsavelEmail} onChange={handleChange}
                    className={inputCls} placeholder="responsavel@email.com" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 4: ESCOLARIDADE ══════════════ */}
        {currentStep === 4 && (
          <div className="space-y-5 animate-fadeIn">
            <div className={sectionHeaderCls('emerald')}>
              <GraduationCap size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Formação Acadêmica Anterior</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}>Nível de Escolaridade Anterior <span className="text-red-500">*</span></label>
                <select name="escolaridadeAnterior" value={formData.escolaridadeAnterior} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione a escolaridade...</option>
                  {ESCOLARIDADES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Instituição de Ensino Anterior</label>
                <input type="text" name="instituicaoOrigem" value={formData.instituicaoOrigem} onChange={handleChange}
                  className={inputCls} placeholder="Nome da escola/faculdade" />
              </div>

              <div>
                <label className={labelCls}>Ano de Conclusão do Ensino Médio</label>
                <input type="text" name="anoConclusaoEnsinoMedio" value={formData.anoConclusaoEnsinoMedio} onChange={handleChange}
                  maxLength={4} className={inputCls} placeholder="Ex: 2019" />
              </div>
            </div>

            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
              <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                <strong>Cursos Técnicos:</strong> O Ensino Médio completo é requisito mínimo obrigatório para inscrição em cursos técnicos subsequentes. O comprovante será verificado no momento da entrega de documentos.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 5: ENDEREÇO & CONTATO ══════════════ */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-fadeIn">
            <div className={sectionHeaderCls('violet')}>
              <MapPin size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Endereço Completo</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className={labelCls}>CEP <span className="text-red-500">*</span></label>
                <input type="text" name="cep" value={formData.cep} onChange={handleChange} onBlur={handleCepBlur}
                  maxLength={9} className={inputCls} placeholder="00000-000" required />
              </div>

              <div className="md:col-span-3">
                <label className={labelCls}>Endereço (Rua/Av) <span className="text-red-500">*</span></label>
                <input type="text" name="endereco" value={formData.endereco} onChange={handleChange}
                  className={inputCls} placeholder="Nome da rua" required />
              </div>

              <div>
                <label className={labelCls}>Número <span className="text-red-500">*</span></label>
                <input type="text" name="numero" value={formData.numero} onChange={handleChange}
                  className={inputCls} placeholder="123" required />
              </div>

              <div>
                <label className={labelCls}>Complemento</label>
                <input type="text" name="complemento" value={formData.complemento} onChange={handleChange}
                  className={inputCls} placeholder="Apto, Bloco..." />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Bairro <span className="text-red-500">*</span></label>
                <input type="text" name="bairro" value={formData.bairro} onChange={handleChange}
                  className={inputCls} placeholder="Bairro" required />
              </div>

              <div className="md:col-span-3">
                <label className={labelCls}>Cidade <span className="text-red-500">*</span></label>
                <input type="text" name="cidade" value={formData.cidade} onChange={handleChange}
                  className={inputCls} placeholder="Nome da cidade" required />
              </div>

              <div>
                <label className={labelCls}>UF <span className="text-red-500">*</span></label>
                <select name="uf" value={formData.uf} onChange={handleChange} className={inputCls} required>
                  <option value="">UF</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className={sectionHeaderCls('violet')}>
              <Phone size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Contato</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}><Mail size={12} className="inline mr-1" />E-mail <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={formData.email} onChange={handleChange}
                  className={inputCls} placeholder="aluno@email.com" required />
                <p className="text-[10px] text-slate-400 mt-1 ml-0.5 flex items-center gap-1">
                  <AlertCircle size={10} />Boleto e acesso ao portal serão enviados para este e-mail.
                </p>
              </div>

              <div>
                <label className={labelCls}>Celular / WhatsApp <span className="text-red-500">*</span></label>
                <input type="tel" name="contato1" value={formData.contato1} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 00000-0000" required />
              </div>

              <div>
                <label className={labelCls}>Telefone de Recado (Opcional)</label>
                <input type="tel" name="contato2" value={formData.contato2} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div>
              <label className={labelCls}><FileText size={12} className="inline mr-1" />Observações Internas (Opcional)</label>
              <textarea name="observacao" value={formData.observacao} onChange={handleChange} rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-violet-400 focus:bg-white outline-none transition-all resize-none" placeholder="Anotações internas da secretaria..." />
            </div>
          </div>
        )}

        {/* Botões de Navegação */}
        <div className="flex justify-between gap-3 pt-6 mt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={currentStep === 1 ? onCancel : handleBack}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={16} />
            {currentStep === 1 ? 'Cancelar' : 'Voltar'}
          </button>

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!stepValid()}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próximo <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 transition-all"
            >
              <Save size={16} /> Salvar Aluno
            </button>
          )}
        </div>

        {/* Progresso */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Etapa {currentStep} de 5</span>
            <span>{Math.round((currentStep / 5) * 100)}% concluído</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
          </div>
        </div>
      </form>

      {/* Modal Matrícula */}
      {showMatriculaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl relative border border-slate-100">
            <button type="button" onClick={() => setShowMatriculaModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors">
              <X size={20} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight mb-2">Cadastro Finalizado</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
                O aluno <strong>{formData.nomeCompleto || 'novo'}</strong> foi cadastrado com sucesso.<br />
                Deseja matriculá-lo em alguma turma agora?
              </p>

              <div className="flex flex-col gap-3 w-full">
                <button type="button" onClick={() => handleFinalize(true)}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl uppercase tracking-wider text-sm transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                  <BookOpen size={18} /> Sim, Matricular Agora
                </button>
                <button type="button" onClick={() => handleFinalize(false)}
                  className="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl uppercase tracking-wider text-sm transition-colors border border-slate-200">
                  Não, Concluir Cadastro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoForm;
