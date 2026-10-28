import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-telemarketing-20261027-v2",
  "courseId": "505eb40f-faa7-4e60-bc55-946a3fdb44b1",
  "courseName": "Telemarketing",
  "hours": 80,
  "audience": "Interessados em comunicação telefônica de atendimento e oferta, com registros confiáveis e respeito às regras e à proteção de dados.",
  "objectives": [
    "Conduzir conversa com finalidade clara e escuta.",
    "Distinguir tentativa, interesse, confirmação e pendência.",
    "Interpretar indicadores e reconhecer limites de contato, dados e condições de trabalho."
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
