import React from 'react';
import { BadgeCheck, CreditCard, Download, Loader2, Printer } from 'lucide-react';
import CarteirinhaPreview from '../../../gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../../gestor/cadastros/modelos-documentos/cracha/components/CrachaPreview';
import CrachaPeriodoEleitoralPreview from '../../../gestor/cadastros/modelos-documentos/cracha-periodo-eleitoral/components/CrachaPeriodoEleitoralPreview';

export type AlunoIdentityTab = 'servicos' | 'carteirinha' | 'cracha' | 'cracha-eleitoral';

interface Props {
  tab: AlunoIdentityTab;
  canStudentCard: boolean;
  canInternshipBadge: boolean;
  canElectionBadge: boolean;
  studentCardTemplate: any;
  internshipBadgeTemplate: any;
  electionBadgeTemplate: any;
  alunoData: any;
  electionAlunoData: any;
  studentCardCode?: string;
  internshipBadgeCode?: string;
  downloadingStudentCard: boolean;
  onTabChange: (tab: AlunoIdentityTab) => void;
  onDownloadStudentCard: () => void;
  onPrintRegistered: (code: string | undefined, label: string) => void;
}

const tabClass = (active: boolean) => `flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all ${active ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`;

const AlunoIdentityDocuments: React.FC<Props> = (props) => {
  const hasIdentityDocument = props.canStudentCard || props.canInternshipBadge || props.canElectionBadge;
  return (
    <>
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        <button onClick={() => props.onTabChange('servicos')} className={tabClass(props.tab === 'servicos')}><CreditCard size={13} /> Serviços</button>
        {hasIdentityDocument && props.canStudentCard ? <button onClick={() => props.onTabChange('carteirinha')} className={tabClass(props.tab === 'carteirinha')}><CreditCard size={13} /> Carteirinha Digital</button> : null}
        {hasIdentityDocument && props.canInternshipBadge ? <button onClick={() => props.onTabChange('cracha')} className={tabClass(props.tab === 'cracha')}><BadgeCheck size={13} /> Crachá de Identificação</button> : null}
        {hasIdentityDocument && props.canElectionBadge ? <button onClick={() => props.onTabChange('cracha-eleitoral')} className={tabClass(props.tab === 'cracha-eleitoral')}><BadgeCheck size={13} /> SES</button> : null}
      </div>
      {props.tab === 'carteirinha' && props.studentCardTemplate && props.canStudentCard ? <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn"><header className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><CreditCard size={15} className="text-blue-600" /> Carteirinha de Estudante</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Frente e verso do documento oficial.</p></div><div className="flex flex-wrap gap-2"><button onClick={props.onDownloadStudentCard} disabled={!props.studentCardCode || props.downloadingStudentCard} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-700 disabled:bg-slate-300">{props.downloadingStudentCard ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {props.downloadingStudentCard ? 'Gerando PDF' : 'Baixar PDF'}</button><button onClick={() => props.onPrintRegistered(props.studentCardCode, 'carteirinha')} disabled={!props.studentCardCode} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600 disabled:bg-slate-300"><Printer size={13} /> Imprimir</button></div></header><div id="print-area" className="flex flex-col items-center justify-center gap-8 p-8 sm:flex-row sm:gap-12">{(['frente', 'verso'] as const).map((page) => <div key={page} className="flex flex-col items-center gap-3"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span><div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-slate-200"><CarteirinhaPreview formData={props.studentCardTemplate} page={page} zoomLevel={90} aluno={{ ...props.alunoData, validationCode: props.studentCardCode }} isEditable={false} /></div></div>)}</div></section> : null}
      {props.tab === 'cracha' && props.internshipBadgeTemplate && props.canInternshipBadge ? <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn"><header className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><BadgeCheck size={15} className="text-blue-600" /> Crachá de Identificação</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Frente e verso do crachá oficial.</p></div><button onClick={() => props.onPrintRegistered(props.internshipBadgeCode, 'crachá')} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600"><Download size={13} /> Baixar / Imprimir</button></header><div id="print-area-cracha" className="flex flex-col items-start justify-center gap-8 p-8 sm:flex-row sm:gap-12">{(['frente', 'verso'] as const).map((page) => <div key={page} className="flex flex-col items-center gap-3"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span><div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-slate-200"><CrachaPreview formData={props.internshipBadgeTemplate} page={page} zoomLevel={90} aluno={{ ...props.alunoData, validationCode: props.internshipBadgeCode }} isEditable={false} /></div></div>)}</div></section> : null}
      {props.tab === 'cracha-eleitoral' && props.electionBadgeTemplate && props.canElectionBadge ? <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn"><header className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><BadgeCheck size={15} className="text-cyan-600" /> Crachá SES</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Liberado após o registro de entrada no estágio.</p></div><button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600"><Download size={13} /> Baixar / Imprimir</button></header><div id="print-area-cracha-eleitoral" className="flex flex-col items-center justify-center gap-8 p-8">{(['frente', 'verso'] as const).map((page) => <div key={page} className="flex flex-col items-center gap-3"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span><div className="overflow-hidden shadow-xl ring-1 ring-slate-200"><CrachaPeriodoEleitoralPreview formData={props.electionBadgeTemplate} page={page} zoomLevel={90} aluno={props.electionAlunoData} /></div></div>)}</div></section> : null}
    </>
  );
};

export default AlunoIdentityDocuments;
