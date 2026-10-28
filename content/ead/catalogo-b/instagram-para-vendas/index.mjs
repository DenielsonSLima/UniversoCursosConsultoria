import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-instagram-para-vendas-20261027-v2",
  "courseId": "776f18b0-9191-4b8f-a0c9-213779d03f6f",
  "courseName": "Instagram para Vendas",
  "hours": 80,
  "audience": "Estudantes e pequenos negócios que desejam organizar ofertas, conteúdo, atendimento e análise de resultados no Instagram.",
  "objectives": [
    "Construir uma apresentação comercial clara e uma sequência de conteúdo com objetivo.",
    "Conferir oferta e atendimento sem ocultar condições ou expor clientes.",
    "Calcular indicadores definidos e usar comparações para melhorar a comunicação."
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
