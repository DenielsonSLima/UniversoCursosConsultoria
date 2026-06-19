import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://universocc.com.br';

const ROUTE_METADATA: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Universo Cursos e Consultoria | Educação Profissional em Sergipe',
    description: 'Cursos técnicos, EAD, ensino superior e capacitação profissional em Japoatã, Aquidabã e Porto da Folha, Sergipe.',
  },
  '/ead': {
    title: 'Cursos EAD | Universo Cursos e Consultoria',
    description: 'Conheça os cursos EAD oferecidos pela Universo Cursos e Consultoria e estude com flexibilidade.',
  },
  '/login': {
    title: 'Login do Aluno | Universo Cursos e Consultoria',
    description: 'Acesse o portal do aluno da Universo Cursos e Consultoria.',
  },
  '/ensino-superior': {
    title: 'Ensino Superior | Universo Cursos e Consultoria',
    description: 'Graduações, licenciaturas e cursos superiores de tecnologia oferecidos em parceria com a Anhanguera.',
  },
  '/cursos-tecnicos': {
    title: 'Cursos Técnicos | Universo Cursos e Consultoria',
    description: 'Conheça nossos cursos técnicos e prepare-se para novas oportunidades no mercado de trabalho.',
  },
  '/cursos-livres': {
    title: 'Cursos Livres | Universo Cursos e Consultoria',
    description: 'Cursos livres de curta duração para capacitação e desenvolvimento profissional.',
  },
  '/especializacao': {
    title: 'Especializações | Universo Cursos e Consultoria',
    description: 'Especializações profissionais nas áreas de saúde e educação.',
  },
  '/contato': {
    title: 'Fale Conosco | Universo Cursos e Consultoria',
    description: 'Entre em contato com a Universo Cursos e Consultoria e conheça cursos, unidades e condições de matrícula.',
  },
  '/faq': {
    title: 'Perguntas Frequentes | Universo Cursos e Consultoria',
    description: 'Encontre respostas sobre cursos, matrículas, documentos, certificados e atendimento.',
  },
};

const setMetaContent = (selector: string, content: string) => {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
};

const SeoManager: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const basePath = pathname.startsWith('/cursos-tecnicos/detalhes/')
      ? '/cursos-tecnicos'
      : pathname.startsWith('/cursos-livres/detalhes/')
        ? '/cursos-livres'
        : pathname.startsWith('/especializacao/detalhes/')
          ? '/especializacao'
          : pathname;

    const metadata = ROUTE_METADATA[basePath] || ROUTE_METADATA['/'];
    const canonicalUrl = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;

    document.title = metadata.title;
    setMetaContent('meta[name="description"]', metadata.description);
    setMetaContent('meta[property="og:title"]', metadata.title);
    setMetaContent('meta[property="og:description"]', metadata.description);
    setMetaContent('meta[property="og:url"]', canonicalUrl);

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
