// Cadastro inicial de aluno, sem iniciar matrícula neste módulo.

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Save, X } from 'lucide-react';

import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import ProfilePhotoAdjustModal from '../../../../../shared/components/ProfilePhotoAdjustModal';
import { formatCpf, isValidCpf, isValidEmail, normalizeEmail } from '../../../../../shared/utils/identityValidation';
import { uppercaseAlunoTextFields } from '../../../utils/aluno-formatters';
import {
  hasCertidaoCivilData,
  normalizeCertidaoMatricula,
  validateCertidaoCivil,
} from '../../../utils/certidao-civil';
import ParceiroAlunoFormStepContact from './ParceiroAlunoFormStepContact';
import ParceiroAlunoFormStepDocuments from './ParceiroAlunoFormStepDocuments';
import ParceiroAlunoFormStepEducation from './ParceiroAlunoFormStepEducation';
import ParceiroAlunoFormStepFamily from './ParceiroAlunoFormStepFamily';
import ParceiroAlunoFormStepPersonal from './ParceiroAlunoFormStepPersonal';
import {
  createInitialFormData,
  STEPS,
} from './parceiro-aluno-form.constants';
import type { AlunoFormData } from './parceiro-aluno-form.types';

interface ParceiroAlunoFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
  defaultPoloId?: string | null;
  onScopeError?: (message: string) => void;
}

const maskCEP = (value: string) => value.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
const maskPhone = (value: string) => value.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');
const maskDate = (value: string) => value.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\/\d{4})\d+?$/,'$1');

const ParceiroAlunoForm: React.FC<ParceiroAlunoFormProps> = ({
  onCancel,
  onSave,
  defaultPoloId,
  onScopeError,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<AlunoFormData>(() => createInitialFormData(defaultPoloId));

  useEffect(() => {
    if (!defaultPoloId) return;
    setFormData((previous) => (previous.poloId
      ? previous
      : { ...previous, poloId: defaultPoloId }));
  }, [defaultPoloId]);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPendingPhotoFile(file);
  };

  const confirmPhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData((previous) => ({ ...previous, foto: url }));
      setPendingPhotoFile(null);
    } catch (error: any) {
      alert('Erro ao enviar foto: ' + (error.message || error));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = event.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (event.target as HTMLInputElement).checked;
    } else {
      if (type === 'text' || type === 'textarea' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
        if (name !== 'email' && name !== 'responsavelEmail' && name !== 'poloId') {
          finalValue = value.toUpperCase();
        }
      }
      if (name === 'email' || name === 'responsavelEmail') finalValue = normalizeEmail(finalValue);
      if (name === 'cpf' || name === 'responsavelCpf') finalValue = formatCpf(finalValue);
      if (name === 'cep') finalValue = maskCEP(finalValue);
      if (name === 'contato1' || name === 'contato2' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
      if (name === 'rgDataEmissao' || name === 'dataNascimento' || name === 'tituloEleitorDataEmissao') {
        finalValue = maskDate(finalValue);
      }
      if (name === 'tituloEleitorZona' || name === 'tituloEleitorSecao') {
        finalValue = value.replace(/\D/g, '').slice(0, 4);
      }
      if (name === 'certidaoMatricula') finalValue = normalizeCertidaoMatricula(finalValue);
      if (name === 'anoConclusaoEnsinoMedio' || name === 'anoPrevisaoConclusaoEnsinoMedio') {
        finalValue = value.replace(/\D/g, '').slice(0, 4);
      }
    }
    setFormData((previous) => {
      const next = { ...previous, [name]: finalValue };
      if (name === 'situacaoEnsinoMedio') {
        if (finalValue === 'CURSANDO') {
          next.anoConclusaoEnsinoMedio = '';
        } else if (finalValue === 'CONCLUIDO') {
          next.serieEnsinoMedioAtual = '';
          next.anoPrevisaoConclusaoEnsinoMedio = '';
        } else {
          next.serieEnsinoMedioAtual = '';
          next.anoConclusaoEnsinoMedio = '';
          next.anoPrevisaoConclusaoEnsinoMedio = '';
        }
      }
      if (name === 'certidaoModelo') {
        if (finalValue === 'NOVO') {
          next.certidaoTermo = '';
          next.certidaoLivro = '';
          next.certidaoFolha = '';
        } else if (finalValue === 'ANTIGO') {
          next.certidaoMatricula = '';
        }
      }
      if (name === 'certidaoTipo' && next.certidaoModelo === 'NOVO') {
        next.certidaoMatricula = '';
      }
      return next;
    });
  };

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData((previous) => ({
          ...previous,
          endereco: String(data.logradouro || '').toUpperCase(),
          bairro: String(data.bairro || '').toUpperCase(),
          cidade: String(data.localidade || '').toUpperCase(),
          uf: String(data.uf || '').toUpperCase(),
        }));
      }
    } catch {
      // ViaCEP failures should not block manual address entry.
    }
  };

  const isMinor = () => {
    if (!formData.dataNascimento) return false;
    const [day, month, year] = formData.dataNascimento.split('/').map(Number);
    if (!year) return false;
    const birth = new Date(year, month - 1, day);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear()
      - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    return age < 18;
  };

  const stepValid = () => {
    if (currentStep === 1) return formData.nomeCompleto.trim() !== '' && isValidCpf(formData.cpf) && formData.dataNascimento.length === 10;
    if (currentStep === 5) return isValidEmail(formData.email) && formData.contato1.length >= 14;
    return true;
  };

  const handleNext = () => {
    if (!stepValid()) {
      if (currentStep === 1) alert('Informe nome, CPF válido e data de nascimento para avançar.');
      if (currentStep === 5) alert('Informe e-mail válido e telefone para concluir.');
      return;
    }
    if (currentStep < 5) setCurrentStep((step) => step + 1);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (currentStep === 5) handleFinalize();
  };

  const handleFinalize = () => {
    if (!formData.poloId) {
      onScopeError?.('Selecione um polo ativo no cabeçalho antes de cadastrar o aluno.');
      return;
    }
    if (!isValidCpf(formData.cpf)) {
      alert('CPF do aluno inválido. Corrija antes de salvar.');
      return;
    }
    if (!formData.dataNascimento || formData.dataNascimento.length !== 10) {
      alert('Data de nascimento do aluno é obrigatória.');
      return;
    }
    if (!isValidEmail(formData.email)) {
      alert('E-mail do aluno inválido. Ele será usado como login.');
      return;
    }
    if (formData.contato1.length < 14) {
      alert('Telefone/WhatsApp do aluno é obrigatório.');
      return;
    }
    const certidaoError = validateCertidaoCivil(formData);
    if (hasCertidaoCivilData(formData) && certidaoError) {
      alert(`A certidão civil é opcional neste cadastro. Para salvar os dados já informados, complete-a: ${certidaoError}`);
      return;
    }
    if (formData.responsavelCpf && !isValidCpf(formData.responsavelCpf)) {
      alert('CPF do responsável inválido.');
      return;
    }
    if (formData.responsavelEmail && !isValidEmail(formData.responsavelEmail)) {
      alert('E-mail do responsável inválido.');
      return;
    }
    onSave?.(uppercaseAlunoTextFields({
      ...formData,
      email: normalizeEmail(formData.email),
      responsavelEmail: normalizeEmail(formData.responsavelEmail),
      // O módulo Parceiros só cria o cadastro. A matrícula é iniciada em Gestão.
      matricularAgora: false,
    }));
  };

  return (
    <div className="">
      {pendingPhotoFile && (
        <ProfilePhotoAdjustModal
          file={pendingPhotoFile}
          isProcessing={isUploadingPhoto}
          onCancel={() => {
            if (!isUploadingPhoto) setPendingPhotoFile(null);
          }}
          onConfirm={confirmPhotoUpload}
        />
      )}

      <div className="flex justify-between items-center border-b border-slate-100 pb-5 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Aluno</h3>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Cadastro inicial do aluno</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium leading-relaxed text-blue-800">
        Para concluir o cadastro inicial, informe os dados pessoais, endereço e contato. Documentação, filiação e escolaridade podem ser preenchidas depois e só serão exigidas ao iniciar uma matrícula técnica.
      </div>

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
        {currentStep === 1 && (
          <ParceiroAlunoFormStepPersonal
            formData={formData}
            isUploadingPhoto={isUploadingPhoto}
            onChange={handleChange}
            onPhotoUpload={handlePhotoUpload}
            onRemovePhoto={() => setFormData((previous) => ({ ...previous, foto: '' }))}
          />
        )}
        {currentStep === 2 && <ParceiroAlunoFormStepDocuments formData={formData} onChange={handleChange} />}
        {currentStep === 3 && <ParceiroAlunoFormStepFamily formData={formData} isMinor={isMinor()} onChange={handleChange} />}
        {currentStep === 4 && <ParceiroAlunoFormStepEducation formData={formData} onChange={handleChange} />}
        {currentStep === 5 && <ParceiroAlunoFormStepContact formData={formData} onChange={handleChange} onCepBlur={handleCepBlur} />}

        <div className="flex justify-between gap-3 pt-6 mt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={currentStep === 1 ? onCancel : () => setCurrentStep((step) => step - 1)}
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
              <Save size={16} /> Salvar Cadastro
            </button>
          )}
        </div>

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

    </div>
  );
};

export default ParceiroAlunoForm;
