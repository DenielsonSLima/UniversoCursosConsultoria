import React from 'react';
import { CheckCircle2, FileCheck2, FileText, Info } from 'lucide-react';
import type { TechnicalLandingConfig } from '../technicalLanding.types';
import { DOCUMENT_PHASE_LABELS, SCHOOL_SITUATION_LABELS } from './technicalLanding.utils';

interface TechnicalRequiredDocumentsProps {
  config: TechnicalLandingConfig;
}

const PHASE_STYLES: Record<string, string> = {
  POS_PAGAMENTO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REGULARIZACAO: 'bg-blue-50 text-blue-700 border-blue-200',
  ANTES_DO_ESTAGIO: 'bg-amber-50 text-amber-800 border-amber-200',
};

const TechnicalRequiredDocuments: React.FC<TechnicalRequiredDocumentsProps> = ({ config }) => (
  <section className="rounded-[2.5rem] border border-slate-200/80 bg-white p-7 shadow-sm md:p-9 space-y-8">
    <div className="flex items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
        <FileText size={24} />
      </div>
      <div>
        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
          <span>Checklist Transparente</span>
        </div>
        <h2 className="text-2xl font-black text-[#001a33]">Documentos para Matrícula</h2>
      </div>
    </div>

    {/* Simple 3-step workflow banner */}
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-blue-900 font-bold">
        <FileCheck2 size={18} className="text-blue-600 shrink-0" />
        <span>Como funciona o envio de documentos?</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
        <span className="rounded-lg bg-white px-2.5 py-1 border border-slate-200">1. Realize a inscrição</span>
        <span>→</span>
        <span className="rounded-lg bg-white px-2.5 py-1 border border-slate-200">2. Acesse o portal do aluno</span>
        <span>→</span>
        <span className="rounded-lg bg-white px-2.5 py-1 border border-slate-200">3. Envie arquivos em PDF/Foto</span>
      </div>
    </div>

    {/* Document cards grid */}
    <div className="grid gap-3.5 md:grid-cols-2">
      {config.documents.map((document) => {
        const badgeStyle = PHASE_STYLES[document.phase] || 'bg-slate-100 text-slate-700 border-slate-200';

        return (
          <article
            key={document.key}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4.5 transition-all duration-200 hover:border-blue-200 hover:bg-white hover:shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                  <h3 className="text-xs font-black text-slate-800 leading-snug">{document.label}</h3>
                </div>
              </div>

              {document.description ? (
                <p className="mt-2 text-[11px] font-medium leading-relaxed text-slate-500 pl-7">
                  {document.description}
                </p>
              ) : null}
            </div>

            <div className="mt-4 pl-7 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/50">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeStyle}`}>
                {DOCUMENT_PHASE_LABELS[document.phase]}
              </span>

              {document.situations?.length ? (
                <span className="text-[10px] font-bold text-slate-400">
                  ({document.situations.map((item) => SCHOOL_SITUATION_LABELS[item]).join(' ou ')})
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>

    {config.documentationNotice ? (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-xs font-bold leading-relaxed text-amber-900">
        <Info size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <p>{config.documentationNotice}</p>
      </div>
    ) : null}
  </section>
);

export default TechnicalRequiredDocuments;
