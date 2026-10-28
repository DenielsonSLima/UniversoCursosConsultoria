import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-logistica-4-0-20261027-v2",
  "courseId": "3b7e0f70-ce27-434d-bdaf-071a1039c130",
  "courseName": "Logística 4.0",
  "hours": 120,
  "audience": "Estudantes e profissionais que desejam compreender fluxos logísticos, identificação, dados e melhoria de processos com tecnologia.",
  "objectives": [
    "Relacionar fluxo físico e registros de estoque.",
    "Distinguir identificação, leitura e rastreabilidade.",
    "Calcular indicadores definidos e propor uma melhoria digital com dados verificáveis."
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
