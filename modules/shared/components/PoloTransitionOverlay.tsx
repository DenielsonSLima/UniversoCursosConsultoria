import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';

export type PoloTransitionStatus = 'loading' | 'success' | 'error';

type PoloTransitionBaseProps = {
  isOpen: boolean;
  fromPoloName: string;
  fromPoloCity?: string | null;
  fromPoloState?: string | null;
  fromPoloIsMatriz?: boolean;
  toPoloName: string;
  toPoloCity?: string | null;
  toPoloState?: string | null;
  toPoloIsMatriz?: boolean;
  message?: string;
};

type PoloTransitionPendingProps = PoloTransitionBaseProps & {
  status: 'loading' | 'success';
  errorMessage?: never;
  onRetry?: never;
  onCancel?: never;
};

type PoloTransitionErrorProps = PoloTransitionBaseProps & {
  status: 'error';
  errorMessage?: string;
  onRetry: () => void;
  onCancel: () => void;
};

export type PoloTransitionOverlayProps =
  | PoloTransitionPendingProps
  | PoloTransitionErrorProps;

const DEFAULT_MESSAGES: Record<PoloTransitionStatus, string> = {
  loading: 'Atualizando dados, permissões e preferências do ambiente.',
  success: 'O novo ambiente está pronto para uso.',
  error: 'Não foi possível preparar o novo ambiente.',
};

const formatPoloLocation = (city?: string | null, state?: string | null) =>
  [city, state].filter(Boolean).join(' / ');

const getPoloKind = (isMatriz?: boolean) => (isMatriz ? 'Matriz' : 'Polo');

const PoloTransitionOverlay: React.FC<PoloTransitionOverlayProps> = (props) => {
  const {
    isOpen,
    fromPoloName,
    fromPoloCity,
    fromPoloState,
    fromPoloIsMatriz,
    toPoloName,
    toPoloCity,
    toPoloState,
    toPoloIsMatriz,
    status,
    message,
  } = props;
  const overlayRef = useRef<HTMLDivElement>(null);
  const retryButtonRef = useRef<React.ElementRef<'button'>>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const statusMessage =
    message || (isError && props.errorMessage) || DEFAULT_MESSAGES[status];
  const fromPoloKind = getPoloKind(fromPoloIsMatriz);
  const toPoloKind = getPoloKind(toPoloIsMatriz);
  const fromPoloLocation = formatPoloLocation(fromPoloCity, fromPoloState);
  const toPoloLocation = formatPoloLocation(toPoloCity, toPoloState);
  const fromPoloPrimary = fromPoloLocation || fromPoloName;
  const toPoloPrimary = toPoloLocation || toPoloName;
  const toPoloHeadline = toPoloCity
    ? `${toPoloKind} de ${toPoloCity}`
    : toPoloName;

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlayRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (status === 'error') {
      retryButtonRef.current?.focus();
      return;
    }

    overlayRef.current?.focus();
  }, [isOpen, status]);

  if (!isOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (isError) props.onCancel();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ) as HTMLElement[];

    if (focusableElements.length === 0) {
      event.preventDefault();
      overlayRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    } else if (!focusableElements.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="polo-transition-title"
      aria-describedby="polo-transition-description"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[200] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f4f7fb] px-4 py-8 text-slate-900 outline-none motion-safe:animate-fadeIn"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,#f8fbff_0%,#edf4ff_44%,#f7fafc_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(#1d4ed8_1px,transparent_1px),linear-gradient(90deg,#1d4ed8_1px,transparent_1px)] [background-size:56px_56px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-0 h-full w-1/3 rotate-6 bg-[#001a33] opacity-[0.04]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-0 h-full w-1/3 rotate-6 bg-[#4169E1] opacity-[0.06]"
      />

      <section className="relative w-full max-w-[500px] overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div
          aria-hidden="true"
          className={`h-1.5 transition-colors duration-300 motion-reduce:transition-none ${
            isError
              ? 'bg-red-400'
              : isSuccess
                ? 'bg-emerald-400'
                : 'bg-[linear-gradient(90deg,#4169E1,#60a5fa,#22c55e)]'
          }`}
        />

        <div className="p-7 sm:p-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <img
                src="/LogoUniverso.png"
                alt="Universo Cursos e Consultoria"
                className="h-10 w-40 object-contain"
              />
            </div>
            <div
              aria-hidden="true"
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${
                isError
                  ? 'bg-red-50 text-red-600 ring-red-100'
                  : isSuccess
                    ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                    : 'bg-blue-50 text-blue-700 ring-blue-100'
              }`}
            >
              {isError ? (
                <AlertTriangle size={22} />
              ) : isSuccess ? (
                <CheckCircle2 size={22} />
              ) : (
                <ShieldCheck size={22} />
              )}
            </div>
          </div>

          <div className="mb-7">
            <p
              className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${
                isError
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : isSuccess
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-blue-100 bg-blue-50 text-blue-700'
              }`}
            >
              <LockKeyhole size={12} aria-hidden="true" />
              Troca de polo
            </p>
            <h2
              id="polo-transition-title"
              className="text-2xl font-black tracking-tight text-[#001a33] sm:text-3xl"
            >
              {isLoading
                ? 'Preparando seu novo ambiente'
                : isSuccess
                  ? `${toPoloHeadline} ${toPoloIsMatriz ? 'está ativa' : 'está ativo'}`
                  : 'A troca não foi concluída'}
            </h2>
            <p
              id="polo-transition-description"
              role={isError ? 'alert' : 'status'}
              aria-live={isError ? 'assertive' : 'polite'}
              aria-atomic="true"
              className={`mt-3 text-sm leading-6 ${
                isError ? 'text-red-700' : 'text-slate-600'
              }`}
            >
              {statusMessage}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-4 ${
              isError ? 'border-red-100 bg-red-50/70' : 'border-slate-100 bg-slate-50/80'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ${
                  isError
                    ? 'text-red-600 ring-red-100'
                    : isSuccess
                      ? 'text-emerald-600 ring-emerald-100'
                      : 'text-blue-700 ring-slate-100'
                }`}
              >
                {isLoading ? (
                  <Loader2 size={23} className="motion-safe:animate-spin" />
                ) : isSuccess ? (
                  <CheckCircle2 size={23} />
                ) : (
                  <AlertTriangle size={23} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span
                    className={`text-xs font-black uppercase tracking-[0.18em] ${
                      isError ? 'text-red-600' : 'text-slate-500'
                    }`}
                  >
                    {isLoading
                      ? 'Preparando ambiente'
                      : isSuccess
                        ? 'Ambiente pronto'
                        : 'Troca interrompida'}
                  </span>
                  {isError ? (
                    <AlertTriangle size={16} aria-hidden="true" className="text-red-500" />
                  ) : (
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className={isSuccess ? 'text-emerald-500' : 'text-slate-300'}
                    />
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none ${
                      isError
                        ? 'w-full bg-red-400'
                        : isSuccess
                          ? 'w-full bg-emerald-500'
                          : 'w-2/3 bg-[linear-gradient(90deg,#4169E1,#22c55e)] motion-safe:animate-pulse'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200/80 pt-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <div className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Ambiente anterior
                  </span>
                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">
                      {fromPoloKind}
                    </span>
                    <span
                      title={[fromPoloKind, fromPoloLocation, fromPoloName].filter(Boolean).join(' — ')}
                      className="truncate text-xs font-black text-slate-700"
                    >
                      {fromPoloPrimary}
                    </span>
                  </div>
                  {fromPoloLocation ? (
                    <span className="mt-1 block truncate text-[9px] font-semibold text-slate-400">
                      {fromPoloName}
                    </span>
                  ) : null}
                </div>

                <div
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white ${
                    isError
                      ? 'border-red-100 text-red-500'
                      : isSuccess
                        ? 'border-emerald-100 text-emerald-600'
                        : 'border-blue-100 text-blue-600'
                  }`}
                >
                  <ArrowRight size={16} />
                </div>

                <div className="min-w-0 text-right">
                  <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-blue-600">
                    Novo ambiente
                  </span>
                  <div className="mt-1.5 flex min-w-0 items-center justify-end gap-1.5">
                    <Building2
                      size={13}
                      aria-hidden="true"
                      className="shrink-0 text-blue-600"
                    />
                    <span
                      title={[toPoloKind, toPoloLocation, toPoloName].filter(Boolean).join(' — ')}
                      className="truncate text-xs font-black text-[#001a33]"
                    >
                      {toPoloPrimary}
                    </span>
                    <span className="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-blue-700">
                      {toPoloKind}
                    </span>
                  </div>
                  {toPoloLocation ? (
                    <span className="mt-1 block truncate text-[9px] font-semibold text-slate-400">
                      {toPoloName}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {isError ? (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                ref={retryButtonRef}
                type="button"
                onClick={props.onRetry}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-[#082b4b] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none"
              >
                <RefreshCw size={16} aria-hidden="true" />
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={props.onCancel}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none"
              >
                <X size={16} aria-hidden="true" />
                Permanecer aqui
              </button>
            </div>
          ) : (
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <ShieldCheck
                size={14}
                aria-hidden="true"
                className={isSuccess ? 'text-emerald-500' : 'text-blue-600'}
              />
              Seus dados permanecem protegidos durante a atualização
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default PoloTransitionOverlay;
