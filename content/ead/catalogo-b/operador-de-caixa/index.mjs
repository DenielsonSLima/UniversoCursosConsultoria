import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-operador-de-caixa-20261027-v2",
  "courseId": "987364d1-da6f-4b1c-95b8-3e5ec3502b44",
  "courseName": "Operador de Caixa",
  "hours": 80,
  "audience": "Estudantes e trabalhadores que desejam compreender registro de vendas, pagamentos, conferência de caixa e atendimento.",
  "objectives": [
    "Conferir quantidade, preço e troco.",
    "Separar meios de pagamento e calcular saldo físico com base declarada.",
    "Registrar divergências e encaminhar exceções preservando documentos, dados e condições de trabalho."
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
