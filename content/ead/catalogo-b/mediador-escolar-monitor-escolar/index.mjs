import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-mediador-escolar-monitor-escolar-20261027-v2",
  "courseId": "992cf04b-059c-45f5-9518-3911d1f94b18",
  "courseName": "Mediador Escolar (Monitor Escolar)",
  "hours": 120,
  "audience": "Interessados em apoio e mediação escolar, com atuação dependente das atribuições e da formação exigidas na rede.",
  "objectives": [
    "Articular apoio, docência e AEE sem substituir funções.",
    "Planejar rotinas, acesso e participação com autonomia possível.",
    "Registrar e encaminhar ocorrências respeitando proteção e dignidade."
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
