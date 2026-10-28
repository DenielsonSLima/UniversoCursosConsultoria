import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-oratoria-20261027-v2",
  "courseId": "2a932638-6e97-4d1c-8d6f-c5fbd23bc2fd",
  "courseName": "Oratória",
  "hours": 80,
  "audience": "Estudantes e profissionais que desejam planejar apresentações e conversas públicas claras, acessíveis e fundamentadas.",
  "objectives": [
    "Organizar propósito, mensagem e roteiro.",
    "Usar argumentos e dados sem extrapolar evidências.",
    "Planejar recursos de apoio e responder perguntas com precisão e respeito."
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
