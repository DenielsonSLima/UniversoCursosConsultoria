// File: modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx

import React, { useEffect, useState } from 'react';
import { User, Camera, Edit2, Save, X, Loader2 } from 'lucide-react';
import { formatCpf, formatPhone, onlyDigits } from '../../../../../../lib/documentFormatters';
import ProfilePhotoAdjustModal from '../../../../../shared/components/ProfilePhotoAdjustModal';
import { TECHNICAL_DOCUMENT_TYPE_OPTIONS } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import { parceirosService } from '../../../parceiros.service';
import { uppercaseAlunoTextFields } from '../../../utils/aluno-formatters';

interface ParceiroAlunoDadosProps {
  aluno: any;
  onChange: (data: any) => void;
  onPhotoUploaded?: (fotoUrl: string, aluno: any) => void;
  onPhotoUploadError?: (message: string) => void;
}

const DEFAULT_DOCUMENT_TYPE = 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO';

const normalizeText = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const maskCpf = (value?: string | null) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

const maskPhone = (value?: string | null) => {
  const rawDigits = onlyDigits(value);
  const localDigits = rawDigits.startsWith('55') && rawDigits.length > 11 ? rawDigits.slice(2) : rawDigits;
  const digits = localDigits.slice(0, 11);

  if (digits.length > 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return digits;
};

const maskCep = (value?: string | null) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
};

const maskDate = (value?: string | null) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

const normalizeDocumentType = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return DEFAULT_DOCUMENT_TYPE;
  if (['CIN', 'CNI'].includes(normalized) || normalized.includes('CARTEIRA NACIONAL')) {
    return DEFAULT_DOCUMENT_TYPE;
  }
  if (normalized.includes('CNH') || normalized.includes('HABILITACAO')) {
    return 'CNH';
  }
  if (normalized === 'RG' || normalized.includes('REGISTRO GERAL') || normalized.includes('RG ANTIGO')) {
    return 'RG (ANTIGO)';
  }

  const option = TECHNICAL_DOCUMENT_TYPE_OPTIONS.find((item) =>
    normalizeText(item.value) === normalized || normalizeText(item.label) === normalized
  );
  return option?.value || String(value || DEFAULT_DOCUMENT_TYPE);
};

const formatDocumentTypeLabel = (value?: string | null) => {
  const normalizedValue = normalizeDocumentType(value);
  return TECHNICAL_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === normalizedValue)?.label || normalizedValue;
};

const formatPhoneDisplay = (value?: string | null) => (value ? formatPhone(value) : '');

const normalizeAlunoFormData = (data: any) => {
  const normalized = uppercaseAlunoTextFields(data || {});
  const telefone = maskPhone(normalized.telefone || normalized.contato1);
  return {
    ...normalized,
    cpf: maskCpf(normalized.cpf || normalized.cpf_cnpj),
    cep: maskCep(normalized.cep),
    dataNascimento: maskDate(normalized.dataNascimento),
    rgDataEmissao: maskDate(normalized.rgDataEmissao),
    tipoDocumento: normalizeDocumentType(normalized.tipoDocumento),
    telefone,
    contato1: telefone || maskPhone(normalized.contato1),
    contato2: maskPhone(normalized.contato2),
    responsavelCpf: maskCpf(normalized.responsavelCpf),
    responsavelTelefone: maskPhone(normalized.responsavelTelefone),
  };
};

const ParceiroAlunoDados: React.FC<ParceiroAlunoDadosProps> = ({ aluno, onChange, onPhotoUploaded, onPhotoUploadError }) => {
  const [formData, setFormData] = useState(() => normalizeAlunoFormData(aluno));
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    setFormData(normalizeAlunoFormData(aluno));
  }, [aluno]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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
    } catch (err: any) {
      onPhotoUploadError?.(err?.message || 'Erro ao enviar foto.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'text' || e.target.tagName === 'SELECT') {
      if (name !== 'email' && name !== 'responsavelEmail') {
        finalValue = value.toUpperCase();
      }
    }
    if (name === 'cpf' || name === 'responsavelCpf') finalValue = maskCpf(finalValue);
    if (name === 'cep') finalValue = maskCep(finalValue);
    if (name === 'telefone' || name === 'contato1' || name === 'contato2' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
    if (name === 'dataNascimento' || name === 'rgDataEmissao') finalValue = maskDate(finalValue);
    if (name === 'tipoDocumento') finalValue = normalizeDocumentType(finalValue);

    setFormData((prev: any) => {
      const next = { ...prev, [name]: finalValue };
      if (name === 'telefone' || name === 'contato1') {
        next.telefone = finalValue;
        next.contato1 = finalValue;
      }
      return next;
    });
  };

  const handleSave = () => {
    const nextData = normalizeAlunoFormData(formData);
    setFormData(nextData);
    onChange(nextData);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setFormData(normalizeAlunoFormData(aluno));
    setIsEditing(false);
  };

  const DisplayField = ({ label, value }: { label: string, value?: string }) => (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
      <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</span>
      <span className="block text-slate-800 font-medium">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-8 animate-fadeIn relative">
      {pendingPhotoFile && (
        <ProfilePhotoAdjustModal
          file={pendingPhotoFile}
          isProcessing={isUploadingPhoto}
          onCancel={() => setPendingPhotoFile(null)}
          onConfirm={confirmPhotoUpload}
        />
      )}

      {/* Header Actions */}
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

      {/* Seção de Foto e Dados Básicos */}
      <div className="flex flex-col md:flex-row gap-8 pt-4">
        
        {/* Foto */}
        <div className="flex flex-col items-center gap-4 shrink-0">
          <div className="w-40 h-40 rounded-full bg-slate-100 border-4 border-white shadow-lg relative overflow-hidden group">
            {formData.foto ? (
                <img src={formData.foto} alt="Aluno" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <User size={64} />
                </div>
            )}
            {isEditing && !isUploadingPhoto && (
              <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="text-white" size={32} />
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            )}
            {isUploadingPhoto && (
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center text-white">
                  <Loader2 className="animate-spin" size={32} />
              </div>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-3">
              <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:underline cursor-pointer">
                Alterar Foto
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
              </label>
              {formData.foto && (
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, foto: '' }))}
                  className="text-[10px] font-bold text-red-500 uppercase tracking-wider hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
          )}
        </div>

        {/* Identificação Principal */}
        <div className="flex-1 space-y-6">
          <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Informações Pessoais</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isEditing ? (
              <>
                <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Completo</label>
                    <input type="text" name="nome" value={formData.nome || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none" />
                </div>
                <div className="md:col-span-1 space-y-2">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Social</label>
                        <button type="button" onClick={() => setFormData({...formData, nomeSocial: formData.nome})} className="text-[10px] text-blue-600 font-bold uppercase tracking-wider hover:underline bg-blue-50 px-2 py-0.5 rounded">
                            Usar Completo
                        </button>
                    </div>
                    <input type="text" name="nomeSocial" value={formData.nomeSocial || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-700 focus:border-blue-500 outline-none" placeholder="Como prefere ser chamado" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
                    <input type="text" name="cpf" value={formData.cpf || ''} onChange={handleChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nascimento</label>
                    <input type="text" name="dataNascimento" value={formData.dataNascimento || ''} onChange={handleChange} maxLength={10} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="DD/MM/AAAA" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sexo</label>
                    <select name="sexo" value={formData.sexo || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                        <option value="">Selecione...</option>
                        <option value="MASCULINO">MASCULINO</option>
                        <option value="FEMININO">FEMININO</option>
                        <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                        <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Status Acadêmico</label>
                    <select name="status" value={formData.status || 'ATIVO'} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold">
                        <option value="ATIVO">ATIVO</option>
                        <option value="INATIVO">INATIVO</option>
                        <option value="TRANCADO">TRANCADO</option>
                        <option value="CONCLUÍDO">CONCLUÍDO</option>
                        <option value="DESISTENTE">DESISTENTE</option>
                    </select>
                </div>
              </>
            ) : (
              <>
                <div className="md:col-span-2"><DisplayField label="Nome Completo" value={formData.nome} /></div>
                <DisplayField label="Nome Social" value={formData.nomeSocial || formData.nome} />
                <DisplayField label="CPF" value={formatCpf(formData.cpf)} />
                <DisplayField label="Data de Nascimento" value={formData.dataNascimento} />
                <DisplayField label="Sexo" value={formData.sexo} />
                <DisplayField label="Status Acadêmico" value={formData.status || 'ATIVO'} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filiação */}
      <div className="space-y-6 pt-6">
        <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Filiação</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome da Mãe</label>
                  <input type="text" name="nomeMae" value={formData.nomeMae || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome do Pai</label>
                  <input type="text" name="nomePai" value={formData.nomePai || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
            </>
          ) : (
            <>
              <DisplayField label="Nome da Mãe" value={formData.nomeMae} />
              <DisplayField label="Nome do Pai" value={formData.nomePai} />
            </>
          )}
        </div>
      </div>

      {/* Responsável financeiro */}
      <div className="space-y-6 pt-6">
        <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Responsável legal e financeiro</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 cursor-pointer">
                <input type="checkbox" name="responsavelFinanceiro" checked={!!formData.responsavelFinanceiro} onChange={handleChange} className="mt-0.5 h-4 w-4 accent-blue-600" />
                <span>
                  <strong className="block text-xs uppercase tracking-wider text-blue-800">Responsável pelos pagamentos</strong>
                  <span className="mt-1 block text-xs text-blue-700">Será considerado como pagador na declaração de IRPF.</span>
                </span>
              </label>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome</label>
                <input name="responsavelNome" value={formData.responsavelNome || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
                <input name="responsavelCpf" value={formData.responsavelCpf || ''} onChange={handleChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Parentesco</label>
                <input name="responsavelParentesco" value={formData.responsavelParentesco || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone</label>
                <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone || ''} onChange={handleChange} maxLength={15} inputMode="tel" placeholder="(00) 00000-0000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
                <input type="email" name="responsavelEmail" value={formData.responsavelEmail || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
            </>
          ) : (
            <>
              <DisplayField label="Responsável" value={formData.responsavelNome} />
              <DisplayField label="CPF" value={formatCpf(formData.responsavelCpf)} />
              <DisplayField label="Parentesco" value={formData.responsavelParentesco} />
              <DisplayField label="Telefone" value={formatPhoneDisplay(formData.responsavelTelefone)} />
              <DisplayField label="E-mail" value={formData.responsavelEmail} />
              <DisplayField label="Responsável financeiro" value={formData.responsavelFinanceiro ? 'SIM' : 'NÃO'} />
            </>
          )}
        </div>
      </div>

      {/* Documentação Civil */}
      <div className="space-y-6 pt-6">
        <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Documentação Civil</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Tipo de documento</label>
                  <select name="tipoDocumento" value={formData.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                    {TECHNICAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Número do documento</label>
                  <input type="text" name="rg" value={formData.rg || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Órgão Emissor / UF</label>
                  <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Título de Eleitor</label>
                  <input type="text" name="tituloEleitor" value={formData.tituloEleitor || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nacionalidade</label>
                  <input type="text" name="nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Naturalidade</label>
                  <input type="text" name="naturalidade" value={formData.naturalidade || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Reservista</label>
                  <input type="text" name="reservista" value={formData.reservista || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
            </>
          ) : (
            <>
              <DisplayField label="Tipo de documento" value={formatDocumentTypeLabel(formData.tipoDocumento)} />
              <DisplayField label="Número do documento" value={formData.rg} />
              <DisplayField label="Órgão Emissor / UF" value={formData.orgaoEmissor} />
              <DisplayField label="Título de Eleitor" value={formData.tituloEleitor} />
              <DisplayField label="Nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} />
              <DisplayField label="Naturalidade" value={formData.naturalidade} />
              <DisplayField label="Reservista" value={formData.reservista} />
            </>
          )}
        </div>
      </div>

      {/* Contato e Endereço */}
      <div className="space-y-6 pt-6">
        <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Contato e Endereço</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Endereço Completo</label>
                  <input type="text" name="endereco" value={formData.endereco || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
                  <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone / WhatsApp</label>
                  <input type="tel" name="telefone" value={formData.telefone || formData.contato1 || ''} onChange={handleChange} maxLength={15} inputMode="tel" placeholder="(00) 00000-0000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
            </>
          ) : (
            <>
              <div className="md:col-span-2"><DisplayField label="Endereço Completo" value={formData.endereco} /></div>
              <DisplayField label="E-mail" value={formData.email} />
              <DisplayField label="Telefone / WhatsApp" value={formatPhoneDisplay(formData.telefone || formData.contato1)} />
            </>
          )}
        </div>
      </div>

    </div>
  );
};

export default ParceiroAlunoDados;
