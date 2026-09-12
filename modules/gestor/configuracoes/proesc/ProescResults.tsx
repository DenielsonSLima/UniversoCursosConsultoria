import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { proescKeys, proescService } from './proesc.service';
import type { ProescRun } from './proesc.service';

const text = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const money = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : text(value);
};
const th = 'px-3 py-3 text-left text-xs font-bold text-slate-500';
const td = 'px-3 py-3 text-sm text-slate-700 align-top';

export const ProescResults: React.FC<{ run: ProescRun }> = ({ run }) => {
  const [position, setPosition] = useState(1);
  const [search, setSearch] = useState('');
  const page = useQuery({ queryKey: proescKeys.page(run.id, position),
    queryFn: () => proescService.page(run.id, position), enabled: run.pages > 0, retry: false, gcTime: 0 });
  const rows = (page.data?.page?.records || []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold text-[#001a33]">Dados consultados no Proesc</h3>
        <p className="text-xs text-slate-500">{run.resource === 'people' ? 'Pessoas e matrículas' : 'Cobranças'} · {run.status === 'complete' ? 'Período consultado' : 'Consulta parcial'} · {run.records} registros recebidos</p></div>
      <input aria-label="Buscar nesta página Proesc" placeholder="Buscar nesta página…" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-full rounded-xl border border-slate-200 p-3 text-sm" />
    </div>
    <p className="text-sm text-amber-800">Os resultados podem incluir outras turmas da unidade. O vínculo com a T42 ainda precisa ser conferido.</p>
    {page.isError ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar a página. <button onClick={() => void page.refetch()} className="underline">Tentar novamente</button></p> : null}
    {page.isLoading ? <p role="status">Carregando registros…</p> : null}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] divide-y divide-slate-200">
        <thead><tr>{(run.resource === 'people' ? ['Pessoa Proesc', 'Nome', 'Matrículas e turmas'] : ['Parcela / débito', 'Descrição', 'Vencimento', 'Valor original', 'Pago / data', 'Situação']).map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, index) => {
          const discounts = obj(row.discounts);
          return run.resource === 'people' ? <tr key={`${text(row.id)}-${index}`}>
            <td className={td}>{text(row.id)}</td><td className={td}>{text(row.name)}</td>
            <td className={td}>{Array.isArray(row.enrollments) ? row.enrollments.map((value, i) => {
              const enrollment = obj(value); const turma = obj(enrollment.class);
              return <div key={i}>{text(enrollment.id)} · {text(turma.name)} · {text(enrollment.academic_year)}</div>;
            }) : '—'}</td>
          </tr> : <tr key={`${text(row.invoice_id)}-${index}`}>
            <td className={td}>{text(row.invoice_id)} / {text(row.invoice_group_id)}</td>
            <td className={td}>{text(row.description)}</td><td className={td}>{text(row.due_date)}</td>
            <td className={td}>{money(row.original_invoice_amount)}</td>
            <td className={td}>{money(row.paid_invoice_amount ?? discounts.paid_invoice_amount)}<br />{text(row.payment_date ?? discounts.payment_date)}</td>
            <td className={td}>{text(row.status)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!page.isLoading && !page.isError && !rows.length ? <p className="text-sm text-slate-500">Nenhum registro nesta página para a busca informada.</p> : null}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button disabled={position <= 1 || page.isLoading} onClick={() => setPosition((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button>
      <span>Página salva {position} de {run.pages}{page.data?.page?.period ? ` · ${page.data.page.period}` : ''}</span>
      <button disabled={position >= run.pages || page.isLoading} onClick={() => setPosition((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button>
    </div>
  </section>;
};

export function T42ImportedHistory() {
  const [selected, setSelected] = useState('');
  const history = useQuery({ queryKey: proescKeys.history, queryFn: proescService.history, retry: false, gcTime: 0 });
  const student = history.data?.students.find((item) => item.enrollmentId === selected);
  return <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
    <h3 className="font-bold text-[#001a33]">Histórico importado da T42</h3>
    <p className="text-sm text-slate-500">Referência para conferência. Os boletos do segundo ciclo Banese permanecem no financeiro da turma.</p>
    {history.isLoading ? <p role="status">Carregando histórico…</p> : null}
    {history.isError ? <p role="alert" className="text-red-700">Não foi possível carregar o histórico. <button className="underline" onClick={() => void history.refetch()}>Tentar novamente</button></p> : null}
    <select aria-label="Aluno da T42" value={selected} onChange={(event) => setSelected(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <option value="">Selecione um aluno para conferir</option>
      {history.data?.students.map((item) => <option key={item.enrollmentId} value={item.enrollmentId}>{item.studentName} · {item.status}</option>)}
    </select>
    {student ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] divide-y divide-slate-200">
      <thead><tr>{['Referência importada', 'Vencimento', 'Valor', 'Pago', 'Data do pagamento', 'Situação'].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{student.receivables.map((row) => <tr key={row.id}>
        <td className={td}>{row.legacyId}</td><td className={td}>{row.dueDate}</td><td className={td}>{money(row.amount)}</td>
        <td className={td}>{money(row.paidAmount)}</td><td className={td}>{text(row.paymentDate)}</td><td className={td}>{row.status}</td>
      </tr>)}</tbody>
    </table>{!student.receivables.length ? <p className="py-3 text-sm text-slate-500">Nenhuma parcela do histórico selecionado.</p> : null}</div> : null}
  </section>;
}
