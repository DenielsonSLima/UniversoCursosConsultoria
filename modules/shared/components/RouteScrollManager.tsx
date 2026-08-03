import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Mantém a navegação entre páginas previsível em uma SPA.
 * Links com hash continuam sob responsabilidade da página de destino,
 * que pode aguardar o conteúdo assíncrono antes de revelar a âncora.
 */
const RouteScrollManager: React.FC = () => {
  const { pathname, hash } = useLocation();

  React.useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
};

export default RouteScrollManager;
