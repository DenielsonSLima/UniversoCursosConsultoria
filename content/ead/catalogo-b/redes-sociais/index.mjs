import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-redes-sociais-20261027-v2",
  "courseId": "086cc34a-c8f6-4334-860e-8571f922b382",
  "courseName": "Redes Sociais",
  "hours": 80,
  "audience": "Estudantes e profissionais que desejam organizar uma presença em redes sociais, conteúdo, relacionamento e proteção das informações.",
  "objectives": [
    "Distinguir público, finalidade e circulação de uma publicação.",
    "Planejar conteúdo e atendimento com informação clara.",
    "Interpretar indicadores e revisar acessos, privacidade e reputação."
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
