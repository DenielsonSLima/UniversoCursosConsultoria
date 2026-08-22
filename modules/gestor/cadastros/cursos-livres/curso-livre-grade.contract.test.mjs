import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [service, details, grade] = await Promise.all([
  readSource('./cursos-livres.service.ts'),
  readSource('../components/CursoGradeCurricularDetails.tsx'),
  readSource('../components/CursoGradeTab.tsx'),
]);

test('Curso Livre lê e salva a grade pelo contrato transacional dedicado', () => {
  assert.match(service, /obter_grade_curso_livre_gestao_secure/);
  assert.match(service, /salvar_grade_curso_livre_gestao_secure/);
  assert.match(service, /TENTATIVA_REGISTRADA/);
  for (const parameter of [
    'p_request_id',
    'p_curso_id',
    'p_expected_fingerprint',
    'p_modulos',
  ]) assert.match(service, new RegExp(parameter));
  assert.match(details, /curso\.modalidade === 'LIVRE'/);
  assert.match(details, /cursosLivresService\.getGradeWorkspace\(curso\.id\)/);
  assert.match(details, /cursosLivresService\.saveGrade/);
});

test('retry preserva requestId e a resposta oficial substitui o rascunho local', () => {
  assert.match(details, /gradeSaveRequest\.current\?\.signature !== signature/);
  assert.match(details, /requestId: gradeSaveRequest\.current\.requestId/);
  assert.match(details, /if \(workspace\.replayed\)[\s\S]*getGradeWorkspace\(curso\.id\)/);
  assert.match(details, /setModulos\(workspace\.modulos\)/);
  assert.match(details, /setGradeFingerprint\(workspace\.fingerprint\)/);
  assert.match(details, /setGradeStructureLocked\(workspace\.estruturaBloqueada\)/);
  assert.match(details, /setQueryData\(\['cursoLivrePublicGrade', curso\.id\], workspace\.modulos\)/);
});

test('resumo por matéria integra a grade editável sem salvar destrutivamente no cliente', () => {
  assert.match(grade, /Resumo do conteúdo de \$\{disciplina\.nome\}/);
  assert.match(grade, /descricao: value/);
  assert.match(grade, /structureLocked/);
  assert.match(details, /curso\.modalidade === 'LIVRE' && gradeStructureLocked/);
  assert.doesNotMatch(details, /structureLocked=\{curso\.modalidade === 'LIVRE' && turmasVinculadas\.length/);
  assert.doesNotMatch(service, /\.from\('modulos'\)[\s\S]*\.delete\(/);
});

test('duplicação Livre é atômica e preserva o requestId em retry ambíguo', () => {
  assert.match(service, /duplicar_curso_livre_gestao_secure/);
  assert.match(service, /duplicateRequestIds\.get\(signature\)/);
  assert.match(service, /p_request_id: requestId/);
  assert.match(service, /duplicateRequestIds\.delete\(signature\)/);
  assert.doesNotMatch(service, /cadastrosService\.duplicateCurso/);
});

test('conflito ou congelamento recarrega a grade canônica antes de novo save', () => {
  assert.match(details, /errorCode === '40001' \|\| errorCode === '55000'/);
  assert.match(details, /await loadGrade\(\)/);
  assert.match(details, /alterada em outra sessão/);
  assert.match(details, /entrou em uso acadêmico/);
});

test('falhas de leitura não são convertidas em grade ou lista de turmas vazias', () => {
  assert.match(details, /setGradeError\('A grade não foi carregada\. Nenhum estado vazio foi presumido\.'\)/);
  assert.match(details, /setTurmasError\('As turmas vinculadas não foram carregadas\.'\)/);
  assert.match(details, /gradeError \?/);
  assert.match(details, /turmasError \?/);
  assert.match(details, /onClick=\{\(\) => void loadGrade\(\)\}/);
  assert.match(details, /onClick=\{\(\) => void loadTurmas\(\)\}/);
});
