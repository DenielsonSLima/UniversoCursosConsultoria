import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-pa-carregadeira-20261027-v2",
  "courseId": "1065c786-8b36-49db-9739-fffc909a6612",
  "courseName": "Pá Carregadeira",
  "hours": 100,
  "audience": "Interessados em planejamento teórico de trabalho com pá carregadeira, sem prática de operação ou habilitação automática.",
  "objectives": [
    "Distinguir configuração, acessórios e condições do local.",
    "Interpretar volume e estimativas com premissas explícitas.",
    "Encaminhar condições anormais e organizar informação de segurança."
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
