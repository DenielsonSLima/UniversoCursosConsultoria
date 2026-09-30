import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [pageSource, formHostSource, studentFormSource] = await Promise.all([
  readFile(new URL('./ParceirosPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./components/ParceiroFormHost.tsx', import.meta.url), 'utf8'),
  readFile(
    new URL(
      './components/formularioparceiros/aluno/ParceiroAlunoForm.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
]);

test('página aguarda a mutation e encaminha seu estado pendente ao host', () => {
  const formHostUsage = pageSource.slice(
    pageSource.indexOf('<ParceiroFormHost'),
    pageSource.indexOf('/>', pageSource.indexOf('<ParceiroFormHost')) + 2,
  );

  assert.match(
    formHostUsage,
    /onSaveAluno=\{\(data\) => saveAlunoMutation\.mutateAsync\(data\)\}/,
  );
  assert.doesNotMatch(
    formHostUsage,
    /onSaveAluno=\{\(data\) => saveAlunoMutation\.mutate\(data\)\}/,
  );
  assert.match(
    formHostUsage,
    /isSavingAluno=\{saveAlunoMutation\.isPending\}/,
  );
});

test('host encaminha o estado pendente ao formulário de aluno', () => {
  assert.match(formHostSource, /onSaveAluno:\s*\(data:\s*any\)\s*=>\s*Promise<unknown>/);
  assert.match(formHostSource, /isSavingAluno\?:\s*boolean/);

  const studentCase = formHostSource.slice(
    formHostSource.indexOf("case 'aluno':"),
    formHostSource.indexOf("case 'professor':"),
  );

  assert.match(studentCase, /isSaving=\{isSavingAluno\}/);
});

test('formulário bloqueia reenvio síncrono por clique ou Enter', () => {
  assert.match(studentFormSource, /\buseRef\b/);

  const lockDeclaration = studentFormSource.match(
    /const\s+(\w+)\s*=\s*useRef(?:<boolean>)?\(false\)/,
  );
  assert.ok(lockDeclaration, 'guarda síncrona de envio não foi declarada');

  const lockName = lockDeclaration[1];
  const finalizeSource = studentFormSource.slice(
    studentFormSource.indexOf('const handleFinalize'),
    studentFormSource.indexOf('\n  return (', studentFormSource.indexOf('const handleFinalize')),
  );
  const guardIndex = finalizeSource.search(
    new RegExp(`(?:isSaving\\s*\\|\\|\\s*${lockName}\\.current|${lockName}\\.current\\s*\\|\\|\\s*isSaving)`),
  );
  const lockIndex = finalizeSource.indexOf(`${lockName}.current = true`);
  const awaitedSaveIndex = finalizeSource.search(/await\s+onSave(?:\?\.)?\(/);
  const finallyIndex = finalizeSource.indexOf('finally');
  const unlockIndex = finalizeSource.indexOf(`${lockName}.current = false`, finallyIndex);

  assert.match(finalizeSource, /const handleFinalize = async \(\) =>/);
  assert.ok(guardIndex >= 0, 'envio não consulta a guarda síncrona e o estado pendente');
  assert.ok(lockIndex > guardIndex, 'guarda deve ser ativada depois da checagem');
  assert.ok(awaitedSaveIndex > lockIndex, 'guarda deve ser ativada antes de aguardar onSave');
  assert.ok(finallyIndex > awaitedSaveIndex, 'liberação deve ocorrer em finally após onSave');
  assert.ok(unlockIndex > finallyIndex, 'finally deve liberar a guarda síncrona');

  const submitHandler = studentFormSource.slice(
    studentFormSource.indexOf('const handleSubmit'),
    studentFormSource.indexOf('const handleFinalize'),
  );
  assert.match(submitHandler, /event\.preventDefault\(\)/);
  assert.match(submitHandler, /\bvoid\s+handleFinalize\(\)/);

  assert.doesNotMatch(
    studentFormSource,
    new RegExp(
      `useEffect\\(\\(\\) => \\{[\\s\\S]{0,200}${lockName}\\.current\\s*=\\s*false[\\s\\S]{0,100}\\},\\s*\\[isSaving\\]\\)`,
    ),
    'a guarda não deve depender de effect para ser liberada',
  );
});

test('botão informa e bloqueia o salvamento em andamento', () => {
  assert.match(studentFormSource, /isSaving\?:\s*boolean/);

  const submitButton = studentFormSource.slice(
    studentFormSource.lastIndexOf('<button', studentFormSource.indexOf('type="submit"')),
    studentFormSource.indexOf('</button>', studentFormSource.indexOf('type="submit"')),
  );

  assert.match(submitButton, /disabled=\{isSaving\}/);
  assert.match(submitButton, /Salvando\.\.\./);
  assert.match(submitButton, /animate-spin/);
});

