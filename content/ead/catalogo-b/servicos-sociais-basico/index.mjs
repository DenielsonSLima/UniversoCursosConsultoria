import { sources } from './sources.mjs';
import { lessons } from './lessons.mjs';
import { activities, exam } from './assessments.mjs';

export const courseRevision = {
  ...{
  "revisionId": "ead-servicos-sociais-basico-20261027-v2",
  "courseId": "2e08a587-21b7-441f-9094-ac225cc2c45c",
  "courseName": "Serviços Sociais Básico",
  "hours": 80,
  "audience": "Pessoas interessadas em compreender direitos, serviços e encaminhamentos na rede socioassistencial, sem formação profissional de assistente social.",
  "objectives": [
    "Distinguir direito socioassistencial de favor e de outras políticas.",
    "Reconhecer funções introdutórias de CRAS, CREAS e serviços.",
    "Orientar busca de informação e encaminhamento com respeito, privacidade e limites de atribuição."
  ],
  "subtitle": "Introdução a direitos e à rede socioassistencial. Não habilita ao exercício da profissão de assistente social.",
  "videoPolicy": {
    "required": false,
    "verifiedUrls": [],
    "reason": "Vídeos antigos sem alinhamento comprovado; percurso textual com práticas e referências próprias."
  }
},
  sources, lessons, activities, exam,
};
export default courseRevision;
