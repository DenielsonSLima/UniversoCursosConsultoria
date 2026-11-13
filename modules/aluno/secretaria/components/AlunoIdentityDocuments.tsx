import React from 'react';
import { ArrowLeft, BadgeCheck, CreditCard, Download, ImageOff, Loader2, RefreshCw } from 'lucide-react';
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
      {isMobile && props.tab !== 'servicos' ? (
        <button
          type="button"
          onClick={() => props.onTabChange('servicos')}
          className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-slate-600 transition-colors active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft size={17} /> Voltar para documentos
        </button>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white px-1 md:rounded-2xl md:border-slate-100 md:px-7 md:pt-2 md:shadow-sm">
        <FinancialUnderlineTabs
          items={identityTabs}
          value={props.tab}
          onChange={props.onTabChange}
          ariaLabel="Serviços e documentos da secretaria"
          compact={isMobile}
        />
      </div>
      {props.tab === 'carteirinha' && props.canStudentCard ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white animate-fadeIn md:rounded-2xl md:border-slate-100 md:shadow-sm">
          {props.studentCardTemplateLoading ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 bg-slate-50 p-4 md:min-h-[260px] md:p-6" role="status"><Loader2 className="animate-spin text-blue-600 motion-reduce:animate-none" size={24} /><p className="text-[13px] text-slate-600 md:text-xs md:font-bold">Carregando o modelo oficial…</p></div>
          ) : props.studentCardTemplateError || !props.studentCardTemplate ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 bg-slate-50 p-4 text-center md:min-h-[260px] md:p-6" role="alert"><ImageOff size={24} className="text-rose-600" /><p className="text-[13px] text-slate-600 md:text-xs md:font-bold">Não foi possível carregar o modelo oficial da carteirinha.</p><button type="button" onClick={props.onRetryStudentCardTemplate} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#001a33] px-4 py-2 text-[13px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:rounded-xl md:py-3 md:text-xs md:font-bold"><RefreshCw size={14} /> Tentar novamente</button></div>
          ) : (
            <StudentCardDocument template={props.studentCardTemplate} aluno={props.alunoData} code={props.studentCardCode} expiresAt={props.studentCardExpiresAt} />
          )}
        </section>
      ) : null}
      {props.tab === 'cracha' && props.internshipBadgeTemplate && props.canInternshipBadge ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white animate-fadeIn md:rounded-2xl md:border-slate-100 md:shadow-sm">
          <InternshipBadgeDocument template={props.internshipBadgeTemplate} aluno={props.alunoData}
            code={props.internshipBadgeCode} issuedAt={props.internshipBadgeIssuedAt}
            expiresAt={props.internshipBadgeExpiresAt} registrationError={props.internshipBadgeError}
            onRetryRegistration={props.onRetryInternshipBadge} />
        </section>
      ) : null}
      {props.tab === 'cracha-eleitoral' && props.electionBadgeTemplate && props.canElectionBadge ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white animate-fadeIn md:rounded-2xl md:border-slate-100 md:shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-5">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-[#001a33] md:font-black md:uppercase md:tracking-tight"><BadgeCheck size={15} className="text-cyan-600" /> Crachá SES</h3>
              <p className="mt-0.5 text-xs text-slate-600 md:font-medium md:text-slate-500">Liberado após o registro de entrada no estágio.</p>
            </div>
            <button type="button" onClick={() => window.print()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#001a33] px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:w-auto md:rounded-xl md:text-[10px] md:font-bold md:uppercase md:tracking-widest md:shadow-md"><Download size={13} /> Baixar / Imprimir</button>
          </header>
          <div id="print-area-cracha-eleitoral" className="flex flex-col items-center justify-center gap-8 overflow-hidden p-4 md:p-8">
            {(['frente', 'verso'] as const).map((page) => (
              <div key={page} className="flex flex-col items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span>
                <div className="overflow-hidden shadow-xl ring-1 ring-slate-200">
                  <CrachaPeriodoEleitoralPreview formData={props.electionBadgeTemplate} page={page} zoomLevel={electionBadgePreviewZoom} aluno={props.electionAlunoData} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
};

export default AlunoIdentityDocuments;

