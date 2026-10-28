import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-gestao-em-rh-20261027-v2",
  "courseId": "72339ac2-9a6f-4104-b72c-f5f2841ac520",
  "courseName": "Gestão em RH",
  "hours": 120,
  "audience": "Estudantes e profissionais interessados em organizar processos de pessoas, seleção, integração e desenvolvimento com registros e critérios claros.",
  "objectives": [
    "Traduzir necessidades de trabalho em requisitos verificáveis.",
    "Planejar seleção e integração com critérios relacionados à função.",
    "Distinguir dados cadastrais, contratuais e indicadores, preservando finalidade e acesso."
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
