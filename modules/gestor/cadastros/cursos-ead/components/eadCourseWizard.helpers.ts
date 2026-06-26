import { supabase } from '../../../../../lib/supabase';
import { EadConfig } from '../../cadastros.types';

// Helper para analisar e converter preços em formato brasileiro (BRL) para float
export const parseBRLPrice = (valStr: string): number | null => {
  const clean = valStr.trim();
  if (clean === '') return null;

  // Se tiver tanto ponto quanto vírgula (ex: 1.250,50 ou 1,250.50)
  if (clean.includes('.') && clean.includes(',')) {
    if (clean.indexOf('.') < clean.indexOf(',')) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    } else {
      return parseFloat(clean.replace(/,/g, ''));
    }
  }

  // Se tiver apenas vírgula (ex: 299,90)
  if (clean.includes(',')) {
    return parseFloat(clean.replace(',', '.'));
  }

  // Se tiver apenas ponto
  if (clean.includes('.')) {
    const parts = clean.split('.');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 2 || lastPart.length === 1) {
      return parseFloat(clean);
    } else if (lastPart.length === 3) {
      return parseFloat(clean.replace(/\./g, ''));
    }
    return parseFloat(clean);
  }

  // Apenas números (ex: 299)
  return parseFloat(clean);
};

export const MIN_EAD_PROVA_QUESTOES = 10;
export const DEFAULT_EAD_RETRY_HOURS = 1;
export const EAD_IMAGE_BUCKET = 'documentos';
export const STORAGE_BASE_PATH = 'cursos/ead';

export const compressImageToWebp = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const webpFile = new File([blob], `ead-${Date.now()}.webp`, {
                type: 'image/webp'
              });
              resolve(webpFile);
              return;
            }

            resolve(file);
          },
          'image/webp',
          0.82
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const getStoragePathFromPublicUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const patterns = [
      /^\/storage\/v1\/object\/public\/documentos\/(.+)$/,
      /^\/storage\/v1\/object\/sign\/documentos\/(.+)$/,
      /^\/storage\/v1\/object\/documentos\/(.+)$/
    ];

    for (const pattern of patterns) {
      const match = parsed.pathname.match(pattern);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  } catch {
    return null;
  }

  return null;
};

export const removeOldStorageImage = async (url: string) => {
  const path = getStoragePathFromPublicUrl(url);
  if (!path) return;

  const { error } = await supabase.storage
    .from(EAD_IMAGE_BUCKET)
    .remove([path]);

  if (error) {
    console.error('Erro ao remover imagem anterior do armazenamento:', error);
  }
};

export const agenteComunitarioTemplate: Pick<EadConfig, 'pagina' | 'regras' | 'cronograma' | 'conteudos' | 'atividades' | 'provas'> = {
  pagina: {
    subtitulo: 'Formação introdutória para atuação do ACS na Atenção Básica, visitas domiciliares, promoção da saúde e vínculo com a comunidade.',
    objetivos: [
      'Compreender a origem do PACS, do PSF e da Estratégia Saúde da Família.',
      'Identificar atribuições, postura ética e responsabilidades do ACS.',
      'Relacionar promoção da saúde, prevenção de doenças e proteção social.',
      'Aplicar noções de visita domiciliar, cadastro, vigilância e encaminhamento.'
    ],
    publicoAlvo: 'Estudantes, profissionais e candidatos interessados em atuar ou se aperfeiçoar como Agente Comunitário de Saúde.',
    requisitos: 'Ensino fundamental e interesse em saúde pública, território, atenção básica e atendimento comunitário.',
    metodologia: 'Leitura guiada em páginas do próprio ambiente, videoaulas incorporadas, atividades por etapa, conclusão sequencial e prova final.'
  },
  regras: {
    tempoMinimoMinutos: 60,
    liberarSequencialmente: true,
    exigirAtividades: true,
    exigirVideosConcluidos: true,
    intervaloReprovacaoHoras: DEFAULT_EAD_RETRY_HOURS
  },
  cronograma: [
    { id: 'acs-cron-1', titulo: 'História, PACS, SUS e Estratégia Saúde da Família', cargaHoraria: 45 },
    { id: 'acs-cron-2', titulo: 'Atribuições, território, acolhimento e visita domiciliar', cargaHoraria: 45 },
    { id: 'acs-cron-3', titulo: 'Ética, cidadania, proteção social e políticas de saúde', cargaHoraria: 45 },
    { id: 'acs-cron-4', titulo: 'Promoção da saúde, prevenção de doenças e prática comunitária', cargaHoraria: 45 }
  ],
  conteudos: [
    {
      id: 'acs-etapa-1',
      etapa: 1,
      titulo: 'Etapa 1: origem do ACS e organização da Atenção Básica',
      descricao: 'Contexto histórico do PACS, criação do SUS, primeiros programas no Ceará e incorporação do ACS à Saúde da Família.',
      tipo: 'pagina',
      duracaoMinutos: 15,
      videoUrl: 'https://vimeo.com/1204863403?share=copy&fl=sv&fe=ci',
      objetivos: ['Reconhecer a origem do PACS e do ACS.', 'Entender a relação entre ACS, SUS, PSF e ESF.'],
      textoHtml: `O Agente Comunitário de Saúde nasce no processo de construção do Sistema Único de Saúde e se consolida como ponte entre comunidade e unidade básica. O PACS passou a apoiar a Saúde da Família e, em muitos municípios, funcionou como caminho de transição para a Estratégia Saúde da Família.\n\nA primeira experiência estruturada ocorreu no Ceará, em 1987, com ações voltadas à saúde da mulher e da criança, geração de trabalho e redução da mortalidade infantil. Em 1991, a estratégia foi incorporada pelo Ministério da Saúde, ampliando a presença do ACS em territórios rurais, periferias urbanas e municípios industrializados.\n\nNesta etapa, observe que a função do ACS não é apenas repassar avisos: ele reúne informações, acompanha famílias, identifica riscos, orienta o uso adequado dos serviços e fortalece vínculos entre comunidade e equipe de saúde.`
    },
    {
      id: 'acs-etapa-2',
      etapa: 2,
      titulo: 'Etapa 2: atribuições do ACS e visita domiciliar',
      descricao: 'Cadastro familiar, acolhimento, acompanhamento de gestantes e crianças, vacinação, registros e encaminhamentos.',
      tipo: 'pagina',
      duracaoMinutos: 15,
      videoUrl: '',
      objetivos: ['Listar atribuições essenciais do ACS.', 'Organizar uma visita domiciliar com foco em risco e vulnerabilidade.'],
      textoHtml: `O ACS atua no acolhimento porque pertence ao território e cria vínculo com mais facilidade. Entre suas atribuições estão cadastrar famílias, manter informações atualizadas, orientar a comunidade, registrar nascimentos, óbitos e doenças de notificação, acompanhar gestantes, nutrizes e crianças, incentivar vacinação e apoiar ações de saneamento.\n\nA visita domiciliar deve ser planejada com a equipe. Famílias com maior risco ou vulnerabilidade precisam de acompanhamento mais frequente. Durante a visita, o ACS escuta, orienta, identifica sinais de alerta e informa a equipe sobre situações que exigem avaliação técnica.\n\nO trabalho exige postura ativa: observar o território, respeitar a privacidade, registrar dados com responsabilidade e encaminhar ao serviço adequado quando houver necessidade.`
    },
    {
      id: 'acs-etapa-3',
      etapa: 3,
      titulo: 'Etapa 3: ética, cidadania e políticas sociais',
      descricao: 'Sigilo, vínculo, direitos sociais, proteção social, SUS como política pública e papel do Estado.',
      tipo: 'pagina',
      duracaoMinutos: 15,
      videoUrl: '',
      objetivos: ['Aplicar princípios éticos no contato com famílias.', 'Relacionar saúde com cidadania, proteção social e políticas públicas.'],
      textoHtml: `A ética no trabalho do ACS aparece em situações sensíveis: doença, desemprego, pobreza, violência, uso de substâncias, conflitos familiares e riscos sociais. Por isso, sigilo, prudência, respeito, solidariedade e responsabilidade são indispensáveis.\n\nO SUS é uma política pública universal que assume a saúde como direito. A atuação do ACS precisa considerar que saúde depende de moradia, alimentação, saneamento, educação, renda, vínculos familiares e acesso aos serviços. Não existe promoção da saúde isolada da realidade social do território.\n\nNesta etapa, o foco é compreender que o ACS trabalha com pessoas, famílias e comunidades, não apenas com sintomas ou formulários.`
    },
    {
      id: 'acs-etapa-4',
      etapa: 4,
      titulo: 'Etapa 4: promoção da saúde, prevenção e ESF',
      descricao: 'Promoção de saúde, prevenção de doenças, ações educativas, vigilância, perfil profissional e prática comunitária.',
      tipo: 'pagina',
      duracaoMinutos: 15,
      videoUrl: '',
      objetivos: ['Diferenciar promoção da saúde e prevenção de doenças.', 'Reconhecer o ACS dentro da equipe multiprofissional da ESF.'],
      textoHtml: `Promoção da saúde envolve agir sobre fatores que melhoram a qualidade de vida: alimentação, atividade física, saneamento, educação em saúde, participação social e ambientes mais seguros. Prevenção de doenças envolve reduzir riscos e evitar agravos, como vacinação, combate a vetores e orientação sobre sinais de alerta.\n\nNa Estratégia Saúde da Família, a equipe multiprofissional geralmente reúne médico, enfermeiro, técnico ou auxiliar de enfermagem e ACS, podendo incluir equipe de saúde bucal. O ACS contribui para a reorganização da Atenção Básica porque conhece o território, identifica necessidades e aproxima usuários da UBS.\n\nO perfil esperado inclui conhecer a comunidade, agir com ética, gostar de aprender, ser proativo e observar pessoas, ambientes e condições de vida.`
    }
  ],
  atividades: [
    { id: 'acs-atv-1', etapaId: 'acs-etapa-1', titulo: 'Mapa rápido do território', tipo: 'reflexao', enunciado: 'Explique, em poucas linhas, por que o ACS precisa morar ou conhecer profundamente a comunidade onde atua.' },
    { id: 'acs-atv-2', etapaId: 'acs-etapa-2', titulo: 'Roteiro de visita', tipo: 'reflexao', enunciado: 'Monte um roteiro simples de visita domiciliar contendo acolhimento, observação, orientação e encaminhamento.' },
    { id: 'acs-atv-3', etapaId: 'acs-etapa-3', titulo: 'Conduta ética', tipo: 'multipla_escolha', enunciado: 'Ao tomar conhecimento de uma informação íntima de uma família, qual deve ser a postura do ACS?', opcoes: ['Comentar com vizinhos para buscar ajuda', 'Manter sigilo e discutir apenas com a equipe quando necessário', 'Publicar em grupo da comunidade', 'Ignorar a situação'], respostaCorreta: 1 },
    { id: 'acs-atv-4', etapaId: 'acs-etapa-4', titulo: 'Promoção x prevenção', tipo: 'reflexao', enunciado: 'Cite uma ação de promoção da saúde e uma ação de prevenção de doença que o ACS pode apoiar no território.' }
  ],
  provas: [
    {
      id: 'acs-prova-final',
      titulo: 'Prova Final - Agente Comunitário de Saúde',
      notaMinima: 70,
      questoes: [
        { id: 'acs-q1', pergunta: 'Onde ocorreu a primeira experiência de Agentes Comunitários de Saúde como estratégia abrangente de saúde pública estruturada?', opcoes: ['No Ceará, em 1987.', 'No Rio de Janeiro, em 1987.', 'No México, em 1987.', 'No Amazonas, em 1987.'], respostaCorreta: 0 },
        { id: 'acs-q2', pergunta: 'Qual é um importante papel do agente comunitário de saúde?', opcoes: ['Atuar apenas no diagnóstico médico.', 'Contribuir para o acolhimento e o vínculo com a comunidade.', 'Substituir a equipe da UBS.', 'Emitir prescrições clínicas.'], respostaCorreta: 1 },
        { id: 'acs-q3', pergunta: 'Quem é responsável pela atenção, cuidado e vigilância à saúde em todos os níveis, do individual ao coletivo?', opcoes: ['O SUS.', 'Somente o agente.', 'Somente o médico.', 'Somente o enfermeiro.'], respostaCorreta: 0 },
        { id: 'acs-q4', pergunta: 'A equipe multiprofissional da ESF é composta, em sua base, por:', opcoes: ['Apenas técnico ou auxiliar de enfermagem.', 'Médico, enfermeiro e técnico, sem ACS.', 'Médico, enfermeiro, técnico ou auxiliar de enfermagem e ACS.', 'Apenas Agente Comunitário de Saúde.'], respostaCorreta: 2 },
        { id: 'acs-q5', pergunta: 'O que tem como objetivo contribuir para a qualidade de vida das pessoas e da comunidade?', opcoes: ['O programa sem vínculo territorial.', 'O atendimento exclusivamente hospitalar.', 'O serviço social isolado.', 'O trabalho do ACS junto à comunidade.'], respostaCorreta: 3 },
        { id: 'acs-q6', pergunta: 'Por que o conhecimento do território é essencial para o ACS?', opcoes: ['Para substituir consultas médicas.', 'Para identificar riscos, vulnerabilidades e necessidades das famílias.', 'Para dispensar registros da equipe.', 'Para evitar contato com a comunidade.'], respostaCorreta: 1 },
        { id: 'acs-q7', pergunta: 'Na visita domiciliar, uma conduta adequada do ACS é:', opcoes: ['Observar, ouvir, orientar e encaminhar quando necessário.', 'Prescrever medicamentos para a família.', 'Divulgar informações pessoais da família.', 'Realizar procedimentos exclusivos da equipe médica.'], respostaCorreta: 0 },
        { id: 'acs-q8', pergunta: 'Qual atitude demonstra postura ética no trabalho comunitário?', opcoes: ['Compartilhar dados sigilosos com vizinhos.', 'Manter sigilo e tratar informações sensíveis com responsabilidade.', 'Registrar apenas situações positivas.', 'Evitar comunicar riscos à equipe.'], respostaCorreta: 1 },
        { id: 'acs-q9', pergunta: 'Uma ação de promoção da saúde que pode ser apoiada pelo ACS é:', opcoes: ['Somente internação hospitalar.', 'Orientação comunitária sobre hábitos saudáveis e participação social.', 'Suspensão de vacinação.', 'Diagnóstico clínico sem equipe.'], respostaCorreta: 1 },
        { id: 'acs-q10', pergunta: 'Prevenção de doenças envolve principalmente:', opcoes: ['Reduzir riscos e evitar agravos, como vacinação e combate a vetores.', 'Aguardar a doença se agravar.', 'Atuar apenas depois da internação.', 'Ignorar sinais de alerta do território.'], respostaCorreta: 0 }
      ]
    }
  ]
};

export const replaceCertificateTemplateVars = (text: string, values: Record<string, string>) => {
  return (text || '').replace(/{{([^{}]+)}}/g, (_, key) => values[key] || `{{${key}}}`);
};
