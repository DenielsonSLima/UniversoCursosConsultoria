import React from 'react';
import { AlertCircle, Check, CheckCircle, Clock, X, XCircle } from 'lucide-react';
import type { Solicitacao } from '../../../../secretaria/secretaria.service';

interface Props {
  solicitacoes: Solicitacao[];
  selected: Solicitacao | null;
  action: 'deferir' | 'indeferir' | null;
  response: string;
  justification: string;
  onSelect: (item: Solicitacao | null) => void;
  onActionChange: (action: 'deferir' | 'indeferir' | null) => void;
  onResponseChange: (value: string) => void;
  onJustificationChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'Deferido') return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700"><CheckCircle size={10} /> Deferido</span>;
  if (status === 'Indeferido') return <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700"><XCircle size={10} /> Indeferido</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700"><Clock size={10} /> Pendente</span>;
};

const ParceiroSolicitacoesPanel: React.FC<Props> = (props) => (
  <>
    <section className="space-y-4">
      <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Chamados e Solicitações Acadêmicas</h4>
      <div className="overflow-x-auto rounded-2xl border border-slate-150 bg-slate-50/50">
        <table className="w-full border-collapse text-left"><thead><tr className="border-b border-slate-150 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-450"><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Data Pedido</th><th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação / Retorno</th></tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">{!props.solicitacoes.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhuma solicitação acadêmica registrada para este aluno.</td></tr> : props.solicitacoes.map((item) => <tr key={item.id} className="hover:bg-slate-50/30"><td className="px-4 py-3 font-bold text-[#001a33]">{item.tipo}</td><td className="px-4 py-3">{item.dataSolicitacao.split('-').reverse().join('/')}</td><td className="px-4 py-3"><span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-600">{item.prazo}</span></td><td className="px-4 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3 text-right">{item.status === 'Pendente' ? <button onClick={() => props.onSelect(item)} className="rounded-lg bg-[#001a33] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white hover:bg-blue-600">Analisar</button> : <span className="text-[10px] font-semibold italic text-slate-500" title={item.resposta}>{item.status}</span>}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
    {props.selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl animate-slideUp"><header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4"><div><h4 className="text-sm font-black uppercase tracking-wide text-[#001a33]">Análise de Solicitação</h4><p className="mt-0.5 text-[9px] font-bold uppercase text-slate-450">Protocolo #{props.selected.id}</p></div><button onClick={() => { props.onSelect(null); props.onActionChange(null); }} className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm hover:text-rose-500"><X size={16} /></button></header>
      <div className="space-y-5 p-6"><div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-150 bg-slate-50 p-4">{[['Aluno', props.selected.alunoNome], ['Matrícula', props.selected.alunoMatricula], ['Documento', props.selected.tipo], ['Prazo', props.selected.prazo]].map(([label, value]) => <div key={label}><span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><span className="text-xs font-bold text-[#001a33]">{value}</span></div>)}</div>
        <form onSubmit={props.onSubmit} className="space-y-4">{!props.action ? <div className="flex gap-4"><button type="button" onClick={() => props.onActionChange('deferir')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700"><Check size={16} /> Deferir</button><button type="button" onClick={() => props.onActionChange('indeferir')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-700"><X size={16} /> Indeferir</button></div> : <div className="space-y-4">{props.action === 'deferir' ? <div><label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Mensagem ou link do documento</label><input value={props.response} onChange={(event) => props.onResponseChange(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500" /><p className="mt-2 flex items-start gap-1 rounded-lg border border-emerald-100/50 bg-emerald-50/40 p-2.5 text-[10px] font-medium text-slate-400"><AlertCircle size={12} className="shrink-0 text-emerald-500" /> O retorno ficará disponível no painel do aluno.</p></div> : <div><label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Justificativa</label><textarea value={props.justification} onChange={(event) => props.onJustificationChange(event.target.value)} required rows={3} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-700 outline-none focus:border-rose-500" /></div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-2"><button type="button" onClick={() => props.onActionChange(null)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-655">Voltar</button><button type="submit" className={`rounded-lg px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white ${props.action === 'deferir' ? 'bg-emerald-600' : 'bg-rose-600'}`}>Confirmar Homologação</button></div></div>}</form>
      </div></div></div> : null}
  </>
);

export default ParceiroSolicitacoesPanel;
