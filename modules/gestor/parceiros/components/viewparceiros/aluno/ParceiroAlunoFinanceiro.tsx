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
  const { data: receivables = [], isLoading } = useQuery<any[]>({
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
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="border-b border-slate-100 pb-5">
        <div className="flex items-center gap-2 text-emerald-600">
          <DollarSign size={20} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Histórico financeiro por matrícula</span>
        </div>
        <h3 className="mt-2 text-xl font-black uppercase text-[#001a33]">Financeiro do aluno</h3>
        <p className="mt-1 text-xs text-slate-500">Pagamentos antigos permanecem na matrícula de origem; parcelas transferidas aparecem no vínculo atual.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <p className="mt-3 text-2xl font-black text-emerald-700">{currency(summary.paid)}</p>
          <span className="text-[9px] font-black uppercase text-emerald-600">Total pago</span>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <Clock3 size={18} className="text-amber-600" />
          <p className="mt-3 text-2xl font-black text-amber-700">{currency(summary.open)}</p>
          <span className="text-[9px] font-black uppercase text-amber-600">Em aberto</span>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <PauseCircle size={18} className="text-blue-600" />
          <p className="mt-3 text-2xl font-black text-blue-700">{currency(summary.suspended)}</p>
          <span className="text-[9px] font-black uppercase text-blue-600">Suspenso por trancamento</span>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.id} className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-black text-[#001a33]">{group.turma?.cursos?.nome || 'Cobranças gerais'}</h4>
                <p className="text-[10px] font-bold text-slate-500">{group.turma?.nome} · {group.turma?.codigo} · {group.turma?.polos?.nome}</p>
              </div>
              <span className="text-[9px] font-black uppercase text-slate-400">Matrícula {group.matricula?.status || '—'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400">
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
                          <ReceiptText size={14} className="text-slate-400" />
                          <div><p className="text-xs font-bold text-slate-700">{item.descricao}</p><span className="text-[9px] font-black uppercase text-slate-400">{item.tipo_lancamento || item.categoria}</span></div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600">{date(item.data_vencimento)}</td>
                      <td className="px-5 py-4 text-xs font-black text-[#001a33]">{currency(Number(item.valor))}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">{item.data_pagamento ? date(item.data_pagamento) : '—'}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${statusStyle[item.status] || 'bg-slate-100 text-slate-500'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {!groups.length && <p className="py-16 text-center text-sm text-slate-400">Nenhum lançamento financeiro registrado.</p>}
      </div>
    </div>
  );
};

export default ParceiroAlunoFinanceiro;
