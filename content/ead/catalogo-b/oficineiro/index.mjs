import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-oficineiro-20261027-v2",
  "courseId": "c5e1c395-2f2e-4d83-a8aa-1892d98972c7",
  "courseName": "Oficineiro",
  "hours": 80,
  "audience": "Interessados em planejar e mediar oficinas educativas e culturais, respeitando público, referências culturais e condições de segurança.",
  "objectives": [
    "Definir finalidade, etapas e recursos de uma oficina.",
    "Valorizar referências culturais com participação e identificação de fontes.",
    "Acompanhar produção e participação sem transformar produto visual em única evidência."
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
