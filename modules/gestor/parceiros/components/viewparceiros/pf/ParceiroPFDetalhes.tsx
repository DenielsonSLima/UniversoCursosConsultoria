// File: modules/gestor/parceiros/components/viewparceiros/pf/ParceiroPFDetalhes.tsx
// Página de detalhes de Parceiro Pessoa Física com dados reais, edição e abas adequadas ao tipo

import React, { useState } from 'react';
import {
  ArrowLeft, User, Briefcase, Edit3, Save, X,
  MapPin, DollarSign, AlertCircle, Loader2, Trash2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../../../parceiros.service';
import { useToast } from '../../shared/ToastNotification';
import ToastNotification from '../../shared/ToastNotification';
import { formatCpf } from '../../../../../../lib/documentFormatters';

interface ParceiroPFDetalhesProps {
  pfInicial: any;
  onBack: () => void;
}

type TabPF = 'dados' | 'servico';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const Field: React.FC<{ label: string; value?: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-sm font-semibold text-[#001a33] ${mono ? 'font-mono' : ''}`}>
      {value || <span className="text-slate-300 italic font-normal">Não informado</span>}
    </p>
  </div>
);

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-amber-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5';

const ParceiroPFDetalhes: React.FC<ParceiroPFDetalhesProps> = ({ pfInicial, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabPF>('dados');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const { data: pfData = pfInicial, isLoading } = useQuery({
    queryKey: ['parceiro', pfInicial.id],
    queryFn: () => parceirosService.getById(pfInicial.id),
    initialData: pfInicial,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => parceirosService.update(pfInicial.id, { ...data, tipo: 'PF' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiro', pfInicial.id] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      setIsEditing(false);
      setEditData(null);
      toast.success('Parceiro atualizado!', 'Os dados foram salvos com sucesso.');
    },
    onError: () => toast.error('Erro ao salvar', 'Verifique os dados e tente novamente.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => parceirosService.delete(pfInicial.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      toast.success('Parceiro excluído!', 'O registro foi removido com sucesso.');
      setTimeout(() => onBack(), 1200);
    },
    onError: () => toast.error('Erro ao excluir', 'Não foi possível remover o registro.'),
  });

  const startEditing = () => { setEditData({ ...pfData }); setIsEditing(true); };
  const cancelEditing = () => { setEditData(null); setIsEditing(false); };
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditData((prev: any) => ({ ...prev, [name]: value }));
  };
  const handleSave = () => { if (editData) updateMutation.mutate(editData); };

  const statusColor: Record<string, string> = {
    ATIVO: 'bg-emerald-100 text-emerald-700',
    INATIVO: 'bg-slate-100 text-slate-500',
    SUSPENSO: 'bg-red-100 text-red-600',
  };

  const tabs: { id: TabPF; label: string; icon: React.ReactNode }[] = [
    { id: 'dados', label: 'Dados Pessoais', icon: <User size={16} /> },
    { id: 'servico', label: 'Serviço & Pagamento', icon: <DollarSign size={16} /> },
  ];

  const d = isEditing ? editData : pfData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-amber-500" size={32} />
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
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-400 transition-colors bg-slate-50"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <User size={26} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight leading-none">
                    {pfData.nome}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                      Pessoa Física • CPF: <span className="font-mono text-slate-600">{formatCpf(pfData.cpf) || 'Não informado'}</span>
                    </span>
                    {pfData.tipoServico && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded-full border border-amber-100">
                        {pfData.tipoServico}
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full ${statusColor[pfData.status?.toUpperCase()] || 'bg-slate-100 text-slate-500'}`}>
                      {pfData.status || 'ATIVO'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2.5 rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                  <button
                    onClick={startEditing}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    <Edit3 size={14} /> Editar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={cancelEditing} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    <X size={14} /> Cancelar
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

          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">

        {/* ══════════ ABA: DADOS PESSOAIS ══════════ */}
        {activeTab === 'dados' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <User size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Dados Pessoais</h4>
                {isEditing && <span className="ml-auto text-[10px] text-amber-600 font-bold uppercase bg-amber-50 px-2 py-0.5 rounded-full">Modo Edição</span>}
              </div>
              {!isEditing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2"><Field label="Nome Completo" value={pfData.nome} /></div>
                  <Field label="CPF" value={formatCpf(pfData.cpf)} mono />
                  <Field label="Data de Nascimento" value={pfData.dataNascimento} />
                  <Field label="Sexo" value={pfData.sexo} />
                  <Field label="RG" value={pfData.rg} mono />
                  <div className="md:col-span-2"><Field label="E-mail" value={pfData.email} /></div>
                  <Field label="Telefone / WhatsApp" value={pfData.telefone} />
                  <Field label="Status" value={pfData.status} />
                  <Field label="Polo Vinculado" value={pfData.poloNome} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Nome Completo</label>
                    <input name="nomeCompleto" value={d.nome || ''} onChange={handleEditChange} className={inputCls} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className={labelCls}>CPF</label>
                    <input name="cpf" value={d.cpf || ''} onChange={handleEditChange} className={`${inputCls} font-mono`} placeholder="000.000.000-00" maxLength={14} />
                  </div>
                  <div>
                    <label className={labelCls}>Data de Nascimento</label>
                    <input name="dataNascimento" value={d.dataNascimento || ''} onChange={handleEditChange} className={inputCls} placeholder="DD/MM/AAAA" maxLength={10} />
                  </div>
                  <div>
                    <label className={labelCls}>Sexo</label>
                    <select name="sexo" value={d.sexo || ''} onChange={handleEditChange} className={inputCls}>
                      <option value="">Selecione...</option>
                      <option value="MASCULINO">MASCULINO</option>
                      <option value="FEMININO">FEMININO</option>
                      <option value="NÃO-BINÁRIO">NÃO-BINÁRIO</option>
                      <option value="PREFIRO NÃO INFORMAR">PREFIRO NÃO INFORMAR</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>RG</label>
                    <input name="rg" value={d.rg || ''} onChange={handleEditChange} className={`${inputCls} font-mono`} placeholder="Número do RG" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>E-mail</label>
                    <input type="email" name="email" value={d.email || ''} onChange={handleEditChange} className={inputCls} placeholder="email@exemplo.com" />
                  </div>
                  <div>
                    <label className={labelCls}>Telefone</label>
                    <input name="telefone" value={d.telefone || ''} onChange={handleEditChange} className={inputCls} placeholder="(00) 00000-0000" maxLength={15} />
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select name="status" value={d.status || 'ATIVO'} onChange={handleEditChange} className={inputCls}>
                      <option value="ATIVO">ATIVO</option>
                      <option value="INATIVO">INATIVO</option>
                    </select>
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
                  <Field label="CEP" value={pfData.cep} mono />
                  <div className="md:col-span-2"><Field label="Endereço" value={pfData.endereco} /></div>
                  <Field label="Número" value={pfData.numero} />
                  <Field label="Complemento" value={pfData.complemento} />
                  <div className="md:col-span-2"><Field label="Bairro" value={pfData.bairro} /></div>
                  <Field label="Cidade" value={pfData.cidade} />
                  <Field label="UF" value={pfData.uf} />
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
                    <input name="complemento" value={d.complemento || ''} onChange={handleEditChange} className={inputCls} placeholder="Apto, Bloco..." />
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
          </div>
        )}

        {/* ══════════ ABA: SERVIÇO & PAGAMENTO ══════════ */}
        {activeTab === 'servico' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <Briefcase size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Tipo de Serviço & Vínculo</h4>
              </div>
              {!isEditing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2"><Field label="Tipo de Serviço Prestado" value={pfData.tipoServico} /></div>
                  <Field label="Tipo de Vínculo" value={pfData.tipoVinculo} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Tipo de Serviço</label>
                    <input name="tipoServico" value={d.tipoServico || ''} onChange={handleEditChange} className={inputCls} placeholder="Ex: Consultoria, Limpeza..." />
                  </div>
                  <div>
                    <label className={labelCls}>Tipo de Vínculo</label>
                    <input name="tipoVinculo" value={d.tipoVinculo || ''} onChange={handleEditChange} className={inputCls} placeholder="Ex: Autônomo, MEI..." />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
                <DollarSign size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Dados para Pagamento</h4>
              </div>
              {!isEditing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="md:col-span-3"><Field label="Chave PIX" value={pfData.chavePix} mono /></div>
                  <Field label="Banco" value={pfData.banco} />
                  <Field label="Tipo de Conta" value={pfData.tipoConta} />
                  <div />
                  <Field label="Agência" value={pfData.agencia} mono />
                  <Field label="Conta" value={pfData.conta} mono />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-3">
                    <label className={labelCls}>Chave PIX</label>
                    <input name="chavePix" value={d.chavePix || ''} onChange={handleEditChange} className={inputCls} placeholder="CPF, telefone, e-mail ou chave aleatória" />
                  </div>
                  <div>
                    <label className={labelCls}>Banco</label>
                    <input name="banco" value={d.banco || ''} onChange={handleEditChange} className={inputCls} placeholder="Nome do banco" />
                  </div>
                  <div>
                    <label className={labelCls}>Tipo de Conta</label>
                    <select name="tipoConta" value={d.tipoConta || 'Corrente'} onChange={handleEditChange} className={inputCls}>
                      <option value="Corrente">Corrente</option>
                      <option value="Poupança">Poupança</option>
                    </select>
                  </div>
                  <div />
                  <div>
                    <label className={labelCls}>Agência</label>
                    <input name="agencia" value={d.agencia || ''} onChange={handleEditChange} className={inputCls} placeholder="0000" />
                  </div>
                  <div>
                    <label className={labelCls}>Conta</label>
                    <input name="conta" value={d.conta || ''} onChange={handleEditChange} className={inputCls} placeholder="00000-0" />
                  </div>
                </div>
              )}
            </div>

            {(pfData.observacao || isEditing) && (
              <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-4">
                  <AlertCircle size={16} />
                  <h4 className="text-xs font-black uppercase tracking-wider">Observações</h4>
                </div>
                {!isEditing ? (
                  <p className="text-sm text-slate-600 leading-relaxed">{pfData.observacao}</p>
                ) : (
                  <textarea name="observacao" value={d.observacao || ''} onChange={handleEditChange} rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-amber-400 outline-none transition-all resize-none"
                    placeholder="Observações sobre o prestador de serviço..." />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 border border-red-100">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-2">Excluir Parceiro?</h3>
              <p className="text-sm text-slate-500 mb-7 leading-relaxed">
                O registro de <strong>{pfData.nome}</strong> será removido permanentemente.
              </p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => { deleteMutation.mutate(); setShowDeleteConfirm(false); }}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-red-500/20"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroPFDetalhes;
