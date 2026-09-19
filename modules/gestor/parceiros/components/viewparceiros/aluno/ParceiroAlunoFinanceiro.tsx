import React, { useMemo } from 'react';
import { CheckCircle2, Clock3, DollarSign, Loader2, PauseCircle, ReceiptText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';

interface Props {
  alunoId: string;
}

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const date = (value?: string | null) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const statusStyle: Record<string, string> = {
  PAGO: 'bg-emerald-50 text-emerald-700',
  PENDENTE: 'bg-amber-50 text-amber-700',
  VENCIDO: 'bg-rose-50 text-rose-700',
  SUSPENSO: 'bg-blue-50 text-blue-700',
  CANCELADO: 'bg-slate-100 text-slate-500',
};

const ParceiroAlunoFinanceiro: React.FC<Props> = ({ alunoId }) => {
  const { data: receivables = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ['financeiro-aluno-receivables', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(`
          *,
          matriculas(id, status, data_matricula),
          turmas(nome, codigo, cursos(nome), polos(nome))
        `)
        .eq('cliente_id', alunoId)
        .order('data_vencimento', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });

  const summary = useMemo(() => ({
    paid: receivables.filter((item) => item.status === 'PAGO').reduce((sum, item) => sum + Number(item.valor_pago || item.valor || 0), 0),
    open: receivables.filter((item) => ['PENDENTE', 'VENCIDO'].includes(item.status)).reduce((sum, item) => sum + Number(item.valor || 0), 0),
    suspended: receivables.filter((item) => item.status === 'SUSPENSO').reduce((sum, item) => sum + Number(item.valor || 0), 0),
  }), [receivables]);

  const groups = useMemo(() => {
    const map = new Map<string, any>();
    receivables.forEach((item) => {
      const key = item.matricula_id || 'sem-matricula';
      const group = map.get(key) || {
        id: key,
        turma: item.turmas,
        matricula: item.matriculas,
        items: [],
      };
      group.items.push(item);
      map.set(key, group);
    });
    return Array.from(map.values());
  }, [receivables]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-800">Não foi possível carregar o financeiro.</p>
        <p className="mt-1 text-sm text-red-700">Os totais estão indisponíveis. Tente carregar novamente.</p>
        <button type="button" onClick={() => void refetch()}
          className="mt-3 min-h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 ">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <DollarSign size={20} />
          <span className="text-xs font-semibold">Histórico financeiro por matrícula</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-[#001a33]">Financeiro do aluno</h3>
        <p className="mt-1 text-sm text-slate-500">Pagamentos antigos permanecem na matrícula de origem; parcelas transferidas aparecem no vínculo atual.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <p className="mt-2 text-xl font-semibold tabular-nums text-emerald-700">{currency(summary.paid)}</p>
          <span className="text-xs font-semibold text-emerald-600">Total pago</span>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <Clock3 size={18} className="text-amber-600" />
          <p className="mt-2 text-xl font-semibold tabular-nums text-amber-700">{currency(summary.open)}</p>
          <span className="text-xs font-semibold text-amber-600">Em aberto</span>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <PauseCircle size={18} className="text-blue-600" />
          <p className="mt-2 text-xl font-semibold tabular-nums text-blue-700">{currency(summary.suspended)}</p>
          <span className="text-xs font-semibold text-blue-600">Suspenso por trancamento</span>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[#001a33]">{group.turma?.cursos?.nome || 'Cobranças gerais'}</h4>
                <p className="text-xs font-medium text-slate-500">{group.turma?.nome} · {group.turma?.codigo} · {group.turma?.polos?.nome}</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">Matrícula {group.matricula?.status || '—'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500">
                    <th className="px-5 py-3">Cobrança</th>
                    <th className="px-5 py-3">Vencimento</th>
                    <th className="px-5 py-3">Valor</th>
                    <th className="px-5 py-3">Pagamento</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <ReceiptText size={14} className="text-slate-500" />
                          <div><p className="text-sm font-medium text-slate-700">{item.descricao}</p><span className="text-xs font-semibold text-slate-500">{item.tipo_lancamento || item.categoria}</span></div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-600">{date(item.data_vencimento)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-[#001a33]">{currency(Number(item.valor))}</td>
                      <td className="px-5 py-4 text-sm text-slate-500">{item.data_pagamento ? date(item.data_pagamento) : '—'}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[item.status] || 'bg-slate-100 text-slate-500'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {!groups.length && <p className="py-10 text-center text-sm text-slate-500">Nenhum lançamento financeiro registrado.</p>}
      </div>
    </div>
  );
};

export default ParceiroAlunoFinanceiro;
