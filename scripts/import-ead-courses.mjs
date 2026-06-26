import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const docsRoot = path.join(rootDir, 'Documentos', 'Cursos EAD para Adicionar');
const coversDir = path.join(rootDir, 'public', 'course-covers', 'ead');
const storageBucket = 'documentos';
const storageCoverPrefix = 'course-covers/ead';
const DEFAULT_VALUE = 99.9;
const MIN_QUESTIONS = 10;
const RETRY_HOURS = 1;

const CONSOLIDATED_AREAS = [
  'Administração e Gestão',
  'Educação',
  'Saúde',
  'Tecnologia e Comunicação',
  'Comércio e Vendas',
  'Segurança e Operações',
  'Beleza e Bem-estar',
  'Serviços e Finanças',
];

const areaAliases = new Map([
  ['Educação', 'Educação'],
  ['Educação Social', 'Educação'],
  ['Educação Física', 'Educação'],
  ['Administração Escolar', 'Educação'],
  ['Gestão Escolar', 'Educação'],
  ['Matemática', 'Educação'],
  ['Educação Inclusiva', 'Educação'],
  ['Tecnologia Kids', 'Educação'],
  ['Saúde', 'Saúde'],
  ['Saúde e Atendimento', 'Saúde'],
  ['Saúde e Cuidado', 'Saúde'],
  ['Saúde e Diagnóstico', 'Saúde'],
  ['Saúde Animal', 'Saúde'],
  ['Administração e Gestão', 'Administração e Gestão'],
  ['Administração e Operações', 'Administração e Gestão'],
  ['Tecnologia e Produtividade', 'Tecnologia e Comunicação'],
  ['Comunicação Digital', 'Tecnologia e Comunicação'],
  ['Comunicação e Linguagens', 'Tecnologia e Comunicação'],
  ['Tecnologia e Vendas', 'Tecnologia e Comunicação'],
  ['Atendimento e Vendas', 'Comércio e Vendas'],
  ['Comércio e Varejo', 'Comércio e Vendas'],
  ['Negócios e Vendas', 'Comércio e Vendas'],
  ['Segurança Operacional', 'Segurança e Operações'],
  ['Segurança Patrimonial', 'Segurança e Operações'],
  ['Transporte Escolar', 'Segurança e Operações'],
  ['Logística e Operações', 'Segurança e Operações'],
  ['Comércio e Segurança', 'Segurança e Operações'],
  ['Elétrica e Segurança', 'Segurança e Operações'],
  ['Segurança do Trabalho', 'Segurança e Operações'],
  ['Máquinas Pesadas', 'Segurança e Operações'],
  ['Beleza e Estética', 'Beleza e Bem-estar'],
  ['Serviço Social', 'Serviços e Finanças'],
  ['Alimentação', 'Serviços e Finanças'],
  ['Finanças e Bancos', 'Serviços e Finanças'],
]);

function normalizeCourseArea(area, title = '', tags = []) {
  if (CONSOLIDATED_AREAS.includes(area)) return area;
  if (areaAliases.has(area)) return areaAliases.get(area);

  const searchable = `${title} ${area || ''} ${tags.join(' ')}`.toLowerCase();
  if (/creche|educa|pedagog|escolar|monitor|mediador|matem|enem|kids|redacao|redação/.test(searchable)) return 'Educação';
  if (/saude|saúde|farm|idoso|radiologia|veterin|clinica|clínica|nutri/.test(searchable)) return 'Saúde';
  if (/admin|rh|secretar|almox|estoque|faturamento/.test(searchable)) return 'Administração e Gestão';
  if (/excel|word|digitacao|digitação|marketing|instagram|loja virtual|rede social|oratoria|oratória|comunic/.test(searchable)) return 'Tecnologia e Comunicação';
  if (/venda|caixa|telemarketing|frentista|fiscal|corretor|imoveis|imóveis|comerc/.test(searchable)) return 'Comércio e Vendas';
  if (/segur|portaria|porteiro|vigia|empilhadeira|logist|logíst|transporte|eletric|nr-10|pa carregadeira|pá carregadeira|retroescavadeira/.test(searchable)) return 'Segurança e Operações';
  if (/cilios|cílios|sobrancelha|manicure|pedicure|barbeiro|beleza/.test(searchable)) return 'Beleza e Bem-estar';
  if (/banc|finance|servico social|serviço social|cozinha|aliment/.test(searchable)) return 'Serviços e Finanças';
  return 'Administração e Gestão';
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const legacyCourseDefinitions = [
  {
    title: 'Auxiliar de Creche',
    hours: 80,
    area: 'Educação',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/Curso de Auxiliar de Creche.docx'],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Educação Social na Adolescência',
    hours: 80,
    area: 'Educação Social',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/EDUCAÇÃO SOCIAL NA ADOLENCENCIA.docx'],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Metodologias Ativas para o Professor',
    hours: 80,
    area: 'Educação',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/METODOLOGIAS ATIVAS PARA O PROFESSOR 80H.docx'],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Educação Física Escolar',
    hours: 80,
    area: 'Educação Física',
    sources: [
      'CURSOS PARA COLOCAR NA PLATAFORMA/CURSO EDUCAÇÃO FISICA 60H completo.doc',
      'CURSOS PARA O EAD/CURSO EDUCAÇÃO FISICA 60H.doc',
    ],
    tags: ['bncc', 'educacao-fisica'],
  },
  {
    title: 'Introdução à Nutrição',
    hours: 80,
    area: 'Saúde',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/Curso de Introdução à Nutrição 80.docx'],
    tags: ['saude'],
  },
  {
    title: 'Secretariado Escolar',
    hours: 80,
    area: 'Administração Escolar',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/Curso de Secretariado Escolar 80H.docx'],
    tags: ['pedagogia'],
  },
  {
    title: 'Educação e Gestão Escolar',
    hours: 80,
    area: 'Gestão Escolar',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/EDUCAÇÃO E GESTÃO ESCOLAR 60H.docx'],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Monitor Escolar de Classe - Auxiliar do Regente',
    hours: 80,
    area: 'Educação',
    sources: [
      'CURSOS PARA COLOCAR NA PLATAFORMA/MONITOR ESCOLAR DE CLASSE AUXILIAR DO REGENTE.docx',
      'ENC_ CURSOS E PROVAS/Prova do Curso de Monitor Escolar 80 HORAS.docx',
    ],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Redes Sociais',
    hours: 80,
    area: 'Comunicação Digital',
    sources: [
      'CURSOS PARA COLOCAR NA PLATAFORMA/CURSO REDES SOCIAIS EAD 60HS.doc',
      'CURSOS PARA O EAD/CURSO REDES SOCIAIS EAD 60HS.doc',
    ],
    tags: ['lgpd', 'comunicacao'],
  },
  {
    title: 'Serviços Sociais Básico',
    hours: 80,
    area: 'Serviço Social',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/Curso de Serviços Sociais Básico 80.docx'],
    tags: ['servico-social'],
  },
  {
    title: 'Operador de Empilhadeira',
    hours: 80,
    area: 'Segurança Operacional',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/CURSO DE EMPILHADEIRA 60 H.doc'],
    tags: ['nr11', 'seguranca'],
  },
  {
    title: 'Educação nas Mudanças da Sociedade',
    hours: 80,
    area: 'Educação',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/EDUCAÇÃO NAS MUDANÇAS DA SOCIEDADE 40H.docx'],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Oficineiro',
    hours: 80,
    area: 'Educação Social',
    sources: ['CURSOS PARA COLOCAR NA PLATAFORMA/OFICINEIRO 01 80 H F PROVA.docx'],
    tags: ['pedagogia'],
  },
  {
    title: 'Matemática Infantil',
    hours: 100,
    area: 'Matemática',
    sources: [
      'CURSOS PARA COLOCAR NA PLATAFORMA/CURSO EAD MATEMATICA INFANTIL100HS.doc',
      'CURSOS PARA O EAD/CURSO EAD MATEMATICA INFANTIL100HS.doc',
    ],
    tags: ['bncc', 'matematica'],
  },
  {
    title: 'Matemática Básica',
    hours: 80,
    area: 'Matemática',
    sources: [
      'CURSOS PARA COLOCAR NA PLATAFORMA/curson de matemática básica 80 (1).doc',
      'CURSOS PARA O EAD/curson de matemática básica 80 (1).doc',
    ],
    tags: ['bncc', 'matematica'],
  },
  {
    title: 'Matemática EJA',
    hours: 80,
    area: 'Matemática',
    sources: ['CURSOS PARA O EAD/CURSO EAD MATEMATICA EJA 60HS.doc'],
    tags: ['bncc', 'matematica'],
  },
  {
    title: 'Porteiro e Vigia',
    hours: 80,
    area: 'Segurança Patrimonial',
    sources: ['CURSOS PARA O EAD/CURSO PORTEIRO E VIGIA 40H.doc'],
    tags: ['seguranca'],
  },
  {
    title: 'Condutor de Transporte Escolar',
    hours: 80,
    area: 'Transporte Escolar',
    sources: ['CURSOS PARA O EAD/CONDUTOR DE TRANSPORTE ESCOLAR.doc'],
    tags: ['transporte'],
  },
  {
    title: 'Auxiliar de Cozinha',
    hours: 100,
    area: 'Alimentação',
    sources: ['ENC_ CURSOS E PROVAS/Prova do Curso de Auxiliar de Cozinha 100 HORAS.docx'],
    tags: ['alimentacao'],
  },
  {
    title: 'Acolhimento e Segurança no Retorno às Aulas',
    hours: 80,
    area: 'Educação',
    sources: ['ENC_ CURSOS E PROVAS/Prova do Curso de Acolhimento e Segurança no Retorno as Aulas.docx'],
    tags: ['bncc', 'seguranca', 'pedagogia'],
  },
  {
    title: 'Aperfeiçoamento em Educação Interdimensional',
    hours: 156,
    area: 'Educação',
    sources: ['ENC_ CURSOS E PROVAS/Prova do Curso de Aperfeiçoamento em Educação Interdimensional 156 HORAS.docx'],
    tags: ['bncc', 'pedagogia'],
  },
  {
    title: 'Agente Comunitário de Saúde',
    hours: 180,
    area: 'Saúde',
    sources: ['ENC_ CURSOS E PROVAS/prova Curso de Agente Comunitário de Saúde.docx'],
    tags: ['saude'],
    updateExistingOnly: true,
  },
];

const newCourseDefinitions = [
  {
    title: 'Auxiliar Administrativo',
    hours: 120,
    area: 'Administração e Gestão',
    price: 119.9,
    batch: 1,
    sources: [],
    tags: ['administracao', 'office'],
    lessonTopics: ['Rotinas Administrativas', 'Atendimento e Comunicação Empresarial', 'Documentos, Protocolos e Arquivos', 'Noções Financeiras e Compras', 'Produtividade com Ferramentas Digitais', 'Ética, Indicadores e Plano de Ação'],
    researchNotes: ['Conteúdo orientado a rotinas reais de escritório: organização documental, atendimento, agenda, controles financeiros simples, compras, arquivos físicos/digitais e comunicação profissional.'],
  },
  {
    title: 'Atendente de Farmácia',
    hours: 120,
    area: 'Saúde e Atendimento',
    price: 129.9,
    batch: 1,
    sources: [],
    tags: ['farmacia', 'saude', 'atendimento'],
    lessonTopics: ['Sistema de Saúde, Farmácia e Papel do Atendente', 'Atendimento, Triagem Comercial e Comunicação', 'Medicamentos, Receitas e Cuidados Básicos', 'Organização, Estoque e Validade', 'Boas Práticas, Anvisa e Segurança', 'Vendas Responsáveis e Rotina de Balcão'],
    researchNotes: ['O curso não habilita prescrição nem dispensação técnica privativa. O foco é atendimento, organização, leitura básica de rotinas, apoio sob supervisão farmacêutica e boas práticas sanitárias.'],
  },
  {
    title: 'Marketing Digital',
    hours: 100,
    area: 'Comunicação Digital',
    price: 129.9,
    batch: 1,
    sources: [],
    tags: ['marketing', 'lgpd', 'vendas'],
    lessonTopics: ['Fundamentos de Marketing Digital', 'Persona, Oferta e Jornada do Cliente', 'Conteúdo, Tráfego e Funil de Vendas', 'Métricas, Testes e Otimização', 'LGPD, Privacidade e Reputação', 'Plano Prático de Campanha'],
    researchNotes: ['Atualizado para práticas de funil, conteúdo curto, análise de métricas, campanhas pagas, atendimento digital, privacidade e uso responsável de dados pessoais.'],
  },
  {
    title: 'Cuidador de Idoso',
    hours: 160,
    area: 'Saúde e Cuidado',
    price: 149.9,
    batch: 1,
    sources: [],
    tags: ['idoso', 'saude', 'cuidados'],
    lessonTopics: ['Envelhecimento, Autonomia e Direitos', 'Higiene, Conforto e Mobilidade', 'Alimentação, Hidratação e Rotina Segura', 'Medicamentos sob Orientação e Sinais de Alerta', 'Prevenção de Quedas e Primeiros Cuidados', 'Comunicação com Família e Equipe de Saúde'],
    researchNotes: ['Baseado em cuidado humanizado, segurança, prevenção de quedas, registro de rotina, respeito à autonomia e atuação sem invadir atividades privativas de profissionais de saúde.'],
  },
  {
    title: 'Gestão em RH',
    hours: 120,
    area: 'Administração e Gestão',
    price: 129.9,
    batch: 1,
    sources: [],
    tags: ['rh', 'administracao'],
    lessonTopics: ['Papel Estratégico do RH', 'Recrutamento, Seleção e Integração', 'Treinamento e Desenvolvimento', 'Rotinas de Departamento Pessoal', 'Clima, Cultura e Avaliação', 'Indicadores, Ética e LGPD no RH'],
    researchNotes: ['Enfoque em processos de gente, documentação, indicadores, cultura, comunicação interna e proteção de dados pessoais de candidatos e colaboradores.'],
  },
  {
    title: 'Excel Básico e Avançado',
    hours: 120,
    area: 'Tecnologia e Produtividade',
    price: 129.9,
    batch: 2,
    sources: [],
    tags: ['excel', 'office'],
    lessonTopics: ['Planilhas, Formatação e Operações Básicas', 'Fórmulas Essenciais e Referências', 'Funções Lógicas, Texto e Data', 'Tabelas, Filtros e Validação de Dados', 'Gráficos, Dashboards e Impressão', 'Procura, Resumo e Automação Inicial'],
    researchNotes: ['Roteiro prático com planilhas de caixa, estoque, vendas, frequência e relatórios administrativos.'],
  },
  {
    title: 'Instagram para Vendas',
    hours: 80,
    area: 'Comunicação Digital',
    price: 99.9,
    batch: 2,
    sources: [],
    tags: ['marketing', 'lgpd', 'vendas'],
    lessonTopics: ['Perfil Comercial e Posicionamento', 'Conteúdo que Educa e Vende', 'Stories, Reels e Prova Social', 'Atendimento no Direct e WhatsApp', 'Métricas, Calendário e Testes', 'Privacidade, Direitos de Imagem e Crises'],
    researchNotes: ['Foco em vendas reais para pequenos negócios, sem promessas irreais: oferta, atendimento, rotina de publicação, métricas e proteção de dados/imagem.'],
  },
  {
    title: 'Telemarketing',
    hours: 80,
    area: 'Atendimento e Vendas',
    price: 99.9,
    batch: 2,
    sources: [],
    tags: ['vendas', 'atendimento'],
    lessonTopics: ['Comunicação Telefônica Profissional', 'Scripts, Escuta Ativa e Sondagem', 'Atendimento Receptivo e Ativo', 'Objeções, Pós-venda e Registro', 'Indicadores, Qualidade e Produtividade', 'Ética, LGPD e Relação com o Cliente'],
    researchNotes: ['Inclui scripts práticos, abordagem consultiva, registro em sistemas, tratamento de objeções e limites éticos no contato com clientes.'],
  },
  {
    title: 'Criação de Loja Virtual',
    hours: 100,
    area: 'Tecnologia e Vendas',
    price: 149.9,
    batch: 2,
    sources: [],
    tags: ['marketing', 'vendas', 'ecommerce', 'lgpd'],
    lessonTopics: ['Modelo de Negócio e Plataforma', 'Catálogo, Fotos e Descrições', 'Meios de Pagamento, Frete e Checkout', 'Atendimento, Trocas e Pós-venda', 'Tráfego, Conteúdo e Conversão', 'LGPD, Segurança e Operação Diária'],
    researchNotes: ['Curso voltado a montar operação enxuta: produto, catálogo, checkout, logística, atendimento, métricas e cuidados com dados pessoais.'],
  },
  {
    title: 'Operador de Caixa',
    hours: 80,
    area: 'Comércio e Varejo',
    price: 99.9,
    batch: 2,
    sources: [],
    tags: ['varejo', 'caixa', 'atendimento'],
    lessonTopics: ['Rotina do Caixa e Atendimento', 'Formas de Pagamento e Conferência', 'Abertura, Sangria e Fechamento', 'Notas, Cupons e Documentos', 'Prevenção de Perdas e Fraudes', 'Simulações de Atendimento e Fechamento'],
    researchNotes: ['Prática de frente de caixa: conferência, postura, meios de pagamento, divergências, troco, fechamento e prevenção de perdas.'],
  },
  {
    title: 'Técnicas de Redação',
    hours: 80,
    area: 'Comunicação e Linguagens',
    price: 99.9,
    batch: 3,
    sources: [],
    tags: ['redacao', 'linguagens'],
    lessonTopics: ['Clareza, Coesão e Coerência', 'Texto Dissertativo-Argumentativo', 'Planejamento e Repertório', 'Parágrafo, Tese e Argumentos', 'Revisão Gramatical Aplicada', 'Produção, Correção e Reescrita'],
    researchNotes: ['Inclui escrita objetiva para estudo e trabalho, com ênfase em planejamento, reescrita, argumentação e comunicação clara.'],
  },
  {
    title: 'Matemática para Enem',
    hours: 160,
    area: 'Matemática',
    price: 149.9,
    batch: 3,
    sources: [],
    tags: ['matematica', 'enem'],
    lessonTopics: ['Competências do Enem e Resolução de Problemas', 'Aritmética, Razão, Proporção e Porcentagem', 'Álgebra, Funções e Gráficos', 'Geometria Plana, Espacial e Analítica', 'Estatística, Probabilidade e Análise de Dados', 'Simulados, Estratégia de Prova e Revisão'],
    researchNotes: ['Organizado por habilidades cobradas no Enem: interpretação de gráficos, porcentagem, funções, geometria, estatística, probabilidade e resolução contextualizada.'],
  },
  {
    title: 'Agente de Portaria',
    hours: 80,
    area: 'Segurança Patrimonial',
    price: 99.9,
    batch: 3,
    sources: [],
    tags: ['portaria', 'seguranca', 'atendimento'],
    lessonTopics: ['Funções do Agente de Portaria', 'Controle de Acesso e Identificação', 'Comunicação, Registro e Ocorrências', 'Rondas, Chaves e Monitoramento', 'Atendimento ao Público e Conflitos', 'Prevenção, Emergência e Ética'],
    researchNotes: ['Diferencia portaria, recepção e vigilância patrimonial; foca controle de acesso, registros, comunicação e prevenção de riscos.'],
  },
  {
    title: 'Designer de Cílios e Sobrancelha',
    hours: 80,
    area: 'Beleza e Estética',
    price: 129.9,
    batch: 3,
    sources: [],
    tags: ['beleza', 'biosseguranca', 'vendas'],
    lessonTopics: ['Anatomia Básica, Visagismo e Atendimento', 'Biossegurança e Organização do Espaço', 'Design de Sobrancelhas', 'Técnicas de Cílios e Cuidados', 'Avaliação, Contraindicações e Pós-procedimento', 'Precificação, Portfólio e Atendimento'],
    researchNotes: ['Conteúdo prático com biossegurança, ficha de atendimento, contraindicações, cuidados pós-procedimento e gestão de agenda.'],
  },
  {
    title: 'Almoxarifado',
    hours: 100,
    area: 'Logística e Operações',
    price: 119.9,
    batch: 4,
    sources: [],
    tags: ['logistica', 'estoque'],
    lessonTopics: ['Função do Almoxarifado', 'Recebimento e Conferência', 'Armazenagem, Endereçamento e Separação', 'Controle de Estoque e Inventário', 'Documentos, Indicadores e Sistemas', 'Segurança, Organização e Melhoria Contínua'],
    researchNotes: ['Roteiro com recebimento, armazenagem, endereçamento, FIFO/FEFO, inventário, indicadores e controle de divergências.'],
  },
  {
    title: 'Logística 4.0',
    hours: 120,
    area: 'Logística e Operações',
    price: 149.9,
    batch: 4,
    sources: [],
    tags: ['logistica', 'tecnologia'],
    lessonTopics: ['Fundamentos de Logística e Cadeia de Suprimentos', 'Armazenagem, Transporte e Distribuição', 'Indicadores e Gestão de Custos', 'Tecnologias 4.0 na Logística', 'Dados, Rastreabilidade e Integrações', 'Projeto Prático de Melhoria Logística'],
    researchNotes: ['Atualizado para automação, rastreabilidade, dados, integração de sistemas, indicadores e melhoria contínua de operações.'],
  },
  {
    title: 'Atualização em Radiologia',
    hours: 100,
    area: 'Saúde e Diagnóstico',
    price: 149.9,
    batch: 4,
    sources: [],
    tags: ['radiologia', 'saude', 'seguranca'],
    lessonTopics: ['Atualização Profissional em Radiologia', 'Radioproteção e Segurança do Paciente', 'Posicionamento, Qualidade e Protocolos', 'Equipamentos, Imagem Digital e PACS', 'Ética, Registro e Atendimento', 'Estudos de Caso e Revisão Técnica'],
    researchNotes: ['Conteúdo de atualização, não substitui formação técnica: radioproteção, protocolos, qualidade de imagem, atendimento e limites éticos/profissionais.'],
  },
  {
    title: 'Frentista',
    hours: 80,
    area: 'Comércio e Segurança',
    price: 99.9,
    batch: 4,
    sources: [],
    tags: ['combustiveis', 'atendimento', 'seguranca'],
    lessonTopics: ['Posto de Combustível e Papel do Frentista', 'Atendimento, Vendas e Serviços', 'Tipos de Combustíveis e Abastecimento Seguro', 'Produtos, Conferência e Pagamentos', 'Prevenção de Riscos e Emergências', 'Ética, Registro e Relacionamento com Cliente'],
    researchNotes: ['Foco em atendimento, segurança, abastecimento correto, prevenção de acidentes, conferência e rotina comercial de posto.'],
  },
  {
    title: 'Auxiliar de Veterinário',
    hours: 120,
    area: 'Saúde Animal',
    price: 149.9,
    batch: 5,
    sources: [],
    tags: ['veterinario', 'saude', 'atendimento'],
    lessonTopics: ['Rotina de Clínicas Veterinárias', 'Manejo, Contenção e Bem-estar Animal', 'Higiene, Esterilização e Biossegurança', 'Apoio ao Atendimento sob Supervisão', 'Estoque, Prontuário e Comunicação com Tutores', 'Emergências, Ética e Limites de Atuação'],
    researchNotes: ['O curso prepara apoio administrativo e operacional sob supervisão veterinária, sem invadir atos privativos do médico-veterinário.'],
  },
  {
    title: 'Eletricista',
    hours: 160,
    area: 'Elétrica e Segurança',
    price: 179.9,
    batch: 5,
    sources: [],
    tags: ['eletricidade', 'nr10', 'seguranca'],
    lessonTopics: ['Fundamentos de Eletricidade', 'Ferramentas, Materiais e Leitura Básica', 'Instalações Residenciais e Prediais', 'Comandos, Proteções e Manutenção', 'NR-10, Riscos e Medidas de Controle', 'Projetos Práticos e Checklist de Serviço'],
    researchNotes: ['Conteúdo introdutório e prático. Atividades em instalações reais exigem capacitação adequada, autorização e atendimento às normas de segurança aplicáveis.'],
  },
  {
    title: 'NR-10',
    hours: 80,
    area: 'Segurança do Trabalho',
    price: 129.9,
    batch: 5,
    sources: [],
    tags: ['nr10', 'eletricidade', 'seguranca'],
    lessonTopics: ['Introdução à NR-10 e Prontuário', 'Riscos Elétricos e Medidas de Controle', 'EPIs, EPCs e Procedimentos', 'Bloqueio, Sinalização e Emergência', 'Primeiros Socorros e Combate a Incêndio', 'Documentação, Responsabilidades e Avaliação'],
    researchNotes: ['Estrutura alinhada à NR-10: segurança em instalações e serviços com eletricidade, controle de riscos, procedimentos, emergência e responsabilidades.'],
  },
  {
    title: 'Digitação Interativa',
    hours: 80,
    area: 'Tecnologia e Produtividade',
    price: 99.9,
    batch: 5,
    sources: [],
    tags: ['digitacao', 'office'],
    lessonTopics: ['Postura, Ergonomia e Teclado', 'Técnicas de Digitação e Precisão', 'Velocidade com Qualidade', 'Edição de Texto e Atalhos', 'Prática com Documentos e Planilhas', 'Rotina de Treino e Avaliação'],
    researchNotes: ['Curso prático com foco em ergonomia, precisão, velocidade gradual, atalhos e produção de documentos reais.'],
  },
  {
    title: 'Fiscal de Loja',
    hours: 80,
    area: 'Comércio e Varejo',
    price: 99.9,
    batch: 6,
    sources: [],
    tags: ['varejo', 'seguranca', 'atendimento'],
    lessonTopics: ['Função do Fiscal de Loja', 'Prevenção de Perdas e Quebras', 'Abordagem, Postura e Limites Legais', 'Monitoramento, Rondas e Comunicação', 'Registros, Ocorrências e Indicadores', 'Atendimento, Conflitos e Ética'],
    researchNotes: ['Foco em prevenção de perdas com conduta ética, comunicação, registro, respeito ao cliente e limites de atuação.'],
  },
  {
    title: 'Pá Carregadeira',
    hours: 100,
    area: 'Máquinas Pesadas',
    price: 179.9,
    batch: 6,
    sources: [],
    tags: ['maquinas', 'seguranca', 'nr11'],
    lessonTopics: ['Fundamentos da Pá Carregadeira', 'Segurança, Checklists e Inspeção', 'Comandos, Estabilidade e Operação', 'Carregamento, Transporte e Terreno', 'Manutenção Básica e Sinalização', 'Prevenção de Acidentes e Simulações'],
    researchNotes: ['Curso teórico de preparação. Operação real requer treinamento prático supervisionado, autorização e procedimentos internos de segurança.'],
  },
  {
    title: 'Retroescavadeira',
    hours: 100,
    area: 'Máquinas Pesadas',
    price: 179.9,
    batch: 6,
    sources: [],
    tags: ['maquinas', 'seguranca', 'nr11'],
    lessonTopics: ['Fundamentos da Retroescavadeira', 'Segurança, Área de Trabalho e Sinalização', 'Inspeção, Comandos e Estabilidade', 'Escavação, Carregamento e Nivelamento', 'Manutenção Básica e Transporte', 'Estudos de Caso e Prevenção de Acidentes'],
    researchNotes: ['Preparação teórica para segurança operacional, inspeção, estabilidade, isolamento de área e prevenção de acidentes.'],
  },
  {
    title: 'Conhecimentos Bancários',
    hours: 100,
    area: 'Finanças e Bancos',
    price: 129.9,
    batch: 6,
    sources: [],
    tags: ['bancario', 'financeiro', 'atendimento'],
    lessonTopics: ['Sistema Financeiro Nacional', 'Produtos Bancários e Atendimento', 'Crédito, Cobrança e Cadastro', 'Prevenção a Fraudes e Segurança', 'LGPD, Sigilo e Ética', 'Matemática Financeira Aplicada'],
    researchNotes: ['Inclui noções de sistema financeiro, produtos, atendimento, crédito, segurança, sigilo, proteção de dados e matemática financeira básica.'],
  },
  {
    title: 'Manicure e Pedicure',
    hours: 100,
    area: 'Beleza e Estética',
    price: 129.9,
    batch: 7,
    sources: [],
    tags: ['beleza', 'biosseguranca', 'vendas'],
    lessonTopics: ['Biossegurança e Organização do Espaço', 'Anatomia Básica das Unhas', 'Técnicas de Manicure', 'Técnicas de Pedicure e Cuidados', 'Atendimento, Agenda e Precificação', 'Portfólio, Fidelização e Ética'],
    researchNotes: ['Atenção à esterilização, materiais individuais, contraindicações, atendimento e gestão do serviço.'],
  },
  {
    title: 'Barbeiro Profissional',
    hours: 120,
    area: 'Beleza e Estética',
    price: 149.9,
    batch: 7,
    sources: [],
    tags: ['beleza', 'atendimento', 'vendas'],
    lessonTopics: ['Biossegurança, Ferramentas e Atendimento', 'Tipos de Cabelo e Visagismo', 'Cortes Clássicos e Modernos', 'Barba, Acabamento e Finalização', 'Agenda, Precificação e Experiência do Cliente', 'Portfólio, Marketing Local e Fidelização'],
    researchNotes: ['Conteúdo para iniciar com postura profissional: higiene, ferramentas, cortes, barba, atendimento, preço e marketing local.'],
  },
  {
    title: 'Mediador Escolar (Monitor Escolar)',
    hours: 120,
    area: 'Educação Inclusiva',
    price: 129.9,
    batch: 7,
    sources: [],
    tags: ['bncc', 'pedagogia', 'inclusao'],
    lessonTopics: ['Papel do Mediador Escolar', 'Inclusão, Acessibilidade e Direitos', 'Rotina, Comunicação e Registro', 'Apoio Pedagógico e Socioemocional', 'Conflitos, Autonomia e Família', 'Plano de Acompanhamento e Ética'],
    researchNotes: ['Curso orientado à atuação de apoio, inclusão e registro, respeitando equipe pedagógica, família, estudante e limites da função.'],
  },
  {
    title: 'Análises Clínicas',
    hours: 120,
    area: 'Saúde e Diagnóstico',
    price: 149.9,
    batch: 7,
    sources: [],
    tags: ['analises-clinicas', 'saude', 'biosseguranca'],
    lessonTopics: ['Rotina de Laboratório e Biossegurança', 'Coleta, Identificação e Transporte de Amostras', 'Hematologia e Bioquímica Básica', 'Microbiologia e Parasitologia Básica', 'Qualidade, Registros e Descarte', 'Atendimento, Ética e Estudos de Caso'],
    researchNotes: ['Conteúdo introdutório de apoio em laboratório, com foco em biossegurança, identificação, qualidade e limites de atuação.'],
  },
  {
    title: 'Oratória',
    hours: 80,
    area: 'Comunicação e Linguagens',
    price: 99.9,
    batch: 8,
    sources: [],
    tags: ['oratoria', 'comunicacao'],
    lessonTopics: ['Presença, Voz e Respiração', 'Organização de Ideias e Roteiro', 'Linguagem Corporal e Segurança', 'Apresentações, Reuniões e Vendas', 'Storytelling e Argumentação', 'Prática, Feedback e Plano de Evolução'],
    researchNotes: ['Curso prático com exercícios de fala, organização, postura, apresentação e controle de ansiedade.'],
  },
  {
    title: 'Auxiliar Corretor de Imóveis',
    hours: 100,
    area: 'Negócios e Vendas',
    price: 129.9,
    batch: 8,
    sources: [],
    tags: ['imobiliario', 'vendas', 'atendimento'],
    lessonTopics: ['Mercado Imobiliário e Atendimento', 'Captação, Cadastro e Organização de Imóveis', 'Documentos e Noções Contratuais', 'Visitas, Negociação e Pós-venda', 'Marketing Imobiliário e Portais', 'Ética, LGPD e Rotina Comercial'],
    researchNotes: ['Curso de apoio comercial e administrativo, sem substituir habilitação legal quando exigida para corretagem.'],
  },
  {
    title: 'Estoque e Faturamento',
    hours: 100,
    area: 'Administração e Operações',
    price: 119.9,
    batch: 8,
    sources: [],
    tags: ['estoque', 'financeiro', 'administracao'],
    lessonTopics: ['Controle de Estoque e Inventário', 'Entrada, Saída e Conferência', 'Documentos Comerciais e Faturamento', 'Preço, Margem e Custos', 'Sistemas, Indicadores e Relatórios', 'Divergências, Auditoria e Melhoria'],
    researchNotes: ['Integra estoque, faturamento e controles administrativos para comércio e serviços.'],
  },
  {
    title: 'Auxiliar Pedagógico',
    hours: 100,
    area: 'Educação',
    price: 119.9,
    batch: 8,
    sources: [],
    tags: ['bncc', 'pedagogia'],
    lessonTopics: ['Função do Auxiliar Pedagógico', 'Rotina Escolar e Apoio ao Professor', 'BNCC, Planejamento e Atividades', 'Inclusão, Afetividade e Comunicação', 'Registros, Materiais e Organização', 'Ética, Família e Equipe Escolar'],
    researchNotes: ['Curso para apoio pedagógico com foco em rotina escolar, organização, comunicação e inclusão.'],
  },
  {
    title: 'Excel Kids',
    hours: 80,
    area: 'Tecnologia Kids',
    price: 99.9,
    batch: 9,
    sources: [],
    tags: ['excel', 'kids', 'office'],
    lessonTopics: ['Conhecendo Planilhas com Segurança', 'Células, Linhas, Colunas e Formatação', 'Contas Simples e Fórmulas Básicas', 'Tabelas, Gráficos e Jogos de Dados', 'Projetos: Mesada, Agenda e Notas', 'Cidadania Digital e Revisão'],
    researchNotes: ['Linguagem lúdica para crianças, com projetos simples e segurança digital.'],
  },
  {
    title: 'Word Kids',
    hours: 80,
    area: 'Tecnologia Kids',
    price: 99.9,
    batch: 9,
    sources: [],
    tags: ['word', 'kids', 'office'],
    lessonTopics: ['Conhecendo o Editor de Texto', 'Digitação, Formatação e Parágrafos', 'Imagens, Tabelas e Listas', 'Trabalhos Escolares e Criatividade', 'Revisão, Salvamento e Impressão', 'Cidadania Digital e Projeto Final'],
    researchNotes: ['Curso infantil de edição de texto, organização de trabalhos, criatividade e boas práticas digitais.'],
  },
];

const courseDefinitions = [...legacyCourseDefinitions, ...newCourseDefinitions];

const sourceNotes = {
  bncc:
    'Atualização 2026: alinhar planejamento às competências gerais da BNCC, aos direitos de aprendizagem, à avaliação formativa e à inclusão. Na Educação Infantil, organizar experiências por campos de experiência; no Ensino Fundamental, articular competências, habilidades e práticas contextualizadas.',
  matematica:
    'Atualização 2026: trabalhar resolução de problemas, raciocínio lógico, comunicação matemática, análise de dados, geometria, medidas e uso crítico de tecnologias, mantendo progressão compatível com a BNCC e com o perfil do estudante.',
  'educacao-fisica':
    'Atualização 2026: contemplar brincadeiras, jogos, esportes, ginásticas, danças, lutas e práticas corporais de aventura, com segurança, inclusão, respeito às diferenças e avaliação processual.',
  lgpd:
    'Atualização 2026: nas redes sociais, aplicar princípios da LGPD e orientações da ANPD: finalidade, necessidade, transparência, segurança, bases legais, cuidado com imagens de terceiros e gestão de consentimento quando cabível.',
  nr11:
    'Atualização 2026: a operação de empilhadeiras deve observar treinamento, autorização, inspeção, manutenção e prevenção de riscos conforme NR-11, NR-12 e procedimentos internos de segurança.',
  transporte:
    'Atualização 2026: o transporte escolar deve observar CTB, normas do CONTRAN/SENATRAN, autorização, requisitos do condutor, inspeção do veículo, cinto de segurança, registro e conduta preventiva.',
  administracao:
    'Atualização 2026: rotinas administrativas devem integrar organização documental, atendimento, controles simples, indicadores, comunicação escrita e uso responsável de ferramentas digitais.',
  office:
    'Atualização 2026: ferramentas de escritório devem ser ensinadas com tarefas reais: planilhas de controle, textos profissionais, relatórios, compartilhamento seguro e revisão de dados.',
  farmacia:
    'Atualização 2026: atendimento em farmácia exige boas práticas sanitárias, organização de estoque, validade, leitura responsável de informações e atuação sob supervisão do farmacêutico.',
  atendimento:
    'Atualização 2026: atendimento profissional deve priorizar escuta, registro, clareza, empatia, acessibilidade, privacidade e solução responsável de demandas.',
  saude:
    'Atualização 2026: conteúdos de saúde devem reforçar segurança do paciente, biossegurança, limites de atuação, encaminhamento adequado e registro das rotinas.',
  idoso:
    'Atualização 2026: o cuidado à pessoa idosa deve respeitar autonomia, direitos, prevenção de quedas, rotina segura, sinais de alerta e comunicação com família e equipe de saúde.',
  cuidados:
    'Atualização 2026: cuidados pessoais e assistenciais precisam combinar higiene, conforto, observação, prevenção de riscos e limites claros de responsabilidade.',
  marketing:
    'Atualização 2026: marketing digital deve trabalhar oferta, público, conteúdo, funil, métricas, reputação, atendimento e uso responsável de dados pessoais.',
  vendas:
    'Atualização 2026: vendas profissionais dependem de diagnóstico, proposta de valor, negociação ética, pós-venda, indicadores e relacionamento com o cliente.',
  rh:
    'Atualização 2026: gestão de RH deve considerar recrutamento, integração, desenvolvimento, clima, indicadores, documentação e proteção de dados de candidatos e colaboradores.',
  excel:
    'Atualização 2026: planilhas devem ser aplicadas a cenários práticos com fórmulas, filtros, validação, gráficos, análise de dados e conferência para evitar decisões incorretas.',
  ecommerce:
    'Atualização 2026: loja virtual exige catálogo, meios de pagamento, logística, atendimento, indicadores, privacidade, segurança e política clara de trocas.',
  varejo:
    'Atualização 2026: rotinas de varejo combinam atendimento, caixa, estoque, prevenção de perdas, conferência, meios de pagamento e experiência do cliente.',
  caixa:
    'Atualização 2026: operador de caixa precisa dominar abertura, fechamento, conferência, sangria, recibos, meios de pagamento, postura e prevenção de fraudes.',
  redacao:
    'Atualização 2026: redação deve articular leitura crítica, planejamento, coesão, argumentação, revisão e adequação ao gênero textual e ao público.',
  enem:
    'Atualização 2026: preparação para o ENEM deve focar competências, resolução de problemas, interpretação, gestão de tempo, análise de dados e redação argumentativa.',
  portaria:
    'Atualização 2026: portaria exige controle de acesso, registro, comunicação, postura preventiva, atendimento, observação e respeito às normas internas.',
  beleza:
    'Atualização 2026: serviços de beleza exigem biossegurança, higiene, atendimento, análise prévia, materiais adequados, registro de preferência e limites de procedimento.',
  biosseguranca:
    'Atualização 2026: biossegurança inclui higiene das mãos, EPIs, limpeza, descarte adequado, prevenção de contaminação e condutas de segurança.',
  logistica:
    'Atualização 2026: logística deve abordar recebimento, armazenagem, separação, expedição, indicadores, rastreabilidade, tecnologia e melhoria contínua.',
  estoque:
    'Atualização 2026: gestão de estoque depende de cadastro, inventário, giro, validade, curva ABC, endereçamento, conferência e prevenção de perdas.',
  tecnologia:
    'Atualização 2026: tecnologia aplicada ao trabalho deve incluir segurança digital, produtividade, automação simples, organização de arquivos e uso ético de informações.',
  radiologia:
    'Atualização 2026: radiologia deve reforçar atualização profissional, radioproteção, posicionamento, qualidade de imagem, biossegurança e limites de atuação.',
  combustiveis:
    'Atualização 2026: atividades em postos exigem atendimento, segurança, EPIs, prevenção de incêndios, meio ambiente, conferência e procedimentos operacionais.',
  veterinario:
    'Atualização 2026: auxiliar veterinário deve atuar em manejo, contenção, higiene, apoio administrativo, biossegurança e encaminhamento sob responsabilidade do médico-veterinário.',
  eletricidade:
    'Atualização 2026: eletricidade exige noções de circuitos, ferramentas, medição, interpretação básica, prevenção de choque, bloqueio e respeito às normas técnicas.',
  nr10:
    'Atualização 2026: NR-10 trata de segurança em instalações e serviços com eletricidade, incluindo riscos, medidas de controle, documentação, EPIs e autorização.',
  digitacao:
    'Atualização 2026: digitação deve unir ergonomia, precisão, velocidade progressiva, atalhos, revisão e organização de documentos digitais.',
  maquinas:
    'Atualização 2026: operação de máquinas pesadas requer inspeção, checklist, sinalização, estabilidade, comunicação no pátio, manutenção preventiva e conduta segura.',
  bancario:
    'Atualização 2026: conhecimentos bancários devem abordar produtos, atendimento, segurança, prevenção a fraudes, canais digitais, crédito e organização financeira.',
  financeiro:
    'Atualização 2026: rotinas financeiras devem considerar documentos, contas a pagar e receber, faturamento, conciliação, impostos básicos e conferência de lançamentos.',
  imobiliario:
    'Atualização 2026: apoio ao corretor exige atendimento, documentação, prospecção, ética, contratos, noções legais e organização do funil de negociação.',
  oratoria:
    'Atualização 2026: oratória deve desenvolver estrutura de fala, controle emocional, clareza, linguagem corporal, escuta e adaptação ao público.',
  word:
    'Atualização 2026: edição de texto deve trabalhar formatação, revisão, estilos, tabelas, imagens, trabalhos escolares e documentos profissionais.',
  kids:
    'Atualização 2026: cursos kids devem ser lúdicos, seguros, progressivos, com cidadania digital, criatividade, acompanhamento e linguagem adequada à faixa etária.',
  'analises-clinicas':
    'Atualização 2026: análises clínicas devem reforçar coleta, identificação, biossegurança, preparo de amostras, qualidade, ética e apoio sob supervisão técnica.',
  inclusao:
    'Atualização 2026: mediação e apoio escolar devem priorizar inclusão, acessibilidade, comunicação com equipe pedagógica, registros e respeito ao plano educacional individualizado.',
};

function readEnv() {
  const envPath = path.join(rootDir, '.env.local');
  if (!existsSync(envPath)) return process.env;
  const env = { ...process.env };
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function resolveExistingSource(relativePath) {
  const direct = path.join(docsRoot, relativePath);
  if (existsSync(direct)) return direct;
  const normalizedTarget = normalizeForCompare(relativePath);
  const files = execFileSync('find', [docsRoot, '-type', 'f'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return files.find((file) => normalizeForCompare(path.relative(docsRoot, file)) === normalizedTarget);
}

function extractText(filePath) {
  if (!filePath) return '';
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.doc' || ext === '.docx') {
      return execFileSync('textutil', ['-stdout', '-convert', 'txt', filePath], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 16,
      });
    }
  } catch (error) {
    return `Falha ao extrair ${path.basename(filePath)}: ${error.message}`;
  }
  return '';
}

function normalizeForCompare(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeForCompare(value).replace(/\s+/g, '-');
}

function cleanText(value) {
  return value
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/FICHA DE INFORMAÇÕES DO CURSO[\s\S]{0,900}?Objetivos:/i, 'Objetivos:')
    .trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphsToHtml(paragraphs) {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
}

function generatedParagraphs(course) {
  const subject = course.title.toLowerCase();
  const base = [
    `O curso de ${course.title} apresenta fundamentos essenciais para atuação segura, ética e organizada na área de ${course.area}.`,
    'O estudante deve relacionar conceitos teóricos com situações reais de trabalho, observando comunicação, responsabilidade, registro adequado e respeito às normas aplicáveis.',
    'As aulas foram organizadas para apoiar estudo autônomo, revisão progressiva e aplicação prática dos conteúdos em contextos profissionais.',
  ];
  if (Array.isArray(course.researchNotes) && course.researchNotes.length) {
    base.push(...course.researchNotes);
  }
  if (course.tags.includes('bncc')) {
    base.push('Nos temas educacionais, o planejamento considera a BNCC, a avaliação formativa, a inclusão e a aprendizagem integral.');
  }
  if (course.tags.includes('lgpd')) {
    base.push('No uso de redes sociais, a privacidade, a proteção de dados pessoais e a transparência com o público devem orientar cada ação.');
  }
  if (course.tags.includes('nr11')) {
    base.push('Na operação com equipamentos, inspeções, treinamento e procedimentos preventivos reduzem riscos e preservam a integridade das pessoas.');
  }
  if (subject.includes('transporte')) {
    base.push('No transporte escolar, a legislação de trânsito e os cuidados com crianças e adolescentes são parte central da rotina.');
  }
  return base;
}

function isBoilerplateBlock(block) {
  const normalized = normalizeForCompare(block);
  if (!normalized) return true;
  if (
    normalized.includes('curso gratis')
    || normalized.includes('curso gratuito')
    || normalized.includes('voce nao pagara')
    || normalized.includes('certificado valido')
    || normalized.includes('nossos certificados')
    || normalized.includes('ficha de informacoes')
    || normalized.includes('embasamento legal')
    || normalized.includes('pre requisitos')
    || normalized.includes('apostila')
    || normalized.includes('hyperlink')
    || normalized.includes('conteudos programaticos')
    || normalized.includes('sumario')
    || normalized.includes('questionario de avaliacao')
    || normalized.includes('avaliacao vale nota')
  ) {
    return true;
  }
  const dotLeaders = (block.match(/\.{5,}/g) || []).length;
  if (dotLeaders >= 2) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length < 35;
}

function courseRoutineContext(course) {
  const tags = course.tags || [];
  if (tags.includes('saude') || tags.includes('farmacia') || tags.includes('idoso') || tags.includes('radiologia') || tags.includes('analises-clinicas')) {
    return 'rotinas de atendimento, biossegurança, acolhimento, registro de informações, comunicação com a equipe e respeito aos limites de atuação profissional';
  }
  if (tags.includes('administracao') || tags.includes('rh') || tags.includes('financeiro') || tags.includes('office') || tags.includes('bancario')) {
    return 'rotinas administrativas, organização de documentos, controles internos, atendimento, indicadores, conferência de dados e comunicação profissional';
  }
  if (tags.includes('marketing') || tags.includes('vendas') || tags.includes('ecommerce') || tags.includes('lgpd')) {
    return 'planejamento comercial, relacionamento com clientes, conteúdo, métricas, privacidade, atendimento digital e registro das ações realizadas';
  }
  if (tags.includes('bncc') || tags.includes('pedagogia') || tags.includes('matematica') || tags.includes('inclusao')) {
    return 'planejamento pedagógico, inclusão, avaliação, acompanhamento da aprendizagem, comunicação com família e equipe escolar e organização de registros';
  }
  if (tags.includes('seguranca') || tags.includes('nr11') || tags.includes('nr10') || tags.includes('maquinas') || tags.includes('transporte')) {
    return 'inspeções, checklists, normas de segurança, prevenção de riscos, comunicação operacional, uso de equipamentos e registro de ocorrências';
  }
  if (tags.includes('alimentacao')) {
    return 'higiene, boas práticas, organização do ambiente, manipulação segura, controle de validade, atendimento e prevenção de desperdícios';
  }
  return `rotinas profissionais da área de ${course.area}, com planejamento, segurança, comunicação, registro e melhoria contínua`;
}

function lessonPracticalExample(course, lessonTitle) {
  const tags = course.tags || [];
  if (tags.includes('saude') || tags.includes('farmacia') || tags.includes('analises-clinicas')) {
    return `Exemplo aplicado: ao trabalhar "${lessonTitle}", imagine uma situação de atendimento em que o profissional precisa acolher a pessoa, conferir dados, seguir normas de biossegurança, registrar a ocorrência e encaminhar corretamente aquilo que exige supervisão técnica.`;
  }
  if (tags.includes('radiologia')) {
    return `Exemplo aplicado: ao estudar "${lessonTitle}", pense no preparo do ambiente, na identificação do paciente, nos cuidados de radioproteção, no posicionamento adequado e na conferência da qualidade antes de finalizar o atendimento.`;
  }
  if (tags.includes('administracao') || tags.includes('rh') || tags.includes('financeiro')) {
    return `Exemplo aplicado: ao estudar "${lessonTitle}", acompanhe uma demanda administrativa desde a entrada da informação, conferência de documentos, registro no sistema, comunicação ao responsável e fechamento com evidências do que foi executado.`;
  }
  if (tags.includes('marketing') || tags.includes('vendas') || tags.includes('ecommerce')) {
    return `Exemplo aplicado: ao estudar "${lessonTitle}", monte uma pequena campanha ou atendimento simulado, definindo objetivo, público, mensagem, canal, métrica de acompanhamento e cuidado com dados pessoais do cliente.`;
  }
  if (tags.includes('bncc') || tags.includes('pedagogia') || tags.includes('inclusao')) {
    return `Exemplo aplicado: ao estudar "${lessonTitle}", transforme o conteúdo em uma situação de sala de aula ou apoio escolar, com objetivo claro, adaptação quando necessário, registro pedagógico e avaliação formativa.`;
  }
  if (tags.includes('seguranca') || tags.includes('nr11') || tags.includes('nr10') || tags.includes('maquinas')) {
    return `Exemplo aplicado: ao estudar "${lessonTitle}", simule uma atividade operacional com checklist inicial, identificação de riscos, comunicação com a equipe, execução segura e registro de qualquer não conformidade.`;
  }
  return `Exemplo aplicado: ao estudar "${lessonTitle}", observe uma situação real de trabalho, identifique o objetivo da tarefa, organize os recursos necessários, registre a execução e avalie o resultado obtido.`;
}

function buildGeneratedLessonParagraphs(course, lessonTitle, index, total) {
  const routine = courseRoutineContext(course);
  const updateNotes = (course.tags || []).map((tag) => sourceNotes[tag]).filter(Boolean).slice(0, 2);
  const researchNotes = Array.isArray(course.researchNotes) ? course.researchNotes.slice(0, 2) : [];
  const position = `${index + 1} de ${total}`;

  return [
    `Esta aula ${position} do curso de ${course.title} aprofunda o tema "${lessonTitle}" com foco em aplicação profissional. O objetivo é que o estudante entenda o conteúdo como parte de uma rotina real, e não apenas como uma definição isolada.`,
    `No contexto de ${course.area}, este tema se conecta diretamente a ${routine}. Por isso, a leitura deve considerar procedimentos, responsabilidades, limites de atuação e formas corretas de comunicação com alunos, clientes, pacientes, equipe, família ou supervisão, conforme a área do curso.`,
    `O primeiro ponto de estudo é reconhecer os conceitos essenciais do tema. Antes de executar qualquer atividade, o profissional precisa compreender o que deve ser feito, por que deve ser feito, quais riscos podem aparecer e quais registros comprovam que a rotina foi realizada com qualidade.`,
    `Na prática, "${lessonTitle}" exige organização. Separe informações, confira orientações, observe normas internas, use linguagem clara e mantenha atenção aos detalhes. Quando houver dúvida, a conduta adequada é registrar a situação e buscar orientação com o responsável técnico ou gestor imediato.`,
    `A comunicação profissional deve ser objetiva, respeitosa e documentada. Uma informação mal transmitida pode gerar erro, retrabalho ou insegurança. Por isso, utilize registros simples, padronizados e atualizados, preservando dados pessoais e evitando exposição desnecessária de informações sensíveis.`,
    `A ética aparece em todas as etapas da rotina. Ela envolve sigilo, responsabilidade, pontualidade, respeito às pessoas, cumprimento de normas e honestidade na comunicação de falhas. Um bom profissional reconhece limites e não assume tarefas que dependem de formação, autorização ou supervisão específica.`,
    lessonPracticalExample(course, lessonTitle),
    `Ao final desta aula, revise os termos principais, compare o conteúdo com situações do seu cotidiano e pense em uma ação concreta que poderia melhorar a execução da rotina. Essa reflexão ajuda a transformar o estudo em competência prática para o trabalho.`,
    ...researchNotes,
    ...updateNotes,
  ];
}

function getLessonBlueprint(course) {
  if (Array.isArray(course.lessonTopics) && course.lessonTopics.length) {
    return course.lessonTopics;
  }
  const common = [
    'Fundamentos e Contexto Profissional',
    'Ética, Legislação e Responsabilidades',
    'Rotinas, Registros e Comunicação',
    'Planejamento e Organização do Trabalho',
    'Práticas, Estudos de Caso e Avaliação',
  ];
  if (course.tags.includes('matematica')) {
    return [
      'Números, Operações e Resolução de Problemas',
      'Geometria, Medidas e Grandezas',
      'Estatística, Probabilidade e Leitura de Dados',
      'Metodologias de Ensino de Matemática',
      'Avaliação e Intervenção Pedagógica',
    ];
  }
  if (course.tags.includes('lgpd')) {
    return [
      'Planejamento de Presença Digital',
      'Conteúdo, Linguagem e Relacionamento',
      'Privacidade, LGPD e Segurança da Informação',
      'Métricas, Campanhas e Atendimento',
      'Boas Práticas e Gestão de Crises',
    ];
  }
  if (course.tags.includes('nr11')) {
    return [
      'Fundamentos da Operação de Empilhadeiras',
      'NR-11, NR-12 e Segurança Operacional',
      'Inspeção, Manutenção e Checklists',
      'Movimentação, Armazenagem e Sinalização',
      'Prevenção de Acidentes e Conduta Profissional',
    ];
  }
  if (course.tags.includes('transporte')) {
    return [
      'Legislação do Transporte Escolar',
      'Condutor, Veículo e Documentação',
      'Embarque, Desembarque e Segurança dos Estudantes',
      'Direção Defensiva e Prevenção de Riscos',
      'Comunicação com Escola, Família e Fiscalização',
    ];
  }
  return common;
}

function splitIntoLessons(course, rawText) {
  const cleaned = cleanText(rawText);
  const lessonTitles = getLessonBlueprint(course);
  const blocks = cleaned
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 80 && !/^prova\b/i.test(block) && !isBoilerplateBlock(block));

  const lessonCount = Math.min(Math.max(lessonTitles.length, 5), 8);
  const durationMinutes = Math.max(15, Math.round((course.hours * 60) / lessonCount));
  const durationHours = Math.max(4, Math.round(course.hours / lessonCount));
  const updateNotes = (course.tags || []).map((tag) => sourceNotes[tag]).filter(Boolean);

  if (blocks.length < 6) {
    return Array.from({ length: lessonCount }, (_, index) => {
      const lessonTitle = lessonTitles[index] ?? `Aula ${index + 1}`;
      const paragraphs = buildGeneratedLessonParagraphs(course, lessonTitle, index, lessonCount);
      return {
        id: `aula-${index + 1}`,
        titulo: lessonTitle,
        tipo: 'pagina',
        duracao: `${durationHours}h`,
        duracaoMinutos: durationMinutes,
        etapa: `Módulo ${Math.floor(index / 3) + 1}`,
        objetivos: [
          `Compreender os conceitos centrais de ${lessonTitle}.`,
          'Relacionar o conteúdo com situações reais da rotina profissional.',
          'Aplicar procedimentos com ética, registro e segurança.',
        ],
        textoHtml: paragraphsToHtml(paragraphs).slice(0, 12000),
      };
    });
  }

  const usableBlocks = blocks.slice(0, Math.max(18, lessonCount * 4));
  const sourceChunkSize = Math.ceil(usableBlocks.length / lessonCount);

  return Array.from({ length: lessonCount }, (_, index) => {
    const lessonTitle = lessonTitles[index] ?? `Aula ${index + 1}`;
    const paragraphs = usableBlocks.slice(index * sourceChunkSize, (index + 1) * sourceChunkSize);
    if (index === lessonCount - 1 && updateNotes.length) paragraphs.push(...updateNotes);
    if (!paragraphs.length) paragraphs.push(...buildGeneratedLessonParagraphs(course, lessonTitle, index, lessonCount));
    const finalParagraphs = paragraphsToHtml(paragraphs).length < 1800
      ? [...paragraphs, ...buildGeneratedLessonParagraphs(course, lessonTitle, index, lessonCount)]
      : paragraphs;
    return {
      id: `aula-${index + 1}`,
      titulo: lessonTitle,
      tipo: 'pagina',
      duracao: `${durationHours}h`,
      duracaoMinutos: durationMinutes,
      etapa: `Módulo ${Math.floor(index / 3) + 1}`,
      objetivos: [
        `Compreender os conceitos centrais de ${lessonTitle}.`,
        'Aplicar o conteúdo em situações práticas e profissionais.',
      ],
      textoHtml: paragraphsToHtml(finalParagraphs).slice(0, 12000),
    };
  });
}

function buildQuestions(course, lessons) {
  const generic = [
    ['Qual atitude demonstra postura ética no curso?', 'Registrar informações corretamente e respeitar normas da área.', 'Ignorar procedimentos para acelerar a rotina.', 'Compartilhar dados sem autorização.', 'Atuar sem planejamento.'],
    ['Por que o planejamento é importante?', 'Porque organiza objetivos, recursos, prazos e critérios de acompanhamento.', 'Porque substitui a avaliação.', 'Porque elimina a necessidade de registros.', 'Porque evita comunicação com a equipe.'],
    ['O que caracteriza uma avaliação formativa?', 'Acompanhamento contínuo com feedback e possibilidade de intervenção.', 'Uma prova sem retorno ao estudante.', 'Apenas a soma de faltas.', 'Registro informal sem critério.'],
    ['Qual prática melhora a segurança?', 'Seguir procedimentos, comunicar riscos e registrar ocorrências.', 'Improvisar soluções sem comunicar ninguém.', 'Omitir falhas para evitar retrabalho.', 'Reduzir checklists para ganhar tempo.'],
    ['Como lidar com informações pessoais?', 'Usar apenas o necessário, com finalidade clara e proteção adequada.', 'Divulgar para facilitar contato.', 'Guardar sem controle de acesso.', 'Publicar sempre que houver interesse.'],
    ['O que favorece aprendizagem autônoma?', 'Organização de estudo, revisão e aplicação prática.', 'Copiar respostas sem refletir.', 'Pular conteúdos introdutórios.', 'Estudar somente no dia da prova.'],
  ];
  const byTag = Array.isArray(course.questionBank) ? [...course.questionBank] : [];
  if (course.tags.includes('bncc')) {
    byTag.push(
      ['Na BNCC, o planejamento pedagógico deve considerar:', 'Competências, habilidades, contexto e desenvolvimento integral.', 'Somente memorização de conteúdos.', 'Apenas avaliações finais.', 'Atividades sem objetivos definidos.'],
      ['Na Educação Infantil, as práticas devem priorizar:', 'Experiências, interações, brincadeiras e direitos de aprendizagem.', 'Treinos repetitivos e sem ludicidade.', 'Provas classificatórias semanais.', 'Conteúdo sem relação com a criança.'],
    );
  }
  if (course.tags.includes('matematica')) {
    byTag.push(
      ['No ensino de Matemática, resolver problemas significa:', 'Mobilizar estratégias, justificar raciocínios e analisar resultados.', 'Aplicar fórmulas sem contexto.', 'Evitar discussão de erros.', 'Decorar respostas prontas.'],
      ['A leitura de dados contribui para:', 'Interpretar informações, comparar resultados e tomar decisões.', 'Eliminar raciocínio lógico.', 'Substituir toda prática matemática.', 'Trabalhar apenas cálculo mental.'],
    );
  }
  if (course.tags.includes('lgpd')) {
    byTag.push(
      ['Uma boa prática de LGPD em redes sociais é:', 'Definir finalidade e evitar exposição desnecessária de dados pessoais.', 'Publicar dados de clientes para gerar prova social.', 'Usar imagens sem autorização.', 'Guardar senhas em planilhas abertas.'],
      ['Métricas em redes sociais devem ser analisadas para:', 'Ajustar conteúdo, atendimento e comunicação com responsabilidade.', 'Comprar seguidores sem critério.', 'Ignorar comentários críticos.', 'Expor conversas privadas.'],
    );
  }
  if (course.tags.includes('nr11')) {
    byTag.push(
      ['Antes de operar uma empilhadeira, é necessário:', 'Ter treinamento, autorização e verificar condições do equipamento.', 'Começar a operar apenas observando colegas.', 'Dispensar inspeção diária.', 'Aumentar velocidade em áreas internas.'],
      ['A NR-12 contribui para:', 'Segurança em máquinas e equipamentos, incluindo proteção e procedimentos.', 'Eliminar treinamentos.', 'Autorizar operação sem manutenção.', 'Trocar inspeção por experiência.'],
    );
  }
  if (course.tags.includes('transporte')) {
    byTag.push(
      ['No transporte escolar, o condutor deve:', 'Cumprir regras de trânsito, zelar pela segurança e manter documentação regular.', 'Transportar acima da lotação se houver demanda.', 'Dispensar cinto em trajetos curtos.', 'Ignorar comunicação com a escola.'],
      ['O embarque e desembarque seguro exige:', 'Atenção, organização, conferência dos estudantes e prevenção de riscos.', 'Pressa acima da segurança.', 'Parada em qualquer local.', 'Ausência de orientação aos alunos.'],
    );
  }
  if (course.tags.includes('farmacia')) {
    byTag.push(
      ['Qual é o limite correto da atuação do atendente de farmácia?', 'Apoiar atendimento e organização sob supervisão farmacêutica.', 'Prescrever medicamentos.', 'Alterar receita médica.', 'Realizar diagnóstico clínico.'],
      ['Uma boa prática no estoque de medicamentos é:', 'Conferir validade, lote, armazenamento e organização.', 'Misturar produtos sem identificação.', 'Ignorar temperatura e validade.', 'Separar apenas por preço.'],
    );
  }
  if (course.tags.includes('idoso')) {
    byTag.push(
      ['No cuidado à pessoa idosa, uma prioridade é:', 'Preservar autonomia, segurança e dignidade.', 'Decidir tudo sem ouvir o idoso.', 'Omitir sinais de alerta.', 'Evitar registros de rotina.'],
      ['Para prevenir quedas, é recomendado:', 'Organizar ambiente, observar mobilidade e comunicar riscos.', 'Deixar tapetes soltos.', 'Reduzir iluminação.', 'Apressar deslocamentos.'],
    );
  }
  if (course.tags.includes('excel')) {
    byTag.push(
      ['Ao criar uma planilha de controle, o primeiro cuidado é:', 'Definir objetivo, campos, fórmulas e conferência dos dados.', 'Inserir fórmulas sem revisar.', 'Usar várias bases duplicadas.', 'Misturar formatos sem padrão.'],
      ['Filtros e validação de dados ajudam a:', 'Organizar informações e reduzir erros de lançamento.', 'Substituir todo raciocínio.', 'Eliminar backup.', 'Impedir análise.'],
    );
  }
  if (course.tags.includes('marketing')) {
    byTag.push(
      ['Uma campanha digital eficiente deve começar por:', 'Objetivo, público, oferta, canal e métrica de acompanhamento.', 'Postagens aleatórias sem meta.', 'Compra de seguidores.', 'Exposição de dados de clientes.'],
      ['No atendimento digital, uma boa prática é:', 'Responder com clareza, registrar demandas e respeitar privacidade.', 'Ignorar dúvidas recorrentes.', 'Usar dados sem finalidade.', 'Prometer resultados impossíveis.'],
    );
  }
  if (course.tags.includes('rh')) {
    byTag.push(
      ['Em recrutamento e seleção, é importante:', 'Definir perfil, critérios, etapas e registro adequado.', 'Escolher sem critérios.', 'Expor dados de candidatos.', 'Ignorar integração.'],
      ['Indicadores de RH servem para:', 'Acompanhar processos, clima, desempenho e desenvolvimento.', 'Substituir conversa com pessoas.', 'Eliminar documentação.', 'Justificar decisões sem análise.'],
    );
  }
  if (course.tags.includes('varejo') || course.tags.includes('caixa')) {
    byTag.push(
      ['No fechamento de caixa, o procedimento adequado é:', 'Conferir valores, comprovantes, sangrias e registrar divergências.', 'Ajustar valores sem registro.', 'Ignorar comprovantes.', 'Misturar dinheiro pessoal.'],
      ['Prevenção de perdas no varejo depende de:', 'Conferência, organização, observação e procedimentos claros.', 'Improviso constante.', 'Falta de controle de estoque.', 'Ausência de comunicação.'],
    );
  }
  if (course.tags.includes('logistica') || course.tags.includes('estoque')) {
    byTag.push(
      ['Um bom processo de armazenagem considera:', 'Endereçamento, identificação, giro, segurança e conferência.', 'Guardar tudo no local livre.', 'Dispensar inventário.', 'Ignorar validade.'],
      ['A curva ABC ajuda a:', 'Priorizar controle conforme importância e giro dos itens.', 'Eliminar cadastro.', 'Substituir segurança.', 'Desorganizar compras.'],
    );
  }
  if (course.tags.includes('nr10') || course.tags.includes('eletricidade')) {
    byTag.push(
      ['Antes de atuar com eletricidade, a conduta segura é:', 'Identificar riscos, usar EPIs, seguir procedimentos e bloquear energia quando aplicável.', 'Trabalhar energizado sem autorização.', 'Ignorar sinalização.', 'Dispensar ferramentas adequadas.'],
      ['A NR-10 reforça principalmente:', 'Segurança em instalações e serviços com eletricidade.', 'Apenas cálculo financeiro.', 'Marketing de serviços.', 'Rotinas escolares.'],
    );
  }
  if (course.tags.includes('maquinas')) {
    byTag.push(
      ['Antes de operar máquina pesada, deve-se:', 'Fazer checklist, verificar área, comunicação e condições do equipamento.', 'Iniciar sem inspeção.', 'Transportar pessoas em local inadequado.', 'Ignorar estabilidade do terreno.'],
      ['Sinalização em operação de máquinas serve para:', 'Reduzir riscos e orientar circulação segura.', 'Decorar o pátio.', 'Substituir treinamento.', 'Aumentar velocidade.'],
    );
  }
  if (course.tags.includes('beleza')) {
    byTag.push(
      ['Em serviços de beleza, biossegurança significa:', 'Higienizar, organizar materiais, usar EPIs e evitar contaminação.', 'Reutilizar materiais sem limpeza.', 'Ignorar alergias.', 'Dispensar orientação ao cliente.'],
      ['Antes de um procedimento estético, é importante:', 'Avaliar necessidade, explicar cuidados e respeitar limites técnicos.', 'Prometer resultado garantido.', 'Ignorar contraindicações.', 'Usar produto desconhecido.'],
    );
  }
  if (course.tags.includes('radiologia') || course.tags.includes('analises-clinicas')) {
    byTag.push(
      ['Em rotinas de diagnóstico, a identificação correta do paciente é:', 'Essencial para segurança, qualidade e rastreabilidade.', 'Opcional quando há pressa.', 'Substituída por memória.', 'Desnecessária em exames simples.'],
      ['Biossegurança em saúde envolve:', 'EPIs, higiene, descarte adequado e prevenção de contaminação.', 'Apenas limpeza visual.', 'Improviso de materiais.', 'Ausência de registro.'],
    );
  }
  if (course.tags.includes('redacao') || course.tags.includes('enem')) {
    byTag.push(
      ['Uma redação bem estruturada precisa de:', 'Tese, argumentos, coesão, repertório e conclusão coerente.', 'Frases soltas.', 'Cópia de textos.', 'Ausência de revisão.'],
      ['Na preparação para o ENEM, interpretar o enunciado é:', 'Parte central para escolher estratégia e evitar erros.', 'Desnecessário se souber fórmula.', 'Menos importante que decorar.', 'Algo feito após responder.'],
    );
  }
  if (course.tags.includes('bancario') || course.tags.includes('financeiro')) {
    byTag.push(
      ['Em rotinas financeiras, conciliação significa:', 'Comparar registros internos com documentos e extratos.', 'Lançar valores sem conferir.', 'Eliminar comprovantes.', 'Misturar contas pessoais e empresa.'],
      ['Na prevenção a fraudes, uma boa prática é:', 'Confirmar dados, proteger acessos e registrar operações.', 'Compartilhar senhas.', 'Clicar em links duvidosos.', 'Ignorar alertas do cliente.'],
    );
  }
  if (course.tags.includes('oratoria')) {
    byTag.push(
      ['Uma apresentação clara começa com:', 'Objetivo, estrutura, linguagem adequada e treino.', 'Improviso sem roteiro.', 'Leitura acelerada.', 'Falta de escuta do público.'],
      ['Controle emocional na fala pode ser melhorado com:', 'Preparação, respiração, prática e domínio do tema.', 'Evitar qualquer preparação.', 'Falar sem pausa.', 'Ignorar perguntas.'],
    );
  }

  const questions = [...byTag, ...generic].slice(0, MIN_QUESTIONS);
  while (questions.length < MIN_QUESTIONS) {
    const lesson = lessons[questions.length % lessons.length];
    questions.push([
      `Sobre "${lesson.titulo}", qual é a melhor conduta?`,
      'Relacionar teoria, prática, registro e responsabilidade profissional.',
      'Executar tarefas sem consultar orientações.',
      'Evitar registros para simplificar o trabalho.',
      'Desconsiderar normas e contexto.',
    ]);
  }

  return questions.map(([pergunta, correta, ...incorretas], index) => ({
    id: `q-${index + 1}`,
    pergunta,
    opcoes: [correta, ...incorretas],
    respostaCorreta: 0,
    explicacao: 'A alternativa correta valoriza planejamento, segurança, ética, registro e aplicação prática.',
  }));
}

function buildActivities(course, lessons, questions) {
  return lessons.slice(0, 4).map((lesson, index) => ({
    id: `atividade-${index + 1}`,
    titulo: `Atividade ${index + 1}: ${lesson.titulo}`,
    descricao: `Marque a alternativa correta sobre uma situação prática relacionada ao curso de ${course.title}.`,
    tipo: 'multipla_escolha',
    obrigatoria: true,
    etapaId: lesson.id,
    aulaId: lesson.id,
    enunciado: questions[index]?.pergunta || `Qual conduta se relaciona melhor com "${lesson.titulo}"?`,
    opcoes: questions[index]?.opcoes || [
      'Aplicar o conteúdo com planejamento, ética, registro e segurança.',
      'Ignorar procedimentos para acelerar a rotina.',
      'Executar tarefas sem observar o contexto.',
      'Deixar registros para depois sem critério.'
    ],
    respostaCorreta: questions[index]?.respostaCorreta ?? 0,
  }));
}

function buildEadConfig(course, lessons) {
  const questions = buildQuestions(course, lessons);
  const tempoMinimoMinutos = Math.max(15, Math.min(90, Math.round(course.hours * 0.2)));

  return {
    pagina: {
      chamada: `Formação EAD em ${course.title}`,
      subtitulo: `Curso online com certificado, ${course.hours} horas e avaliação final.`,
      publicoAlvo: `Estudantes e profissionais interessados em ${course.area}.`,
    },
    regras: {
      cargaHorariaTotal: course.hours,
      tempoMinimoMinutos,
      notaMinima: 70,
      liberarSequencialmente: true,
      exigirAtividades: true,
      exigirVideosConcluidos: true,
      liberarCertificadoAutomaticamente: true,
      intervaloReprovacaoHoras: RETRY_HOURS,
      minimoQuestoesProva: MIN_QUESTIONS,
      tentativasIlimitadas: true,
    },
    cronograma: lessons.map((lesson, index) => ({
      id: `modulo-${index + 1}`,
      titulo: lesson.titulo,
      descricao: `Estudo orientado: ${lesson.titulo}.`,
      ordem: index + 1,
      cargaHoraria: Math.max(4, Math.round(course.hours / lessons.length)),
      conteudos: [lesson.id],
    })),
    conteudos: lessons,
    atividades: buildActivities(course, lessons, questions),
    provas: [
      {
        id: 'prova-final',
        titulo: `Prova Final - ${course.title}`,
        descricao: 'Avaliação objetiva obrigatória para conclusão e emissão do certificado.',
        notaMinima: 70,
        tempoMinutos: 60,
        liberarAposConteudos: true,
        intervaloReprovacaoHoras: RETRY_HOURS,
        questoes: questions,
      },
    ],
    certificacao: {
      modelo: 'ead_padrao',
      emitirAutomatico: true,
      emitirAutomaticamente: true,
      minimoAproveitamento: 70,
      notaMinima: 70,
      cargaHoraria: course.hours,
      textoConclusao: 'Certificado liberado após conclusão dos conteúdos e aprovação na prova final.',
    },
  };
}

const thematicCoverSources = {
  'Auxiliar de Creche': 'superior-pedagogia.webp',
  'Educação Social na Adolescência': 'superior-servico-social.webp',
  'Metodologias Ativas para o Professor': 'especializacao-educacao-especial-inclusiva.webp',
  'Educação Física Escolar': 'superior-educacao-fisica.webp',
  'Introdução à Nutrição': 'superior-nutricao.webp',
  'Secretariado Escolar': 'livre-auxiliar-administrativo.webp',
  'Educação e Gestão Escolar': 'superior-gestao-publica.webp',
  'Monitor Escolar de Classe - Auxiliar do Regente': 'superior-pedagogia.webp',
  'Redes Sociais': 'superior-ciencia-computacao.webp',
  'Serviços Sociais Básico': 'superior-servico-social.webp',
  'Operador de Empilhadeira': 'superior-logistica.webp',
  'Educação nas Mudanças da Sociedade': 'superior-letras.webp',
  Oficineiro: 'especializacao-educacao-especial-inclusiva.webp',
  'Matemática Infantil': 'superior-pedagogia.webp',
  'Matemática Básica': 'superior-ciencia-computacao.webp',
  'Matemática EJA': 'superior-administracao-empresas.webp',
  'Porteiro e Vigia': 'tecnico-seguranca-trabalho.webp',
  'Condutor de Transporte Escolar': 'superior-logistica.webp',
  'Auxiliar de Cozinha': 'superior-nutricao.webp',
  'Acolhimento e Segurança no Retorno às Aulas': 'tecnico-seguranca-trabalho.webp',
  'Aperfeiçoamento em Educação Interdimensional': 'superior-pedagogia.webp',
  'Agente Comunitário de Saúde': 'superior-gestao-saude-publica.webp',
  'Auxiliar Administrativo': 'livre-auxiliar-administrativo.webp',
  'Atendente de Farmácia': 'superior-farmacia.webp',
  'Marketing Digital': 'superior-ciencia-computacao.webp',
  'Cuidador de Idoso': 'superior-gestao-saude-publica.webp',
  'Gestão em RH': 'superior-administracao-empresas.webp',
  'Excel Básico e Avançado': 'livre-excel-avancado-negocios.webp',
  'Instagram para Vendas': 'superior-ciencia-computacao.webp',
  Telemarketing: 'livre-auxiliar-administrativo.webp',
  'Criação de Loja Virtual': 'superior-ciencia-computacao.webp',
  'Operador de Caixa': 'superior-gestao-financeira.webp',
  'Técnicas de Redação': 'superior-letras.webp',
  'Matemática para Enem': 'superior-ciencia-computacao.webp',
  'Agente de Portaria': 'tecnico-seguranca-trabalho.webp',
  'Designer de Cílios e Sobrancelha': 'superior-terapia-ocupacional.webp',
  Almoxarifado: 'superior-logistica.webp',
  'Logística 4.0': 'superior-logistica.webp',
  'Atualização em Radiologia': 'tecnico-radiologia.webp',
  Frentista: 'tecnico-seguranca-trabalho.webp',
  'Auxiliar de Veterinário': 'superior-terapia-ocupacional.webp',
  Eletricista: 'tecnico-seguranca-trabalho.webp',
  'NR-10': 'tecnico-seguranca-trabalho.webp',
  'Digitação Interativa': 'livre-informatica-basica.webp',
  'Fiscal de Loja': 'superior-gestao-financeira.webp',
  'Pá Carregadeira': 'superior-logistica.webp',
  Retroescavadeira: 'superior-logistica.webp',
  'Conhecimentos Bancários': 'superior-gestao-financeira.webp',
  'Manicure e Pedicure': 'superior-terapia-ocupacional.webp',
  'Barbeiro Profissional': 'superior-terapia-ocupacional.webp',
  'Mediador Escolar (Monitor Escolar)': 'superior-pedagogia.webp',
  'Análises Clínicas': 'tecnico-analises-clinicas.webp',
  Oratória: 'superior-letras.webp',
  'Auxiliar Corretor de Imóveis': 'superior-administracao-empresas.webp',
  'Estoque e Faturamento': 'superior-gestao-financeira.webp',
  'Auxiliar Pedagógico': 'superior-pedagogia.webp',
  'Excel Kids': 'livre-informatica-basica.webp',
  'Word Kids': 'livre-informatica-basica.webp',
};

function coverSourceForCourse(course) {
  const fallbackByArea = {
    Educação: 'superior-pedagogia.webp',
    'Educação Social': 'superior-servico-social.webp',
    'Educação Física': 'superior-educacao-fisica.webp',
    Saúde: 'superior-gestao-saude-publica.webp',
    'Administração Escolar': 'livre-auxiliar-administrativo.webp',
    'Gestão Escolar': 'superior-gestao-publica.webp',
    'Comunicação Digital': 'superior-ciencia-computacao.webp',
    'Serviço Social': 'superior-servico-social.webp',
    'Segurança Operacional': 'superior-logistica.webp',
    Matemática: 'superior-ciencia-computacao.webp',
    'Segurança Patrimonial': 'tecnico-seguranca-trabalho.webp',
    'Transporte Escolar': 'superior-logistica.webp',
    Alimentação: 'superior-nutricao.webp',
    'Administração e Gestão': 'superior-administracao-empresas.webp',
    'Saúde e Atendimento': 'superior-farmacia.webp',
    'Saúde e Cuidado': 'superior-gestao-saude-publica.webp',
    'Tecnologia e Produtividade': 'livre-informatica-basica.webp',
    'Tecnologia e Vendas': 'superior-ciencia-computacao.webp',
    'Atendimento e Vendas': 'livre-auxiliar-administrativo.webp',
    'Comércio e Varejo': 'superior-gestao-financeira.webp',
    'Comunicação e Linguagens': 'superior-letras.webp',
    'Beleza e Estética': 'superior-terapia-ocupacional.webp',
    'Logística e Operações': 'superior-logistica.webp',
    'Saúde e Diagnóstico': 'tecnico-analises-clinicas.webp',
    'Comércio e Segurança': 'tecnico-seguranca-trabalho.webp',
    'Saúde Animal': 'superior-terapia-ocupacional.webp',
    'Elétrica e Segurança': 'tecnico-seguranca-trabalho.webp',
    'Segurança do Trabalho': 'tecnico-seguranca-trabalho.webp',
    'Máquinas Pesadas': 'superior-logistica.webp',
    'Finanças e Bancos': 'superior-gestao-financeira.webp',
    'Educação Inclusiva': 'superior-pedagogia.webp',
    'Negócios e Vendas': 'superior-administracao-empresas.webp',
    'Administração e Operações': 'superior-gestao-financeira.webp',
    'Tecnologia Kids': 'livre-informatica-basica.webp',
  };
  const fileName = thematicCoverSources[course.title] ?? fallbackByArea[course.area] ?? 'superior-pedagogia.webp';
  const sourcePath = path.join(rootDir, 'public', 'course-covers', fileName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Capa base nao encontrada: ${fileName}`);
  }
  return sourcePath;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

const coverThemes = {
  'Administração e Gestão': ['#12315f', '#2f80ed', '#b8d8ff'],
  Educação: ['#0d5f73', '#23b8a9', '#d8fbf6'],
  Saúde: ['#0f766e', '#22c55e', '#dcfce7'],
  'Tecnologia e Comunicação': ['#4f46e5', '#06b6d4', '#e0e7ff'],
  'Comércio e Vendas': ['#7c3aed', '#f59e0b', '#fef3c7'],
  'Segurança e Operações': ['#334155', '#f97316', '#ffedd5'],
  'Beleza e Bem-estar': ['#be185d', '#f472b6', '#fce7f3'],
  'Serviços e Finanças': ['#065f46', '#14b8a6', '#ccfbf1'],
};

const courseVisuals = [
  { match: /corretor|im[oó]veis/, type: 'realEstate', palette: ['#0f3d5e', '#22c55e', '#dcfce7'] },
  { match: /fiscal de loja/, type: 'storeSecurity', palette: ['#1f2937', '#f59e0b', '#fef3c7'] },
  { match: /operador de caixa/, type: 'cashier', palette: ['#075985', '#06b6d4', '#cffafe'] },
  { match: /auxiliar administrativo/, type: 'officeAdmin', palette: ['#12315f', '#2f80ed', '#dbeafe'] },
  { match: /estoque|faturamento/, type: 'inventoryInvoice', palette: ['#334155', '#14b8a6', '#ccfbf1'] },
  { match: /gest[aã]o em rh|recursos humanos/, type: 'hrPeople', palette: ['#4f46e5', '#8b5cf6', '#ede9fe'] },
  { match: /almoxarifado/, type: 'warehouse', palette: ['#365314', '#84cc16', '#ecfccb'] },
  { match: /log[ií]stica/, type: 'logistics', palette: ['#0f172a', '#f97316', '#ffedd5'] },
  { match: /marketing digital/, type: 'digitalMarketing', palette: ['#6d28d9', '#ec4899', '#fce7f3'] },
  { match: /instagram/, type: 'socialSales', palette: ['#be185d', '#f97316', '#ffedd5'] },
  { match: /loja virtual/, type: 'onlineStore', palette: ['#0f766e', '#06b6d4', '#ccfbf1'] },
  { match: /telemarketing/, type: 'headset', palette: ['#1d4ed8', '#38bdf8', '#dbeafe'] },
  { match: /redes sociais/, type: 'socialNetwork', palette: ['#4f46e5', '#06b6d4', '#e0e7ff'] },
  { match: /orat[oó]ria/, type: 'microphone', palette: ['#7c2d12', '#fb923c', '#ffedd5'] },
  { match: /reda[cç][aã]o/, type: 'writing', palette: ['#4338ca', '#22c55e', '#dcfce7'] },
  { match: /excel/, type: 'spreadsheet', palette: ['#166534', '#22c55e', '#dcfce7'] },
  { match: /word/, type: 'document', palette: ['#1d4ed8', '#60a5fa', '#dbeafe'] },
  { match: /digita[cç][aã]o/, type: 'keyboard', palette: ['#0f172a', '#38bdf8', '#cffafe'] },
  { match: /creche/, type: 'childCare', palette: ['#0d9488', '#f59e0b', '#fef3c7'] },
  { match: /pedag[oó]gico|pedagogia/, type: 'teacherBoard', palette: ['#047857', '#22c55e', '#dcfce7'] },
  { match: /secretariado escolar|gest[aã]o escolar/, type: 'schoolDesk', palette: ['#0f766e', '#38bdf8', '#ccfbf1'] },
  { match: /mediador escolar|monitor escolar|educa[cç][aã]o inclusiva|especial/, type: 'inclusiveClass', palette: ['#6d28d9', '#a78bfa', '#ede9fe'] },
  { match: /educa[cç][aã]o f[ií]sica/, type: 'sports', palette: ['#047857', '#f97316', '#ffedd5'] },
  { match: /matem[aá]tica|enem/, type: 'math', palette: ['#1d4ed8', '#f59e0b', '#fef3c7'] },
  { match: /metodologias ativas/, type: 'activeLearning', palette: ['#0f766e', '#8b5cf6', '#ede9fe'] },
  { match: /farm[aá]cia/, type: 'pharmacy', palette: ['#0f766e', '#22c55e', '#dcfce7'] },
  { match: /idoso|cuidador/, type: 'elderCare', palette: ['#9a3412', '#fb923c', '#ffedd5'] },
  { match: /radiologia/, type: 'xray', palette: ['#0f172a', '#22d3ee', '#cffafe'] },
  { match: /veterin[aá]rio/, type: 'veterinary', palette: ['#166534', '#84cc16', '#ecfccb'] },
  { match: /an[aá]lises cl[ií]nicas/, type: 'lab', palette: ['#0f766e', '#14b8a6', '#ccfbf1'] },
  { match: /nutri[cç][aã]o/, type: 'nutrition', palette: ['#15803d', '#f59e0b', '#fef3c7'] },
  { match: /agente comunit[aá]rio/, type: 'communityHealth', palette: ['#0f766e', '#60a5fa', '#dbeafe'] },
  { match: /empilhadeira/, type: 'forklift', palette: ['#7c2d12', '#f97316', '#ffedd5'] },
  { match: /p[aá] carregadeira/, type: 'loader', palette: ['#713f12', '#eab308', '#fef9c3'] },
  { match: /retroescavadeira/, type: 'excavator', palette: ['#7c2d12', '#f59e0b', '#fef3c7'] },
  { match: /eletricista|nr-10/, type: 'electric', palette: ['#1e3a8a', '#facc15', '#fef9c3'] },
  { match: /portaria|porteiro|vigia|agente de portaria/, type: 'securityGate', palette: ['#1f2937', '#22c55e', '#dcfce7'] },
  { match: /frentista/, type: 'fuelStation', palette: ['#991b1b', '#f97316', '#ffedd5'] },
  { match: /transporte escolar|condutor/, type: 'schoolBus', palette: ['#713f12', '#facc15', '#fef9c3'] },
  { match: /barbeiro/, type: 'barber', palette: ['#831843', '#f472b6', '#fce7f3'] },
  { match: /c[ií]lios|sobrancelha/, type: 'lashes', palette: ['#9d174d', '#f0abfc', '#fae8ff'] },
  { match: /manicure|pedicure/, type: 'nails', palette: ['#be185d', '#fb7185', '#ffe4e6'] },
  { match: /banc[aá]rios/, type: 'banking', palette: ['#065f46', '#14b8a6', '#ccfbf1'] },
  { match: /cozinha/, type: 'cooking', palette: ['#9a3412', '#f59e0b', '#fef3c7'] },
  { match: /servi[cç]os sociais|servi[cç]o social/, type: 'socialCare', palette: ['#0f766e', '#22c55e', '#dcfce7'] },
];

function visualForCourse(course) {
  const text = `${course.title} ${course.area || ''} ${(course.tags || []).join(' ')}`.toLowerCase();
  return courseVisuals.find((visual) => visual.match.test(text)) || {
    type: 'courseNotebook',
    palette: coverThemes[normalizeCourseArea(course.area, course.title, course.tags)] || coverThemes['Administração e Gestão'],
  };
}

function themedCourseIcon(type, palette, seed) {
  const [dark, accent] = palette;
  const drift = seed % 22;
  const common = {
    paper: `<rect x="700" y="132" width="260" height="300" rx="28" fill="white" opacity=".86"/>
      <path d="M742 206h160M742 252h120M742 298h146M742 344h96" stroke="${dark}" stroke-width="16" stroke-linecap="round" opacity=".84"/>`,
    person: `<circle cx="822" cy="176" r="42" fill="white" opacity=".88"/>
      <path d="M738 360c20-76 148-76 168 0" fill="none" stroke="white" stroke-width="34" stroke-linecap="round" opacity=".82"/>`,
  };
  const icons = {
    realEstate: `<path d="M710 284l132-112 132 112v132H710V284Z" fill="white" opacity=".88"/>
      <path d="M778 414V310h80v104M842 172l132 112M842 172L710 284" stroke="${dark}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="966" cy="192" r="34" fill="${accent}"/><path d="M966 226v86m0-42h54m-54 24h34" stroke="white" stroke-width="14" stroke-linecap="round"/>`,
    storeSecurity: `<path d="M842 130l118 42v86c0 82-50 132-118 162-68-30-118-80-118-162v-86l118-42Z" fill="white" opacity=".88"/>
      <rect x="772" y="226" width="140" height="92" rx="18" fill="${accent}" opacity=".9"/><circle cx="842" cy="272" r="26" fill="white"/>
      <path d="M792 226l22-44h56l22 44" stroke="${dark}" stroke-width="14" fill="none" stroke-linecap="round"/>`,
    cashier: `<rect x="716" y="188" width="260" height="190" rx="28" fill="white" opacity=".9"/>
      <rect x="764" y="132" width="162" height="78" rx="18" fill="${accent}" opacity=".9"/>
      <path d="M760 280h170M782 322h28M834 322h28M886 322h28" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <path d="M796 164h96" stroke="white" stroke-width="14" stroke-linecap="round"/>`,
    officeAdmin: `${common.paper}<path d="M742 404h172" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>
      <path d="M738 162h62v52h-62Z" fill="${accent}" opacity=".85"/>`,
    inventoryInvoice: `<rect x="704" y="226" width="112" height="112" rx="18" fill="white" opacity=".88"/><rect x="836" y="168" width="112" height="170" rx="18" fill="white" opacity=".88"/>
      <path d="M724 252h72M724 286h72M856 206h72M856 244h56M856 282h72" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>
      <path d="M718 388h238" stroke="${accent}" stroke-width="24" stroke-linecap="round"/>`,
    hrPeople: `<circle cx="760" cy="202" r="40" fill="white" opacity=".9"/><circle cx="862" cy="176" r="48" fill="white" opacity=".82"/><circle cx="962" cy="212" r="38" fill="white" opacity=".9"/>
      <path d="M690 372c22-74 118-74 140 0M770 390c28-92 156-92 184 0M900 372c22-74 114-74 136 0" fill="none" stroke="${dark}" stroke-width="20" stroke-linecap="round" opacity=".74"/>`,
    warehouse: `<rect x="700" y="192" width="290" height="196" rx="18" fill="white" opacity=".88"/>
      <path d="M724 192l120-70 122 70M758 388V260h62v128M870 388V260h62v128M714 236h264" stroke="${dark}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M748 320h210" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
    logistics: `<rect x="704" y="230" width="218" height="96" rx="18" fill="white" opacity=".9"/><path d="M922 258h76l42 68v52H704v-52" fill="white" opacity=".76"/>
      <circle cx="774" cy="386" r="30" fill="${dark}"/><circle cx="984" cy="386" r="30" fill="${dark}"/><path d="M742 272h112" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
    digitalMarketing: `<rect x="710" y="146" width="250" height="210" rx="30" fill="white" opacity=".88"/><path d="M770 292l54-46 44 30 62-84" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="764" cy="198" r="24" fill="${dark}" opacity=".78"/><path d="M760 398h154" stroke="${dark}" stroke-width="20" stroke-linecap="round"/>`,
    socialSales: `<rect x="728" y="152" width="224" height="288" rx="46" fill="white" opacity=".88"/><circle cx="840" cy="282" r="58" fill="${accent}" opacity=".92"/>
      <path d="M812 282h56M840 254v56M782 398h116" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>`,
    onlineStore: `<rect x="706" y="174" width="274" height="206" rx="28" fill="white" opacity=".88"/><path d="M746 226h194l-20 92H772l-26-92Z" fill="${accent}" opacity=".86"/>
      <path d="M778 226l24-48h88l32 48M794 350h.1M902 350h.1" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>`,
    headset: `${common.person}<path d="M770 176c0-54 104-54 104 0v46c0 42-34 68-74 68" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
      <rect x="730" y="178" width="30" height="74" rx="14" fill="${dark}"/><rect x="884" y="178" width="30" height="74" rx="14" fill="${dark}"/>`,
    socialNetwork: `<circle cx="752" cy="220" r="42" fill="white" opacity=".9"/><circle cx="936" cy="204" r="48" fill="white" opacity=".9"/><circle cx="850" cy="360" r="52" fill="white" opacity=".86"/>
      <path d="M790 232l104-22M780 252l52 76M900 238l-34 82" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>`,
    microphone: `<rect x="790" y="132" width="100" height="182" rx="50" fill="white" opacity=".9"/><path d="M740 250c0 72 42 116 100 116s100-44 100-116M840 366v64M780 430h120" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>`,
    writing: `${common.paper}<path d="M824 390l112-112 38 38-112 112-58 20 20-58Z" fill="${accent}" opacity=".92"/>`,
    spreadsheet: `<rect x="700" y="142" width="294" height="258" rx="28" fill="white" opacity=".9"/>
      <path d="M740 210h214M740 272h214M740 334h214M812 162v220M884 162v220" stroke="${dark}" stroke-width="12" stroke-linecap="round" opacity=".78"/>
      <path d="M740 162h214" stroke="${accent}" stroke-width="24" stroke-linecap="round"/>`,
    document: `${common.paper}<path d="M804 156v88h88" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`,
    keyboard: `<rect x="700" y="206" width="306" height="162" rx="28" fill="white" opacity=".9"/>
      <path d="M740 250h32M806 250h32M872 250h32M938 250h32M740 306h230" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>`,
    childCare: `<circle cx="782" cy="198" r="44" fill="white" opacity=".9"/><circle cx="920" cy="200" r="40" fill="white" opacity=".84"/>
      <path d="M714 374c18-76 118-76 136 0M860 374c18-70 112-70 130 0" fill="none" stroke="${dark}" stroke-width="20" stroke-linecap="round"/>
      <path d="M788 300l58-56 56 56-56 56-58-56Z" fill="${accent}" opacity=".9"/>`,
    teacherBoard: `<rect x="700" y="156" width="306" height="190" rx="24" fill="white" opacity=".88"/><path d="M746 216h214M746 268h146" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <circle cx="760" cy="404" r="36" fill="${accent}"/><path d="M812 408h142" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>`,
    schoolDesk: `${common.paper}<path d="M698 432h310M746 432v-64M960 432v-64" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <rect x="786" y="124" width="92" height="70" rx="14" fill="${accent}" opacity=".88"/>`,
    inclusiveClass: `<circle cx="764" cy="206" r="38" fill="white" opacity=".9"/><circle cx="900" cy="192" r="44" fill="white" opacity=".84"/>
      <path d="M722 358h126l44 54 46-118h82" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M700 414h310" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>`,
    sports: `<circle cx="824" cy="260" r="86" fill="white" opacity=".9"/><path d="M768 206c42 46 86 86 142 112M742 276c62-20 118-54 164-116" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>
      <path d="M704 410c94-34 196-34 306 0" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>`,
    math: `<rect x="700" y="156" width="292" height="220" rx="30" fill="white" opacity=".9"/>
      <path d="M752 222h58M780 192v58M862 206l70 70M932 206l-70 70M754 324h178" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>
      <circle cx="940" cy="154" r="34" fill="${accent}" opacity=".85"/>`,
    activeLearning: `<path d="M710 282l126-104 126 104-126 104-126-104Z" fill="white" opacity=".88"/>
      <path d="M836 178v208M766 282h140" stroke="${dark}" stroke-width="16" stroke-linecap="round"/><circle cx="972" cy="364" r="44" fill="${accent}" opacity=".9"/>`,
    pharmacy: `<rect x="760" y="150" width="170" height="220" rx="40" fill="white" opacity=".9"/><path d="M845 198v124M784 260h124" stroke="${dark}" stroke-width="22" stroke-linecap="round"/>
      <path d="M714 414h266" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>`,
    elderCare: `<circle cx="806" cy="196" r="42" fill="white" opacity=".9"/><path d="M734 372c24-86 122-88 150-6M898 228v184M898 306h76" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>
      <path d="M790 276c64 58 126 58 186 0" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
    xray: `<rect x="728" y="132" width="230" height="300" rx="28" fill="white" opacity=".88"/><path d="M844 188v166M798 240c40 18 52 18 92 0M798 302c40-18 52-18 92 0" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>
      <circle cx="844" cy="188" r="28" fill="${accent}"/>`,
    veterinary: `<path d="M740 350c-26-74 50-128 102-72 52-56 128-2 102 72-20 58-102 86-102 86s-82-28-102-86Z" fill="white" opacity=".9"/>
      <circle cx="770" cy="214" r="24" fill="${accent}"/><circle cx="828" cy="186" r="28" fill="${accent}"/><circle cx="892" cy="186" r="28" fill="${accent}"/><circle cx="950" cy="214" r="24" fill="${accent}"/>`,
    lab: `<path d="M782 142h128M812 142v94l-78 142c-16 30 4 66 38 66h148c34 0 54-36 38-66l-78-142v-94" fill="white" opacity=".9" stroke="${dark}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M770 360h152" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>`,
    nutrition: `<path d="M824 182c76-54 156 10 118 98-34 78-118 126-118 126s-84-48-118-126c-38-88 42-152 118-98Z" fill="white" opacity=".88"/>
      <path d="M850 180c28-52 72-70 132-56" stroke="${dark}" stroke-width="16" stroke-linecap="round"/><circle cx="774" cy="260" r="22" fill="${accent}"/>`,
    communityHealth: `<path d="M842 142l128 74v146l-128 74-128-74V216l128-74Z" fill="white" opacity=".88"/>
      <path d="M842 220v112M786 276h112" stroke="${dark}" stroke-width="22" stroke-linecap="round"/><path d="M724 410c82-38 164-38 246 0" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
    forklift: `<path d="M716 314h162v56H716zM878 238h64v132h-64zM942 168v202M990 168v202" fill="none" stroke="${dark}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="760" cy="392" r="30" fill="${accent}"/><circle cx="884" cy="392" r="30" fill="${accent}"/><rect x="730" y="230" width="92" height="70" rx="16" fill="white" opacity=".86"/>`,
    loader: `<path d="M700 346h170l82-78h62v78l-94 58H700z" fill="white" opacity=".9"/><circle cx="762" cy="420" r="34" fill="${dark}"/><circle cx="918" cy="420" r="34" fill="${dark}"/>
      <path d="M952 268l86-38v54l-86 38" stroke="${accent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`,
    excavator: `<path d="M700 356h208v66H700z" fill="white" opacity=".9"/><circle cx="760" cy="436" r="30" fill="${dark}"/><circle cx="866" cy="436" r="30" fill="${dark}"/>
      <path d="M908 356l74-102 92 50-54 70" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`,
    electric: `<path d="M858 126l-130 190h96l-50 142 160-210h-102l26-122Z" fill="white" opacity=".9" stroke="${dark}" stroke-width="14" stroke-linejoin="round"/>
      <circle cx="960" cy="366" r="42" fill="${accent}" opacity=".88"/>`,
    securityGate: `<rect x="736" y="176" width="218" height="238" rx="28" fill="white" opacity=".9"/><path d="M790 414V250h110v164M736 250h218" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>
      <circle cx="846" cy="214" r="32" fill="${accent}"/>`,
    fuelStation: `<rect x="742" y="154" width="166" height="250" rx="26" fill="white" opacity=".9"/><path d="M784 202h82v72h-82zM908 214h44l34 54v112c0 22-34 22-34 0v-70" stroke="${dark}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M764 404h188" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>`,
    schoolBus: `<rect x="704" y="216" width="304" height="138" rx="24" fill="white" opacity=".9"/><path d="M744 250h70M838 250h70M932 250h40M736 354h250" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <circle cx="770" cy="374" r="28" fill="${accent}"/><circle cx="938" cy="374" r="28" fill="${accent}"/>`,
    barber: `<path d="M770 178l174 174M944 178L770 352" stroke="${dark}" stroke-width="18" stroke-linecap="round"/><circle cx="748" cy="154" r="34" fill="white" opacity=".9"/><circle cx="968" cy="154" r="34" fill="white" opacity=".9"/>
      <rect x="812" y="384" width="112" height="34" rx="17" fill="${accent}"/>`,
    lashes: `<path d="M714 280c86-82 192-82 278 0-86 82-192 82-278 0Z" fill="white" opacity=".9"/>
      <circle cx="854" cy="280" r="44" fill="${accent}" opacity=".85"/><path d="M734 250l-34-34M784 232l-18-48M844 226v-58M904 232l18-48M954 250l34-34" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>`,
    nails: `<path d="M752 198c34-44 86-30 86 24v132c0 44-34 80-76 80h-28V248c0-18 6-36 18-50Z" fill="white" opacity=".9"/>
      <path d="M874 178c34-44 86-30 86 24v132c0 44-34 80-76 80h-28V228c0-18 6-36 18-50Z" fill="white" opacity=".78"/>
      <path d="M734 330h224" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>`,
    banking: `<path d="M702 236h304l-152-86-152 86Z" fill="white" opacity=".9"/><path d="M746 236v146M822 236v146M898 236v146M974 236v146M720 382h268" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <circle cx="854" cy="174" r="28" fill="${accent}"/>`,
    cooking: `<path d="M718 262h250v44c0 78-62 140-140 140s-140-62-140-140v-44h30Z" fill="white" opacity=".9"/>
      <path d="M760 224c-24-52 56-70 70-22 18-54 108-36 84 22" fill="none" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <path d="M724 306h236" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
    socialCare: `<path d="M842 406s-138-78-138-174c0-82 96-114 138-44 42-70 138-38 138 44 0 96-138 174-138 174Z" fill="white" opacity=".9"/>
      <path d="M842 214v100M792 264h100" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>`,
    courseNotebook: `<rect x="718" y="142" width="244" height="300" rx="26" fill="white" opacity=".9"/><path d="M774 200h132M774 250h104M774 300h132M774 350h86" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
      <path d="M718 190h-28M718 250h-28M718 310h-28M718 370h-28" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
  };
  return `<g transform="translate(${drift - 11} 0)">${icons[type] || icons.courseNotebook}</g>`;
}

function coverIconSvg(area, seed) {
  const offset = seed % 18;
  const icons = {
    'Administração e Gestão': `
      <rect x="724" y="156" width="236" height="152" rx="24" fill="white" opacity=".82"/>
      <path d="M768 252h148M768 214h118M768 176h84" stroke="#12315f" stroke-width="18" stroke-linecap="round"/>
      <path d="M754 324l52-58 48 34 80-102" fill="none" stroke="#2f80ed" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    Educação: `
      <path d="M704 198c90-46 176-46 266 0v154c-90-46-176-46-266 0V198Z" fill="white" opacity=".84"/>
      <path d="M704 198v154M970 198v154M746 234h78M746 272h116M746 310h88" stroke="#0d5f73" stroke-width="16" stroke-linecap="round"/>
      <circle cx="${868 + offset}" cy="164" r="38" fill="#23b8a9" opacity=".8"/>
    `,
    Saúde: `
      <rect x="754" y="138" width="164" height="164" rx="36" fill="white" opacity=".86"/>
      <path d="M836 178v84M794 220h84" stroke="#0f766e" stroke-width="24" stroke-linecap="round"/>
      <path d="M724 340c48-68 112-68 160 0 42-56 94-56 136 0" fill="none" stroke="#22c55e" stroke-width="18" stroke-linecap="round"/>
    `,
    'Tecnologia e Comunicação': `
      <rect x="714" y="150" width="260" height="164" rx="26" fill="white" opacity=".84"/>
      <path d="M748 284h192M800 344h88M844 314v30" stroke="#4f46e5" stroke-width="18" stroke-linecap="round"/>
      <circle cx="780" cy="212" r="22" fill="#06b6d4"/>
      <circle cx="844" cy="212" r="22" fill="#06b6d4" opacity=".75"/>
      <circle cx="908" cy="212" r="22" fill="#06b6d4" opacity=".5"/>
    `,
    'Comércio e Vendas': `
      <path d="M732 214h226l-24 118H768l-36-118Z" fill="white" opacity=".86"/>
      <path d="M760 214l28-62h126l38 62M790 374h.1M910 374h.1" stroke="#7c3aed" stroke-width="22" stroke-linecap="round"/>
      <path d="M790 264h116" stroke="#f59e0b" stroke-width="18" stroke-linecap="round"/>
    `,
    'Segurança e Operações': `
      <path d="M842 132l120 42v86c0 82-52 132-120 162-68-30-120-80-120-162v-86l120-42Z" fill="white" opacity=".86"/>
      <path d="M782 254h120M842 194v120" stroke="#334155" stroke-width="18" stroke-linecap="round"/>
      <path d="M762 364h160" stroke="#f97316" stroke-width="20" stroke-linecap="round"/>
    `,
    'Beleza e Bem-estar': `
      <path d="M774 180c72-58 170-20 170 70 0 86-86 140-170 174-84-34-170-88-170-174 0-90 98-128 170-70Z" fill="white" opacity=".84" transform="translate(70 -10) scale(.82)"/>
      <path d="M752 330c96-82 142-138 192-202M792 352l112-112" stroke="#be185d" stroke-width="18" stroke-linecap="round"/>
      <circle cx="${740 + offset}" cy="206" r="34" fill="#f472b6" opacity=".75"/>
    `,
    'Serviços e Finanças': `
      <circle cx="796" cy="214" r="62" fill="white" opacity=".88"/>
      <circle cx="902" cy="292" r="62" fill="white" opacity=".72"/>
      <path d="M796 174v80M766 198h60M766 230h60M902 252v80M872 276h60M872 308h60" stroke="#065f46" stroke-width="14" stroke-linecap="round"/>
    `,
  };
  return icons[area] || icons['Administração e Gestão'];
}

function generatedCoverSvg(course) {
  const area = normalizeCourseArea(course.area, course.title, course.tags);
  const visual = visualForCourse({ ...course, area });
  const [dark, accent, soft] = visual.palette;
  const seed = hashString(`${course.title}-${course.hours}-${area}-${visual.type}`);
  const circleA = 72 + (seed % 90);
  const circleB = 54 + ((seed >> 4) % 80);
  const xA = 90 + ((seed >> 8) % 220);
  const yA = 72 + ((seed >> 12) % 120);
  const xB = 360 + ((seed >> 16) % 220);
  const yB = 238 + ((seed >> 20) % 110);
  const wave = 42 + (seed % 32);
  const opacity = 0.18 + ((seed % 7) / 100);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="Capa do curso ${escapeXml(course.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${soft}"/>
      <stop offset="52%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="${dark}" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect width="1200" height="675" rx="0" fill="url(#bg)"/>
  <circle cx="${xA}" cy="${yA}" r="${circleA}" fill="${accent}" opacity="${opacity}"/>
  <circle cx="${xB}" cy="${yB}" r="${circleB}" fill="${dark}" opacity=".10"/>
  <path d="M0 ${500 - wave} C 190 ${430 - wave}, 280 ${610 - wave}, 464 ${530 - wave} S 786 ${390 - wave}, 1200 ${494 - wave} V675 H0Z" fill="url(#panel)" opacity=".88"/>
  <path d="M70 118h420M70 170h330M70 222h250" stroke="${dark}" stroke-width="22" stroke-linecap="round" opacity=".16"/>
  <rect x="654" y="98" width="404" height="346" rx="52" fill="white" opacity=".22" filter="url(#shadow)"/>
  ${themedCourseIcon(visual.type, visual.palette, seed)}
  <path d="M92 538c96-68 196-92 300-72 74 14 138 52 218 42 58-8 112-40 178-78" fill="none" stroke="white" stroke-width="20" stroke-linecap="round" opacity=".46"/>
  <circle cx="1040" cy="112" r="44" fill="white" opacity=".32"/>
  <circle cx="112" cy="112" r="26" fill="white" opacity=".48"/>
</svg>`;
}

async function buildCourses() {
  await mkdir(coversDir, { recursive: true });
  return Promise.all(
    courseDefinitions.map(async (course) => {
      const normalizedCourse = {
        ...course,
        area: normalizeCourseArea(course.area, course.title, course.tags || []),
      };
      const resolvedSources = course.sources.map(resolveExistingSource).filter(Boolean);
      const rawText = resolvedSources.map(extractText).join('\n\n');
      const lessons = splitIntoLessons(normalizedCourse, rawText);
      const slug = slugify(course.title);
      const coverPath = path.join(coversDir, `${slug}.webp`);
      if (!existsSync(coverPath)) {
        copyFileSync(coverSourceForCourse(normalizedCourse), coverPath);
      }
      return {
        ...normalizedCourse,
        slug,
        sourcesFound: resolvedSources.map((file) => path.relative(rootDir, file)),
        sourceChars: rawText.length,
        imagem_url: `/course-covers/ead/${slug}.webp`,
        ead_config: buildEadConfig(normalizedCourse, lessons),
      };
    }),
  );
}

function summarize(courses) {
  const lines = [
    `Cursos detectados: ${courses.length}`,
    `Valor base: R$ ${DEFAULT_VALUE.toFixed(2).replace('.', ',')} com precos individuais quando definidos`,
    `Questoes minimas por prova: ${MIN_QUESTIONS}`,
    `Bloqueio por reprovacao: ${RETRY_HOURS}h`,
    '',
  ];
  for (const course of courses) {
    lines.push(
      `- ${course.title} | area ${course.area} | R$ ${(course.price ?? DEFAULT_VALUE).toFixed(2).replace('.', ',')} | ${course.hours}h | aulas ${course.ead_config.conteudos.length} | questoes ${course.ead_config.provas[0].questoes.length} | fontes ${course.sourcesFound.length} | capa ${course.imagem_url}`,
    );
  }
  return lines.join('\n');
}

function restUrl(baseUrl, table, params = {}) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function storageCoverUrl(baseUrl, slug) {
  return `${baseUrl}/storage/v1/object/public/${storageBucket}/${storageCoverPrefix}/${slug}.webp`;
}

async function uploadCover(baseUrl, key, course) {
  const cover = readFileSync(path.join(coversDir, `${course.slug}.webp`));
  const response = await fetch(
    `${baseUrl}/storage/v1/object/${storageBucket}/${storageCoverPrefix}/${course.slug}.webp`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'image/webp',
        'x-upsert': 'true',
      },
      body: cover,
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text)?.message ?? text;
    } catch {
      // Keep the raw storage error when it is not JSON.
    }
    const error = new Error(message || `Falha ao enviar capa (${response.status})`);
    error.status = response.status;
    throw error;
  }
  course.imagem_url = storageCoverUrl(baseUrl, course.slug);
}

async function restRequest(baseUrl, key, table, { method = 'GET', params = {}, body, prefer } = {}) {
  const response = await fetch(restUrl(baseUrl, table, params), {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message ?? data?.error ?? text ?? `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function upsertCourse(baseUrl, key, course) {
  const payload = {
    nome: course.title,
    descricao: `Curso EAD de ${course.title} com ${course.hours} horas, atividades, prova final e certificado automatico.`,
    modalidade: 'EAD',
    carga_horaria: course.hours,
    duracao_meses: Math.max(1, Math.ceil(course.hours / 40)),
    area: course.area,
    status: 'ativo',
    versao: '1.0',
    valor: course.price ?? DEFAULT_VALUE,
    imagem_url: course.imagem_url,
    publicar_site: true,
    ead_config: course.ead_config,
  };

  const existingRows = await restRequest(baseUrl, key, 'cursos', {
    params: {
      select: 'id,nome',
      nome: `eq.${course.title}`,
      modalidade: 'eq.EAD',
      limit: '1',
    },
  });
  const existing = existingRows?.[0];

  if (existing?.id) {
    await restRequest(baseUrl, key, 'cursos', {
      method: 'PATCH',
      params: { id: `eq.${existing.id}` },
      body: payload,
      prefer: 'return=minimal',
    });
    return { id: existing.id, action: 'updated' };
  }

  if (course.updateExistingOnly) {
    return { id: null, action: 'skipped-no-existing' };
  }

  const inserted = await restRequest(baseUrl, key, 'cursos', {
    method: 'POST',
    body: payload,
    prefer: 'return=representation',
  });
  return { id: inserted?.[0]?.id, action: 'inserted' };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const courses = await buildCourses();
  console.log(summarize(courses));

  if (!write) {
    console.log('\nPrevia concluida. Use --write para gravar no Supabase.');
    return;
  }

  const env = readEnv();
  const supabaseUrl = env.REACT_APP_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.REACT_APP_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variaveis Supabase ausentes em .env.local.');
  }

  const results = [];
  for (const course of courses) {
    await uploadCover(supabaseUrl, supabaseKey, course);
    results.push({ title: course.title, ...(await upsertCourse(supabaseUrl, supabaseKey, course)) });
  }
  console.log('\nResultado da gravacao:');
  for (const result of results) {
    console.log(`- ${result.title}: ${result.action}${result.id ? ` (${result.id})` : ''}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
