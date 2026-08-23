import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resetProfileSelectionSession } from "./profile-selection-session.ts";

test("encerra o Auth local antes de limpar sessão do portal e cache", async () => {
  const calls: string[] = [];

  await resetProfileSelectionSession({
    signOutLocal: async () => {
      calls.push("sign-out-local");
      return { error: null };
    },
    clearPortalSession: () => calls.push("clear-portal-session"),
    clearQueryCache: () => calls.push("clear-query-cache"),
  });

  assert.deepEqual(calls, [
    "sign-out-local",
    "clear-portal-session",
    "clear-query-cache",
  ]);
});

test("mantém o seletor intacto quando o sign-out local falha", async () => {
  const expectedError = new Error("local sign-out failed");
  const calls: string[] = [];

  await assert.rejects(
    () =>
      resetProfileSelectionSession({
        signOutLocal: async () => {
          calls.push("sign-out-local");
          return { error: expectedError };
        },
        clearPortalSession: () => calls.push("clear-portal-session"),
        clearQueryCache: () => calls.push("clear-query-cache"),
      }),
    expectedError,
  );

  assert.deepEqual(calls, ["sign-out-local"]);
});

test("os três seletores voltam com sign-out local e sem logout global", async () => {
  const [institutionalSource, ...sources] = await Promise.all([
    readFile(new URL("./LoginPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../public/login/useAlunoLoginPublicPage.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../aluno/login-app/AlunoAppLoginPage.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of [institutionalSource, ...sources]) {
    const handlerStart = source.indexOf("const handleProfileSelectionBack");
    const handlerEnd = source.indexOf("\n  };", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
    assert.match(handler, /resetProfileSelectionSession/);
    assert.match(handler, /signOut\(\{ scope: 'local' \}\)/);
    assert.doesNotMatch(handler, /loginService\.logout|scope:\s*'global'/);
    assert.match(source, /onBack[=:]\s*\{?handleProfileSelectionBack\}?/);
  }

  const poloSelectorSource = await readFile(
    new URL("./components/ProfessorPoloSelector.tsx", import.meta.url),
    "utf8",
  );
  assert.match(institutionalSource, /<ProfessorPoloSelector[\s\S]*onBack=\{handleProfileSelectionBack\}/);
  assert.match(poloSelectorSource, /onClick=\{\(\) => void onBack\(\)\}/);
  assert.doesNotMatch(poloSelectorSource, /setLoginStep\('credentials'\)/);
});

test("primeiro acesso no app respeita Aluno e Responsável", async () => {
  const source = await readFile(
    new URL("../aluno/login-app/AlunoAppLoginPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /buildPortalFirstAccessPath\(profile\.tipo, profile\.contextId, redirectPath\)/,
  );
  assert.match(
    source,
    /profile\.tipo !== 'Aluno' && profile\.tipo !== 'Responsavel'/,
  );
  assert.doesNotMatch(source, /navigate\(`\/aluno\/primeiro-acesso/);
});
