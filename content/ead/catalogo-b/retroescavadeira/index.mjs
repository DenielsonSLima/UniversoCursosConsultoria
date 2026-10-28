import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-retroescavadeira-20261027-v2",
  "courseId": "fd43d555-1ab5-4b6b-8e9d-876022ebac49",
  "courseName": "Retroescavadeira",
  "hours": 100,
  "audience": "Interessados em fundamentos teóricos de planejamento de trabalho com retroescavadeira; não inclui condução, escavação prática ou autorização profissional.",
  "objectives": [
    "Distinguir frentes de trabalho e configuração da máquina.",
    "Identificar necessidade de informação sobre terreno e interferências.",
    "Interpretar estimativas e registrar condições e pendências."
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
