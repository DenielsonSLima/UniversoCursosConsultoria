import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-fiscal-de-loja-20261027-v2",
  "courseId": "7cf9bd3d-4d33-49fb-879a-99a3790ea826",
  "courseName": "Fiscal de Loja",
  "hours": 80,
  "audience": "Estudantes e trabalhadores que precisam compreender prevenção de perdas, observação e atendimento respeitoso no varejo.",
  "objectives": [
    "Conferir movimentações e investigar divergências sem presumir sua causa.",
    "Distinguir prevenção de perdas, atendimento e atuação de segurança especializada.",
    "Produzir registros objetivos e indicadores verificáveis."
  ],
  "videoPolicy": {
    "required": false,
    "verifiedUrls": [],
    "reason": "Vídeos antigos sem alinhamento comprovado; percurso textual com práticas e referências próprias."
  }
},
  sources, lessons, activities, exam,
};
export default courseRevision;
