import React from 'react';
import { BadgeCheck, CreditCard, Download, ImageOff, Loader2, Printer, RefreshCw } from 'lucide-react';
import CarteirinhaPreview from '../../../gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../../gestor/cadastros/modelos-documentos/cracha/components/CrachaPreview';
import CrachaPeriodoEleitoralPreview from '../../../gestor/cadastros/modelos-documentos/cracha-periodo-eleitoral/components/CrachaPeriodoEleitoralPreview';
import { useDocumentBackgroundReadiness } from '../../../gestor/cadastros/modelos-documentos/hooks/useDocumentBackgroundReadiness';
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
  downloadingStudentCard: boolean;
  onTabChange: (tab: AlunoIdentityTab) => void;
  onDownloadStudentCard: () => void;
  onRetryStudentCardTemplate: () => void;
  onPrintRegistered: (code: string | undefined, label: string) => void;
}

const AlunoIdentityDocuments: React.FC<Props> = (props) => {
  const isMobile = useAlunoMobileLayout();
  const studentCardPreviewZoom = isMobile ? 82 : 90;
  const studentCardPreviewSize = {
    width: `${85.6 * (studentCardPreviewZoom / 100)}mm`,
    height: `${54 * (studentCardPreviewZoom / 100)}mm`,
  };
  const electionBadgePreviewZoom = isMobile ? 52 : 90;
  const hasIdentityDocument = props.canStudentCard || props.canInternshipBadge || props.canElectionBadge;
  const studentCardBackgrounds = useDocumentBackgroundReadiness(
    props.studentCardTemplate?.bgFrenteUrl,
    props.studentCardTemplate?.hasVerso === false ? null : props.studentCardTemplate?.bgVersoUrl,
  );
  const studentCardReady = Boolean(
    props.studentCardTemplate
    && !props.studentCardTemplateLoading
    && !props.studentCardTemplateError
    && studentCardBackgrounds.status === 'ready',
  );
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

  const retryStudentCard = () => {
    if (props.studentCardTemplateError || !props.studentCardTemplate) {
      props.onRetryStudentCardTemplate();
      return;
    }
    studentCardBackgrounds.retry();
  };

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
          <header className="flex flex-col justify-between gap-4 border-b border-slate-100 px-4 py-5 md:flex-row md:items-center md:px-6">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><CreditCard size={15} className="text-blue-600" /> Carteirinha de Estudante</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Frente e verso do modelo oficial configurado pela instituição.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
              <button type="button" onClick={props.onDownloadStudentCard} disabled={!studentCardReady || !props.studentCardCode || props.downloadingStudentCard} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{props.downloadingStudentCard ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> : <Download size={13} />} {props.downloadingStudentCard ? 'Gerando PDF' : 'Baixar PDF'}</button>
              <button type="button" onClick={() => props.onPrintRegistered(props.studentCardCode, 'carteirinha')} disabled={!studentCardReady || !props.studentCardCode} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"><Printer size={13} /> Imprimir</button>
            </div>
          </header>

          {props.studentCardTemplateLoading || studentCardBackgrounds.status === 'loading' ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 bg-slate-50 px-6 py-12 text-center">
              <Loader2 className="animate-spin text-blue-600 motion-reduce:animate-none" size={30} />
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Preparando a carteirinha oficial</p>
              <p className="text-xs font-medium text-slate-400">Carregando frente, verso e dados de validação…</p>
            </div>
          ) : props.studentCardTemplateError || !props.studentCardTemplate || studentCardBackgrounds.status === 'error' ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center bg-slate-50 px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm"><ImageOff size={23} /></div>
              <h4 className="mt-4 text-sm font-black uppercase tracking-tight text-[#001a33]">Modelo oficial indisponível</h4>
              <p className="mt-2 max-w-md text-xs font-medium leading-relaxed text-slate-500">A carteirinha foi pausada para não exibir um layout branco ou incompleto no lugar da arte cadastrada.</p>
              <button type="button" onClick={retryStudentCard} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-900"><RefreshCw size={14} /> Tentar novamente</button>
            </div>
          ) : (
            <div id="print-area" className="flex flex-col items-center justify-center gap-5 bg-slate-50/70 px-3 py-6 md:flex-row md:flex-wrap md:items-start md:gap-x-5 md:gap-y-4 md:px-6">
              {(['frente', 'verso'] as const).map((page) => (
                <div key={page} className="flex shrink-0 flex-col items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span>
                  <div className="relative shrink-0 overflow-visible" style={studentCardPreviewSize}>
                    <CarteirinhaPreview formData={props.studentCardTemplate} page={page} zoomLevel={studentCardPreviewZoom} transformOrigin="top left" aluno={{ ...props.alunoData, validationCode: props.studentCardCode }} isEditable={false} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {props.tab === 'cracha' && props.internshipBadgeTemplate && props.canInternshipBadge ? <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn"><header className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6"><div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><BadgeCheck size={15} className="text-blue-600" /> Crachá de Identificação</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Frente e verso do crachá oficial.</p></div><button type="button" onClick={() => props.onPrintRegistered(props.internshipBadgeCode, 'crachá')} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600 md:w-auto"><Download size={13} /> Baixar / Imprimir</button></header><div id="print-area-cracha" className="flex flex-col items-center justify-center gap-8 p-5 md:flex-row md:items-start md:gap-12 md:p-8">{(['frente', 'verso'] as const).map((page) => <div key={page} className="flex flex-col items-center gap-3"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span><div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-slate-200"><CrachaPreview formData={props.internshipBadgeTemplate} page={page} zoomLevel={90} aluno={{ ...props.alunoData, validationCode: props.internshipBadgeCode }} isEditable={false} /></div></div>)}</div></section> : null}
      {props.tab === 'cracha-eleitoral' && props.electionBadgeTemplate && props.canElectionBadge ? <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fadeIn"><header className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6"><div><h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><BadgeCheck size={15} className="text-cyan-600" /> Crachá SES</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Liberado após o registro de entrada no estágio.</p></div><button type="button" onClick={() => window.print()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-md hover:bg-blue-600 md:w-auto"><Download size={13} /> Baixar / Imprimir</button></header><div id="print-area-cracha-eleitoral" className="flex flex-col items-center justify-center gap-8 overflow-hidden p-4 md:p-8">{(['frente', 'verso'] as const).map((page) => <div key={page} className="flex flex-col items-center gap-3"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">◆ {page}</span><div className="overflow-hidden shadow-xl ring-1 ring-slate-200"><CrachaPeriodoEleitoralPreview formData={props.electionBadgeTemplate} page={page} zoomLevel={electionBadgePreviewZoom} aluno={props.electionAlunoData} /></div></div>)}</div></section> : null}
    </>
  );
};

export default AlunoIdentityDocuments;
