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
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700"><CheckCircle2 size={13} /> Pronto</span>;
  }
  if (status === 'Indeferido') {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700"><XCircle size={13} /> Não aprovado</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700"><Clock3 size={13} /> Em análise</span>;
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
    eligibility.canEmitBulletin,
    eligibility.canEmitEnrollmentDeclaration,
    eligibility.canEmitIrpf,
  ].filter(Boolean).length;

  const quickDocuments = [
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
    <div className="space-y-4 md:hidden">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#001f3f] p-5 text-white shadow-[0_18px_44px_-28px_rgba(0,31,63,0.85)]">
        <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full border-[24px] border-blue-500/15" />
        <div className="relative">
          <div className="flex items-center gap-2 text-blue-200">
            <Landmark size={16} aria-hidden="true" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Secretaria digital</p>
          </div>
          <h1 className="mt-2 text-xl font-black tracking-tight">Serviços acadêmicos</h1>
          <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-300">{courseName}</p>

          <button type="button" onClick={onCopyEnrollment} className="mt-4 flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-left active:bg-white/10" aria-label={`Copiar matrícula ${enrollmentNumber}`}>
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Minha matrícula</span>
              <span className="mt-1 block font-mono text-sm font-black tracking-wider text-white">{enrollmentNumber}</span>
            </span>
            <Copy size={18} className="shrink-0 text-blue-200" />
          </button>

          <div className="mt-4 grid grid-cols-2 divide-x divide-white/10 rounded-2xl bg-white/[0.05] py-3 text-center">
            <div>
              <strong className="text-lg font-black">{immediateDocuments}</strong>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">Disponíveis</span>
            </div>
            <div>
              <strong className="text-lg font-black">{pendingCount}</strong>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-300">Em análise</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm" role="tablist" aria-label="Áreas da secretaria">
        {([
          ['servicos', 'Serviços'],
          ['solicitacoes', 'Pedidos'],
          ['identificacao', 'Identificação'],
        ] as Array<[MobileSection, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`min-h-11 rounded-xl px-2 text-[10px] font-black uppercase tracking-wide ${section === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {section === 'servicos' ? (
        <section className="space-y-3" aria-labelledby="mobile-secretaria-services-title">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Emitir agora</p>
              <h2 id="mobile-secretaria-services-title" className="mt-0.5 text-sm font-black text-[#001a33]">Documentos rápidos</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{quickDocuments.length}</span>
          </div>

          {quickDocuments.length > 0 ? quickDocuments.map((document) => {
            const Icon = document.icon;
            return (
              <button key={document.id} type="button" onClick={document.onClick} className="flex min-h-[4.75rem] w-full items-center gap-3 rounded-[1.35rem] border border-slate-200/80 bg-white p-3 text-left shadow-sm active:border-blue-200 active:bg-blue-50">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon size={21} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-[#001a33]">{document.title}</span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">{document.detail}</span>
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Disponível</span>
                <ChevronRight size={17} className="shrink-0 text-slate-400" />
              </button>
            );
          }) : (
            <div className="rounded-[1.35rem] border border-slate-200/80 bg-white p-5 text-center shadow-sm">
              <Clipboard size={25} className="mx-auto text-slate-300" />
              <p className="mt-2 text-xs font-black text-[#001a33]">Nenhum documento imediato</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Consulte as solicitações disponíveis para seu vínculo.</p>
            </div>
          )}

          {eligibility.blockedSummary ? <p className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[11px] font-bold leading-relaxed text-amber-800">{eligibility.blockedSummary}</p> : null}

          <button type="button" onClick={() => { setSection('solicitacoes'); setShowNewRequest(true); }} className="flex min-h-14 w-full items-center justify-between rounded-[1.35rem] bg-[#001f3f] px-4 text-left text-white shadow-sm active:bg-slate-900">
            <span className="flex items-center gap-3"><Send size={18} className="text-blue-300" /><span><span className="block text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">Atendimento acadêmico</span><span className="mt-0.5 block text-xs font-bold">Fazer nova solicitação</span></span></span>
            <ChevronRight size={18} className="text-blue-200" />
          </button>
        </section>
      ) : null}

      {section === 'solicitacoes' ? (
        <section className="space-y-3" aria-labelledby="mobile-secretaria-requests-title">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Acompanhamento</p>
              <h2 id="mobile-secretaria-requests-title" className="mt-0.5 text-sm font-black text-[#001a33]">Minhas solicitações</h2>
            </div>
            <button type="button" onClick={() => setShowNewRequest((current) => !current)} className="min-h-11 rounded-xl bg-blue-600 px-3 text-[10px] font-black uppercase tracking-wide text-white" aria-expanded={showNewRequest}>
              {showNewRequest ? 'Fechar' : 'Nova'}
            </button>
          </div>

          {showNewRequest ? (
            <div className="rounded-[1.5rem] border border-blue-100 bg-white p-4 shadow-sm">
              <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500" htmlFor="mobile-secretaria-request-type">Tipo de documento</label>
              <select id="mobile-secretaria-request-type" value={selectedType} onChange={(event) => onSelectedTypeChange(event.target.value as AlunoSecretariaSolicitacaoTipo)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                {eligibility.allowedRequests.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-blue-600">Prazo: {prazos[selectedType]?.prazo || '48 horas'}</p>
                <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">{prazos[selectedType]?.descricao || 'A secretaria analisará sua solicitação.'}</p>
              </div>
              <button type="button" onClick={onSubmitRequest} disabled={submitting || !eligibility.allowedRequests.length} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wide text-white disabled:bg-slate-300">
                {submitting ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Send size={16} />} Enviar solicitação
              </button>
            </div>
          ) : null}

          {solicitacoes.length > 0 ? solicitacoes.map((request) => (
            <article key={request.id} className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-black leading-snug text-[#001a33]">{request.tipo}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Pedido em {formatDate(request.dataSolicitacao)}</p>
                </div>
                <RequestStatus status={request.status} />
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${request.status === 'Deferido' ? 'bg-emerald-500' : request.status === 'Indeferido' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                <span className="min-w-0 flex-1"><span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Prazo informado</span><span className="mt-0.5 block text-xs font-bold text-slate-700">{request.prazo}</span></span>
              </div>
              {request.status === 'Deferido' && request.resposta?.startsWith('http') ? (
                <a href={request.resposta} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 text-[10px] font-black uppercase tracking-wide text-emerald-700"><Download size={15} /> Baixar documento</a>
              ) : request.status === 'Indeferido' ? (
                <p className="mt-3 rounded-xl bg-rose-50 p-3 text-[11px] font-medium leading-relaxed text-rose-700">{request.resposta || 'Consulte a secretaria para revisar os dados desta solicitação.'}</p>
              ) : null}
            </article>
          )) : (
            <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 text-center shadow-sm">
              <Clock3 size={26} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-black text-[#001a33]">Nenhuma solicitação enviada</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Seus pedidos e prazos aparecerão aqui.</p>
            </div>
          )}
        </section>
      ) : null}

      {section === 'identificacao' ? (
        <section className="space-y-3" aria-labelledby="mobile-secretaria-identity-title">
          <div className="px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600">Documentos digitais</p>
            <h2 id="mobile-secretaria-identity-title" className="mt-0.5 text-sm font-black text-[#001a33]">Identificação acadêmica</h2>
          </div>
          {identityDocuments.length > 0 ? identityDocuments.map((document) => {
            const Icon = document.icon;
            return (
              <button key={document.id} type="button" onClick={() => onOpenIdentity(document.id)} className="flex min-h-[4.75rem] w-full items-center gap-3 rounded-[1.35rem] border border-slate-200/80 bg-white p-3 text-left shadow-sm active:border-cyan-200 active:bg-cyan-50">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><Icon size={21} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black text-[#001a33]">{document.title}</span><span className="mt-1 block text-[11px] font-medium text-slate-500">{document.detail}</span></span>
                <ChevronRight size={18} className="text-slate-400" />
              </button>
            );
          }) : (
            <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 text-center shadow-sm"><CreditCard size={27} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-black text-[#001a33]">Nenhuma identificação disponível</p><p className="mt-1 text-[11px] font-medium text-slate-500">A liberação depende do tipo e da situação da matrícula.</p></div>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default AlunoMobileSecretaria;
