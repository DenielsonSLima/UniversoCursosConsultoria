import React, { useMemo } from 'react';
import { ChevronRight, CheckCircle2, Clock3, DollarSign, Loader2, PauseCircle, ReceiptText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { loadStudentFinanceView, type StudentFinanceView, type StudentReceivable } from './parceiro-aluno-financeiro.service';
import EadBoletoButton from './EadBoletoButton';
import { groupStudentFinance } from './parceiro-aluno-financeiro.groups';

interface Props {
  alunoId: string;
  cacheScope?: string;
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

const ParceiroAlunoFinanceiro: React.FC<Props> = ({ alunoId, cacheScope }) => {
  const { data, isLoading, isError, refetch } = useQuery<StudentFinanceView>({
    queryKey: ['financeiro-aluno-receivables', alunoId, cacheScope],
    queryFn: () => loadStudentFinanceView(alunoId),
    enabled: Boolean(cacheScope),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const receivables = data?.items || [];
  const summary = data?.summary || { paid: 0, open: 0, suspended: 0 };

  const groups = useMemo(() => groupStudentFinance(receivables), [receivables]);

  if (isLoading || !cacheScope) {
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

      <div key={`${alunoId}:${cacheScope}`} className="space-y-3">
        {groups.map((type) => (
          <details key={type.id} className="group/type rounded-xl border border-slate-200 bg-white">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-[#001a33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
              <ChevronRight size={16} className="shrink-0 transition-transform group-open/type:rotate-90" />
              {type.label}
            </summary>
            <div className="space-y-2 p-3">
              {type.courses.map((course) => (
                <details key={course.id} className="group/course rounded-lg border border-slate-200">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-[#001a33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
                    <ChevronRight size={15} className="shrink-0 transition-transform group-open/course:rotate-90" />
                    {course.name}
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 p-2">
                    {course.enrollments.map((group) => (
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
                                <th className="px-5 py-3">Boleto EAD</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.items.map((item: StudentReceivable) => (
                                <tr key={item.id}>
                                  <td className="px-5 py-4">
                                    <div className="flex items-center gap-2">
                                      <ReceiptText size={14} className="text-slate-500" />
                                      <div><p className="text-sm font-medium text-slate-700">{item.descricao}</p><span className="text-xs font-semibold text-slate-500">{item.tipo_lancamento}</span></div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 text-sm font-medium text-slate-600">{date(item.data_vencimento)}</td>
                                  <td className="px-5 py-4 text-sm font-semibold text-[#001a33]">{currency(Number(item.valor))}</td>
                                  <td className="px-5 py-4 text-sm text-slate-500">{item.data_pagamento ? date(item.data_pagamento) : '—'}</td>
                                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[item.status] || 'bg-slate-100 text-slate-500'}`}>{item.status}</span></td>
                                  <td className="px-5 py-4">
                                    {item.can_open_boleto === true
                                      ? <EadBoletoButton receivableId={item.id} />
                                      : <span className="text-sm text-slate-400">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
        {!groups.length && <p className="py-10 text-center text-sm text-slate-500">Nenhum lançamento financeiro registrado.</p>}
      </div>
    </div>
  );
};

export default ParceiroAlunoFinanceiro;
