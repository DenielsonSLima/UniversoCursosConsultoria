import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://universocc.com.br';

type RouteMetadata = {
  title: string;
  description: string;
  image: string;
  robots?: string;
  canonicalPath?: string;
};

const ROUTE_METADATA: Record<string, RouteMetadata> = {
  '/': {
    title: 'Universo Cursos e Consultoria | Educação que transforma',
    description: 'Cursos técnicos, EAD, cursos livres, especializações e ensino superior com atendimento próximo e formação de qualidade.',
    image: '/social-share/home-v2.jpg',
  },
  '/ead': {
    title: 'Cursos EAD | Universo Cursos e Consultoria',
    description: 'Estude onde estiver com cursos EAD acessíveis, flexíveis e voltados ao seu desenvolvimento profissional.',
    image: '/social-share/ead-v2.jpg',
  },
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
  '/ensino-superior': {
    title: 'Ensino Superior | Universo Cursos e Consultoria',
    description: 'Graduações, licenciaturas e cursos superiores de tecnologia para transformar seu futuro profissional.',
    image: '/social-share/ensino-superior.jpg',
  },
  '/cursos-tecnicos': {
    title: 'Cursos Técnicos | Universo Cursos e Consultoria',
    description: 'Formação técnica de qualidade para você conquistar novas oportunidades e avançar no mercado de trabalho.',
    image: '/social-share/cursos-tecnicos.jpg',
  },
  '/cursos-livres': {
    title: 'Cursos Livres | Universo Cursos e Consultoria',
    description: 'Capacitações práticas e de curta duração para desenvolver habilidades e abrir novas oportunidades profissionais.',
    image: '/social-share/cursos-livres.jpg',
  },
  '/especializacao': {
    title: 'Especializações | Universo Cursos e Consultoria',
    description: 'Aprofunde seus conhecimentos com especializações profissionais nas áreas de saúde, educação e gestão.',
    image: '/social-share/especializacao-v2.jpg',
  },
  '/contato': {
    title: 'Contato e localização | Universo Cursos e Consultoria',
    description: 'Entre em contato, consulte nossos endereços e conheça as opções de atendimento da Universo Cursos e Consultoria.',
    image: '/social-share/localizacao.jpg',
  },
  '/localizacao': {
    title: 'Onde estamos | Universo Cursos e Consultoria',
    description: 'Encontre a Universo Cursos e Consultoria e fale com a unidade mais próxima de você.',
    image: '/social-share/localizacao.jpg',
  },
  '/polos': {
    title: 'Nossos polos | Universo Cursos e Consultoria',
    description: 'Conheça os polos da Universo Cursos e Consultoria em Japoatã, Aquidabã e Porto da Folha, Sergipe.',
    image: '/social-share/polos.jpg',
  },
  '/links': {
    title: 'Links oficiais | Universo Cursos e Consultoria',
    description: 'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
    image: '/social-share/links.jpg',
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
  '/faq': {
    title: 'Perguntas Frequentes | Universo Cursos e Consultoria',
    description: 'Encontre respostas sobre cursos, matrículas, documentos, certificados e atendimento.',
    image: '/social-share/home-v2.jpg',
  },
  '/validador': {
    title: 'Validador de documentos | Universo Cursos e Consultoria',
    description: 'Consulte a autenticidade de certificados e documentos acadêmicos emitidos pela Universo Cursos e Consultoria.',
    image: '/social-share/validador.jpg',
    robots: 'noindex, follow',
  },
  '/termos': {
    title: 'Termos de Uso | Universo Cursos e Consultoria',
    description: 'Consulte os termos e condições de uso dos serviços da Universo Cursos e Consultoria.',
    image: '/social-share/home-v2.jpg',
  },
  '/privacidade': {
    title: 'Política de Privacidade (LGPD) | Universo Cursos e Consultoria',
    description: 'Saiba como a Universo Cursos e Consultoria trata e protege dados pessoais conforme a LGPD.',
    image: '/social-share/home-v2.jpg',
  },
  '/cookies': {
    title: 'Política de Cookies | Universo Cursos e Consultoria',
    description: 'Entenda como os cookies são utilizados no site da Universo Cursos e Consultoria.',
    image: '/social-share/home-v2.jpg',
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
    const metadata = ROUTE_METADATA[basePath] || ROUTE_METADATA['/'];
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
