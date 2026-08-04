import React from 'react';

type AlunoAppSplashProps = {
  message?: string;
  onRetry?: () => void;
};

const AlunoAppSplash: React.FC<AlunoAppSplashProps> = ({
  message = 'Preparando seu portal',
  onRetry,
}) => (
  <main
    className="relative flex h-dvh min-h-[28rem] w-full items-center justify-center overflow-hidden bg-[#001a33] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-white"
    role="status"
    aria-live="polite"
    aria-label={message}
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(37,99,235,0.30),transparent_38%)]" />
    <div className="absolute -left-24 top-1/4 h-64 w-64 rounded-full border-[42px] border-white/[0.025]" />
    <div className="absolute -right-28 bottom-1/4 h-72 w-72 rounded-full border border-blue-300/10" />

    <div className="relative flex w-full max-w-sm flex-col items-center text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-[1.8rem] border border-white/70 bg-white p-2 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
        <img
          src="/aluno/icons/icon-192.png"
          alt=""
          width="96"
          height="96"
          className="h-24 w-24 rounded-[1.35rem] object-cover"
        />
      </div>

      <h1 className="mt-7 text-center text-2xl font-extrabold leading-tight tracking-tight">Universo Cursos e Consultoria</h1>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.3em] text-blue-200">
        Portal do Aluno
      </p>

      <div className="mt-9 flex flex-col items-center gap-4">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-blue-300 motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold text-blue-100/75">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-11 rounded-xl border border-white/20 bg-white/10 px-5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  </main>
);

export default AlunoAppSplash;
