// File: modules/gestor/configuracoes/categorias-financeiras/CategoriasFinanceirasConfig.tsx

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building, ShoppingBag, TrendingDown, Plus, Edit2,
  RefreshCw, X, Check, Loader2, Wallet2, Power, PowerOff,
} from 'lucide-react';
import {
  categoriasFinanceirasService,
  CategoriaFinanceira,
  CategoriaFinanceiraTipo,
} from './categorias-financeiras.service';
import { supabase } from '../../../../lib/supabase';

const toUpper = (value: string) => value.toLocaleUpperCase('pt-BR');
const invalidateCategorias = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['categorias-financeiras'] });
  queryClient.invalidateQueries({ queryKey: ['despesas', 'categorias-financeiras'] });
};

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
      const payload = {
        nome: toUpper(nome.trim()),
        tipo,
        descricao: descricao.trim() ? toUpper(descricao.trim()) : undefined,
        status,
      };
      return editingItem?.id
        ? categoriasFinanceirasService.update(editingItem.id, payload)
        : categoriasFinanceirasService.create(payload);
    },
    onSuccess: () => {
      invalidateCategorias(queryClient);
      onSaved();
    },
  });

  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 animate-fadeIn">
      <div>
        <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">NOME *</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(toUpper(e.target.value))}
          placeholder="NOME DA CATEGORIA..."
          autoFocus
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold uppercase outline-none focus:ring-2 focus:ring-rose-500 transition-all placeholder:text-slate-300"
        />
      </div>
      <div>
        <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">DESCRIÇÃO</label>
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(toUpper(e.target.value))}
          placeholder="DESCRIÇÃO BREVE (OPCIONAL)..."
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold uppercase outline-none focus:ring-2 focus:ring-rose-500 transition-all placeholder:text-slate-300"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'ativo' | 'inativo')}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500 appearance-none transition-all"
        >
          <option value="ativo">ATIVO</option>
          <option value="inativo">INATIVO</option>
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
            SALVAR
          </button>
        </div>
      </div>
      {saveMutation.isError && (
        <p className="text-xs font-bold uppercase text-red-500">ERRO AO SALVAR. TENTE NOVAMENTE.</p>
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
  onToggleStatus: (item: CategoriaFinanceira) => void;
  isToggling: boolean;
}

const ColunaCategorias: React.FC<ColunaCategoriasProps> = ({
  tipo, label, icon, accentColor, items, onToggleStatus, isToggling
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoriaFinanceira | null>(null);
  const activeCount = items.filter((item) => item.status === 'ativo').length;

  return (
    <div className="flex-1 min-w-[260px]">
      <div className={`flex items-center gap-2 mb-4 pb-3 border-b-2 ${accentColor}`}>
        {icon}
        <h3 className="font-black text-sm text-[#001a33] uppercase tracking-tight">{label}</h3>
        <span className="ml-auto text-[10px] text-slate-400 font-bold uppercase">{activeCount} ATIVAS / {items.length} TOTAL</span>
      </div>

      <div className="space-y-2 mb-4">
        {items.length === 0 && !showForm && (
          <p className="py-4 text-center text-xs font-bold uppercase text-slate-400">NENHUMA CATEGORIA CADASTRADA</p>
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
              <div className={`flex items-center gap-3 px-4 py-3 bg-white rounded-xl border shadow-sm group hover:shadow-md transition-all ${
                item.status === 'ativo' ? 'border-slate-100' : 'border-slate-200 opacity-70'
              }`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate uppercase">{item.nome}</p>
                  {item.descricao && (
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 uppercase">{item.descricao}</p>
                  )}
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${item.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {item.status}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingItem(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="EDITAR">
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => onToggleStatus(item)}
                    disabled={isToggling}
                    className={`p-1.5 rounded-lg transition-colors ${
                      item.status === 'ativo'
                        ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                        : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                    } disabled:opacity-50`}
                    title={item.status === 'ativo' ? 'INATIVAR' : 'ATIVAR'}
                  >
                    {item.status === 'ativo' ? <PowerOff size={13} /> : <Power size={13} />}
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
        NOVA CATEGORIA
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

  const toggleStatusMutation = useMutation({
    mutationFn: (item: CategoriaFinanceira) =>
      categoriasFinanceirasService.update(item.id, {
        status: item.status === 'ativo' ? 'inativo' : 'ativo',
      }),
    onSuccess: () => invalidateCategorias(queryClient),
    onError: () => alert('ERRO AO ALTERAR STATUS DA CATEGORIA.'),
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
          <p className="text-slate-500 font-bold text-sm mt-0.5">
            Adicione, edite, ative e inative as categorias do financeiro.
          </p>
        </div>
      </div>

      {/* Colunas principais: Fixas | Variáveis */}
      <div className="flex flex-wrap gap-6 mb-8">
        <ColunaCategorias
          tipo="DESPESA_FIXA"
          label="DESPESAS FIXAS"
          icon={<Building size={16} className="text-rose-600" />}
          accentColor="border-rose-500"
          items={fixas}
          onToggleStatus={(item) => toggleStatusMutation.mutate(item)}
          isToggling={toggleStatusMutation.isPending}
        />
        <ColunaCategorias
          tipo="DESPESA_VARIAVEL"
          label="DESPESAS VARIÁVEIS"
          icon={<ShoppingBag size={16} className="text-orange-500" />}
          accentColor="border-orange-500"
          items={variaveis}
          onToggleStatus={(item) => toggleStatusMutation.mutate(item)}
          isToggling={toggleStatusMutation.isPending}
        />
      </div>

      {/* Seção: Outros Débitos */}
      <div className="border-t border-slate-100 pt-6">
        <ColunaCategorias
          tipo="OUTRO_DEBITO"
          label="OUTROS DÉBITOS"
          icon={<TrendingDown size={16} className="text-indigo-500" />}
          accentColor="border-indigo-500"
          items={outros}
          onToggleStatus={(item) => toggleStatusMutation.mutate(item)}
          isToggling={toggleStatusMutation.isPending}
        />
      </div>
    </div>
  );
};

export default CategoriasFinanceirasConfig;
