import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-secretariado-escolar-20261027-v2",
  "courseId": "400437cc-4163-4962-b168-3ab16b3849ba",
  "courseName": "Secretariado Escolar",
  "hours": 80,
  "audience": "Interessados em rotinas de secretaria escolar; atuação depende das atribuições, requisitos e normas do sistema de ensino.",
  "objectives": [
    "Conservar identidade, vínculos e origem dos registros escolares.",
    "Distinguir matrícula, frequência, resultado e documento emitido.",
    "Conferir informações, tratar pendências e proteger dados no atendimento."
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
