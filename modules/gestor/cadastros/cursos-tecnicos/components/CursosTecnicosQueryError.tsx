import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface CursosTecnicosQueryErrorProps {
  error: unknown;
  isRetrying: boolean;
  onRetry: () => void;
}

const CursosTecnicosQueryError: React.FC<CursosTecnicosQueryErrorProps> = ({
  error,
  isRetrying,
  onRetry,
}) => (
  <div
    role="alert"
    className="rounded-[2rem] border border-amber-200 bg-amber-50/70 px-6 py-10 text-center"
  >
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-600 shadow-sm">
      <AlertTriangle size={22} />
    </span>
    <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-[#001a33]">
      Cursos técnicos não carregados
    </h3>
    <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-600">
      {error instanceof Error && error.message
        ? error.message
        : "Não foi possível consultar os cursos e seus totais de disciplinas."}
    </p>
    <button
      type="button"
      onClick={onRetry}
      disabled={isRetrying}
      className="mx-auto mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-blue-900 disabled:cursor-wait disabled:opacity-60"
    >
      <RefreshCw size={15} className={isRetrying ? "animate-spin" : ""} />
      {isRetrying ? "Tentando novamente" : "Tentar novamente"}
    </button>
  </div>
);

export default CursosTecnicosQueryError;
