import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dialogSource = readFileSync(
  new URL('./TurmaGradeDialogs.tsx', import.meta.url),
  'utf8',
);
const gradeSource = readFileSync(
  new URL('../TurmaGrade.tsx', import.meta.url),
  'utf8',
);

test('seletor de docente permanece compacto, centralizado e com rolagem interna', () => {
  assert.match(dialogSource, /createPortal\([\s\S]*document\.body/);
  assert.match(dialogSource, /fixed inset-0[^"]*items-center justify-center/);
  assert.match(dialogSource, /bg-\[#001a33\]\/60 backdrop-blur-sm/);
  assert.match(dialogSource, /max-h-\[88dvh\][^"]*max-w-3xl/);
  assert.match(dialogSource, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(dialogSource, /h-\[100dvh\][^"]*w-screen[^"]*bg-white/);
});

test('diálogo preserva acessibilidade, foco e fechamento por teclado', () => {
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /aria-describedby="docente-dialog-description"/);
  assert.match(dialogSource, /event\.key === 'Escape'/);
  assert.match(dialogSource, /event\.key !== 'Tab'/);
  assert.match(dialogSource, /previouslyFocused\?\.focus\(\)/);
});

test('progresso aparece somente no docente escolhido', () => {
  assert.match(
    dialogSource,
    /const isSelectedAssigning = assigningProfessorId === professor\.id/,
  );
  assert.match(dialogSource, /\{isSelectedAssigning && \(/);
  assert.doesNotMatch(
    dialogSource,
    /\(isAssigning \|\| assigningProfessorId === professor\.id\)/,
  );
});

test('sucesso segue o toast padrão e erro mantém o seletor aberto para retry', () => {
  assert.match(gradeSource, /toast\.success\(\s*'Docente confirmado'/);
  assert.match(gradeSource, /assignment\.professor_nome\?\.trim\(\)/);

  const errorCallbackStart = gradeSource.indexOf("console.error('Erro ao atribuir docente:'");
  const nextMutationStart = gradeSource.indexOf(
    'const assignProfessorToAllMutation',
    errorCallbackStart,
  );
  assert.ok(errorCallbackStart >= 0 && nextMutationStart > errorCallbackStart);
  const errorCallbackSource = gradeSource.slice(errorCallbackStart, nextMutationStart);
  assert.match(errorCallbackSource, /toast\.error\('Docente não salvo'/);
  assert.doesNotMatch(errorCallbackSource, /closeDocenteModal\(\)/);
});
