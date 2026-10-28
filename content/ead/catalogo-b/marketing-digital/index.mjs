import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-marketing-digital-20261027-v2",
  "courseId": "14e006ac-78a1-4d1e-a758-8b11929ab128",
  "courseName": "Marketing Digital",
  "hours": 100,
  "audience": "Estudantes e pequenos negócios que precisam planejar oferta, conteúdo, aquisição e atendimento em canais digitais.",
  "objectives": [
    "Planejar jornada e oferta com informação verificável.",
    "Relacionar conteúdo, aquisição, orçamento e atendimento.",
    "Calcular indicadores definidos e revisar campanhas com proteção dos dados."
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
