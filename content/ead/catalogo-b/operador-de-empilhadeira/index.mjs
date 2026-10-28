import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-operador-de-empilhadeira-20261027-v2",
  "courseId": "b7831380-ef35-4328-8332-4f0bf970ff0e",
  "courseName": "Operador de Empilhadeira",
  "hours": 80,
  "audience": "Interessados em fundamentos teóricos de movimentação com empilhadeira; prática, preparação específica e autorização não são substituídas pelo curso.",
  "objectives": [
    "Reconhecer a relação entre carga, configuração e capacidade.",
    "Planejar informação de movimentação e armazenagem.",
    "Identificar anomalias, conflitos de circulação e limites de atuação."
  ],
  "subtitle": "Introdução teórica ao planejamento e à segurança. A conclusão do percurso textual não atesta prática nem autoriza operação de máquinas.",
  "videoPolicy": {
    "required": false,
    "verifiedUrls": [],
    "reason": "Vídeos antigos sem alinhamento comprovado; percurso textual com práticas e referências próprias."
  }
},
  sources, lessons, activities, exam,
};
export default courseRevision;
