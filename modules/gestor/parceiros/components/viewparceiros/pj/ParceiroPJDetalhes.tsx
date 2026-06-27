// File: modules/gestor/parceiros/components/viewparceiros/pj/ParceiroPJDetalhes.tsx
// Página de detalhes de Parceiro Pessoa Jurídica com dados reais, edição e abas adequadas ao tipo

import React, { useState } from 'react';
import {
  ArrowLeft, Building, Handshake, Edit3, Save, X, MapPin, Phone,
  AlertCircle, Loader2, Trash2, Upload, Image
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../../../parceiros.service';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { useToast } from '../../shared/ToastNotification';
import ToastNotification from '../../shared/ToastNotification';
import { formatCnpj, formatCpf } from '../../../../../../lib/documentFormatters';

interface ParceiroPJDetalhesProps {
  pjInicial: any;
  onBack: () => void;
}

type TabPJ = 'dados' | 'parceria';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const Field: React.FC<{ label: string; value?: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-sm font-semibold text-[#001a33] ${mono ? 'font-mono' : ''}`}>
      {value || <span className="text-slate-300 italic font-normal">Não informado</span>}
    </p>
  </div>
);

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5';

const ParceiroPJDetalhes: React.FC<ParceiroPJDetalhesProps> = ({ pjInicial, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabPJ>('dados');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const { data: pjData = pjInicial, isLoading } = useQuery({
    queryKey: ['parceiro', pjInicial.id],
    queryFn: () => parceirosService.getById(pjInicial.id),
    initialData: pjInicial,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => parceirosService.update(pjInicial.id, { ...data, tipo: 'PJ' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiro', pjInicial.id] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      setIsEditing(false);
      setEditData(null);
      toast.success('Parceiro atualizado!', 'Os dados foram salvos com sucesso.');
    },
    onError: () => {
      toast.error('Erro ao salvar', 'Verifique os dados e tente novamente.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => parceirosService.delete(pjInicial.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      toast.success('Parceiro excluído!', 'O registro foi removido com sucesso.');
      setTimeout(() => onBack(), 1200);
    },
    onError: () => {
      toast.error('Erro ao excluir', 'Não foi possível remover o registro.');
    },
  });

  const startEditing = () => {
    setEditData({ ...pjData });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditData(null);
    setIsEditing(false);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (!editData) return;
    updateMutation.mutate(editData);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setEditData((prev: any) => ({ ...prev, foto: url }));
      toast.success('Logo enviada!', 'A imagem foi carregada com sucesso.');
    } catch (err: any) {
      toast.error('Erro no upload', err.message || 'Tente novamente.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const statusColor: Record<string, string> = {
    ATIVO: 'bg-emerald-100 text-emerald-700',
    INATIVO: 'bg-slate-100 text-slate-500',
    SUSPENSO: 'bg-red-100 text-red-600',
  };

  const tabs: { id: TabPJ; label: string; icon: React.ReactNode }[] = [
    { id: 'dados', label: 'Dados da Empresa', icon: <Building size={16} /> },
    { id: 'parceria', label: 'Parceria / Convênio', icon: <Handshake size={16} /> },
  ];

  const d = isEditing ? editData : pjData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-8 py-5 shadow-sm -mx-8 -mt-8 mb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-800 hover:border-slate-800 transition-colors bg-slate-50"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-4">
                {/* Logo / Avatar */}
                {pjData.foto ? (
                  <img src={pjData.foto} alt={pjData.nome} className="w-14 h-14 rounded-2xl object-contain border border-slate-100 bg-white shadow-sm" />
                ) : (
                  <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-sm">
                    <Building size={26} />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight leading-none">
                    {pjData.nome}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      PJ • CNPJ: <span className="font-mono text-slate-600">{formatCnpj(pjData.cnpj) || 'Não informado'}</span>
                    </span>
                    {pjData.tipoPj && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100">
                        {pjData.tipoPj}
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full ${statusColor[pjData.status?.toUpperCase()] || 'bg-slate-100 text-slate-500'}`}>
                      {pjData.status || 'ATIVO'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2.5 rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    Excluir
                  </button>
                  <button
                    onClick={startEditing}
                    className="px-5 py-2.5 rounded-xl bg-[#001a33] hover:bg-blue-900 text-white transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-slate-900/20"
                  >
                    <Edit3 size={14} />
                    Editar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={cancelEditing}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                  >
                    {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#001a33] text-white shadow-lg shadow-slate-900/20'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto">

        {/* ══════════ ABA: DADOS DA EMPRESA ══════════ */}
        {activeTab === 'dados' && (
          <div className="space-y-6 animate-fadeIn">

            {/* Identificação */}
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <Building size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Identificação da Empresa</h4>
                {isEditing && <span className="ml-auto text-[10px] text-blue-500 font-bold uppercase bg-blue-50 px-2 py-0.5 rounded-full">Modo Edição</span>}
              </div>

              {!isEditing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2"><Field label="Razão Social" value={pjData.nome} /></div>
                  <Field label="CNPJ" value={formatCnpj(pjData.cnpj)} mono />
                  <Field label="Tipo / Classificação" value={pjData.tipoPj} />
                  <Field label="Tipo de Convênio" value={pjData.tipoConvenio} />
                  <Field label="Status" value={pjData.status} />
                  <div className="md:col-span-3"><Field label="Polo Vinculado" value={pjData.poloNome} /></div>
                  {/* Logo em modo leitura */}
                  {pjData.foto && (
                    <div className="md:col-span-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Logo / Imagem</p>
                      <img src={pjData.foto} alt={pjData.nome} className="h-16 object-contain rounded-xl border border-slate-100 bg-slate-50 p-2" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Razão Social <span className="text-red-500">*</span></label>
                    <input name="nomeCompleto" value={d.nome || ''} onChange={handleEditChange} className={inputCls} placeholder="Razão social da empresa" />
                  </div>
                  <div>
                    <label className={labelCls}>CNPJ</label>
                    <input name="cnpj" value={d.cnpj || ''} onChange={handleEditChange} className={`${inputCls} font-mono`} placeholder="00.000.000/0000-00" maxLength={18} />
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select name="status" value={d.status || 'ATIVO'} onChange={handleEditChange} className={inputCls}>
                      <option value="ATIVO">ATIVO</option>
                      <option value="INATIVO">INATIVO</option>
                      <option value="SUSPENSO">SUSPENSO</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Classificação / Tipo</label>
                    <input name="tipoPj" value={d.tipoPj || ''} onChange={handleEditChange} className={inputCls} placeholder="Ex: Faculdade Parceira, Franquia..." />
                  </div>
                  <div>
                    <label className={labelCls}>Tipo de Convênio</label>
                    <input name="tipoConvenio" value={d.tipoConvenio || ''} onChange={handleEditChange} className={inputCls} placeholder="Ex: Afiliado, Parceiro EAD..." />
                  </div>
                  {/* LOGO UPLOAD */}
                  <div className="md:col-span-3">
                    <label className={labelCls}>Logo / Imagem da Empresa</label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                        {d.foto ? (
                          <img src={d.foto} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                          <Image size={24} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase cursor-pointer transition-colors border border-slate-200 w-full">
                          {isUploadingLogo ? (
                            <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                          ) : (
                            <><Upload size={14} /> Fazer Upload da Logo</>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={isUploadingLogo} />
                        </label>
                        <input
                          name="foto"
                          value={d.foto || ''}
                          onChange={handleEditChange}
                          className={`${inputCls} text-xs font-mono`}
                          placeholder="Ou cole a URL da imagem aqui..."
                        />
                        {d.foto && (
                          <button type="button" onClick={() => setEditData((prev: any) => ({ ...prev, foto: '' }))} className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-wide">
                            × Remover logo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Endereço */}
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <MapPin size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Endereço</h4>
              </div>

              {!isEditing ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <Field label="CEP" value={pjData.cep} mono />
                  <div className="md:col-span-2"><Field label="Endereço" value={pjData.endereco} /></div>
                  <Field label="Número" value={pjData.numero} />
                  <Field label="Complemento" value={pjData.complemento} />
                  <div className="md:col-span-2"><Field label="Bairro" value={pjData.bairro} /></div>
                  <Field label="Cidade" value={pjData.cidade} />
                  <Field label="UF" value={pjData.uf} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div>
                    <label className={labelCls}>CEP</label>
                    <input name="cep" value={d.cep || ''} onChange={handleEditChange} className={inputCls} placeholder="00000-000" maxLength={9} />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelCls}>Endereço</label>
                    <input name="endereco" value={d.endereco || ''} onChange={handleEditChange} className={inputCls} placeholder="Rua / Avenida" />
                  </div>
                  <div>
                    <label className={labelCls}>Número</label>
                    <input name="numero" value={d.numero || ''} onChange={handleEditChange} className={inputCls} placeholder="123" />
                  </div>
                  <div>
                    <label className={labelCls}>Complemento</label>
                    <input name="complemento" value={d.complemento || ''} onChange={handleEditChange} className={inputCls} placeholder="Sala, Andar..." />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Bairro</label>
                    <input name="bairro" value={d.bairro || ''} onChange={handleEditChange} className={inputCls} placeholder="Bairro" />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelCls}>Cidade</label>
                    <input name="cidade" value={d.cidade || ''} onChange={handleEditChange} className={inputCls} placeholder="Cidade" />
                  </div>
                  <div>
                    <label className={labelCls}>UF</label>
                    <select name="uf" value={d.uf || ''} onChange={handleEditChange} className={inputCls}>
                      <option value="">UF</option>
                      {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Contato */}
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <Phone size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Contato Comercial</h4>
              </div>

              {!isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div><Field label="E-mail" value={pjData.email} /></div>
                  <div><Field label="Telefone Principal" value={pjData.telefone} /></div>
                  <div><Field label="Responsável / Contato" value={pjData.responsavelNome} /></div>
                  <div><Field label="CPF do Contato" value={formatCpf(pjData.responsavelCpf)} mono /></div>
                  <div><Field label="Cargo / Função" value={pjData.responsavelCargo} /></div>
                  <div><Field label="E-mail do Contato" value={pjData.responsavelEmail} /></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className={labelCls}>E-mail Institucional</label>
                    <input type="email" name="email" value={d.email || ''} onChange={handleEditChange} className={inputCls} placeholder="contato@empresa.com" />
                  </div>
                  <div>
                    <label className={labelCls}>Telefone Comercial</label>
                    <input name="telefone" value={d.telefone || ''} onChange={handleEditChange} className={inputCls} placeholder="(00) 00000-0000" maxLength={15} />
                  </div>
                  <div>
                    <label className={labelCls}>Nome do Contato</label>
                    <input name="responsavelNome" value={d.responsavelNome || ''} onChange={handleEditChange} className={inputCls} placeholder="Nome do representante" />
                  </div>
                  <div>
                    <label className={labelCls}>Cargo do Contato</label>
                    <input name="responsavelCargo" value={d.responsavelCargo || ''} onChange={handleEditChange} className={inputCls} placeholder="Ex: Diretor, Coordenador..." />
                  </div>
                  <div>
                    <label className={labelCls}>Telefone do Contato</label>
                    <input name="responsavelTelefone" value={d.responsavelTelefone || ''} onChange={handleEditChange} className={inputCls} placeholder="(00) 00000-0000" maxLength={15} />
                  </div>
                  <div>
                    <label className={labelCls}>E-mail do Contato</label>
                    <input type="email" name="responsavelEmail" value={d.responsavelEmail || ''} onChange={handleEditChange} className={inputCls} placeholder="contato@empresa.com" />
                  </div>
                </div>
              )}
            </div>

            {/* Observações */}
            {(pjData.observacao || isEditing) && (
              <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-4">
                  <AlertCircle size={16} />
                  <h4 className="text-xs font-black uppercase tracking-wider">Observações da Parceria</h4>
                </div>
                {!isEditing ? (
                  <p className="text-sm text-slate-600 leading-relaxed">{pjData.observacao}</p>
                ) : (
                  <textarea name="observacao" value={d.observacao || ''} onChange={handleEditChange} rows={4}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-blue-400 outline-none transition-all resize-none"
                    placeholder="Condições da parceria, validade do convênio, observações importantes..." />
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════ ABA: PARCERIA / CONVÊNIO ══════════ */}
        {activeTab === 'parceria' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <Handshake size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Informações da Parceria</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Field label="Tipo de Convênio" value={pjData.tipoConvenio} />
                <Field label="Classificação" value={pjData.tipoPj} />
                <Field label="Polo de Atuação" value={pjData.poloNome} />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-6 rounded-[2rem]">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-black text-blue-700 uppercase tracking-wider mb-1">Sobre esta aba</p>
                  <p className="text-xs text-blue-600 leading-relaxed">
                    Futuramente esta seção permitirá cadastrar cursos afiliados, termos de convênio, e gerenciar o status de parceria de forma detalhada com documentos vinculados.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 border border-red-100">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-2">Excluir Parceiro?</h3>
              <p className="text-sm text-slate-500 mb-7 leading-relaxed">
                O registro de <strong>{pjData.nome}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { deleteMutation.mutate(); setShowDeleteConfirm(false); }}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-red-500/20 disabled:opacity-60"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroPJDetalhes;
