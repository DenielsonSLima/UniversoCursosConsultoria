import React, { useState, useEffect } from 'react';
import { Save, Plus, Building, Trash2, RefreshCw, AlertCircle, Power } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { polosService, Polo } from './polos.service';
import { supabase } from '../../../../lib/supabase';

// Novos componentes de modal customizados
import ModalExcluirPolo from './components/ModalExcluirPolo';
import ModalInativarPolo from './components/ModalInativarPolo';

const PolosConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editingPolo, setEditingPolo] = useState<Partial<Polo>>({});

  // Estados para os modais customizados
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [poloToDelete, setPoloToDelete] = useState<Polo | null>(null);

  const [inactivateModalOpen, setInactivateModalOpen] = useState(false);
  const [poloToToggle, setPoloToToggle] = useState<Polo | null>(null);

  // 1. Carregar os polos do Supabase
  const { data: polos = [], isLoading, isError, error } = useQuery<Polo[]>({
    queryKey: ['polos'],
    queryFn: polosService.getAll,
  });

  // 2. Realtime para sincronização automática
  useEffect(() => {
    const channel = supabase
      .channel('polos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        () => {
          console.log('Alteração detectada em polos, recarregando...');
          queryClient.invalidateQueries({ queryKey: ['polos'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutations para salvar e excluir
  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Omit<Polo, 'id'> }) => {
      if (id) {
        return polosService.update(id, data);
      } else {
        return polosService.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polos'] });
      queryClient.invalidateQueries({ queryKey: ['active_polos'] });
      setIsEditing(null);
      setEditingPolo({});
    },
    onError: (err: any) => alert(`Erro ao salvar polo: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => polosService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polos'] });
      queryClient.invalidateQueries({ queryKey: ['active_polos'] });
      if (isEditing) {
        setIsEditing(null);
        setEditingPolo({});
      }
    },
    onError: (err: any) => alert(`Erro ao excluir polo: ${err.message}`),
  });

  const handleEdit = (polo: Polo) => {
    setIsEditing(polo.id || null);
    setEditingPolo(polo);
  };

  const handleRemoveClick = (polo: Polo) => {
    if (polo.is_matriz) {
      alert('Não é possível excluir o Polo Matriz.');
      return;
    }
    setPoloToDelete(polo);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (poloToDelete?.id) {
      deleteMutation.mutate(poloToDelete.id);
    }
  };

  const handleToggleStatusClick = (polo: Polo) => {
    if (polo.is_matriz) {
      alert('Não é possível inativar o Polo Matriz.');
      return;
    }
    setPoloToToggle(polo);
    setInactivateModalOpen(true);
  };

  const handleConfirmToggleStatus = () => {
    if (poloToToggle?.id) {
      saveMutation.mutate({
        id: poloToToggle.id,
        data: {
          nome: poloToToggle.nome,
          cnpj: poloToToggle.cnpj,
          cidade: poloToToggle.cidade,
          estado: poloToToggle.estado,
          status: poloToToggle.status === 'ativo' ? 'inativo' : 'ativo',
        }
      });
    }
  };

  const handleSave = () => {
    if (!editingPolo.nome || !editingPolo.cnpj) {
      alert('Nome e CNPJ são obrigatórios.');
      return;
    }

    const hasId = polos.some(p => p.id === isEditing);
    saveMutation.mutate({
      id: hasId ? (isEditing || undefined) : undefined,
      data: {
        nome: editingPolo.nome || '',
        cnpj: editingPolo.cnpj || '',
        cidade: editingPolo.cidade || '',
        estado: editingPolo.estado || '',
        status: editingPolo.status || 'ativo',
        endereco: editingPolo.endereco || '',
        numero: editingPolo.numero || '',
        bairro: editingPolo.bairro || '',
        cep: editingPolo.cep || '',
        telefone: editingPolo.telefone || '',
        email: editingPolo.email || '',
        logoUrl: editingPolo.logoUrl || '',
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando polos do banco...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar os polos:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
       <div className="mb-6 flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Polos e Filiais</h3>
          <p className="text-sm font-medium text-slate-500 mt-1">Gestão das unidades, matriz e filiais da instituição.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditing('novo');
            setEditingPolo({ nome: '', cnpj: '', cidade: '', estado: '', status: 'ativo' });
          }}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Polo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lista de Polos */}
        <div className="lg:col-span-1 space-y-3">
          {polos.map(polo => (
            <div 
              key={polo.id} 
              onClick={() => handleEdit(polo)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                isEditing === polo.id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-slate-50'
              }`}
            >
               <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-[#001a33] text-sm flex items-center flex-wrap gap-1.5">
                   <Building size={16} className="text-blue-600 flex-shrink-0" />
                   <span>{polo.nome}</span>
                   {polo.is_matriz && (
                     <span className="bg-blue-100 text-blue-800 text-[8px] px-2 py-0.5 rounded-md font-extrabold uppercase tracking-widest flex-shrink-0">
                       Matriz
                     </span>
                   )}
                 </h4>
                 
                 <div className="flex gap-1">
                   {!polo.is_matriz && (
                     <>
                       <button 
                         onClick={(e) => { 
                           e.stopPropagation(); 
                           handleToggleStatusClick(polo); 
                         }}
                         className={`p-1.5 rounded-lg transition-colors ${
                           polo.status === 'ativo' 
                             ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50' 
                             : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'
                         }`}
                         title={polo.status === 'ativo' ? 'Inativar Polo' : 'Ativar Polo'}
                       >
                         <Power size={14} />
                       </button>
                       <button 
                         onClick={(e) => { 
                           e.stopPropagation(); 
                           handleRemoveClick(polo); 
                         }}
                         className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                         title="Excluir Polo"
                       >
                         <Trash2 size={14} />
                       </button>
                     </>
                   )}
                 </div>
               </div>
               
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                 CNPJ: <span className="text-slate-700">{polo.cnpj}</span>
               </p>
               
               <div className="flex items-center gap-2 mt-2">
                 <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${
                   polo.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                 }`}>
                   {polo.status}
                 </span>
                 <span className="text-[10px] font-bold text-slate-400 uppercase">{polo.cidade} - {polo.estado}</span>
               </div>
            </div>
          ))}
          {polos.length === 0 && (
            <p className="text-slate-400 text-xs font-semibold text-center py-6">Nenhum polo cadastrado.</p>
          )}
        </div>

        {/* Editor de Polo */}
        {isEditing && (
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-fadeIn flex flex-col h-full">
            <h4 className="font-black text-[#001a33] text-lg mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Building size={20} className="text-blue-600" /> 
              {polos.find(p => p.id === isEditing) ? 'Editar Polo' : 'Novo Polo'}
            </h4>
            
            {editingPolo.is_matriz && (
              <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-2xl text-xs font-semibold mb-6 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p>
                  Este polo representa a <strong>Matriz</strong>. O Nome e o CNPJ são sincronizados automaticamente a partir das configurações em <strong>Dados da Empresa</strong>.
                </p>
              </div>
            )}
            
            <div className="space-y-5 flex-1">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome do Polo</label>
                <input
                  type="text"
                  value={editingPolo.nome || ''}
                  onChange={e => setEditingPolo({...editingPolo, nome: e.target.value})}
                  disabled={editingPolo.is_matriz}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="Ex: Polo Matriz"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CNPJ</label>
                  <input
                    type="text"
                    value={editingPolo.cnpj || ''}
                    onChange={e => setEditingPolo({...editingPolo, cnpj: e.target.value})}
                    disabled={editingPolo.is_matriz}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status</label>
                  <select
                    value={editingPolo.status || 'ativo'}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, status: e.target.value as 'ativo' | 'inativo'})}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cidade</label>
                  <input
                    type="text"
                    value={editingPolo.cidade || ''}
                    onChange={e => setEditingPolo({...editingPolo, cidade: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Estado (UF)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={editingPolo.estado || ''}
                    onChange={e => setEditingPolo({...editingPolo, estado: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Endereço / Logradouro</label>
                  <input
                    type="text"
                    value={editingPolo.endereco || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, endereco: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: Rua Principal"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Número</label>
                  <input
                    type="text"
                    value={editingPolo.numero || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, numero: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: 100"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bairro</label>
                  <input
                    type="text"
                    value={editingPolo.bairro || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, bairro: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: Centro"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CEP</label>
                  <input
                    type="text"
                    value={editingPolo.cep || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, cep: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: 49950-000"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Telefone / Contato</label>
                  <input
                    type="text"
                    value={editingPolo.telefone || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, telefone: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: (79) 99999-0000"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">E-mail</label>
                  <input
                    type="email"
                    value={editingPolo.email || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: polo@exemplo.com"}
                  />
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
                <Save size={16} /> {saveMutation.isPending ? 'Salvando...' : 'Salvar Polo'}
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Modal Customizado de Exclusão */}
      <ModalExcluirPolo 
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setPoloToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        poloNome={poloToDelete?.nome || ''}
      />

      {/* Modal Customizado de Inativação / Ativação */}
      <ModalInativarPolo 
        isOpen={inactivateModalOpen}
        onClose={() => {
          setInactivateModalOpen(false);
          setPoloToToggle(null);
        }}
        onConfirm={handleConfirmToggleStatus}
        poloNome={poloToToggle?.nome || ''}
        statusAtual={poloToToggle?.status || 'ativo'}
      />
    </div>
  );
};

export default PolosConfig;
