import React from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import type { TechnicalLandingConfig } from '../technicalLanding.types';
import { DOCUMENT_PHASE_LABELS, SCHOOL_SITUATION_LABELS } from './technicalLanding.utils';

interface TechnicalRequiredDocumentsProps {
  config: TechnicalLandingConfig;
}

const TechnicalRequiredDocuments: React.FC<TechnicalRequiredDocumentsProps> = ({ config }) => (
  <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
    <div className="flex items-center gap-3">
      <div className="rounded-2xl bg-blue-50 p-3 text-blue-600"><FileText size={22} /></div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Checklist transparente</p>
        <h2 className="text-xl font-black text-[#001a33]">Documentos da matrícula</h2>
      </div>
    </div>
    <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-500">
      Você pode pagar primeiro e enviar os arquivos em PDF ou imagem pelo portal do aluno.
    </p>
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      {config.documents.map((document) => (
        <article key={document.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={17} />
            <div>
              <h3 className="text-sm font-black text-slate-800">{document.label}</h3>
              {document.description ? <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{document.description}</p> : null}
              <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-blue-600">
                {DOCUMENT_PHASE_LABELS[document.phase]}
              </p>
              {document.situations?.length ? (
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  {document.situations.map((item) => SCHOOL_SITUATION_LABELS[item]).join(' ou ')}
                </p>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
    {config.documentationNotice ? (
      <p className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">
        {config.documentationNotice}
      </p>
    ) : null}
  </section>
);

export default TechnicalRequiredDocuments;
