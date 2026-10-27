import { activities, exam } from './assessments.mjs';
import { lessons } from './lessons.mjs';
import { sources } from './sources.mjs';

export const courseRevision = {
  revisionId: 'me-20261027',
  courseName: 'Matemática para Enem',
  hours: 160,
  audience: 'Estudantes que buscam revisar fundamentos e resolver problemas matemáticos contextualizados para o Enem.',
  objectives: [
    'Interpretar tabelas, unidades e estimativas para resolver situações quantitativas.',
    'Resolver problemas de proporção, porcentagem e variações sucessivas.',
    'Construir e interpretar modelos de funções afins e quadráticas.',
    'Aplicar áreas, volumes, escalas e distâncias no plano cartesiano.',
    'Calcular medidas estatísticas e probabilidades em experimentos bem definidos.',
    'Integrar conceitos matemáticos e conferir a coerência dos resultados.',
  ],
  videoPolicy: {
    required: false,
    verifiedUrls: [],
    reason: 'Vídeo anterior não foi assistido nem teve alinhamento pedagógico comprovado. A revisão usa aulas textuais autossuficientes e estudo aberto; não herdar conclusão obrigatória de vídeo não validado.',
  },
  sources,
  lessons,
  activities,
  exam,
};

export const matematicaEnemRevision = courseRevision;
export default courseRevision;
