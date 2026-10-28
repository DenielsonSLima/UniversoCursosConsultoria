import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-introducao-a-nutricao-20261027-v2",
  "courseId": "2830d9e9-3a59-48f3-ac80-c92166b7a28e",
  "courseName": "Introdução à Nutrição",
  "hours": 80,
  "audience": "Estudantes que desejam compreender alimentação, nutrientes, processamento e leitura de rótulos, sem prescrição de dieta individual.",
  "objectives": [
    "Distinguir alimentação, nutrientes e contexto das refeições.",
    "Reconhecer categorias de processamento com apoio na composição.",
    "Interpretar bases de rótulos e planejar práticas educativas com informações verificáveis."
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
