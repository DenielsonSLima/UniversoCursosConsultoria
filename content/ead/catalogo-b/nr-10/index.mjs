import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-nr-10-20261027-v2",
  "courseId": "6a3242a7-76a0-4d97-8568-6ffd9c7ab8e9",
  "courseName": "NR-10",
  "hours": 80,
  "audience": "Estudantes que buscam introdução teórica à prevenção de riscos elétricos. Não autoriza intervenção nem substitui a formação e os demais requisitos aplicáveis ao trabalho.",
  "objectives": [
    "Reconhecer perigos elétricos e limites de atuação.",
    "Interpretar a lógica de planejamento, controle e liberação sem executar manobras.",
    "Relacionar documentos, responsabilidades e resposta a mudanças ou emergências."
  ],
  "subtitle": "Introdução teórica à prevenção de riscos elétricos. A conclusão do percurso textual não atesta prática nem autoriza intervenção em instalações.",
  "videoPolicy": {
    "required": false,
    "verifiedUrls": [],
    "reason": "Vídeos antigos sem alinhamento comprovado; percurso textual com práticas e referências próprias."
  }
},
  sources, lessons, activities, exam,
};
export default courseRevision;
