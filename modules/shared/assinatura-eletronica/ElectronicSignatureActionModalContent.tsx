import React from "react";
import {
  CheckCircle2,
  Eye,
  FileSignature,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { formatDateTime } from "./ElectronicSignatureActionModal.helpers";
import ElectronicSignatureConsentForm from "./ElectronicSignatureConsentForm";
import type { ElectronicSignatureActionModalController } from "./useElectronicSignatureActionModal";

interface ElectronicSignatureActionModalContentProps {
  controller: ElectronicSignatureActionModalController;
}

const ElectronicSignatureActionModalContent: React.FC<
  ElectronicSignatureActionModalContentProps
> = ({ controller }) => {
  const {
    canRecoverFinalization,
    canSign,
    canonicalParticipant,
    closeSafely,
    detail,
    detailQuery,
    dialogRef,
    finalizationFailure,
    isFinalizing,
    isSignatureAction,
    isSubmitting,
    item,
    onClose,
    retryFinalization,
    successMessage,
  } = controller;

  return (
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar confirmação de assinatura"
        className="absolute inset-0 cursor-default bg-[#001a33]/70 backdrop-blur-sm"
        onClick={closeSafely}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="electronic-signature-action-title"
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <FileSignature size={21} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
                  {isSignatureAction
                    ? "Confirmação protegida"
                    : "Detalhes do documento"}
                </p>
                <h2
                  id="electronic-signature-action-title"
                  className="mt-1 truncate text-xl font-black tracking-tight text-[#001a33]"
                >
                  {item.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={closeSafely}
              disabled={isSubmitting || isFinalizing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          {detailQuery.isPending
            ? (
              <div
                className="flex min-h-44 items-center justify-center gap-3 text-sm font-bold text-slate-500"
                role="status"
              >
                <Loader2 size={20} className="animate-spin text-blue-600" />
                Conferindo envelope e ordem…
              </div>
            )
            : detailQuery.isError
            ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5">
                <p className="text-sm font-black text-rose-800">
                  Não foi possível conferir este envelope.
                </p>
                <button
                  type="button"
                  onClick={() => void detailQuery.refetch()}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-100"
                >
                  <RefreshCw size={14} /> Tentar novamente
                </button>
              </div>
            )
            : detail
            ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Papel neste documento
                    </p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">
                      {canonicalParticipant?.roleLabel || "Consulta"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Revisão
                    </p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">
                      {detail.envelope.revisionLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Prazo
                    </p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">
                      {formatDateTime(detail.envelope.deadlineAt)}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      size={20}
                      className="mt-0.5 shrink-0 text-blue-700"
                    />
                    <div>
                      <p className="text-sm font-black text-[#001a33]">
                        Você confirmará o PDF original congelado
                      </p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                        A senha apenas confirma sua identidade neste ato. Ela
                        não é armazenada pelo sistema e não substitui sua sessão
                        atual.
                      </p>
                      {detail.envelope.original.sha256
                        ? (
                          <p className="mt-3 break-all font-mono text-[9px] font-bold text-slate-500">
                            SHA-256 {detail.envelope.original.sha256}
                          </p>
                        )
                        : null}
                    </div>
                  </div>
                </div>

                {successMessage
                  ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                      <CheckCircle2
                        className="mx-auto text-emerald-600"
                        size={27}
                      />
                      <p className="mt-3 text-sm font-black text-emerald-900">
                        {successMessage}
                      </p>
                      <button
                        type="button"
                        onClick={onClose}
                        className="mt-5 h-11 rounded-xl bg-emerald-700 px-6 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-800"
                      >
                        Concluir
                      </button>
                    </div>
                  )
                  : finalizationFailure || canRecoverFinalization
                  ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                      <p className="text-sm font-black text-amber-900">
                        A assinatura já foi registrada.
                      </p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                        {finalizationFailure ||
                          "O documento final oficial ainda precisa ser concluído pelo serviço."}
                      </p>
                      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={closeSafely}
                          disabled={isFinalizing}
                          className="h-11 rounded-xl border border-amber-200 bg-white px-5 text-xs font-black uppercase tracking-wide text-amber-800 disabled:opacity-50"
                        >
                          Fechar
                        </button>
                        <button
                          type="button"
                          onClick={() => void retryFinalization()}
                          disabled={isFinalizing}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isFinalizing
                            ? <Loader2 size={16} className="animate-spin" />
                            : <RefreshCw size={16} />}
                          {isFinalizing
                            ? "Finalizando…"
                            : "Tentar finalizar documento"}
                        </button>
                      </div>
                    </div>
                  )
                  : !canSign
                  ? (
                    <div
                      className={`rounded-2xl border p-5 ${
                        item.primaryAction === "VIEW"
                          ? "border-slate-200 bg-slate-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <p
                        className={`text-sm font-black ${
                          item.primaryAction === "VIEW"
                            ? "text-[#001a33]"
                            : "text-amber-900"
                        }`}
                      >
                        {item.primaryAction === "VIEW"
                          ? "Documento disponível para consulta."
                          : "A assinatura não está disponível neste momento."}
                      </p>
                      <p
                        className={`mt-1 text-xs font-medium leading-relaxed ${
                          item.primaryAction === "VIEW"
                            ? "text-slate-600"
                            : "text-amber-800"
                        }`}
                      >
                        {item.message || canonicalParticipant?.statusLabel ||
                          detail.envelope.statusLabel}
                      </p>
                    </div>
                  )
                  : <ElectronicSignatureConsentForm controller={controller} />}

                <div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] font-bold text-slate-500">
                  <Eye size={14} />{" "}
                  O horário oficial e a ordem dos participantes são registrados
                  pelo serviço.
                </div>
              </>
            )
            : null}
        </div>
      </section>
    </div>
  );
};

export default ElectronicSignatureActionModalContent;
