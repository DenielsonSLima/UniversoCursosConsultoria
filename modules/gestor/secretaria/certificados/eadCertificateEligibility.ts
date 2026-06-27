import { CertificadoAcademico } from './certificados.types';

type EadProgressRow = {
  aluno_id: string;
  curso_id: string;
  progress: any;
};

const asArray = (value: any): any[] => Array.isArray(value) ? value : [];
const asBoolean = (value: any, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const asNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getEadProgressKey = (alunoId: string, cursoId: string) => `${alunoId}:${cursoId}`;

export const buildEadProgressMap = (rows: EadProgressRow[]) =>
  new Map(rows.map(row => [getEadProgressKey(row.aluno_id, row.curso_id), row.progress || {}]));

export const hasValidEadCertificateCompletion = (
  certificate: CertificadoAcademico,
  progress?: any
) => {
  if (certificate.modalidade !== 'EAD') return true;
  if (certificate.status !== 'FINALIZADO' || !certificate.codigo_validacao) return false;
  if (!progress) return false;

  const config = certificate.curso?.ead_config || {};
  const regras = config.regras || {};
  const conteudos = asArray(config.conteudos);
  const atividades = asArray(config.atividades);
  const questoes = asArray(config.provas?.[0]?.questoes);

  const completedContentIds = asArray(progress.completedContentIds);
  const completedActivityIds = asArray(progress.completedActivityIds);
  const completedVideoIds = asArray(progress.completedVideoIds);
  const quizScore = asNumber(progress.quizScore, -1);
  const minimumScore = asNumber(config.provas?.[0]?.notaMinima, 70);
  const minimumQuestions = 10;

  const requiredActivities = asBoolean(regras.exigirAtividades, true) ? atividades.length : 0;
  const requiredVideos = asBoolean(regras.exigirVideosConcluidos, true)
    ? conteudos.filter((item: any) => String(item?.videoUrl || '').trim()).length
    : 0;

  return Boolean(progress.completedAt)
    && quizScore >= minimumScore
    && questoes.length >= minimumQuestions
    && completedContentIds.length >= conteudos.length
    && completedActivityIds.length >= requiredActivities
    && completedVideoIds.length >= requiredVideos;
};
