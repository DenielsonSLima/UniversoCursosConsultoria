import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

const isAlunoRoute = (pathname: string) => (
  pathname === '/aluno'
  || pathname.startsWith('/aluno/')
  || ['/login', '/cadastro', '/primeiro-acesso', '/confirmacao-email', '/recuperar-senha'].includes(pathname)
);

const AlunoConnectivityStatus: React.FC = () => {
  const { pathname } = useLocation();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const retry = useCallback(() => {
    const connectionAvailable = navigator.onLine;
    setIsOnline(connectionAvailable);
    if (connectionAvailable) window.location.reload();
  }, []);

  if (isOnline || !isAlunoRoute(pathname)) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100000] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-slate-900 shadow-2xl"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg" aria-hidden="true">
        !
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">Você está sem internet</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">
          Verifique o Wi-Fi ou os dados móveis. O acesso volta automaticamente quando a conexão retornar.
        </p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="min-h-10 shrink-0 rounded-xl bg-[#003b73] px-3 text-xs font-black text-white transition hover:bg-[#002c57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Tentar novamente
      </button>
    </aside>
  );
};

export default AlunoConnectivityStatus;
