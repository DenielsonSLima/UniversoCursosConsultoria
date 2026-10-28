import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-monitor-escolar-de-classe-auxiliar-do-regente-20261027-v2",
  "courseId": "b2e0cd7e-8ad0-49a1-b582-829253fef6fa",
  "courseName": "Monitor Escolar de Classe - Auxiliar do Regente",
  "hours": 80,
  "audience": "Interessados em apoio à rotina de classe sob articulação com o professor regente; atribuições dependem do cargo e da rede.",
  "objectives": [
    "Distinguir auxílio à regência de substituição automática da docência.",
    "Apoiar transições, convivência e participação com proteção.",
    "Compreender o objetivo da tarefa para oferecer ajuda sem responder pelo estudante."
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
