// File: modules/gestor/parceiros/components/formularioparceiros/pf/ParceiroPFForm.tsx
// Formulário completo de Pessoa Física (Prestador de Serviço)

import React, { useState } from 'react';
import {
  User, MapPin, Save, X, FileText, DollarSign, Briefcase, ChevronRight, ChevronLeft, CheckCircle2, Plus
} from 'lucide-react';

interface ParceiroPFFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
}

const STEPS = [
  { id: 1, label: 'Dados Pessoais', icon: User },
  { id: 2, label: 'Endereço', icon: MapPin },
  { id: 3, label: 'Serviço & Pag.', icon: DollarSign },
];

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const PRESET_SERVICOS = [
  'CONSULTORIA',
  'LIMPEZA E CONSERVAÇÃO',
  'MANUTENÇÃO PREDIAL',
  'TECNOLOGIA DA INFORMAÇÃO',
  'CONTABILIDADE',
  'JURÍDICO',
  'MARKETING / DESIGN',
  'SEGURANÇA PATRIMONIAL',
  'ALIMENTAÇÃO / CANTINA',
  'TRANSPORTE',
  'FOTOGRAFIA / AUDIOVISUAL',
];
const PRESET_VINCULOS = ['AUTÔNOMO', 'MEI (MICROEMPREENDEDOR INDIVIDUAL)', 'EVENTUAL / AVULSO', 'CONTRATO FIXO'];
const BANCOS = [
  'Banco do Brasil', 'Caixa Econômica Federal', 'Bradesco', 'Itaú', 'Santander',
  'Nubank', 'Inter', 'Sicoob', 'Sicredi', 'Outro'
];

const ParceiroPFForm: React.FC<ParceiroPFFormProps> = ({ onCancel, onSave }) => {
  const [currentStep, setCurrentStep] = useState(1);

  // Dynamic category states
  const [showCustomServico, setShowCustomServico] = useState(false);
  const [customServico, setCustomServico] = useState('');
  const [selectedServico, setSelectedServico] = useState('');

  const [showCustomVinculo, setShowCustomVinculo] = useState(false);
  const [customVinculo, setCustomVinculo] = useState('');
  const [selectedVinculo, setSelectedVinculo] = useState('');

  const [formData, setFormData] = useState({
    // Step 1 — Dados Pessoais
    polo: 'matriz',
    nome: '',
    cpf: '',
    dataNascimento: '',
    sexo: '',
    rg: '',
    email: '',
    telefone: '',

    // Step 2 — Endereço
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',

    // Step 3 — Serviço & Pagamento
    chavePix: '',
    banco: '',
    agencia: '',
    conta: '',
    tipoConta: 'Corrente',
    observacoes: '',
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
    if (name === 'telefone') finalValue = maskPhone(finalValue);
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
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || '',
        }));
      }
    } catch {
      // ViaCEP failures should not block manual address entry.
    }
  };

  const stepValid = () => {
    if (currentStep === 1) return formData.nome.trim() !== '' && formData.cpf.length === 14 && formData.telefone.length >= 14;
    return true;
  };

  const handleNext = () => { if (stepValid() && currentStep < 3) setCurrentStep(s => s + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(s => s - 1); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalServico = showCustomServico ? customServico.trim().toUpperCase() : selectedServico;
    const finalVinculo = showCustomVinculo ? customVinculo.trim().toUpperCase() : selectedVinculo;
    if (onSave) onSave({
      ...formData,
      tipoServico: finalServico,
      tipoVinculo: finalVinculo,
      // normalizar campos para compatibilidade com o service
      nomeCompleto: formData.nome,
      endereco: formData.logradouro,
      contato1: formData.telefone,
      observacao: formData.observacoes,
    });
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-amber-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
  const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-5 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Parceiro PF</h3>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Prestador de Serviço — Pessoa Física</p>
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
                  active ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30' :
                  'bg-white border-slate-200 text-slate-400 cursor-default'
                }`}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={16} />}
              </button>
              <span className={`text-[9px] font-black uppercase tracking-wider text-center leading-tight ${
                active ? 'text-amber-600' : done ? 'text-emerald-600' : 'text-slate-400'
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
            <div className="flex items-center gap-2 text-amber-600 border-b border-slate-100 pb-2 mb-5">
              <User size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Dados Pessoais & Contato</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={labelCls}>Polo/Unidade</label>
                <select name="polo" value={formData.polo} onChange={handleChange} className={inputCls}>
                  <option value="matriz">Matriz — Aracaju</option>
                  <option value="estancia">Polo Estância</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Nome Completo <span className="text-red-500">*</span></label>
                <input type="text" name="nome" value={formData.nome} onChange={handleChange}
                  className={inputCls} placeholder="Nome completo do prestador" required />
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

              <div>
                <label className={labelCls}>RG</label>
                <input type="text" name="rg" value={formData.rg} onChange={handleChange}
                  className={inputCls} placeholder="Número do RG" />
              </div>

              <div>
                <label className={labelCls}>E-mail</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange}
                  className={inputCls} placeholder="email@exemplo.com" />
              </div>

              <div>
                <label className={labelCls}>Celular / WhatsApp <span className="text-red-500">*</span></label>
                <input type="text" name="telefone" value={formData.telefone} onChange={handleChange}
                  maxLength={15} className={inputCls} placeholder="(00) 00000-0000" required />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 2: ENDEREÇO ══════════════ */}
        {currentStep === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-amber-600 border-b border-slate-100 pb-2 mb-5">
              <MapPin size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Endereço</h4>
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
          </div>
        )}

        {/* ══════════════ STEP 3: SERVIÇO & PAGAMENTO ══════════════ */}
        {currentStep === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center gap-2 text-amber-600 border-b border-slate-100 pb-2 mb-5">
              <Briefcase size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">Tipo de Serviço & Dados para Pagamento</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}>Tipo de Serviço Prestado <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {!showCustomServico ? (
                    <select
                      value={selectedServico}
                      onChange={(e) => setSelectedServico(e.target.value)}
                      className={`${inputCls} flex-grow`}
                    >
                      <option value="">Selecione o tipo de serviço...</option>
                      {PRESET_SERVICOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={customServico}
                      onChange={(e) => setCustomServico(e.target.value.toUpperCase())}
                      placeholder="DESCREVA O TIPO DE SERVIÇO PRESTADO"
                      className={`${inputCls} flex-grow`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowCustomServico(!showCustomServico); setCustomServico(''); }}
                    className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center shadow-sm"
                    title={showCustomServico ? 'Escolher da lista' : 'Cadastrar novo tipo de serviço'}
                  >
                    {showCustomServico ? <X size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Tipo de Vínculo</label>
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
                    title={showCustomVinculo ? 'Escolher da lista' : 'Cadastrar novo tipo de vínculo'}
                  >
                    {showCustomVinculo ? <X size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 h-px bg-slate-100 my-1" />

              <div className="md:col-span-2">
                <label className={labelCls}>Chave PIX</label>
                <input type="text" name="chavePix" value={formData.chavePix} onChange={handleChange}
                  className={inputCls} placeholder="CPF, telefone, e-mail ou chave aleatória" />
              </div>

              <div>
                <label className={labelCls}>Banco</label>
                <select name="banco" value={formData.banco} onChange={handleChange} className={inputCls}>
                  <option value="">Selecione...</option>
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
                <label className={labelCls}>Conta</label>
                <input type="text" name="conta" value={formData.conta} onChange={handleChange}
                  className={inputCls} placeholder="00000-0" />
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}><FileText size={12} className="inline mr-1" />Observações</label>
                <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-amber-400 outline-none transition-all resize-none" placeholder="Observações adicionais..." />
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
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-amber-500 text-white font-bold text-xs uppercase tracking-wider hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próximo <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-600/20 transition-all"
            >
              <Save size={16} /> Salvar Parceiro PF
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
            <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${(currentStep / 3) * 100}%` }} />
          </div>
        </div>
      </form>
    </div>
  );
};

export default ParceiroPFForm;
