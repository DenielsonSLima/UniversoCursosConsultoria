import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-matematica-infantil-20261027-v2",
  "courseId": "af5fe251-a584-4e52-a9a6-1986bad18e26",
  "courseName": "Matemática Infantil",
  "hours": 100,
  "audience": "Educadores que planejam experiências com noções matemáticas na educação infantil; o estudante do curso é o adulto, não a criança.",
  "objectives": [
    "Planejar contagem, comparação, espaço e medidas em experiências e brincadeiras.",
    "Distinguir participação e raciocínio de repetição mecânica.",
    "Documentar observações e organizar mediações acessíveis sem antecipação escolar automática."
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
