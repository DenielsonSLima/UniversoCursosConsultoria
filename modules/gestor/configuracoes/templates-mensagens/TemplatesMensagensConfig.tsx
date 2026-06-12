import React, { useState, useEffect } from 'react';
import { Save, Plus, MessageSquare, Variable, Trash2, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mensageriaService, TemplateMensagem } from '../mensageria/mensageria.service';
import { supabase } from '../../../../lib/supabase';

const TemplatesMensagensConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Partial<TemplateMensagem>>({});

  // 1. Carregar os templates de mensagens usando useQuery
  const { data: templates = [], isLoading, isError, error } = useQuery<TemplateMensagem[]>({
    queryKey: ['templates_mensagens'],
    queryFn: mensageriaService.getTemplates,
  });

  // 2. Realtime para templates_mensagens
  useEffect(() => {
    const channel = supabase
      .channel('templates_mensagens_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'templates_mensagens' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['templates_mensagens'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutations para Salvar e Excluir
  const saveMutation = useMutation({
    mutationFn: (data: Omit<TemplateMensagem, 'id'>) => {
      if (isEditing && isEditing !== 'novo') {
        return mensageriaService.updateTemplate(isEditing, data);
      } else {
        return mensageriaService.createTemplate(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates_mensagens'] });
      setIsEditing(null);
      setEditingTemplate({});
    },
    onError: (err: any) => alert(`Erro ao salvar template: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mensageriaService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates_mensagens'] });
      if (isEditing) {
        setIsEditing(null);
        setEditingTemplate({});
      }
    },
    onError: (err: any) => alert(`Erro ao excluir template: ${err.message}`),
  });

  const handleEdit = (template: TemplateMensagem) => {
    setIsEditing(template.id || null);
    setEditingTemplate(template);
  };

  const handleSave = () => {
    if (!editingTemplate.nome || !editingTemplate.conteudo) {
      alert('Nome e Conteúdo são obrigatórios.');
      return;
    }
    saveMutation.mutate({
      nome: editingTemplate.nome || '',
      gatilho: editingTemplate.gatilho || 'Manual',
      conteudo: editingTemplate.conteudo || '',
    });
  };

  const handleRemove = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este template?')) {
      deleteMutation.mutate(id);
    }
  };

  const insertVariable = (variable: string) => {
    setEditingTemplate(prev => ({
      ...prev,
      conteudo: (prev.conteudo || '') + ` {{${variable}}}`
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando templates...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center animate-fadeIn">
        <p className="text-red-600 font-bold">Erro ao carregar templates:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl animate-fadeIn">
       <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Templates de Mensagens</h3>
          <p className="text-sm font-medium text-slate-500 mt-1">Textos padrões variáveis para envios automáticos.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditing('novo');
            setEditingTemplate({ nome: '', gatilho: 'Manual', conteudo: '' });
          }}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Template
        </button>
      </div>

      <div className="grid grid-cols-1 grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lista de Templates */}
        <div className="lg:col-span-1 space-y-3">
          {templates.map(template => (
            <div 
              key={template.id} 
              onClick={() => handleEdit(template)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                isEditing === template.id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-slate-50'
              }`}
            >
               <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-[#001a33] text-sm">{template.nome}</h4>
                 <div className="flex gap-2">
                   <button 
                     onClick={(e) => { e.stopPropagation(); if (template.id) handleRemove(template.id); }}
                     className="text-slate-400 hover:text-red-500 p-1"
                   >
                     <Trash2 size={16} />
                   </button>
                 </div>
               </div>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                 Disparo: <span className="text-blue-600">{template.gatilho}</span>
               </p>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-slate-400 text-xs font-semibold text-center py-6">Nenhum template cadastrado.</p>
          )}
        </div>

        {/* Editor de Template */}
        {isEditing && (
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-fadeIn flex flex-col h-full">
            <h4 className="font-black text-[#001a33] text-lg mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <MessageSquare size={20} className="text-blue-600" /> 
              {templates.find(t => t.id === isEditing) ? 'Editar Template' : 'Novo Template'}
            </h4>
            
            <div className="space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome do Template</label>
                  <input
                    type="text"
                    value={editingTemplate.nome || ''}
                    onChange={e => setEditingTemplate({...editingTemplate, nome: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gatilho de Disparo</label>
                  <select
                    value={editingTemplate.gatilho || 'Manual'}
                    onChange={e => setEditingTemplate({...editingTemplate, gatilho: e.target.value})}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all"
                  >
                    <option value="Manual">Envio Manual</option>
                    <option value="1 dia antes do vencimento">1 dia antes do vencimento</option>
                    <option value="No dia do vencimento">No dia do vencimento</option>
                    <option value="Post-vencido (3 dias)">3 dias após o vencimento (Atraso)</option>
                    <option value="Matrícula confirmada">Confirmação de Matrícula</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Conteúdo da Mensagem</label>
                </div>
                
                <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                  <textarea
                    value={editingTemplate.conteudo || ''}
                    onChange={e => setEditingTemplate({...editingTemplate, conteudo: e.target.value})}
                    className="w-full h-40 p-4 resize-none outline-none text-slate-700 font-medium"
                    placeholder="Digite a mensagem aqui. Use os botões abaixo para inserir variáveis..."
                  />
                  
                  <div className="bg-slate-50 border-t border-slate-200 p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                      <Variable size={12} /> Variáveis Disponíveis
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['nome_parceiro', 'nome_curso', 'data_vencimento', 'valor_fatura', 'linha_digitavel', 'codigo_pix', 'link_pagamento'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVariable(v)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsEditing(null)}
                className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
              >
                <Save size={16} /> {saveMutation.isPending ? 'Salvando...' : 'Salvar Template'}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default TemplatesMensagensConfig;
