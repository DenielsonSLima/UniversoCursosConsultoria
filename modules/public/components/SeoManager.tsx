import React, { useEffect } from 'react';
import { useLocation } from 'react-router';
import { PUBLIC_PAGES, PUBLIC_SITE_URL } from '../seo/public-pages';

const SITE_URL = PUBLIC_SITE_URL;

const TECHNICAL_NURSING_METADATA: RouteMetadata = {
  title: 'Técnico em Enfermagem | Universo Cursos e Consultoria',
  description: 'Transforme cuidado em profissão. Conheça a nova turma de Técnico em Enfermagem em Japoatã e fale com a nossa secretaria.',
  image: '/social-share/tecnico-enfermagem-2026.jpg',
};

type RouteMetadata = {
  title: string;
  description: string;
  image: string;
  robots?: string;
  canonicalPath?: string;
};

const ROUTE_METADATA: Record<string, RouteMetadata> = {
  ...Object.fromEntries(PUBLIC_PAGES.map(page => [page.path, {
    title: page.title, description: page.description,
    image: `/social-share/${page.imageSlug}.jpg`, canonicalPath: page.canonicalPath,
  }])),
  '/login': {
    title: 'Portal do Aluno | Universo Cursos e Consultoria',
    description: 'Entre no Portal do Aluno para acessar seus cursos, matrículas, pagamentos e documentos acadêmicos.',
    image: '/social-share/login.jpg',
    robots: 'noindex, nofollow',
  },
  '/cadastro': {
    title: 'Crie seu cadastro | Universo Cursos e Consultoria',
    description: 'Crie seu cadastro de aluno para fazer sua matrícula, acompanhar pagamentos e acessar seus cursos.',
    image: '/social-share/cadastro.jpg',
    robots: 'noindex, nofollow',
  },
  '/primeiro-acesso': {
    title: 'Primeiro acesso | Universo Cursos e Consultoria',
    description: 'Conclua seu cadastro e prepare seu acesso ao Portal do Aluno da Universo Cursos e Consultoria.',
    image: '/social-share/cadastro.jpg',
    robots: 'noindex, nofollow',
  },
  '/confirmacao-email': {
    title: 'Confirmação de e-mail | Universo Cursos e Consultoria',
    description: 'Confirme seu e-mail para continuar seu acesso aos serviços da Universo Cursos e Consultoria.',
    image: '/social-share/cadastro.jpg',
    robots: 'noindex, nofollow',
  },
  '/recuperar-senha': {
    title: 'Recuperar senha | Universo Cursos e Consultoria',
    description: 'Recupere com segurança o acesso à sua conta da Universo Cursos e Consultoria.',
    image: '/social-share/login.jpg',
    robots: 'noindex, nofollow',
  },
  '/sistema/login': {
    title: 'Acesso ao Sistema | Universo Cursos e Consultoria',
    description: 'Área segura de acesso ao sistema acadêmico da Universo Cursos e Consultoria.',
    image: '/social-share/gestor.jpg',
    robots: 'noindex, nofollow',
  },
  '/gestor': {
    title: 'Portal do Gestor | Universo Cursos e Consultoria',
    description: 'Área restrita para gestão acadêmica e administrativa da Universo Cursos e Consultoria.',
    image: '/social-share/gestor.jpg',
    robots: 'noindex, nofollow',
  },
  '/professor': {
    title: 'Portal do Professor | Universo Cursos e Consultoria',
    description: 'Área exclusiva para professores acompanharem turmas, atividades e comunicação acadêmica.',
    image: '/social-share/gestor.jpg',
    robots: 'noindex, nofollow',
  },
  '/aluno': {
    title: 'Área do Aluno | Universo Cursos e Consultoria',
    description: 'Área exclusiva para acompanhar cursos, materiais, avaliações e informações acadêmicas.',
    image: '/social-share/login.jpg',
    robots: 'noindex, nofollow',
  },
  '/bio': {
    title: 'Links oficiais | Universo Cursos e Consultoria',
    description: 'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
    image: '/social-share/links.jpg',
    canonicalPath: '/links',
    robots: 'noindex, follow',
  },
  '/linktree': {
    title: 'Links oficiais | Universo Cursos e Consultoria',
    description: 'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
    image: '/social-share/links.jpg',
    canonicalPath: '/links',
    robots: 'noindex, follow',
  },
  '/validador': {
    title: 'Validador de documentos | Universo Cursos e Consultoria',
    description: 'Consulte a autenticidade de certificados e documentos acadêmicos emitidos pela Universo Cursos e Consultoria.',
    image: '/social-share/validador.jpg',
    robots: 'noindex, follow',
  },
};

const setMetaContent = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
};

const getMetadataPath = (pathname: string) => {
  if (pathname === '/cursos-tecnicos' || pathname.startsWith('/cursos-tecnicos/')) return '/cursos-tecnicos';
  if (pathname === '/cursos-livres' || pathname.startsWith('/cursos-livres/')) return '/cursos-livres';
  if (pathname === '/especializacao' || pathname.startsWith('/especializacao/')) return '/especializacao';
  if (pathname === '/ead' || pathname.startsWith('/ead/')) return '/ead';
  if (pathname.startsWith('/gestor')) return '/gestor';
  if (pathname.startsWith('/professor')) return '/professor';
  if (pathname.startsWith('/aluno')) return '/aluno';
  return pathname;
};

const SeoManager: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const basePath = getMetadataPath(pathname);
    const metadata = pathname.startsWith('/cursos-tecnicos/tecnico-em-enfermagem/')
      ? TECHNICAL_NURSING_METADATA
      : ROUTE_METADATA[basePath] || ROUTE_METADATA['/'];
    let cleanPath = pathname;
    if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
      cleanPath = cleanPath.slice(0, -1);
    }
    const canonicalUrl = `${SITE_URL}${metadata.canonicalPath || cleanPath}`;
    const imageUrl = `${SITE_URL}${metadata.image}`;

    document.title = metadata.title;
    setMetaContent('meta[name="description"]', 'name', 'description', metadata.description);
    setMetaContent('meta[name="robots"]', 'name', 'robots', metadata.robots || 'index, follow');
    setMetaContent('meta[property="og:title"]', 'property', 'og:title', metadata.title);
    setMetaContent('meta[property="og:description"]', 'property', 'og:description', metadata.description);
    setMetaContent('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMetaContent('meta[property="og:image"]', 'property', 'og:image', imageUrl);
    setMetaContent('meta[property="og:image:width"]', 'property', 'og:image:width', '1200');
    setMetaContent('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
    setMetaContent('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMetaContent('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
    setMetaContent('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
    setMetaContent('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }, [pathname]);

  return null;
};

export default SeoManager;
