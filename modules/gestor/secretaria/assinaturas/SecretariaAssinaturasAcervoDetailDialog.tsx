import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  ShieldCheck,
  UserRoundCheck,
  X,
} from 'lucide-react';
import type {
  ElectronicSignatureArchiveItem,
  ElectronicSignatureArtifactClass,
  ElectronicSignatureArtifactDownload,
} from '../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import {
  artifactLabel,
  formatDateTime,
  roleLabel,
} from './SecretariaAssinaturasAcervo.shared';

interface ArchiveDetailDialogProps {
  item: ElectronicSignatureArchiveItem | null;
  busyArtifactClass: ElectronicSignatureArtifactClass | null;
  authorizedDownload: ElectronicSignatureArtifactDownload | null;
  onClose: () => void;
  onOpenArtifact: (
    item: ElectronicSignatureArchiveItem,
    artifactClass: 'DOCUMENTO_FINAL' | 'COMPROVANTE_EVIDENCIA',
  ) => void;
}

export const ArchiveDetailDialog: React.FC<ArchiveDetailDialogProps> = ({
  item,
  busyArtifactClass,
  authorizedDownload,
  onClose,
  onOpenArtifact,
}) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busyArtifactClass);
  closeRef.current = onClose;
  busyRef.current = busyArtifactClass;

  useEffect(() => {
    if (!item || typeof document === 'undefined') return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable: HTMLElement[] = [];
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ).forEach((element) => {
        if (!element.hasAttribute('hidden')) focusable.push(element);
      });
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [item?.envelopeId]);

  if (!item || typeof document === 'undefined') return null;
  const statusClassName = item.status === 'ASSINADO'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : 'bg-slate-100 text-slate-700 ring-slate-200';
  const downloadMatchesItem = authorizedDownload?.envelopeId === item.envelopeId;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar detalhes do documento"
        className="absolute inset-0 cursor-default bg-[#001a33]/70 backdrop-blur-sm"
        onClick={() => { if (!busyArtifactClass) onClose(); }}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-detail-title"
        aria-busy={Boolean(busyArtifactClass)}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <FileCheck2 size={21} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Documento assinado</p>
                <h2 id="archive-detail-title" className="mt-1 text-xl font-black tracking-tight text-[#001a33]">
                  {item.title}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{item.revisionLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={Boolean(busyArtifactClass)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wide ring-1 ${statusClassName}`}>
              {item.status === 'ASSINADO' ? 'Assinado' : 'Substituído'}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700 ring-1 ring-blue-100">
              Diário de classe
            </span>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Turma</dt>
              <dd className="mt-1 text-sm font-black text-[#001a33]">{item.turmaNome}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Disciplina</dt>
              <dd className="mt-1 text-sm font-black text-[#001a33]">{item.disciplinaNome}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Finalização oficial</dt>
              <dd className="mt-1 text-sm font-black text-[#001a33]">{formatDateTime(item.finalizedAt)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Código de validação</dt>
              <dd className="mt-1 break-all text-sm font-black text-[#001a33]">
                {item.validationCode || 'Não informado'}
              </dd>
              {item.validationCode ? (
                <a
                  href={`/validador?code=${encodeURIComponent(item.validationCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-blue-700 underline underline-offset-4"
                >
                  <ExternalLink size={13} /> Conferir no validador público
                </a>
              ) : null}
            </div>
          </dl>

          <section aria-labelledby="archive-signers-title">
            <div className="mb-3 flex items-center gap-2">
              <UserRoundCheck size={17} className="text-blue-700" aria-hidden="true" />
              <h3 id="archive-signers-title" className="text-sm font-black text-[#001a33]">Registro dos signatários</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {item.signers.map((signer, signerIndex) => (
                <div key={`${item.envelopeId}:signer:${signerIndex}`} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[9px] font-black uppercase tracking-wide text-blue-600">{roleLabel(signer.role)}</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{signer.name}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">Assinado em {formatDateTime(signer.signedAt)}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Integridade do documento final</p>
            <p className="mt-2 break-all font-mono text-[9px] font-bold leading-relaxed text-slate-600">SHA-256 {item.sha256}</p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
              <p className="text-[11px] font-semibold leading-relaxed text-slate-600">
                Cada ação solicita uma URL HTTPS temporária de 2 minutos. O endereço interno do Storage não é enviado para esta tela.
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onOpenArtifact(item, 'DOCUMENTO_FINAL')}
                disabled={!item.artifacts.final || Boolean(busyArtifactClass)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busyArtifactClass === 'DOCUMENTO_FINAL' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {busyArtifactClass === 'DOCUMENTO_FINAL' ? 'Autorizando…' : 'Visualizar documento final'}
              </button>
              <button
                type="button"
                onClick={() => onOpenArtifact(item, 'COMPROVANTE_EVIDENCIA')}
                disabled={!item.artifacts.receipt || Boolean(busyArtifactClass)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyArtifactClass === 'COMPROVANTE_EVIDENCIA' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {busyArtifactClass === 'COMPROVANTE_EVIDENCIA' ? 'Autorizando…' : 'Abrir comprovante'}
              </button>
            </div>
            {downloadMatchesItem ? (
              <a
                href={authorizedDownload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-blue-700 underline underline-offset-4"
              >
                <ExternalLink size={13} /> Reabrir {artifactLabel(authorizedDownload.artifactClass)} enquanto o link estiver válido
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

