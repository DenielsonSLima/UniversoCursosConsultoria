// File: modules/gestor/configuracoes/categorias/CategoriasConfig.tsx

import React, { useState, useEffect } from 'react';
import { Plus, Tags, Search, Edit, Trash2, RefreshCw } from 'lucide-react';
import CategoriaForm from './components/CategoriaForm';
import { categoriasService, Categoria } from './categorias.service';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

const CategoriasConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Buscar categorias do Supabase
  const { data: categorias = [], isLoading, isError, error } = useQuery<Categoria[]>({
    queryKey: ['categorias'],
    queryFn: categoriasService.getAll,
  });

  // 2. Realtime para a tabela 'categorias'
  useEffect(() => {
    const channel = supabase
      .channel('categorias_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categorias' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['categorias'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutations para Salvar e Excluir
  const saveMutation = useMutation({
    mutationFn: (data: Omit<Categoria, 'id'>) => {
      if (editingCategoria?.id) {
        return categoriasService.update(editingCategoria.id, data);
      } else {
        return categoriasService.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setShowModal(false);
      setEditingCategoria(null);
    },
    onError: (err: any) => alert(`Erro ao salvar categoria: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriasService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (err: any) => alert(`Erro ao excluir categoria: ${err.message}`),
  });

  const filteredCategorias = categorias.filter(cat => 
    cat.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.tipo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta categoria?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (categoria: Categoria) => {
    setEditingCategoria(categoria);
    setShowModal(true);
  };

  const handleSave = (data: Omit<Categoria, 'id'>) => {
    saveMutation.mutate(data);
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'pj': return 'Pessoa Jurídica';
      case 'pf': return 'Pessoa Física';
      case 'aluno': return 'Aluno';
      case 'professor': return 'Professor';
      default: return tipo;
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'pj': return 'bg-slate-100 text-slate-700';
      case 'pf': return 'bg-amber-50 text-amber-600';
      case 'aluno': return 'bg-blue-50 text-blue-600';
      case 'professor': return 'bg-purple-50 text-purple-600';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-orange-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando categorias...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar as categorias:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <Tags size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">
              Categorias de Cadastros
            </h2>
            <p className="text-slate-500 font-medium">
              Gerencie as categorias para classificar alunos, professores, pessoas físicas e jurídicas.
            </p>
          </div>
        </div>

        <button 
          onClick={() => {
            setEditingCategoria(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl hover:bg-blue-900 transition-colors font-bold uppercase tracking-wide text-sm whitespace-nowrap"
        >
          <Plus size={18} />
          Nova Categoria
        </button>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-full max-w-md">
           <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
           <input 
             type="text"
             placeholder="Buscar categorias..."
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
           />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nome da Categoria</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Grupo</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCategorias.map((cat) => (
              <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="p-4">
                  <div className="font-bold text-slate-800">{cat.nome}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm text-slate-500 truncate max-w-xs">{cat.descricao || '-'}</div>
                </td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${getTipoColor(cat.tipo)}`}>
                    {getTipoLabel(cat.tipo)}
                  </span>
                </td>
                <td className="p-4">
                   <div className="flex items-center gap-2">
                     <div className={`w-2 h-2 rounded-full ${cat.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                     <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        {cat.status === 'ativo' ? 'Ativo' : 'Inativo'}
                     </span>
                   </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleEdit(cat)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      onClick={() => cat.id && handleDelete(cat.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredCategorias.length === 0 && (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center">
            <Tags size={48} className="text-slate-300 mb-4" />
            <p className="font-medium">Nenhuma categoria encontrada.</p>
          </div>
        )}
      </div>

      {showModal && (
        <CategoriaForm 
          onClose={() => {
            setShowModal(false);
            setEditingCategoria(null);
          }}
          onSave={handleSave}
          categoria={editingCategoria}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
};

export default CategoriasConfig;
