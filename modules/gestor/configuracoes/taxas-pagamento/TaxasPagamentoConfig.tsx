import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, Percent, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taxasPagamentoService, TaxaPagamento } from './taxas-pagamento.service';
import { supabase } from '../../../../lib/supabase';

const TaxasPagamentoConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [editedTaxas, setEditedTaxas] = useState<Record<string, Partial<TaxaPagamento>>>({});

  // 1. Carregar as taxas de pagamento
  const { data: taxas = [], isLoading, isError, error } = useQuery<TaxaPagamento[]>({
    queryKey: ['taxas_pagamento'],
    queryFn: taxasPagamentoService.getAll,
  });

  // 2. Realtime para taxas_pagamento
  useEffect(() => {
    const channel = supabase
      .channel('taxas_pagamento_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'taxas_pagamento' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['taxas_pagamento'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutations para Salvar, Adicionar e Excluir
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TaxaPagamento> }) => 
      taxasPagamentoService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['taxas_pagamento'] });
      // Limpa do estado de editados
      setEditedTaxas(prev => {
        const copy = { ...prev };
        delete copy[variables.id];
        return copy;
      });
      alert('Taxa atualizada com sucesso!');
    },
    onError: (err: any) => alert(`Erro ao atualizar taxa: ${err.message}`),
  });

  const createMutation = useMutation({
    mutationFn: () => taxasPagamentoService.create({
      forma: 'Nova Forma de Pagamento',
      prazo: 'Imediato',
      taxa: 0.00
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxas_pagamento'] });
    },
    onError: (err: any) => alert(`Erro ao criar taxa: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => taxasPagamentoService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxas_pagamento'] });
    },
    onError: (err: any) => alert(`Erro ao excluir taxa: ${err.message}`),
  });

  const handleFieldChange = (id: string, field: keyof TaxaPagamento, value: any) => {
    setEditedTaxas(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSaveLine = (id: string) => {
    const changes = editedTaxas[id];
    if (changes) {
      updateMutation.mutate({ id, data: changes });
    }
  };

  const handleRemove = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta taxa de pagamento?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando taxas de pagamento...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar as taxas de pagamento:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl animate-fadeIn">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Taxas e Formas de Pagamento</h3>
          <p className="text-sm font-medium text-slate-500 mt-1">Configuração de taxas de operadoras e maquininhas para o fluxo de caixa real.</p>
        </div>
        <button 
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
        >
          <Plus size={16} /> Nova Taxa
        </button>
      </div>

      <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl mb-8 flex items-start gap-3">
        <div className="text-blue-500 mt-0.5">
          <AlertCircle size={20} />
        </div>
        <p className="text-sm font-medium text-slate-600">
          As taxas cadastradas aqui serão deduzidas automaticamente dos recebimentos do dia para compor o seu fluxo de caixa líquido.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-6">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h4 className="font-bold text-[#001a33] text-sm uppercase tracking-widest">Taxas Cadastradas (Supabase)</h4>
        </div>
        
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest bg-white">
              <th className="px-6 py-4">Forma de Pagamento</th>
              <th className="px-6 py-4">Prazo de Recebimento</th>
              <th className="px-6 py-4">Taxa (%)</th>
              <th className="px-6 py-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {taxas.map((taxa) => {
              const id = taxa.id!;
              const currentForma = editedTaxas[id]?.forma !== undefined ? editedTaxas[id].forma : taxa.forma;
              const currentPrazo = editedTaxas[id]?.prazo !== undefined ? editedTaxas[id].prazo : taxa.prazo;
              const currentTaxaVal = editedTaxas[id]?.taxa !== undefined ? editedTaxas[id].taxa : taxa.taxa;
              const isModified = editedTaxas[id] !== undefined;

              return (
                <tr key={id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      className="w-full bg-transparent border-b border-transparent focus:border-blue-500 font-bold text-slate-700 outline-none text-sm py-1"
                      value={currentForma}
                      onChange={(e) => handleFieldChange(id, 'forma', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      className="w-full bg-transparent border-b border-transparent focus:border-blue-500 font-medium text-slate-600 outline-none text-sm py-1"
                      value={currentPrazo}
                      onChange={(e) => handleFieldChange(id, 'prazo', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative w-32">
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 text-sm font-bold text-slate-700 text-right pr-8"
                        value={currentTaxaVal}
                        onChange={(e) => handleFieldChange(id, 'taxa', e.target.value)}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Percent size={14} />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isModified && (
                        <button 
                          onClick={() => handleSaveLine(id)}
                          disabled={updateMutation.isPending}
                          className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                          title="Salvar Alterações"
                        >
                          <Save size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleRemove(id)}
                        disabled={deleteMutation.isPending}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {taxas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm font-semibold">
                  Nenhuma taxa cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaxasPagamentoConfig;
