export const PUBLIC_SITE_URL = 'https://universocc.com.br';

export interface PublicPageMetadata {
  path: string;
  label: string;
  heading: string;
  title: string;
  description: string;
  imageSlug: string;
  canonicalPath?: string;
}

/** Public, stable page content only. Availability and prices stay in the live catalog. */
export const PUBLIC_PAGES: readonly PublicPageMetadata[] = [
  {
    path: '/', label: 'Início', heading: 'Universo Cursos e Consultoria',
    title: 'Universo Cursos e Consultoria | Educação que transforma',
    description: 'Cursos técnicos, EAD, cursos livres, especializações e ensino superior com atendimento próximo e formação de qualidade.',
    imageSlug: 'home-dona-v5',
  },
  {
    path: '/cursos-tecnicos', label: 'Cursos Técnicos', heading: 'Cursos Técnicos',
    title: 'Cursos Técnicos | Universo Cursos e Consultoria',
    description: 'Formação técnica de qualidade para você conquistar novas oportunidades e avançar no mercado de trabalho.',
    imageSlug: 'cursos-tecnicos',
  },
  {
    path: '/ead', label: 'Cursos EAD', heading: 'Cursos EAD',
    title: 'Cursos EAD | Universo Cursos e Consultoria',
    description: 'Estude onde estiver com cursos EAD acessíveis, flexíveis e voltados ao seu desenvolvimento profissional.',
    imageSlug: 'ead-v2',
  },
  {
    path: '/cursos-livres', label: 'Cursos Livres', heading: 'Cursos Livres',
    title: 'Cursos Livres | Universo Cursos e Consultoria',
    description: 'Capacitações práticas e de curta duração para desenvolver habilidades e abrir novas oportunidades profissionais.',
    imageSlug: 'cursos-livres',
  },
  {
    path: '/especializacao', label: 'Especializações', heading: 'Especialização Técnica',
    title: 'Especializações | Universo Cursos e Consultoria',
    description: 'Aprofunde seus conhecimentos com especializações profissionais nas áreas de saúde, educação e gestão.',
    imageSlug: 'especializacao-v2',
  },
  {
    path: '/ensino-superior', label: 'Ensino Superior', heading: 'Ensino Superior',
    title: 'Ensino Superior | Universo Cursos e Consultoria',
    description: 'Graduações, licenciaturas e cursos superiores de tecnologia para transformar seu futuro profissional.',
    imageSlug: 'ensino-superior',
  },
  {
    path: '/contato', label: 'Contato', heading: 'Fale Conosco',
    title: 'Contato e localização | Universo Cursos e Consultoria',
    description: 'Encontre a unidade mais próxima e consulte os endereços e canais de atendimento cadastrados em cada polo.',
    imageSlug: 'localizacao',
  },
  {
    path: '/polos', label: 'Nossos polos', heading: 'Nossos Polos',
    title: 'Nossos polos | Universo Cursos e Consultoria',
    description: 'Conheça os polos da Universo Cursos e Consultoria em Japoatã, Aquidabã e Porto da Folha, Sergipe.',
    imageSlug: 'polos',
  },
  {
    path: '/localizacao', label: 'Localização', heading: 'Fale Conosco',
    title: 'Contato e localização | Universo Cursos e Consultoria',
    description: 'Encontre a unidade mais próxima e consulte os endereços e canais de atendimento cadastrados em cada polo.',
    imageSlug: 'localizacao', canonicalPath: '/contato',
  },
  {
    path: '/faq', label: 'Perguntas frequentes', heading: 'Perguntas Frequentes',
    title: 'Perguntas Frequentes | Universo Cursos e Consultoria',
    description: 'Encontre respostas rápidas para as principais dúvidas sobre nossos cursos, matrículas e consultoria.',
    imageSlug: 'home-v2',
  },
  {
    path: '/links', label: 'Links oficiais', heading: 'Links oficiais da Universo',
    title: 'Links oficiais | Universo Cursos e Consultoria',
    description: 'Acesse em um só lugar os cursos, canais de atendimento e páginas oficiais da Universo Cursos e Consultoria.',
    imageSlug: 'links',
  },
  {
    path: '/termos', label: 'Termos de Uso', heading: 'Termos de Uso',
    title: 'Termos de Uso | Universo Cursos e Consultoria',
    description: 'Consulte os termos e condições de uso dos serviços da Universo Cursos e Consultoria.',
    imageSlug: 'home-v2',
  },
  {
    path: '/privacidade', label: 'Privacidade', heading: 'Política de Privacidade',
    title: 'Política de Privacidade (LGPD) | Universo Cursos e Consultoria',
    description: 'Saiba como a Universo Cursos e Consultoria trata e protege dados pessoais conforme a LGPD.',
    imageSlug: 'home-v2',
  },
  {
    path: '/cookies', label: 'Cookies', heading: 'Política de Cookies',
    title: 'Política de Cookies | Universo Cursos e Consultoria',
    description: 'Entenda como os cookies são utilizados no site da Universo Cursos e Consultoria.',
    imageSlug: 'home-v2',
  },
];

export const PUBLIC_NAVIGATION_PATHS = [
  '/cursos-tecnicos', '/ead', '/cursos-livres', '/especializacao',
  '/ensino-superior', '/polos', '/contato', '/faq',
] as const;
