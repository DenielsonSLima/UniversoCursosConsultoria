
import React, { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Trash2, Copy, Building2, CreditCard, Power, PowerOff, RefreshCw } from 'lucide-react';
import AccountForm from './AccountForm';
import { contasBancariasService } from '../contas-bancarias.service';
import ConfirmModal from '../../../components/ConfirmModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';

interface CompanyAccountsManagerProps {
  company: any;
  onBack: () => void;
}

const CompanyAccountsManager: React.FC<CompanyAccountsManagerProps> = ({ company, onBack }) => {
  const [viewState, setViewState] = useState<'list' | 'form'>('list');
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const queryClient = useQueryClient();

  // Estado Modal Exclusão
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  // Estado Modal Inativação
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [accountToToggle, setAccountToToggle] = useState<any | null>(null);

  // 1. Carregar as contas bancárias usando useQuery
  const { data: accounts = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ['accounts', company.id],
    queryFn: () => contasBancariasService.getAccountsByCompany(company.id),
  });

  // 2. Realtime para atualizar as contas instantaneamente se houver mudanças no banco
  useEffect(() => {
    const channel = supabase
      .channel(`accounts_realtime_${company.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_bancarias', filter: `polo_id=eq.${company.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['accounts', company.id] });
          queryClient.invalidateQueries({ queryKey: ['companies_accounts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company.id, queryClient]);

  // 3. Mutations para Salvar, Alternar Status e Excluir
  const saveMutation = useMutation<any, Error, any>({
    mutationFn: async (data: any) => {
      if (selectedAccount) {
        return contasBancariasService.updateAccount(selectedAccount.id, data);
      } else {
        return contasBancariasService.createAccount(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', company.id] });
      queryClient.invalidateQueries({ queryKey: ['companies_accounts'] });
      setViewState('list');
      setSelectedAccount(null);
    },
    onError: (err: any) => alert(`Erro ao salvar conta: ${err.message}`),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: boolean }) => 
      contasBancariasService.toggleAccountStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', company.id] });
      queryClient.invalidateQueries({ queryKey: ['companies_accounts'] });
      setAccountToToggle(null);
    },
    onError: (err: any) => alert(`Erro ao alterar status da conta: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contasBancariasService.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', company.id] });
      queryClient.invalidateQueries({ queryKey: ['companies_accounts'] });
      setAccountToDelete(null);
    },
    onError: (err: any) => alert(`Erro ao excluir conta: ${err.message}`),
  });

  const confirmDelete = (id: string) => {
    setAccountToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmToggleStatus = (account: any) => {
    setAccountToToggle(account);
    setStatusModalOpen(true);
  };

  const handleDelete = async () => {
    if (accountToDelete) {
      deleteMutation.mutate(accountToDelete);
    }
  };

  const handleToggleStatus = async () => {
    if (accountToToggle) {
      toggleStatusMutation.mutate({ id: accountToToggle.id, status: !accountToToggle.ativo });
    }
  };

  const handleSave = async (data: any) => {
    saveMutation.mutate(data);
  };

  const getBankColor = (bankName: string, isActive: boolean) => {
    if (!isActive) return 'from-slate-400 to-slate-600 grayscale'; // Cor inativa

    const name = bankName.toLowerCase();
    if (name.includes('nubank')) return 'from-purple-600 to-purple-900';
    if (name.includes('brasil') || name.includes('bb')) return 'from-yellow-400 to-blue-900';
    if (name.includes('caixa')) return 'from-blue-500 to-orange-500';
    if (name.includes('inter')) return 'from-orange-500 to-orange-700';
    if (name.includes('santander')) return 'from-red-600 to-red-800';
    if (name.includes('bradesco')) return 'from-red-500 to-red-700';
    if (name.includes('itau')) return 'from-orange-500 to-blue-900';
    return 'from-slate-700 to-slate-900';
  };

  if (viewState === 'form') {
    return (
      <AccountForm 
        companyId={company.id}
        initialData={selectedAccount}
        onSave={handleSave}
        onCancel={() => {
          setViewState('list');
          setSelectedAccount(null);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando contas bancárias...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar as contas bancárias:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header da Empresa */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33]">{company.nomeFantasia}</h3>
            <p className="text-slate-500 text-sm flex items-center gap-2">
              <Building2 size={14} /> Gerenciando contas bancárias desta unidade
            </p>
          </div>
        </div>
        <button 
          onClick={() => {
            setSelectedAccount(null);
            setViewState('form');
          }}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Nova Conta
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
          <CreditCard size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium mb-4">Nenhuma conta cadastrada para esta unidade.</p>
          <button 
            onClick={() => setViewState('form')}
            className="text-blue-600 font-bold hover:underline"
          >
            Adicionar primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((account) => (
            <div 
              key={account.id} 
              className={`relative h-60 rounded-[1.5rem] p-6 text-white shadow-xl bg-gradient-to-br ${getBankColor(account.banco, account.ativo !== false)} flex flex-col justify-between overflow-hidden group transition-all duration-300 ${!account.ativo ? 'opacity-80' : 'hover:-translate-y-1'}`}
            >
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
              
              {/* Badge Inativo */}
              {!account.ativo && (
                <div className="absolute inset-0 bg-slate-900/40 z-20 flex items-center justify-center backdrop-blur-[1px] pointer-events-none">
                  <span className="bg-red-500/90 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-red-400 shadow-lg transform -rotate-12">
                    Conta Inativa
                  </span>
                </div>
              )}

              <div className="relative z-30 flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80">{account.banco}</p>
                  <p className="text-[10px] font-medium opacity-60">{account.tipo}</p>
                </div>
                
                {/* Ações Rápidas (Sempre visíveis mas discretas) */}
                <div className="flex gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); confirmToggleStatus(account); }}
                    className={`p-1.5 rounded-lg backdrop-blur-md transition-colors ${
                      account.ativo 
                        ? 'bg-white/20 hover:bg-red-500/80 text-white' 
                        : 'bg-emerald-500/80 hover:bg-emerald-600 text-white shadow-lg pointer-events-auto cursor-pointer'
                    }`}
                    title={account.ativo ? "Inativar Conta" : "Reativar Conta"}
                  >
                    {account.ativo ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>

                  {account.ativo && (
                    <>
                      <button 
                        onClick={() => {
                          setSelectedAccount(account);
                          setViewState('form');
                        }}
                        className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Editar / Copiar"
                      >
                        <Copy size={14} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(account.id)}
                        className="p-1.5 bg-white/20 rounded-lg hover:bg-red-500/50 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-1">
                   <div>
                     <p className="text-[10px] uppercase tracking-wider opacity-60">Agência</p>
                     <p className="font-mono font-bold text-lg tracking-wide">{account.agencia}</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-wider opacity-60">Conta</p>
                     <p className="font-mono font-bold text-lg tracking-wide">{account.conta}</p>
                   </div>
                </div>
              </div>

              <div className="relative z-10 border-t border-white/20 pt-3 mt-1">
                <p className="text-[10px] uppercase tracking-wider opacity-60">Titular</p>
                <p className="font-bold text-sm truncate">{account.titular}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Exclusão */}
      <ConfirmModal 
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Excluir Conta Bancária?"
        message="Esta ação apagará permanentemente os dados desta conta. Se ela já foi usada, prefira INATIVAR."
        confirmText="Sim, Excluir"
        variant="danger"
      />

      {/* Modal de Status (Inativar/Ativar) */}
      <ConfirmModal 
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        onConfirm={handleToggleStatus}
        title={accountToToggle?.ativo ? "Inativar Conta Bancária?" : "Reativar Conta Bancária?"}
        message={accountToToggle?.ativo 
          ? "Ao inativar, esta conta deixará de aparecer nas opções de pagamento para novos alunos, mas o histórico financeiro será preservado."
          : "Deseja tornar esta conta disponível novamente para recebimentos e pagamentos?"
        }
        confirmText={accountToToggle?.ativo ? "Inativar Conta" : "Reativar Conta"}
        variant={accountToToggle?.ativo ? "warning" : "info"}
      />
    </div>
  );
};

export default CompanyAccountsManager;
