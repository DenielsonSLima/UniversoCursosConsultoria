import './ParceiroAlunoDados.css';
import { prepareAlunoSaveData, updateAlunoDraft } from './parceiro-aluno-edicao';
import React, { useEffect, useRef, useState } from 'react';
import { Edit2, Loader2, Save, X } from 'lucide-react';

import { onlyDigits } from '../../../../../../lib/documentFormatters';
import ProfilePhotoAdjustModal from '../../../../../shared/components/ProfilePhotoAdjustModal';
import { lookupBrazilianCep } from '../../../../../shared/utils/brazilianCep';
import { parceirosService } from '../../../parceiros.service';
import {
  hasCertidaoCivilData,
  normalizeCertidaoMatricula,
  validateCertidaoCivil,
} from '../../../utils/certidao-civil';
import ParceiroAlunoAddressSection, { type CepStatus } from './ParceiroAlunoAddressSection';
import ParceiroAlunoDetailsSections from './ParceiroAlunoDetailsSections';
import ParceiroAlunoPersonalSection from './ParceiroAlunoPersonalSection';
import {
  maskCep,
  maskCpf,
  maskDate,
  maskPhone,
  normalizeAlunoFormData,
  normalizeDocumentType,
} from './parceiro-aluno-dados.utils';

interface ParceiroAlunoDadosProps {
  aluno: any;
  onChange: (data: any) => Promise<unknown>;
  onEditingChange?: (editing: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onPhotoUploaded?: (fotoUrl: string, aluno: any) => void;
  onPhotoUploadError?: (message: string) => void;
}

const ParceiroAlunoDados: React.FC<ParceiroAlunoDadosProps> = ({
  aluno,
  onChange,
  onPhotoUploaded,
  onPhotoUploadError,
  onEditingChange,
  onDirtyChange,
  onSavingChange,
}) => {
  const [formData, setFormData] = useState(() => normalizeAlunoFormData(aluno));
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [cepRequest, setCepRequest] = useState('');
  const baseline = useRef(normalizeAlunoFormData(aluno));
  const errorRef = useRef<HTMLDivElement>(null);
  const isDirty = isEditing && JSON.stringify(formData) !== JSON.stringify(baseline.current);

  useEffect(() => {
    if (isEditing) return;
    baseline.current = normalizeAlunoFormData(aluno);
    setFormData(baseline.current);
    setCepStatus('idle');
  }, [aluno, isEditing]);

  useEffect(() => { onEditingChange?.(isEditing); }, [isEditing, onEditingChange]);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => { onSavingChange?.(isSaving || isUploadingPhoto); }, [isSaving, isUploadingPhoto, onSavingChange]);
  useEffect(() => { if (saveError) errorRef.current?.focus(); }, [saveError]);

  useEffect(() => {
    if (!isEditing || onlyDigits(cepRequest).length !== 8) return undefined;
    const controller = new globalThis.AbortController();
    const timer = window.setTimeout(async () => {
      setCepStatus('loading');
      try {
        const address = await lookupBrazilianCep(cepRequest, controller.signal);
        if (controller.signal.aborted) return;
        if (!address) {
          setCepStatus('not-found');
          return;
        }
        setFormData((current: any) => ({
          ...current,
          cep: address.cep,
          endereco: address.endereco || current.endereco,
          bairro: address.bairro || current.bairro,
          cidade: address.cidade,
          uf: address.uf,
        }));
        setCepStatus('resolved');
      } catch (error) {
        if (controller.signal.aborted) return;
        setCepStatus('error');
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [cepRequest, isEditing]);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingPhotoFile(file);
  };

  const confirmPhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const url = await parceirosService.uploadProfilePhoto(aluno.id, formData, file);
      baseline.current = { ...baseline.current, foto: url };
      setFormData((current: any) => ({ ...current, foto: url }));
      setPendingPhotoFile(null);
      onPhotoUploaded?.(url, { ...aluno, foto: url });
    } catch (error: any) {
      onPhotoUploadError?.(error?.message || 'Erro ao enviar foto.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (event.target as HTMLInputElement).checked;
    } else if (type === 'text' || event.target.tagName === 'SELECT') {
      if (name !== 'email' && name !== 'responsavelEmail') {
        finalValue = value.toUpperCase();
      }
    }
    if (name === 'cpf' || name === 'responsavelCpf') finalValue = maskCpf(finalValue);
    if (name === 'cep') {
      finalValue = maskCep(finalValue);
      setCepStatus(onlyDigits(finalValue).length === 8 ? 'loading' : 'idle');
      setCepRequest(finalValue);
    }
    if (name === 'telefone' || name === 'contato1' || name === 'contato2' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
    if (name === 'dataNascimento' || name === 'rgDataEmissao' || name === 'tituloEleitorDataEmissao') {
      finalValue = maskDate(finalValue);
    }
    if (name === 'tituloEleitorZona' || name === 'tituloEleitorSecao') {
      finalValue = onlyDigits(finalValue).slice(0, 4);
    }
    if (name === 'tipoDocumento') finalValue = normalizeDocumentType(finalValue);
    if (name === 'certidaoMatricula') finalValue = normalizeCertidaoMatricula(finalValue);
    if (name === 'anoConclusaoEnsinoMedio' || name === 'anoPrevisaoConclusaoEnsinoMedio') {
      finalValue = value.replace(/\D/g, '').slice(0, 4);
    }

    setFormData((previous: any) => updateAlunoDraft(previous, name, finalValue));
  };

  const handleSave = async () => {
    if (isSaving || isUploadingPhoto) return;
    setSaveError('');
    if (hasCertidaoCivilData(formData)) {
      const certidaoError = validateCertidaoCivil(formData);
      if (certidaoError) {
        setSaveError(certidaoError);
        return;
      }
    }
    setIsSaving(true);
    try {
      const nextData = prepareAlunoSaveData(normalizeAlunoFormData(formData), baseline.current);
      await onChange(nextData);
      baseline.current = nextData;
      setFormData(nextData);
      setCepRequest('');
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar. Seus dados continuam em edição.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setFormData(baseline.current);
    setCepStatus('idle');
    setCepRequest('');
    setSaveError('');
    setIsEditing(false);
  };

  return (
    <div className="aluno-cadastro relative space-y-6">
      {pendingPhotoFile && (
        <ProfilePhotoAdjustModal
          file={pendingPhotoFile}
          isProcessing={isUploadingPhoto}
          onCancel={() => setPendingPhotoFile(null)}
          onConfirm={confirmPhotoUpload}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-semibold text-[#001a33]">Cadastro do aluno</h3>
          <p className="mt-1 text-sm text-slate-500">Dados pessoais, documentação e contato.</p>
        </div>
        {!isEditing && <button type="button" onClick={() => { setSaveError(''); setIsEditing(true); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-500">
          <Edit2 size={16} /> Editar cadastro
        </button>}
      </div>
      <nav aria-label="Seções do cadastro" className="flex flex-wrap gap-1">
        {[['pessoais', 'Dados pessoais'], ['filiacao', 'Filiação'], ['responsavel', 'Responsável'], ['documentacao', 'Documentação'], ['escolaridade', 'Escolaridade'], ['contato', 'Contato e endereço']].map(([id, label]) => (
          <a key={id} href={`#aluno-${id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500">{label}</a>
        ))}
      </nav>
      <fieldset disabled={isSaving || isUploadingPhoto} className="min-w-0 space-y-6 disabled:opacity-70">
      <ParceiroAlunoPersonalSection
        formData={formData}
        isEditing={isEditing}
        isUploadingPhoto={isUploadingPhoto}
        onChange={handleChange}
        onPhotoUpload={handlePhotoUpload}
        onRemovePhoto={() => setFormData((previous: any) => ({ ...previous, foto: '' }))}
        onUseFullName={() => setFormData({ ...formData, nomeSocial: formData.nome })}
      />

      <ParceiroAlunoDetailsSections formData={formData} isEditing={isEditing} onChange={handleChange} />
      <ParceiroAlunoAddressSection
        formData={formData}
        isEditing={isEditing}
        cepStatus={cepStatus}
        onChange={handleChange}
      />
      </fieldset>
      {isEditing && (
        <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          {saveError && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 outline-none">{saveError}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600" aria-live="polite">
              {isSaving ? 'Salvando cadastro…' : isDirty ? 'Alterações ainda não salvas' : 'Editando cadastro'}
              <p className="mt-1 text-slate-500">O envio de foto é salvo imediatamente.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={cancelEdit} disabled={isSaving || isUploadingPhoto} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 disabled:opacity-50"><X size={16} /> Cancelar</button>
              <button type="button" onClick={handleSave} disabled={isSaving || isUploadingPhoto || cepStatus === 'loading'} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{isSaving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoDados;
