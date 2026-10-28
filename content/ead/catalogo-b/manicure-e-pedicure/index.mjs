import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-manicure-e-pedicure-20261027-v2",
  "courseId": "22020154-bbfd-49df-8160-23939767a08f",
  "courseName": "Manicure e Pedicure",
  "hours": 100,
  "audience": "Estudantes de embelezamento de mãos e pés, com foco introdutório em cuidado cosmético não invasivo e organização do atendimento.",
  "objectives": [
    "Distinguir embelezamento de diagnóstico e tratamento.",
    "Planejar materiais e fluxo sanitário, respeitando instruções e regras locais.",
    "Executar planejamento de acabamento cosmético e calcular recursos de um atendimento."
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
