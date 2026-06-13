// File: modules/gestor/parceiros/components/formularioparceiros/pj/ParceiroPJForm.tsx
// Formulário completo de Pessoa Jurídica (Empresa / Convenio)

import React, { useState } from 'react';
import {
  Building, MapPin, Phone, Mail, Save, X, FileText, User,
  AlertCircle, ChevronRight, ChevronLeft, CheckCircle2, Handshake
} from 'lucide-react';

interface ParceiroPJFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const STEPS = [
  { id: 1, label: 'Dados da Empresa', icon: Building },
  { id: 2, label: 'Responsável', icon: User },
  { id: 3, label: 'Endereço & Contato', icon: MapPin },
];

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const TIPOS_CONVENIO = ['Convênio de Estágio', 'Contrato de Prestação de Serviços', 'Fornecedor', 'Prefeitura / Órgão Público', 'ONG / Associação', 'Sindicato', 'Outro'];

const ParceiroPJForm: React.FC<ParceiroPJFormProps> = ({ onCancel, onSave }) => {
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    // Step 1 — Empresa
    polo: 'matriz',
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    tipoPj: '',
    tipoConvenio: '',

    // Step 2 — Responsável
    responsavelNome: '',
    responsavelCpf: '',
    responsavelCargo: '',
    responsavelEmail: '',
    responsavelTelefone: '',

    // Step 3 — Endereço & Contato
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue = value;
    if (type === 'text' || type === 'textarea' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (name !== 'email') {
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

  const stepValid = () => {
    if (currentStep === 1) return formData.razaoSocial.trim() !== '' && formData.cnpj.length === 18;
    if (currentStep === 2) return formData.responsavelNome.trim() !== '';
    return true;
  };

  const handleNext = () => { if (stepValid() && currentStep < 3) setCurrentStep(s => s + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(s => s - 1); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSave) onSave({
      ...formData,
      // normalizar para compatibilidade com o service
      nome: formData.razaoSocial,
      nomeCompleto: formData.razaoSocial,
      cpf_cnpj: formData.cnpj,
      cpf: formData.cnpj,
      endereco: formData.logradouro,
      contato1: formData.telefone,
      observacao: formData.observacoes,
      tipoPj: formData.tipoPj,
      tipoConvenio: formData.tipoConvenio,
      responsavelCargo: formData.responsavelCargo,
    });
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-slate-700 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
  const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';

  return (
    <div className="animate-fadeIn">
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
                  active ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-500/30' :
                  'bg-white border-slate-200 text-slate-400 cursor-default'
                }`}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={16} />}
              </button>
              <span className={`text-[9px] font-black uppercase tracking-wider text-center leading-tight ${
                active ? 'text-slate-800' : done ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit}>
        {/* ══════════════ STEP 1: EMPRESA ══════════════ */}
        {currentStep === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2 mb-5">
              <Building size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Dados da Empresa / Entidade</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}>Polo/Unidade Vínculo</label>
                <select name="polo" value={formData.polo} onChange={handleChange} className={inputCls}>
                  <option value="matriz">Matriz — Aracaju</option>
                  <option value="estancia">Polo Estância</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Razão Social <span className="text-red-500">*</span></label>
                <input type="text" name="razaoSocial" value={formData.razaoSocial} onChange={handleChange}
                  className={inputCls} placeholder="Razão Social Completa" required />
              </div>

              <div>
                <label className={labelCls}>Nome Fantasia</label>
                <input type="text" name="nomeFantasia" value={formData.nomeFantasia} onChange={handleChange}
                  className={inputCls} placeholder="Nome Fantasia (se houver)" />
              </div>

              <div>
                <label className={labelCls}>CNPJ <span className="text-red-500">*</span></label>
                <input type="text" name="cnpj" value={formData.cnpj} onChange={handleChange}
                  maxLength={18} className={`${inputCls} font-mono`} placeholder="00.000.000/0000-00" required />
              </div>

              <div>
                <label className={labelCls}>Tipo de Entidade</label>
                <select name="tipoPj" value={formData.tipoPj} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  <option value="Empresa Privada">Empresa Privada</option>
                  <option value="Prefeitura">Prefeitura / Órgão Público</option>
                  <option value="ONG">ONG / Associação</option>
                  <option value="Sindicato">Sindicato</option>
                  <option value="Hospital">Hospital / Clínica</option>
                  <option value="Cooperativa">Cooperativa</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Tipo de Convênio / Parceria</label>
                <select name="tipoConvenio" value={formData.tipoConvenio} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
                  {TIPOS_CONVENIO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-start gap-3">
              <AlertCircle size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600 font-medium">
                <strong>Convênio de Estágio:</strong> Para empresas que recebem alunos em campo de estágio, o contrato de convênio será gerado automaticamente pelo sistema.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 2: RESPONSÁVEL ══════════════ */}
        {currentStep === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2 mb-5">
              <User size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Responsável / Contato Principal da Empresa</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}>Nome do Responsável <span className="text-red-500">*</span></label>
                <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={handleChange}
                  className={inputCls} placeholder="Nome completo do responsável" required />
              </div>

              <div>
                <label className={labelCls}>CPF do Responsável</label>
                <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={handleChange}
                  maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" />
              </div>

              <div>
                <label className={labelCls}>Cargo / Função</label>
                <input type="text" name="responsavelCargo" value={formData.responsavelCargo} onChange={handleChange}
                  className={inputCls} placeholder="Ex: Diretor(a), Coordenador(a), RH..." />
              </div>

              <div>
                <label className={labelCls}>E-mail do Responsável</label>
                <input type="email" name="responsavelEmail" value={formData.responsavelEmail} onChange={handleChange}
                  className={inputCls} placeholder="contato@empresa.com" />
              </div>

              <div>
                <label className={labelCls}>Telefone do Responsável</label>
                <input type="text" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 3: ENDEREÇO & CONTATO ══════════════ */}
        {currentStep === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2 mb-5">
              <MapPin size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Endereço da Empresa</h4>
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
            </div>

            <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
              <Phone size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Contato Institucional</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>E-mail Institucional</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange}
                  className={inputCls} placeholder="contato@empresa.com" />
              </div>

              <div>
                <label className={labelCls}>Telefone Principal</label>
                <input type="text" name="telefone" value={formData.telefone} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 0000-0000" />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}><FileText size={12} className="inline mr-1" />Observações</label>
                <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-slate-600 outline-none transition-all resize-none" placeholder="Condições do convênio, validade, observações gerais..." />
              </div>
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

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!stepValid()}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próximo <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-slate-900/20 transition-all"
            >
              <Save size={16} /> Salvar Parceiro PJ
            </button>
          )}
        </div>

        {/* Progresso */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Etapa {currentStep} de 3</span>
            <span>{Math.round((currentStep / 3) * 100)}% concluído</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div className="bg-slate-900 h-1.5 rounded-full transition-all duration-500" style={{ width: `${(currentStep / 3) * 100}%` }} />
          </div>
        </div>
      </form>
    </div>
  );
};

export default ParceiroPJForm;
