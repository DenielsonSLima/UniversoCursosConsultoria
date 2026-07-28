import React, { useEffect, useState } from 'react';
import { Edit, Handshake, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import TipoParceriaForm from './components/TipoParceriaForm';
import {
  TipoParceria,
  tiposParceriaQueryKeys,
  tiposParceriaService,
} from './tipos-parceria.service';

const TiposParceriaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TipoParceria | null>(null);
  const [showForm, setShowForm] = useState(false);

  const query = useQuery({
    queryKey: tiposParceriaQueryKeys.all,
    queryFn: tiposParceriaService.getAll,
  });

  useEffect(() => {
    const channel = supabase
      .channel('tipos_parceria_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tipos_parceria' }, () => {
        queryClient.invalidateQueries({ queryKey: tiposParceriaQueryKeys.all });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (data: Omit<TipoParceria, 'id'>) => (
      editing?.id
        ? tiposParceriaService.update(editing.id, data)
        : tiposParceriaService.create(data)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tiposParceriaQueryKeys.all });
      setEditing(null);
      setShowForm(false);
    },
    onError: (error: Error) => alert(`Erro ao salvar tipo de parceria: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: tiposParceriaService.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tiposParceriaQueryKeys.all }),
    onError: (error: Error) => alert(`Erro ao excluir tipo de parceria: ${error.message}`),
  });

  const filtered = (query.data || []).filter((item) => (
    `${item.nome} ${item.descricao || ''}`.toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR'))
  ));

  if (query.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <RefreshCw className="mb-4 animate-spin text-blue-600" size={32} />
        <p className="font-medium">Carregando tipos de parceria...</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-red-600">
        Não foi possível carregar os tipos de parceria: {(query.error as Error).message}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <Handshake size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Tipos de parceria</h2>
            <p className="font-medium text-slate-500">Gerencie convênios e relacionamentos disponíveis para pessoas jurídicas.</p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#001a33] px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-blue-900"
        >
          <Plus size={18} />
          Novo tipo
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar tipos de parceria..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 outline-none transition-all focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de parceria</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Descrição</th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
              <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <tr key={item.id} className="group hover:bg-slate-50/60">
                <td className="p-4 font-bold text-slate-800">{item.nome}</td>
                <td className="p-4 text-sm text-slate-500">{item.descricao || '—'}</td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <span className={`h-2 w-2 rounded-full ${item.status === 'ativo' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {item.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditing(item);
                        setShowForm(true);
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                      title="Editar"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (item.id && confirm('Excluir este tipo? Parceiros existentes manterão o texto histórico.')) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhum tipo de parceria encontrado.</div>
        ) : null}
      </div>

      {showForm ? (
        <TipoParceriaForm
          tipo={editing}
          isSaving={saveMutation.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(data) => saveMutation.mutate(data)}
        />
      ) : null}
    </div>
  );
};

export default TiposParceriaConfig;
