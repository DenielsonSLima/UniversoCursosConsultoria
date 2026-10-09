import React from 'react';
import { BadgeCheck, CreditCard, Download, ImageOff, Loader2, RefreshCw } from 'lucide-react';
import StudentCardDocument from './StudentCardDocument';
import InternshipBadgeDocument from './InternshipBadgeDocument';
import CrachaPeriodoEleitoralPreview from '../../../gestor/cadastros/modelos-documentos/cracha-periodo-eleitoral/components/CrachaPeriodoEleitoralPreview';
import FinancialUnderlineTabs, { type FinancialUnderlineTabItem } from '../../../gestor/financeiro/components/FinancialUnderlineTabs';
import useAlunoMobileLayout from '../../hooks/useAlunoMobileLayout';

export type AlunoIdentityTab = 'servicos' | 'carteirinha' | 'cracha' | 'cracha-eleitoral';

interface Props {
  tab: AlunoIdentityTab;
  canStudentCard: boolean;
  canInternshipBadge: boolean;
  canElectionBadge: boolean;
  studentCardTemplate: any;
  studentCardTemplateLoading: boolean;
  studentCardTemplateError: boolean;
  internshipBadgeTemplate: any;
  electionBadgeTemplate: any;
  alunoData: any;
  electionAlunoData: any;
  studentCardCode?: string;
  internshipBadgeCode?: string;
  internshipBadgeIssuedAt?: string;
  internshipBadgeExpiresAt?: string | null;
  internshipBadgeError?: boolean;
  onRetryInternshipBadge?: () => void;
  studentCardExpiresAt?: string | null;
  onTabChange: (tab: AlunoIdentityTab) => void;
  onRetryStudentCardTemplate: () => void;
}

const AlunoIdentityDocuments: React.FC<Props> = (props) => {
  const isMobile = useAlunoMobileLayout();
  const electionBadgePreviewZoom = isMobile ? 52 : 90;
  const hasIdentityDocument = props.canStudentCard || props.canInternshipBadge || props.canElectionBadge;
  const identityTabs: FinancialUnderlineTabItem<AlunoIdentityTab>[] = [
    { id: 'servicos', label: 'Serviços', icon: <CreditCard size={15} /> },
  ];
  if (hasIdentityDocument && props.canStudentCard) {
    identityTabs.push({ id: 'carteirinha', label: 'Carteirinha digital', icon: <CreditCard size={15} /> });
  }
  if (hasIdentityDocument && props.canInternshipBadge) {
    identityTabs.push({ id: 'cracha', label: 'Crachá de identificação', icon: <BadgeCheck size={15} /> });
  }
  if (hasIdentityDocument && props.canElectionBadge) {
    identityTabs.push({ id: 'cracha-eleitoral', label: 'SES', icon: <BadgeCheck size={15} /> });
  }


  return (
    <>
      <div className="rounded-2xl border border-slate-100 bg-white px-4 pt-2 shadow-sm md:px-7">
        <FinancialUnderlineTabs
          items={identityTabs}
          value={props.tab}
          onChange={props.onTabChange}
          ariaLabel="Serviços e documentos da secretaria"
        />
      </div>
      {props.tab === 'carteirinha' && props.canStudentCard ? (
        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn">
          {props.studentCardTemplateLoading ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 bg-slate-50 p-6" role="status"><Loader2 className="animate-spin text-blue-600" size={28} /><p className="text-xs font-bold text-slate-600">Carregando o modelo oficial…</p></div>
          ) : props.studentCardTemplateError || !props.studentCardTemplate ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center" role="alert"><ImageOff size={24} className="text-rose-600" /><p className="text-xs font-bold text-slate-600">Não foi possível carregar o modelo oficial da carteirinha.</p><button type="button" onClick={props.onRetryStudentCardTemplate} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-xs font-bold text-white"><RefreshCw size={14} /> Tentar novamente</button></div>
          ) : (
            <StudentCardDocument template={props.studentCardTemplate} aluno={props.alunoData} code={props.studentCardCode} expiresAt={props.studentCardExpiresAt} />
          )}
        </section>
      ) : null}
      {props.tab === 'cracha' && props.internshipBadgeTemplate && props.canInternshipBadge ? (
        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn">
          <InternshipBadgeDocument template={props.internshipBadgeTemplate} aluno={props.alunoData}
            code={props.internshipBadgeCode} issuedAt={props.internshipBadgeIssuedAt}
            expiresAt={props.internshipBadgeExpiresAt} registrationError={props.internshipBadgeError}
            onRetryRegistration={props.onRetryInternshipBadge} />
        </section>
      ) : null}
      {props.tab === 'cracha-eleitoral' && props.electionBadgeTemplate && props.canElectionBadge ? <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn"><header className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6"><div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><BadgeCheck size={15} className="text-cyan-600" /> Crachá SES</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Liberado após o registro de entrada no estágio.</p></div><button type="button" onClick={() => window.print()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600 md:w-auto"><Download size={13} /> Baixar / Imprimir</button></header><div id="print-area-cracha-eleitoral" className="flex flex-col items-center justify-center gap-8 overflow-hidden p-4 md:p-8">{(['frente', 'verso'] as const).map((page) => <div key={page} className="flex flex-col items-center gap-3"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span><div className="overflow-hidden shadow-xl ring-1 ring-slate-200"><CrachaPeriodoEleitoralPreview formData={props.electionBadgeTemplate} page={page} zoomLevel={electionBadgePreviewZoom} aluno={props.electionAlunoData} /></div></div>)}</div></section> : null}
    </>
  );
};

export default AlunoIdentityDocuments;

