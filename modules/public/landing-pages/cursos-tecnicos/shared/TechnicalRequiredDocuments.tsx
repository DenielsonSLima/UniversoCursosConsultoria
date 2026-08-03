import React from 'react';
import {
  CheckCircle2,
  FileCheck2,
  FileText,
  Info,
  LockKeyhole,
  Upload,
  UserRoundCheck,
} from 'lucide-react';
import type {
  TechnicalDocumentPhase,
  TechnicalLandingConfig,
} from '../technicalLanding.types';
import { SCHOOL_SITUATION_LABELS } from './technicalLanding.utils';

interface TechnicalRequiredDocumentsProps {
  config: TechnicalLandingConfig;
}

const PHASES: Array<{
  phase: TechnicalDocumentPhase;
  step: string;
  title: string;
  description: string;
  accent: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    phase: 'APOS_PAGAMENTO',
    step: 'Etapa 1',
    title: 'Depois de concluir a inscrição',
    description: 'Envie estes arquivos pelo portal do aluno após a confirmação do pagamento.',
    accent: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: Upload,
  },
  {
    phase: 'ANTES_ATIVACAO',
    step: 'Etapa 2',
    title: 'Para regularizar sua matrícula',
    description: 'Envie os documentos acadêmicos e pessoais necessários para a análise da secretaria.',
    accent: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    icon: UserRoundCheck,
  },
  {
    phase: 'ANTES_ESTAGIO',
    step: 'Etapa 3',
    title: 'Antes de iniciar o estágio',
    description: 'Este item não impede a inscrição nem o pagamento e pode ser regularizado depois.',
    accent: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: LockKeyhole,
  },
];

const situationLabel = (situations: NonNullable<TechnicalLandingConfig['documents'][number]['situations']>) => {
  if (situations.length === 1 && situations[0] === 'CONCLUIDO') {
    return 'Para quem já concluiu o Ensino Médio';
  }
  return `Para quem está ${situations.map((item) => SCHOOL_SITUATION_LABELS[item].toLocaleLowerCase('pt-BR')).join(' ou ')}`;
};

const TechnicalRequiredDocuments: React.FC<TechnicalRequiredDocumentsProps> = ({ config }) => {
  const hasStageDocuments = config.documents.some((document) => document.phase === 'ANTES_ESTAGIO');

  return (
  <section className="space-y-8 rounded-[2.5rem] border border-slate-200/80 bg-white p-7 shadow-sm md:p-9">
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <FileText size={24} />
      </div>
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
          Documentação sem complicação
        </div>
        <h2 className="mt-1 text-2xl font-black leading-tight text-[#001a33] md:text-3xl">
          Seus documentos, no momento certo
        </h2>
        <p className="mt-2 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
          Você não precisa separar tudo agora. Conclua a inscrição primeiro e acompanhe cada solicitação pelo portal do aluno.
        </p>
      </div>
    </div>

    <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 md:grid-cols-3">
      {[
        ['1', 'Faça sua inscrição', 'Sem anexar documentos'],
        ['2', 'Acesse o portal', 'Use sua conta de aluno'],
        ['3', 'Envie os arquivos', 'PDF ou foto legível'],
      ].map(([number, title, detail], index) => (
        <div key={number} className={`relative flex items-center gap-3 p-4 ${index < 2 ? 'border-b border-slate-200 md:border-b-0 md:border-r' : ''}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#001f5b] text-xs font-black text-white">{number}</span>
          <div>
            <p className="text-xs font-black text-[#001a33]">{title}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{detail}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="space-y-5">
      {PHASES.map(({ phase, step, title, description, accent, icon: Icon }) => {
        const documents = config.documents.filter((document) => document.phase === phase);
        if (documents.length === 0) return null;

        return (
          <section key={phase} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className={`flex items-start gap-3 border-b px-5 py-4 ${accent}`}>
              <Icon size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70">{step}</p>
                <h3 className="mt-0.5 text-sm font-black">{title}</h3>
                <p className="mt-1 text-[11px] font-semibold leading-relaxed opacity-80">{description}</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 px-5">
              {documents.map((document) => (
                <article key={document.key} className="flex items-start gap-3 py-4">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                  <div className="min-w-0">
                    <h4 className="text-xs font-black leading-snug text-slate-800">{document.label}</h4>
                    {document.description ? (
                      <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">{document.description}</p>
                    ) : null}
                    {document.situations?.length ? (
                      <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">
                        {situationLabel(document.situations)}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>

    {config.documentationNotice ? (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-900">
        <Info size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <p className="font-black">{hasStageDocuments ? 'Importante sobre o estágio' : 'Importante sobre a documentação'}</p>
          <p className="mt-1 font-semibold">{config.documentationNotice}</p>
        </div>
      </div>
    ) : null}

    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
      <FileCheck2 size={15} className="text-blue-500" />
      A secretaria confere os documentos e avisa pelo portal se algum arquivo precisar ser reenviado.
    </div>
  </section>
  );
};

export default TechnicalRequiredDocuments;
