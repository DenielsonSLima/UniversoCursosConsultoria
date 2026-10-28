import React from 'react';

interface Props {
  error: string;
  loading: boolean;
  retry: () => unknown;
}

export const AlunoCertificateModelStatus: React.FC<Props> = ({ error, loading, retry }) => (
  <div role={error && !loading ? 'alert' : 'status'} className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
    <p>{loading ? 'Carregando o modelo do certificado...' : error}</p>
    {error && !loading && <button type="button" onClick={retry}
      className="mt-4 rounded-xl bg-[#001a33] px-5 py-3 font-bold text-white">
      Tentar novamente
    </button>}
  </div>
);
