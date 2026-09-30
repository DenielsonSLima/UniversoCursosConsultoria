import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  GraduationCap,
  Loader2,
  MapPin,
  Save,
  User,
  X,
} from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { parceirosService } from '../../../parceiros.service';
import { formatCpf, normalizeEmail } from '../../../../../shared/utils/identityValidation';
import ProfessorContactStep from './ProfessorContactStep';
import ProfessorEducationStep from './ProfessorEducationStep';
import ProfessorPaymentStep from './ProfessorPaymentStep';
import ProfessorPersonalStep from './ProfessorPersonalStep';
import {
  createInitialProfessorFormData,
  formatPixKeyInput,
  getProfessorFormError,
  getProfessorStepError,
  maskCep,
  maskDate,
  maskPhone,
  normalizePixKey,
  type PixKeyType,
  type ProfessorPoloOption,
} from './professor-form.model';

interface ParceiroProfessorFormProps {
  onCancel?: () => void;
  onSave?: (data: unknown) => void;
  defaultPoloId?: string | null;
  onScopeError?: (message: string) => void;
  isSaving?: boolean;
}

const STEPS = [
  { id: 1, label: 'Dados pessoais', icon: User },
  { id: 2, label: 'Formação', icon: GraduationCap },
  { id: 3, label: 'Financeiro', icon: DollarSign },
  { id: 4, label: 'Endereço e contato', icon: MapPin },
] as const;

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-purple-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';

const ParceiroProfessorForm: React.FC<ParceiroProfessorFormProps> = ({
  onCancel,
  onSave,
  defaultPoloId,
  onScopeError,
  isSaving = false,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(() => createInitialProfessorFormData(defaultPoloId));
  const [polosList, setPolosList] = useState<ProfessorPoloOption[]>([]);
  const [polosLoading, setPolosLoading] = useState(true);
  const [polosError, setPolosError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [validationError, setValidationError] = useState('');

  const loadPolos = useCallback(async () => {
    setPolosLoading(true);
    setPolosError('');
    try {
      const data = await parceirosService.getPolos();
      setPolosList((data || []).map((polo: any) => ({
        id: String(polo.id),
        nome: String(polo.nome || 'Polo sem nome'),
        cidade: String(polo.cidade || 'Cidade não informada'),
        estado: polo.estado || null,
        uf: polo.uf || null,
      })));
    } catch (error) {
      console.error('Erro ao buscar polos:', error);
      setPolosError('Não foi possível carregar os polos.');
    } finally {
      setPolosLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolos();
  }, [loadPolos]);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setValidationError('');
    setIsUploadingPhoto(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData((previous) => ({ ...previous, foto: url }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setValidationError(`Não foi possível enviar a foto: ${message}`);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, tagName } = event.target;
    setValidationError('');

    if (name === 'tipoChavePix') {
      setFormData((previous) => ({
        ...previous,
        tipoChavePix: value as PixKeyType,
        chavePix: '',
      }));
      return;
    }

    let finalValue = value;
    if (name === 'email') finalValue = normalizeEmail(value);
    else if (name === 'cpf') finalValue = formatCpf(value);
    else if (name === 'cep') finalValue = maskCep(value);
    else if (name === 'contato1' || name === 'contato2') finalValue = maskPhone(value);
    else if (name === 'dataNascimento') finalValue = maskDate(value);
    else if (name === 'chavePix') finalValue = formatPixKeyInput(formData.tipoChavePix, value);
    else if (tagName === 'INPUT' || tagName === 'TEXTAREA') finalValue = value.toUpperCase();

    setFormData((previous) => ({ ...previous, [name]: finalValue }));
  };

  const handleTogglePolo = (poloId: string) => {
    setValidationError('');
    setFormData((previous) => {
      const nextPoloIds = previous.poloIds.includes(poloId)
        ? previous.poloIds.filter((id) => id !== poloId)
        : [...previous.poloIds, poloId];
      return { ...previous, poloIds: nextPoloIds, poloId: nextPoloIds[0] || '' };
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
      // Falhas no ViaCEP não impedem o preenchimento manual opcional.
    }
  };

  const handleNext = () => {
    const message = getProfessorStepError(currentStep, formData);
    if (message) {
      setValidationError(message);
      if (currentStep === 1 && formData.poloIds.length === 0) onScopeError?.(message);
      return;
    }
    setValidationError('');
    setCurrentStep((step) => Math.min(step + 1, 4));
  };

  const handleBack = () => {
    setValidationError('');
    setCurrentStep((step) => Math.max(step - 1, 1));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    const error = getProfessorFormError(formData);
    if (error) {
      setCurrentStep(error.step);
      setValidationError(error.message);
      if (formData.poloIds.length === 0) onScopeError?.(error.message);
      return;
    }

    setValidationError('');
    onSave?.({
      ...formData,
      email: normalizeEmail(formData.email),
      chavePix: normalizePixKey(formData.tipoChavePix, formData.chavePix),
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Novo professor</h3>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Somente polo, nome e CPF são obrigatórios.</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-red-500" aria-label="Cancelar cadastro">
            <X size={20} />
          </button>
        )}
      </div>

      <div className="relative mb-8 flex items-center justify-between">
        <div className="absolute left-0 right-0 top-5 z-0 h-0.5 bg-slate-100" />
        {STEPS.map((step) => {
          const Icon = step.icon;
          const done = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <div key={step.id} className="z-10 flex flex-1 flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (done) {
                    setValidationError('');
                    setCurrentStep(step.id);
                  }
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  done
                    ? 'cursor-pointer border-emerald-500 bg-emerald-500 text-white'
                    : active
                      ? 'border-purple-600 bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                      : 'cursor-default border-slate-200 bg-white text-slate-400'
                }`}
                aria-label={`Etapa ${step.id}: ${step.label}`}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={16} />}
              </button>
              <span className={`text-center text-[9px] font-black uppercase leading-tight tracking-wider ${
                active ? 'text-purple-600' : done ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {validationError && (
          <div role="alert" aria-live="assertive" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {currentStep === 1 && (
          <ProfessorPersonalStep
            formData={formData}
            polosList={polosList}
            polosLoading={polosLoading}
            polosError={polosError}
            isUploadingPhoto={isUploadingPhoto}
            inputCls={inputCls}
            labelCls={labelCls}
            onChange={handleChange}
            onPhotoUpload={handlePhotoUpload}
            onRemovePhoto={() => setFormData((previous) => ({ ...previous, foto: '' }))}
            onTogglePolo={handleTogglePolo}
            onReloadPolos={() => void loadPolos()}
          />
        )}
        {currentStep === 2 && <ProfessorEducationStep formData={formData} inputCls={inputCls} labelCls={labelCls} onChange={handleChange} />}
        {currentStep === 3 && <ProfessorPaymentStep formData={formData} inputCls={inputCls} labelCls={labelCls} onChange={handleChange} />}
        {currentStep === 4 && <ProfessorContactStep formData={formData} inputCls={inputCls} labelCls={labelCls} onChange={handleChange} onCepBlur={handleCepBlur} />}

        <div className="mt-6 flex justify-between gap-3 border-t border-slate-100 pt-6">
          <button type="button" onClick={currentStep === 1 ? onCancel : handleBack} disabled={isSaving} className="flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            <ChevronLeft size={16} /> {currentStep === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {currentStep < 4 ? (
            <button key="next-step" type="button" onClick={handleNext} className="flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-purple-500/20 transition-all hover:bg-purple-700">
              Próximo <ChevronRight size={16} />
            </button>
          ) : (
            <button key="submit-professor" type="submit" disabled={isSaving} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-8 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-purple-900/20 transition-all hover:bg-purple-900 disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving ? 'Salvando...' : 'Salvar professor'}
            </button>
          )}
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Etapa {currentStep} de 4</span>
            <span>{Math.round((currentStep / 4) * 100)}% concluído</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-purple-600 transition-all duration-500" style={{ width: `${(currentStep / 4) * 100}%` }} />
          </div>
        </div>
      </form>
    </div>
  );
};

export default ParceiroProfessorForm;
