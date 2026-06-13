
// File: lib/ExternalRedirect.tsx
// Componente que redireciona o navegador para uma URL externa (fora da SPA)

import { useEffect } from 'react';

interface ExternalRedirectProps {
  url: string;
}

/**
 * Redireciona imediatamente o usuário para uma URL externa.
 * Usado para enviar para o Proesc, EAD etc. em modo de produção.
 */
const ExternalRedirect: React.FC<ExternalRedirectProps> = ({ url }) => {
  useEffect(() => {
    window.location.href = url;
  }, [url]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#001a33]">
      <div className="text-center text-white">
        <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-lg font-semibold">Redirecionando...</p>
        <p className="text-slate-400 text-sm mt-1">Aguarde um momento</p>
      </div>
    </div>
  );
};

export default ExternalRedirect;
