import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-matematica-eja-20261027-v2",
  "courseId": "a0dcb37e-7a85-4e71-adb9-f8ab41552206",
  "courseName": "Matemática EJA",
  "hours": 80,
  "audience": "Professores e educadores que planejam ensino de matemática para jovens e adultos; não é curso de certificação da educação básica.",
  "objectives": [
    "Dialogar com estratégias de jovens e adultos e ampliar representações matemáticas.",
    "Planejar problemas de números, medidas, proporção e dados.",
    "Avaliar raciocínios e organizar mediações acessíveis."
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
