import { useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock3,
  Copy,
  CreditCard,
  Download,
  FileText,
  GraduationCap,
  Landmark,
  Loader2,
  Send,
  WalletCards,
  XCircle,
} from 'lucide-react';

import type { PrazoConfig, Solicitacao } from '../../../../gestor/secretaria/secretaria.service';
import FinancialUnderlineTabs from '../../../../gestor/financeiro/components/FinancialUnderlineTabs';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type {
  AlunoSecretariaEligibility,
  AlunoSecretariaSolicitacaoTipo,
} from '../../secretaria-aluno.types';
import type { AlunoIdentityTab } from '../AlunoIdentityDocuments';

type MobileSection = 'servicos' | 'solicitacoes' | 'identificacao';

type AlunoMobileSecretariaProps = {
  courseName: string;
  eligibility: AlunoSecretariaEligibility;
  enrollmentNumber: string;
  prazos: Record<string, PrazoConfig>;
  selectedType: AlunoSecretariaSolicitacaoTipo;
  solicitacoes: Solicitacao[];
  submitting: boolean;
  onCopyEnrollment: () => void;
  onOpenBulletin: () => void;
  onOpenDeclaration: () => void;
  onOpenIrpf: () => void;
  onOpenIdentity: (tab: AlunoIdentityTab) => void;
  onSelectedTypeChange: (value: AlunoSecretariaSolicitacaoTipo) => void;
  onSubmitRequest: () => void;
};

const formatDate = (date: string) => date?.split('-').reverse().join('/') || 'Não informada';

const RequestStatus = ({ status }: { status: string }) => {
  if (status === 'Deferido') {
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Pronto</span>;
  }
  if (status === 'Indeferido') {
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"><XCircle size={13} /> Não aprovado</span>;
  }
  return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"><Clock3 size={13} /> Em análise</span>;
};

const AlunoMobileSecretaria = ({
  courseName,
  eligibility,
  enrollmentNumber,
  prazos,
  selectedType,
  solicitacoes,
  submitting,
  onCopyEnrollment,
  onOpenBulletin,
  onOpenDeclaration,
  onOpenIrpf,
  onOpenIdentity,
  onSelectedTypeChange,
  onSubmitRequest,
}: AlunoMobileSecretariaProps) => {
  const [section, setSection] = useState<MobileSection>('servicos');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const pendingCount = solicitacoes.filter((item) => item.status === 'Pendente').length;
  const immediateDocuments = [
    eligibility.canEmitStudentCard,
    eligibility.canEmitBulletin,
    eligibility.canEmitEnrollmentDeclaration,
    eligibility.canEmitIrpf,
  ].filter(Boolean).length;

  const quickDocuments = [
    eligibility.canEmitStudentCard
      ? { id: 'student-card', title: 'Carteirinha do estudante', detail: 'Abrir carteirinha digital', icon: CreditCard, onClick: () => onOpenIdentity('carteirinha') }
      : null,
    eligibility.canEmitBulletin
      ? { id: 'bulletin', title: 'Boletim', detail: 'Notas e frequência', icon: GraduationCap, onClick: onOpenBulletin }
      : null,
    eligibility.canEmitEnrollmentDeclaration
      ? { id: 'declaration', title: 'Declaração', detail: 'Matrícula com QR Code', icon: FileText, onClick: onOpenDeclaration }
      : null,
    eligibility.canEmitIrpf
      ? { id: 'irpf', title: 'IRPF', detail: 'Pagamentos do ano', icon: WalletCards, onClick: onOpenIrpf }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const identityDocuments = [
    eligibility.canEmitStudentCard
      ? { id: 'carteirinha' as const, title: 'Carteirinha digital', detail: 'Identificação acadêmica', icon: CreditCard }
      : null,
    eligibility.canEmitInternshipBadge
      ? { id: 'cracha' as const, title: 'Crachá de estágio', detail: 'Identificação para estágio', icon: BadgeCheck }
      : null,
    eligibility.canEmitElectionBadge
      ? { id: 'cracha-eleitoral' as const, title: 'Crachá SES', detail: 'Identificação eleitoral', icon: Landmark }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="space-y-4 text-[13px] md:hidden">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-medium text-[#001a33]">Documentos</h1>
        <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{courseName}</p>
        <button
          type="button"
          onClick={onCopyEnrollment}
          className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`Copiar matrícula ${enrollmentNumber}`}
        >
          <span className="min-w-0">
            <span className="block text-xs text-slate-500">Minha matrícula</span>
            <span className="mt-0.5 block break-all font-mono text-[13px] font-medium text-[#001a33]">{enrollmentNumber}</span>
          </span>
          <Copy size={16} className="shrink-0 text-slate-500" />
        </button>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span><strong className="font-semibold text-[#001a33]">{immediateDocuments}</strong> disponíveis</span>
          <span><strong className="font-semibold text-[#001a33]">{pendingCount}</strong> em análise</span>
        </div>
      </section>

      <FinancialUnderlineTabs<MobileSection>
        items={[
          { id: 'servicos', label: 'Serviços' },
          { id: 'solicitacoes', label: 'Pedidos' },
          { id: 'identificacao', label: 'Identificação' },
        ]}
        value={section}
        onChange={setSection}
        ariaLabel="Áreas de documentos"
        idPrefix="mobile-secretaria"
        compact
      />

      {section === 'servicos' ? (
        <section id="mobile-secretaria-servicos-panel" role="tabpanel" tabIndex={0} className="space-y-3" aria-labelledby="mobile-secretaria-servicos-tab">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mobile-secretaria-services-title" className="text-sm font-medium text-[#001a33]">Documentos rápidos</h2>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{quickDocuments.length}</span>
          </div>

          {quickDocuments.length > 0 ? quickDocuments.map((document) => {
            const Icon = document.icon;
            return (
              <button key={document.id} type="button" onClick={document.onClick} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors active:border-blue-200 active:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[#001a33]">{document.title}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                    <span className="text-slate-600">{document.detail}</span>
                    <span className="text-emerald-700">Disponível</span>
                  </span>
                </span>
                <ChevronRight size={17} className="shrink-0 text-slate-400" />
              </button>
            );
          }) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <Clipboard size={22} className="mx-auto text-slate-400" />
              <p className="mt-2 text-[13px] font-medium text-[#001a33]">Nenhum documento imediato</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">Consulte as solicitações disponíveis para seu vínculo.</p>
            </div>
          )}

          {eligibility.blockedSummary ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{eligibility.blockedSummary}</p> : null}

          <button type="button" onClick={() => { setSection('solicitacoes'); setShowNewRequest(true); }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-[#001a33] px-3 py-3 text-left text-white active:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <span className="flex min-w-0 items-center gap-3"><Send size={17} className="shrink-0 text-blue-200" /><span><span className="block text-xs text-blue-200">Atendimento acadêmico</span><span className="mt-0.5 block text-[13px] font-medium">Fazer nova solicitação</span></span></span>
            <ChevronRight size={17} className="shrink-0 text-blue-200" />
          </button>
        </section>
      ) : null}

      {section === 'solicitacoes' ? (
        <section id="mobile-secretaria-solicitacoes-panel" role="tabpanel" tabIndex={0} className="space-y-3" aria-labelledby="mobile-secretaria-solicitacoes-tab">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mobile-secretaria-requests-title" className="text-sm font-medium text-[#001a33]">Minhas solicitações</h2>
            <button type="button" onClick={() => setShowNewRequest((current) => !current)} className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-3 text-[13px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-expanded={showNewRequest} aria-controls={showNewRequest ? 'mobile-secretaria-new-request' : undefined}>
              {showNewRequest ? 'Fechar' : 'Nova'}
            </button>
          </div>

          {showNewRequest ? (
            <div id="mobile-secretaria-new-request" className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="text-xs text-slate-600" htmlFor="mobile-secretaria-request-type">Tipo de documento</label>
              <InstitutionalSelect
                id="mobile-secretaria-request-type"
                value={selectedType}
                onValueChange={(value) => {
                  const nextType = eligibility.allowedRequests.find((type) => type === value);
                  if (nextType) onSelectedTypeChange(nextType);
                }}
                options={eligibility.allowedRequests.map((type) => ({ value: type, label: type }))}
                ariaLabel="Tipo de documento"
                placeholder="Buscar documento…"
                className="mt-1.5"
                disabled={submitting || !eligibility.allowedRequests.length}
                ariaDescribedBy="mobile-secretaria-request-deadline"
              />
              <div id="mobile-secretaria-request-deadline" className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-blue-700">Prazo: {prazos[selectedType]?.prazo || '48 horas'}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{prazos[selectedType]?.descricao || 'A secretaria analisará sua solicitação.'}</p>
              </div>
              <button type="button" onClick={onSubmitRequest} disabled={submitting || !eligibility.allowedRequests.length} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-medium text-white disabled:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {submitting ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Send size={16} />} Enviar solicitação
              </button>
            </div>
          ) : null}

          {solicitacoes.length > 0 ? solicitacoes.map((request) => (
            <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-[13px] font-medium leading-snug text-[#001a33]">{request.tipo}</p>
                  <p className="mt-1 text-xs text-slate-600">Pedido em {formatDate(request.dataSolicitacao)}</p>
                </div>
                <RequestStatus status={request.status} />
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${request.status === 'Deferido' ? 'bg-emerald-500' : request.status === 'Indeferido' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                <span className="min-w-0 flex-1"><span className="block text-xs text-slate-600">Prazo informado</span><span className="mt-0.5 block text-[13px] font-medium text-slate-700">{request.prazo}</span></span>
              </div>
              {request.status === 'Deferido' && request.resposta?.startsWith('http') ? (
                <a href={request.resposta} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 text-[13px] font-medium text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Download size={15} /> Baixar documento</a>
              ) : request.status === 'Indeferido' ? (
                <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{request.resposta || 'Consulte a secretaria para revisar os dados desta solicitação.'}</p>
              ) : null}
            </article>
          )) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <Clock3 size={22} className="mx-auto text-slate-400" />
              <p className="mt-2 text-[13px] font-medium text-[#001a33]">Nenhuma solicitação enviada</p>
              <p className="mt-1 text-xs text-slate-600">Seus pedidos e prazos aparecerão aqui.</p>
            </div>
          )}
        </section>
      ) : null}

      {section === 'identificacao' ? (
        <section id="mobile-secretaria-identificacao-panel" role="tabpanel" tabIndex={0} className="space-y-3" aria-labelledby="mobile-secretaria-identificacao-tab">
          <h2 id="mobile-secretaria-identity-title" className="text-sm font-medium text-[#001a33]">Identificação acadêmica</h2>
          {identityDocuments.length > 0 ? identityDocuments.map((document) => {
            const Icon = document.icon;
            return (
              <button key={document.id} type="button" onClick={() => onOpenIdentity(document.id)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors active:border-cyan-200 active:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><Icon size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-[#001a33]">{document.title}</span><span className="mt-1 block text-xs text-slate-600">{document.detail}</span></span>
                <ChevronRight size={17} className="shrink-0 text-slate-400" />
              </button>
            );
          }) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center"><CreditCard size={22} className="mx-auto text-slate-400" /><p className="mt-2 text-[13px] font-medium text-[#001a33]">Nenhuma identificação disponível</p><p className="mt-1 text-xs leading-relaxed text-slate-600">A liberação depende do tipo e da situação da matrícula.</p></div>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default AlunoMobileSecretaria;
