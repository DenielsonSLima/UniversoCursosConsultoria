import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const STUDENT_MANIFEST_URL = '/aluno/manifest.webmanifest';
const STUDENT_THEME_COLOR = '#001a33';

type ManagedMeta = {
  name: string;
  content: string;
};

const STUDENT_META: ManagedMeta[] = [
  { name: 'theme-color', content: STUDENT_THEME_COLOR },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-title', content: 'Universo CC' },
  { name: 'mobile-web-app-capable', content: 'yes' },
  { name: 'application-name', content: 'Universo CC' },
];

const STUDENT_PUBLIC_AUTH_PATHS = new Set([
  '/login',
  '/cadastro',
  '/primeiro-acesso',
  '/confirmacao-email',
  '/recuperar-senha',
]);

const isAlunoAppPath = (pathname: string) => (
  pathname === '/aluno'
  || pathname.startsWith('/aluno/')
  || STUDENT_PUBLIC_AUTH_PATHS.has(pathname)
);

const AlunoPwaRuntime = () => {
  const { pathname } = useLocation();
  const isAlunoPath = isAlunoAppPath(pathname);

  useLayoutEffect(() => {
    const staticSplash = document.getElementById('aluno-app-bootstrap-splash');
    if (staticSplash) staticSplash.remove();
    document.documentElement.removeAttribute('data-aluno-bootstrap');
  }, []);

  useEffect(() => {
    if (!isAlunoPath) return undefined;

    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifestHref = manifest?.getAttribute('href') || null;
    const manifestElement = manifest || document.createElement('link');
    manifestElement.rel = 'manifest';
    manifestElement.href = STUDENT_MANIFEST_URL;
    if (!manifest) document.head.appendChild(manifestElement);

    const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const previousAppleTouchIconHref = appleTouchIcon?.getAttribute('href') || null;
    const appleTouchIconElement = appleTouchIcon || document.createElement('link');
    appleTouchIconElement.rel = 'apple-touch-icon';
    appleTouchIconElement.href = '/aluno/icons/apple-touch-icon-v2.png';
    appleTouchIconElement.setAttribute('sizes', '180x180');
    if (!appleTouchIcon) document.head.appendChild(appleTouchIconElement);

    const previousMeta = STUDENT_META.map(({ name, content }) => {
      const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const previousContent = existing?.getAttribute('content') || null;
      const element = existing || document.createElement('meta');
      element.name = name;
      element.content = content;
      if (!existing) document.head.appendChild(element);
      return { element, wasCreated: !existing, previousContent };
    });

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/aluno/sw.js', { scope: '/aluno/' })
        .catch((error) => {
          console.warn('Não foi possível registrar os recursos instaláveis do Portal do Aluno.', error);
        });
    }

    return () => {
      if (previousManifestHref) manifestElement.href = previousManifestHref;
      else if (!manifest) manifestElement.remove();

      if (previousAppleTouchIconHref) appleTouchIconElement.href = previousAppleTouchIconHref;
      else if (!appleTouchIcon) appleTouchIconElement.remove();

      previousMeta.forEach(({ element, wasCreated, previousContent }) => {
        if (wasCreated) element.remove();
        else if (previousContent !== null) element.content = previousContent;
      });

      // O registro permanece instalado para futuras aberturas, mas seu escopo
      // restrito a /aluno/ impede qualquer controle sobre gestor, professor ou site.
    };
  }, [isAlunoPath]);

  return null;
};

export default AlunoPwaRuntime;
