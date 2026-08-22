import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

const [pageEntry, cardSource, utilsSource] = await Promise.all([
  readSource("./AlunoLoginPublicPage.tsx"),
  readSource("./AlunoLoginAuthCard.tsx"),
  readSource("./aluno-login.utils.ts"),
]);
const pageSource = [
  pageEntry,
  await readSource('./useAlunoLoginPublicPage.ts'),
  await readSource('./aluno-login-redirect.ts'),
].join('\n');

test("link de acesso expirado no login explica o primeiro acesso e oferece recuperação protegida", () => {
  assert.match(pageSource, /EXPIRED_AUTH_LINK_MESSAGE/);
  assert.match(
    pageSource,
    /Se este era seu primeiro acesso, você ainda não possui senha/,
  );
  assert.match(
    pageSource,
    /action: expiredAuthLink \? 'request-new-link' : undefined/,
  );
  assert.match(utilsSource, /'existing-account' \| 'request-new-link'/);
  assert.match(cardSource, /message\.action === 'request-new-link'/);
  assert.match(cardSource, /href=\{recoveryHref\}/);
  assert.match(cardSource, /Solicitar novo link/);
});

test("o login não reenvia convite automaticamente a partir de um callback expirado", () => {
  const callbackSection = pageSource.slice(
    pageSource.indexOf("const checkAuthRedirectReturn"),
    pageSource.indexOf("const switchMode"),
  );

  assert.doesNotMatch(
    callbackSection,
    /requestPasswordRecovery|inviteUserByEmail|sendStudentInvite/,
  );
});

test('um erro OAuth apenas com "invalid" não é tratado como convite vencido', () => {
  const helperSection = pageSource.slice(
    pageSource.indexOf("const isExpiredAuthLink"),
    pageSource.indexOf("const EXPIRED_AUTH_LINK_MESSAGE"),
  );

  assert.doesNotMatch(helperSection, /lower\.includes\('invalid'\)/);
});
