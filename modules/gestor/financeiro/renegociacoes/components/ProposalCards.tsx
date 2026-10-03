import React from 'react';
import { ChevronRight, Clock3, FileCheck2, FileX2, WalletCards } from 'lucide-react';
import { formatCents, formatRenegociacaoDate } from '../renegociacoes.model';
import type { RenegociacaoProposalPage, RenegociacaoProposalSummary } from '../renegociacoes.types';
import { EmptyPanel, ErrorPanel, LoadingPanel, Pagination } from './RenegociacaoPanels';

const statusPresentation = {
  DRAFT: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700', icon: Clock3 },
  PROPOSED: { label: 'Proposta salva', className: 'bg-blue-100 text-blue-800', icon: FileCheck2 },
  CANCELED: { label: 'Descartada', className: 'bg-rose-100 text-rose-800', icon: FileX2 },
} as const;

interface ProposalCardsProps {
  data?: RenegociacaoProposalPage;
  loading: boolean;
  error: unknown;
  search: string;
  onRetry: () => void;
  onOpen: (proposal: RenegociacaoProposalSummary) => void;
  onPage: (page: number) => void;
}

const ProposalCards: React.FC<ProposalCardsProps> = ({ data, loading, error, search, onRetry, onOpen, onPage }) => {
  if (loading) return <LoadingPanel label="Carregando propostas..." />;
  if (error) return <ErrorPanel error={error} onRetry={onRetry} />;
  if (!data?.rows.length)
    return (
      <EmptyPanel
        title="Nenhuma proposta encontrada"
        description={search ? 'Nenhuma proposta corresponde à busca atual.' : 'Esta visão ainda não possui propostas.'}
      />
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.rows.map((proposal) => {
          const status = statusPresentation[proposal.lifecycleStatus];
          const Icon = status.icon;
          return (
            <article
              key={proposal.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-black text-[#001a33]">{proposal.studentName}</h4>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                    {proposal.className}
                    {proposal.classCode ? ` • ${proposal.classCode}` : ''}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${status.className}`}
                >
                  <Icon size={12} /> {status.label}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2">
                <Metric label="Títulos" value={String(proposal.sourceCount)} />
                <Metric label="Saldo selecionado" value={formatCents(proposal.sourceOpenCents)} />
                <Metric label="Total proposto" value={formatCents(proposal.negotiatedCents)} strong />
                <Metric
                  label="Plano"
                  value={`${proposal.installmentCount}x • ${formatRenegociacaoDate(proposal.firstDueDate)}`}
                />
              </dl>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-500">
                <WalletCards size={14} className="shrink-0" />
                <span>Ativação e emissão ainda indisponíveis.</span>
              </div>
              <button
                type="button"
                onClick={() => onOpen(proposal)}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-blue-700 hover:bg-blue-50"
              >
                Ver proposta <ChevronRight size={15} />
              </button>
            </article>
          );
        })}
      </div>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.totalItems} onChange={onPage} />
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
    <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className={`mt-0.5 truncate text-xs ${strong ? 'font-black text-blue-800' : 'font-bold text-slate-700'}`}>
      {value}
    </dd>
  </div>
);

export default ProposalCards;
