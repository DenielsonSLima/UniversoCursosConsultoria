// File: modules/gestor/configuracoes/categorias-financeiras/CategoriasFinanceirasConfig.tsx

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building, ShoppingBag, TrendingDown, Plus, Edit2, Trash2,
  RefreshCw, X, Check, Loader2, Wallet2,
} from 'lucide-react';
import {
  categoriasFinanceirasService,
  CategoriaFinanceira,
  CategoriaFinanceiraTipo,
} from './categorias-financeiras.service';
import { supabase } from '../../../../lib/supabase';

// ============================================================
// Mini Form Inline
// ============================================================
interface InlineFormProps {
  tipo: CategoriaFinanceiraTipo;
  editingItem?: CategoriaFinanceira | null;
  onSaved: () => void;
  onCancel: () => void;
}

const InlineForm: React.FC<InlineFormProps> = ({ tipo, editingItem, onSaved, onCancel }) => {
  const [nome, setNome] = useState(editingItem?.nome || '');
  const [descricao, setDescricao] = useState(editingItem?.descricao || '');
  const [status, setStatus] = useState<'ativo' | 'inativo'>(editingItem?.status || 'ativo');
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { nome: nome.trim(), tipo, descricao: descricao.trim() || undefined, status };
      return editingItem?.id
        ? categoriasFinanceirasService.update(editingItem.id, payload)
        : categoriasFinanceirasService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-financeiras'] });
      onSaved();
    },
  });

  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 animate-fadeIn">
      <div>
        <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Nome *</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da categoria..."
          autoFocus
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500 transition-all placeholder:text-slate-300"
        />
      </div>
      <div>
        <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Descrição</label>
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição breve (opcional)..."
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500 transition-all placeholder:text-slate-300"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'ativo' | 'inativo')}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500 appearance-none transition-all"
        >
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <button onClick={onCancel} className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-white transition-colors">
            <X size={14} />
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!nome.trim() || saveMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </div>
      </div>
      {saveMutation.isError && (
        <p className="text-xs text-red-500">Erro ao salvar. Tente novamente.</p>
      )}
    </div>
  );
};

// ============================================================
// Coluna de Categorias
// ============================================================
interface ColunaCategoriasProps {
  tipo: CategoriaFinanceiraTipo;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  items: CategoriaFinanceira[];
  onDelete: (id: string) => void;
}

const ColunaCategorias: React.FC<ColunaCategoriasProps> = ({
  tipo, label, icon, accentColor, items, onDelete
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoriaFinanceira | null>(null);

  const handleDelete = (id: string) => {
    if (confirm('Excluir esta categoria? Os lançamentos vinculados não serão excluídos.')) {
      onDelete(id);
    }
  };

  return (
    <div className="flex-1 min-w-[260px]">
      <div className={`flex items-center gap-2 mb-4 pb-3 border-b-2 ${accentColor}`}>
        {icon}
        <h3 className="font-black text-sm text-[#001a33] uppercase tracking-tight">{label}</h3>
        <span className="ml-auto text-[10px] text-slate-400 font-bold">{items.length} itens</span>
      </div>

      <div className="space-y-2 mb-4">
        {items.length === 0 && !showForm && (
          <p className="text-xs text-slate-400 text-center py-4 italic">Nenhuma categoria cadastrada</p>
        )}
        {items.map((item) => (
          <div key={item.id}>
            {editingItem?.id === item.id ? (
              <InlineForm
                tipo={tipo}
                editingItem={item}
                onSaved={() => setEditingItem(null)}
                onCancel={() => setEditingItem(null)}
              />
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100 shadow-sm group hover:shadow-md transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{item.nome}</p>
                  {item.descricao && (
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.descricao}</p>
                  )}
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${item.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {item.status}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingItem(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {showForm && (
          <InlineForm
            tipo={tipo}
            onSaved={() => setShowForm(false)}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>

      <button
        onClick={() => { setShowForm(true); setEditingItem(null); }}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 hover:border-rose-400 text-slate-400 hover:text-rose-600 rounded-xl text-xs font-bold uppercase tracking-wide transition-all"
      >
        <Plus size={13} />
        Nova Categoria
      </button>
    </div>
  );
};

// ============================================================
// Página Principal
// ============================================================
const CategoriasFinanceirasConfig: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: allCategorias = [], isLoading } = useQuery<CategoriaFinanceira[]>({
    queryKey: ['categorias-financeiras'],
    queryFn: categoriasFinanceirasService.getAll,
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('categorias_financeiras_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias_financeiras' }, () => {
        queryClient.invalidateQueries({ queryKey: ['categorias-financeiras'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriasFinanceirasService.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias-financeiras'] }),
    onError: () => alert('Erro ao excluir categoria.'),
  });

  const fixas = allCategorias.filter((c) => c.tipo === 'DESPESA_FIXA');
  const variaveis = allCategorias.filter((c) => c.tipo === 'DESPESA_VARIAVEL');
  const outros = allCategorias.filter((c) => c.tipo === 'OUTRO_DEBITO');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="animate-spin text-rose-500" size={32} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 border-b border-slate-200 pb-6">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
          <Wallet2 size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">
            Categorias Financeiras
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Gerencie as categorias de despesas fixas, variáveis e outros débitos.
          </p>
        </div>
      </div>

      {/* Colunas principais: Fixas | Variáveis */}
      <div className="flex flex-wrap gap-6 mb-8">
        <ColunaCategorias
          tipo="DESPESA_FIXA"
          label="Despesas Fixas"
          icon={<Building size={16} className="text-rose-600" />}
          accentColor="border-rose-500"
          items={fixas}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
        <ColunaCategorias
          tipo="DESPESA_VARIAVEL"
          label="Despesas Variáveis"
          icon={<ShoppingBag size={16} className="text-orange-500" />}
          accentColor="border-orange-500"
          items={variaveis}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </div>

      {/* Seção: Outros Débitos */}
      <div className="border-t border-slate-100 pt-6">
        <ColunaCategorias
          tipo="OUTRO_DEBITO"
          label="Outros Débitos"
          icon={<TrendingDown size={16} className="text-indigo-500" />}
          accentColor="border-indigo-500"
          items={outros}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </div>
    </div>
  );
};

export default CategoriasFinanceirasConfig;
