import React from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";

import type { ElectronicSignatureActionModalController } from "./useElectronicSignatureActionModal";

interface ElectronicSignatureConsentFormProps {
  controller: ElectronicSignatureActionModalController;
}

const ElectronicSignatureConsentForm: React.FC<
  ElectronicSignatureConsentFormProps
> = ({ controller }) => {
  const {
    canRequestOriginal,
    closeSafely,
    confirm,
    consentAccepted,
    consentTerm,
    consentTermQuery,
    failure,
    hasValidTicket,
    isOpeningOriginal,
    isSubmitting,
    openOriginalDocument,
    originalDownload,
    originalFailure,
    originalNotice,
    password,
    setConsentAccepted,
    setFailure,
    setPassword,
  } = controller;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
      className="space-y-5 rounded-2xl border border-slate-200 p-5"
      aria-busy={isSubmitting || consentTermQuery.isPending ||
        isOpeningOriginal}
    >
      <section aria-label="Termo de aceite da assinatura">
        {consentTermQuery.isPending
          ? (
            <div
              className="flex min-h-24 items-center justify-center gap-3 rounded-xl bg-slate-50 text-xs font-bold text-slate-500"
              role="status"
            >
              <Loader2 size={17} className="animate-spin text-blue-600" />
              Carregando termo canônico…
            </div>
          )
          : consentTermQuery.isError
          ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
              <p
                role="alert"
                className="text-xs font-bold leading-relaxed text-rose-700"
              >
                O termo de aceite não pôde ser carregado. A assinatura permanece
                bloqueada.
              </p>
              <button
                type="button"
                onClick={() => void consentTermQuery.refetch()}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-100"
              >
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          )
          : consentTerm
          ? (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    id="electronic-signature-consent-title"
                    className="text-base font-black text-[#001a33]"
                  >
                    {consentTerm.title}
                  </h3>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700">
                    {consentTerm.versionLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                  Leia todos os blocos e confira o PDF original antes de
                  aceitar.
                </p>
              </div>
              <div
                className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
                tabIndex={0}
                aria-label="Conteúdo integral do termo de aceite"
              >
                {consentTerm.sections.map((section) => (
                  <article
                    key={section.id}
                    aria-labelledby={`consent-section-${section.id}`}
                  >
                    <h4
                      id={`consent-section-${section.id}`}
                      className="text-xs font-black text-[#001a33]"
                    >
                      {section.title}
                    </h4>
                    <p className="mt-1 whitespace-pre-line text-xs font-medium leading-relaxed text-slate-600">
                      {section.body}
                    </p>
                  </article>
                ))}
              </div>
              <p className="break-all font-mono text-[9px] font-bold text-slate-400">
                Termo SHA-256 {consentTerm.sha256}
              </p>
            </div>
          )
          : null}
      </section>

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileText
              size={18}
              className="mt-0.5 shrink-0 text-blue-700"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-black text-[#001a33]">
                Documento que será assinado
              </p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">
                Acesso temporário autorizado pelo serviço, sem expor o endereço
                interno do arquivo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void openOriginalDocument()}
            disabled={!consentTerm || !canRequestOriginal ||
              isOpeningOriginal ||
              isSubmitting}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isOpeningOriginal
              ? <Loader2 size={15} className="animate-spin" />
              : <ExternalLink size={15} />}
            {isOpeningOriginal ? "Autorizando…" : "Visualizar PDF original"}
          </button>
        </div>
        {!canRequestOriginal
          ? (
            <p
              role="alert"
              className="mt-3 text-[11px] font-bold leading-relaxed text-amber-800"
            >
              O original não está pronto ou este perfil não possui leitura
              autorizada. O aceite permanece indisponível.
            </p>
          )
          : null}
        {originalFailure
          ? (
            <p
              role="alert"
              className="mt-3 text-[11px] font-bold leading-relaxed text-rose-700"
            >
              {originalFailure}
            </p>
          )
          : null}
        {originalNotice
          ? (
            <p
              role="status"
              className="mt-3 text-[11px] font-bold leading-relaxed text-blue-800"
            >
              {originalNotice}
            </p>
          )
          : null}
        {originalDownload
          ? (
            <a
              href={originalDownload.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-blue-700 underline underline-offset-4"
            >
              <ExternalLink size={13} />{" "}
              Abrir novamente enquanto o link estiver válido
            </a>
          )
          : null}
      </div>

      <label
        htmlFor="electronic-signature-consent"
        className={`flex items-start gap-3 rounded-xl border p-4 transition ${
          consentAccepted
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-white"
        } ${
          !consentTerm || !canRequestOriginal
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer"
        }`}
      >
        <input
          id="electronic-signature-consent"
          type="checkbox"
          checked={consentAccepted}
          onChange={(event) => {
            setConsentAccepted(event.target.checked);
            setFailure(null);
          }}
          disabled={!consentTerm || !canRequestOriginal || isSubmitting}
          aria-describedby="electronic-signature-consent-message"
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-4 focus:ring-blue-100"
        />
        <span
          id="electronic-signature-consent-message"
          className="text-xs font-bold leading-relaxed text-[#001a33]"
        >
          {consentTerm?.confirmationMessage ||
            "Aguarde o carregamento do termo canônico para registrar seu aceite."}
        </span>
      </label>

      <div>
        <label
          htmlFor="electronic-signature-password"
          className="text-xs font-black uppercase tracking-wide text-[#001a33]"
        >
          Repita sua senha de acesso
        </label>
        <p
          id="electronic-signature-password-help"
          className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500"
        >
          A nova autenticação registra o instante oficial no servidor. Sua senha
          não integra o comprovante.
        </p>
        <div className="relative mt-2">
          <LockKeyhole
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="electronic-signature-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            aria-describedby="electronic-signature-password-help"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-[#001a33] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>
      {failure
        ? (
          <p
            role="alert"
            className="text-xs font-bold leading-relaxed text-rose-700"
          >
            {failure}
          </p>
        )
        : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={closeSafely}
          disabled={isSubmitting}
          className="h-11 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !consentTerm || !consentAccepted ||
            !canRequestOriginal || (!password && !hasValidTicket)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-blue-950/15 hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {isSubmitting
            ? <Loader2 size={16} className="animate-spin" />
            : <LockKeyhole size={16} />}
          {isSubmitting
            ? "Confirmando…"
            : hasValidTicket
            ? "Tentar confirmar novamente"
            : "Confirmar e assinar"}
        </button>
      </div>
    </form>
  );
};

export default ElectronicSignatureConsentForm;
