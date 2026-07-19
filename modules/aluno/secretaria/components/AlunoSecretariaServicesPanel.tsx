import React from 'react';
import { CheckCircle, Clock, DollarSign, Download, FileText, HelpCircle, Loader2, ScrollText, Send, XCircle } from 'lucide-react';
import type { Solicitacao, PrazoConfig } from '../../../gestor/secretaria/secretaria.service';
import type { AlunoSecretariaEligibility, AlunoSecretariaSolicitacaoTipo } from '../secretaria-aluno.types';

interface Props {
  eligibility: AlunoSecretariaEligibility;
  solicitacoes: Solicitacao[];
  prazos: Record<string, PrazoConfig>;
  selectedType: AlunoSecretariaSolicitacaoTipo;
  submitting: boolean;
  onSelectedTypeChange: (value: AlunoSecretariaSolicitacaoTipo) => void;
  onSubmit: (event: React.FormEvent) => void;
  onOpenBulletin: () => void;
  onOpenDeclaration: () => void;
  onOpenIrpf: () => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'Deferido') return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700"><CheckCircle size={10} /> Deferido</span>;
  if (status === 'Indeferido') return <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700"><XCircle size={10} /> Indeferido</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700"><Clock size={10} /> Pendente</span>;
};

const QuickDocument = ({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) => (
  <button onClick={onClick} className="group flex min-h-[150px] flex-col items-start justify-between rounded-2xl border border-slate-150 bg-slate-50 p-5 text-left transition-all duration-300 hover:bg-[#001a33] hover:text-white">
    <div className="rounded-xl bg-white p-3 text-blue-600 shadow-sm transition-colors group-hover:bg-white/10 group-hover:text-white">{icon}</div>
    <div><h4 className="text-sm font-bold text-slate-800 transition-colors group-hover:text-white">{title}</h4><p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500 transition-colors group-hover:text-slate-400">{description}</p></div>
  </button>
);

const AlunoSecretariaServicesPanel: React.FC<Props> = ({ eligibility, solicitacoes, prazos, selectedType, submitting, onSelectedTypeChange, onSubmit, onOpenBulletin, onOpenDeclaration, onOpenIrpf }) => (
  <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
    <div className="space-y-5 lg:col-span-2">
      <section className="space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div><h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Emissão de Documentação Imediata</h3><p className="mt-0.5 font-medium text-slate-500">Clique para visualizar ou imprimir seus comprovantes oficiais.</p></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {eligibility.canEmitBulletin ? <QuickDocument icon={<ScrollText size={20} />} title="Boletim Escolar" description="Notas, médias finais e frequência calculadas pelo sistema acadêmico." onClick={onOpenBulletin} /> : null}
          {eligibility.canEmitEnrollmentDeclaration ? <QuickDocument icon={<FileText size={20} />} title="Declaração Cursando" description="Comprovante de matrícula oficial com autenticação por QR Code." onClick={onOpenDeclaration} /> : null}
          {eligibility.canEmitIrpf ? <QuickDocument icon={<DollarSign size={20} />} title="Comprovante IRPF" description="Declaração financeira de mensalidades quitadas no ano-calendário anterior." onClick={onOpenIrpf} /> : null}
        </div>
        {!eligibility.canEmitBulletin && !eligibility.canEmitEnrollmentDeclaration && !eligibility.canEmitIrpf ? <div className="rounded-2xl border border-slate-150 bg-slate-50 p-5 text-center"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Nenhum documento de emissão imediata disponível neste vínculo.</p><p className="mt-1 text-[11px] font-semibold text-slate-400">Certificados ficam disponíveis na área de cursos quando aplicável.</p></div> : null}
        {eligibility.blockedSummary ? <p className="rounded-xl border border-amber-100 bg-amber-50 p-2 text-[10px] font-bold uppercase tracking-wider text-amber-700">{eligibility.blockedSummary}</p> : null}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5"><h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Minhas Solicitações</h3><p className="mt-0.5 font-medium text-slate-500">Acompanhe o status e faça download das solicitações concluídas.</p></div>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400"><th className="px-5 py-3">Documento</th><th className="px-5 py-3">Data Pedido</th><th className="px-5 py-3">Prazo</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Retorno / Link</th></tr></thead>
          <tbody className="divide-y divide-slate-50 font-medium text-slate-700">{!solicitacoes.length ? <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Nenhuma solicitação enviada até o momento.</td></tr> : solicitacoes.map((item) => <tr key={item.id} className="hover:bg-slate-50/50"><td className="px-5 py-3.5 font-bold text-[#001a33]">{item.tipo}</td><td className="px-5 py-3.5">{item.dataSolicitacao.split('-').reverse().join('/')}</td><td className="px-5 py-3.5"><span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-600">{item.prazo}</span></td><td className="px-5 py-3.5"><StatusBadge status={item.status} /></td><td className="px-5 py-3.5 text-right">{item.status === 'Deferido' && item.resposta?.startsWith('http') ? <a href={item.resposta} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:underline"><Download size={12} /> Download</a> : <span className="text-[10px] font-semibold italic text-slate-500">{item.status === 'Pendente' ? 'Em análise' : item.status}</span>}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
    <section className="h-fit space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div><h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Nova Solicitação</h3><p className="mt-0.5 font-medium text-slate-500">Abra um chamado acadêmico regulamentar.</p></div>
      {eligibility.allowedRequests.length ? <form onSubmit={onSubmit} className="space-y-4"><div className="space-y-1"><label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tipo de Documento</label><select value={selectedType} onChange={(event) => onSelectedTypeChange(event.target.value as AlunoSecretariaSolicitacaoTipo)} className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-bold text-slate-700 outline-none focus:border-blue-500">{eligibility.allowedRequests.map((type) => <option key={type} value={type}>{type} (Prazo: {prazos[type]?.prazo || '48h'})</option>)}</select></div><div className="space-y-1.5 rounded-2xl border border-slate-150 bg-slate-50 p-4"><h4 className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-700"><HelpCircle size={12} /> Detalhes Regulamentares</h4><p className="text-[10px] font-semibold leading-relaxed text-slate-500">{prazos[selectedType]?.descricao || ''}</p></div><button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001a33] py-4 text-xs font-black uppercase tracking-widest text-white shadow-md hover:bg-blue-600 disabled:bg-slate-300">{submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar Solicitação</button></form> : <div className="rounded-2xl border border-slate-150 bg-slate-50 p-5"><p className="text-xs font-black uppercase tracking-wider text-slate-600">Sem solicitações disponíveis</p></div>}
    </section>
  </div>
);

export default AlunoSecretariaServicesPanel;
