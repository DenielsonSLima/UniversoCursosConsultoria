import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-porteiro-e-vigia-20261027-v2",
  "courseId": "e51427ec-3dc0-455a-a482-9389c2ec9ad8",
  "courseName": "Porteiro e Vigia",
  "hours": 80,
  "audience": "Interessados em recepção, controle de acesso e observação patrimonial dentro das atribuições do posto, sem formação de vigilante ou autorização de segurança privada.",
  "objectives": [
    "Aplicar lógica de identificação, autorização e registro de acesso.",
    "Distinguir observação de suspeita e encaminhar ocorrências.",
    "Preservar documentos, chaves e informações na passagem do posto."
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
