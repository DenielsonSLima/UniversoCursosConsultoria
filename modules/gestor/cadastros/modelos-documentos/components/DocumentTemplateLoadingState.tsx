import React from 'react';
import { ImageOff, Loader2, RefreshCw } from 'lucide-react';
import type { DocumentBackgroundStatus } from '../hooks/useDocumentBackgroundReadiness';

interface DocumentTemplatePageStateProps {
  isError?: boolean;
  onRetry?: () => void;
  title: string;
}

export const DocumentTemplatePageState: React.FC<DocumentTemplatePageStateProps> = ({
  isError = false,
  onRetry,
  title,
}) => (
  <div className="mx-auto flex min-h-[520px] max-w-7xl items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
    {isError ? (
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <ImageOff size={26} />
        </div>
        <h3 className="text-base font-black uppercase tracking-tight text-[#001a33]">
          Não foi possível carregar {title}
        </h3>
        <p className="mt-2 text-sm font-medium text-slate-500">
          O modelo padrão não será exibido para evitar substituir visualmente sua personalização.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-900"
        >
          <RefreshCw size={15} /> Tentar novamente
        </button>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={34} />
        <p className="text-xs font-black uppercase tracking-[0.18em]">
          Carregando {title}
        </p>
        <p className="text-xs font-medium text-slate-400">
          Preparando o modelo personalizado…
        </p>
      </div>
    )}
  </div>
);

interface DocumentPreviewAssetGateProps {
  children: React.ReactNode;
  onRetry: () => void;
  status: DocumentBackgroundStatus;
  title: string;
}

export const DocumentPreviewAssetGate: React.FC<DocumentPreviewAssetGateProps> = ({
  children,
  onRetry,
  status,
  title,
}) => {
  if (status === 'ready') return <>{children}</>;

  return (
    <div className="flex min-h-[520px] flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-slate-200 p-8">
      {status === 'error' ? (
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm">
            <ImageOff size={23} />
          </div>
          <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">
            Fundo personalizado indisponível
          </h4>
          <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
            A prévia de {title} foi pausada para não mostrar o modelo padrão no lugar da sua arte.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-900"
          >
            <RefreshCw size={14} /> Recarregar imagens
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-blue-600" size={30} />
          <p className="text-xs font-black uppercase tracking-[0.16em]">
            Carregando arte personalizada
          </p>
          <div className="mt-2 flex gap-3">
            <div className="h-24 w-36 animate-pulse rounded-xl bg-white/80 shadow-sm" />
            <div className="h-24 w-36 animate-pulse rounded-xl bg-white/60 shadow-sm" />
          </div>
        </div>
      )}
    </div>
  );
};
