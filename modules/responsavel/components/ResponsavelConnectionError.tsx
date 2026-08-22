import React from 'react';
import { RefreshCw } from 'lucide-react';

const ResponsavelConnectionError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <section className="w-full max-w-xl rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl">
      <RefreshCw className="mx-auto text-rose-600" size={28} />
      <h1 className="mt-4 text-xl font-black text-[#001a33]">Não foi possível conferir o acesso</h1>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Nenhum dado do responsável foi liberado. Verifique a conexão e tente novamente; sua sessão não foi encerrada.</p>
      <button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-900"><RefreshCw size={16} /> Tentar novamente</button>
    </section>
  </main>
);

export default ResponsavelConnectionError;
