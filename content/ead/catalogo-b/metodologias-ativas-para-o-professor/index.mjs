import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-metodologias-ativas-para-o-professor-20261027-v2",
  "courseId": "80214c44-1f3d-44f1-a0ad-0599474855dc",
  "courseName": "Metodologias Ativas para o Professor",
  "hours": 80,
  "audience": "Professores e educadores que planejam participação, investigação e acompanhamento das aprendizagens.",
  "objectives": [
    "Alinhar objetivos, ensino e evidências.",
    "Planejar problemas, colaboração e projetos com condições de acesso.",
    "Usar devolutivas para revisar o ensino sem prometer eficácia universal de uma técnica."
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
