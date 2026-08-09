import React, { useEffect, useState } from 'react';
import { Edit2, Save, X } from 'lucide-react';

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
  onChange: (data: any) => void;
  onPhotoUploaded?: (fotoUrl: string, aluno: any) => void;
  onPhotoUploadError?: (message: string) => void;
}

const ParceiroAlunoDados: React.FC<ParceiroAlunoDadosProps> = ({
  aluno,
  onChange,
  onPhotoUploaded,
  onPhotoUploadError,
}) => {
  const [formData, setFormData] = useState(() => normalizeAlunoFormData(aluno));
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');

  useEffect(() => {
    setFormData(normalizeAlunoFormData(aluno));
    setCepStatus('idle');
  }, [aluno]);

  useEffect(() => {
    if (!isEditing) return undefined;

    const cep = String(formData.cep || '');
    if (onlyDigits(cep).length !== 8) {
      setCepStatus('idle');
      return undefined;
    }

    const controller = new globalThis.AbortController();
    const timer = window.setTimeout(async () => {
      setCepStatus('loading');
      try {
        const address = await lookupBrazilianCep(cep, controller.signal);
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
        if (error instanceof Error && error.name === 'AbortError') return;
        setCepStatus('error');
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [formData.cep, isEditing]);

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
      const nextData = { ...formData, foto: url };
      setFormData(nextData);
      setPendingPhotoFile(null);
      onPhotoUploaded?.(url, nextData);
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
      setCepStatus('idle');
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

    setFormData((previous: any) => {
      const next = { ...previous, [name]: finalValue };
      if (name === 'telefone' || name === 'contato1') {
        next.telefone = finalValue;
        next.contato1 = finalValue;
      }
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

  const handleSave = () => {
    if (hasCertidaoCivilData(formData)) {
      const certidaoError = validateCertidaoCivil(formData);
      if (certidaoError) {
        alert(certidaoError);
        return;
      }
    }
    const nextData = normalizeAlunoFormData(formData);
    setFormData(nextData);
    onChange(nextData);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setFormData(normalizeAlunoFormData(aluno));
    setCepStatus('idle');
    setIsEditing(false);
  };

  return (
    <div className="space-y-8  relative">
      {pendingPhotoFile && (
        <ProfilePhotoAdjustModal
          file={pendingPhotoFile}
          isProcessing={isUploadingPhoto}
          onCancel={() => setPendingPhotoFile(null)}
          onConfirm={confirmPhotoUpload}
        />
      )}

      <div className="flex justify-end absolute top-0 right-0">
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors"
          >
            <Edit2 size={14} /> Editar Dados
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200 transition-colors"
            >
              <X size={14} /> Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
            >
              <Save size={14} /> Salvar
            </button>
          </div>
        )}
      </div>

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
    </div>
  );
};

export default ParceiroAlunoDados;
