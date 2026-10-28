import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-frentista-20261027-v2",
  "courseId": "2295fcad-8d57-4400-ae49-5f84c2eba63b",
  "courseName": "Frentista",
  "hours": 80,
  "audience": "Estudantes e trabalhadores que buscam formação introdutória em atendimento e rotinas de posto, complementada pela capacitação e prática exigidas no local de trabalho.",
  "objectives": [
    "Confirmar pedido e condições de abastecimento sem adivinhar o combustível.",
    "Conferir preço, volume e pagamento com cálculos e registros consistentes.",
    "Reconhecer situações que exigem interrupção e acionamento do procedimento de segurança."
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
