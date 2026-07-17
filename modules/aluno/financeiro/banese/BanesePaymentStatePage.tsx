import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import FileQuestion from 'lucide-react/dist/esm/icons/file-question';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import BanesePaymentHeader from './components/BanesePaymentHeader';
import useBanesePaymentOverlay from './hooks/useBanesePaymentOverlay';

interface BanesePaymentStatePageProps {
  state: 'loading' | 'error' | 'not-found';
  onBack: () => void;
  onRetry?: () => Promise<void> | void;
}

const content = {
  loading: {
    title: 'Preparando sua cobrança',
    description: 'Estamos carregando os dados bancários protegidos desta cobrança Banese.',
    icon: LoaderCircle,
  },
  error: {
    title: 'Não foi possível carregar',
    description: 'Houve uma falha ao consultar esta cobrança. Tente novamente em alguns instantes.',
    icon: AlertTriangle,
  },
  'not-found': {
    title: 'Cobrança não encontrada',
    description: 'O título pode ter sido removido, ainda não estar registrado ou não pertencer a este acesso.',
    icon: FileQuestion,
  },
};

const BanesePaymentStatePage = ({ state, onBack, onRetry }: BanesePaymentStatePageProps) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useBanesePaymentOverlay(pageRef, onBack);
  const item = content[state];
  const Icon = item.icon;

  const retry = async () => {
    if (!onRetry || isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={pageRef} tabIndex={-1} className="fixed inset-0 z-[99999] overflow-y-auto bg-[#f2f5f7] text-slate-900 outline-none">
      <BanesePaymentHeader environment={null} onBack={onBack} />
      <main className="mx-auto grid min-h-[calc(100dvh-7rem)] w-full max-w-3xl place-items-center px-5 py-12">
        <section className="w-full rounded-[2rem] border border-slate-200 bg-white p-7 text-center shadow-[0_28px_80px_rgba(15,23,42,0.12)] sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#001a33] text-white">
            <Icon size={28} className={state === 'loading' || isRetrying ? 'animate-spin' : ''} />
          </div>
          <h1 className="mt-6 font-serif text-3xl font-bold tracking-tight text-[#001a33]">{item.title}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-relaxed text-slate-500">{item.description}</p>
          {state !== 'loading' && onRetry ? (
            <button
              type="button"
              onClick={() => void retry()}
              disabled={isRetrying}
              className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#07345f] disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRetrying ? 'animate-spin' : ''} />
              {isRetrying ? 'Tentando novamente...' : 'Tentar novamente'}
            </button>
          ) : null}
        </section>
      </main>
    </div>,
    document.body,
  );
};

export default BanesePaymentStatePage;
