// File: modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx

import React, { useState } from 'react';
import { User, Camera, MapPin, Phone, Mail, Edit2, Save, X, Upload, Loader2 } from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { formatCpf } from '../../../../../../lib/documentFormatters';

interface ParceiroAlunoDadosProps {
  aluno: any;
  onChange: (data: any) => void;
}

const ParceiroAlunoDados: React.FC<ParceiroAlunoDadosProps> = ({ aluno, onChange }) => {
  const [formData, setFormData] = useState(aluno);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData((prev: any) => ({ ...prev, foto: url }));
    } catch (err: any) {
      alert('Erro ao enviar foto: ' + (err.message || err));
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
    const maskCPF = (v: string) => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
    const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
    const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');
    const maskDate = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\/\d{4})\d+?$/,'$1');

    if (name === 'cpf' || name === 'responsavelCpf') finalValue = maskCPF(finalValue);
    if (name === 'cep') finalValue = maskCEP(finalValue);
    if (name === 'telefone' || name === 'contato1' || name === 'contato2' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
    if (name === 'dataNascimento' || name === 'rgDataEmissao') finalValue = maskDate(finalValue);

    setFormData({ ...formData, [name]: finalValue });
  };

  const handleSave = () => {
    onChange(formData);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setFormData(aluno);
    setIsEditing(false);
  };

  const DisplayField = ({ label, value }: { label: string, value?: string }) => (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</span>
      <span className="block text-slate-800 font-medium">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-8 animate-fadeIn relative">
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
          <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider border-b border-slate-100 pb-2">Informações Pessoais</h4>
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
                    <input type="text" name="cpf" value={formData.cpf || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
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
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider border-b border-slate-100 pb-2">Filiação</h4>
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
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider border-b border-slate-100 pb-2">Responsável legal e financeiro</h4>
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
                <input name="responsavelCpf" value={formData.responsavelCpf || ''} onChange={handleChange} maxLength={14} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Parentesco</label>
                <input name="responsavelParentesco" value={formData.responsavelParentesco || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone</label>
                <input name="responsavelTelefone" value={formData.responsavelTelefone || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
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
              <DisplayField label="Telefone" value={formData.responsavelTelefone} />
              <DisplayField label="E-mail" value={formData.responsavelEmail} />
              <DisplayField label="Responsável financeiro" value={formData.responsavelFinanceiro ? 'SIM' : 'NÃO'} />
            </>
          )}
        </div>
      </div>

      {/* Documentação Civil */}
      <div className="space-y-6 pt-6">
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider border-b border-slate-100 pb-2">Documentação Civil</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">RG</label>
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
                  <input type="text" name="nacionalidade" value={formData.nacionalidade || 'Brasileira'} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
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
              <DisplayField label="RG" value={formData.rg} />
              <DisplayField label="Órgão Emissor / UF" value={formData.orgaoEmissor} />
              <DisplayField label="Título de Eleitor" value={formData.tituloEleitor} />
              <DisplayField label="Nacionalidade" value={formData.nacionalidade || 'Brasileira'} />
              <DisplayField label="Naturalidade" value={formData.naturalidade} />
              <DisplayField label="Reservista" value={formData.reservista} />
            </>
          )}
        </div>
      </div>

      {/* Contato e Endereço */}
      <div className="space-y-6 pt-6">
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider border-b border-slate-100 pb-2">Contato e Endereço</h4>
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
                  <input type="tel" name="telefone" value={formData.telefone || formData.contato1 || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
            </>
          ) : (
            <>
              <div className="md:col-span-2"><DisplayField label="Endereço Completo" value={formData.endereco} /></div>
              <DisplayField label="E-mail" value={formData.email} />
              <DisplayField label="Telefone / WhatsApp" value={formData.telefone || formData.contato1} />
            </>
          )}
        </div>
      </div>

    </div>
  );
};

export default ParceiroAlunoDados;
