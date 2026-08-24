import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginServiceSource = await readFile(
  new URL("./login.service.ts", import.meta.url),
  "utf8",
);
const portalLogoutSource = await readFile(
  new URL("../shared/hooks/usePortalLogout.ts", import.meta.url),
  "utf8",
);
const firstAccessSource = await readFile(
  new URL("../public/login/AlunoFirstAccessPage.tsx", import.meta.url),
  "utf8",
);
const supabaseSource = await readFile(
  new URL("../../lib/supabase.ts", import.meta.url),
  "utf8",
);
const logoutFlowSource = await readFile(
  new URL("./portal-logout-flow.ts", import.meta.url),
  "utf8",
);

test("logout automático usa escopo local por padrão", () => {
  assert.match(
    loginServiceSource,
    /async logout\(scope: PortalLogoutScope = 'local'\)/,
  );
  assert.match(loginServiceSource, /performPortalLogout\(scope/);
  assert.match(logoutFlowSource, /if \(scope === 'local'\)[\s\S]*forceClearAfterFailure/);
});

test("logout voluntário do portal continua revogando globalmente", () => {
  assert.match(portalLogoutSource, /trigger === 'inactivity' \? 'local' : 'global'/);
  assert.match(portalLogoutSource, /loginService\.logout\(scope\)/);
  assert.match(firstAccessSource, /loginService\.logout\('global'\)/);
});

test("timeout de inatividade preserva sessões de outros dispositivos", () => {
  assert.match(portalLogoutSource, /type PortalLogoutTrigger = 'inactivity' \| SyntheticEvent/);
  assert.match(portalLogoutSource, /trigger === 'inactivity' \? 'local' : 'global'/);
});

test("falha de rede tem limpeza direta do token persistido", () => {
  assert.match(loginServiceSource, /forceClearPersistedSupabaseSession/);
  assert.match(logoutFlowSource, /status: 'local-cleared'/);
  assert.match(logoutFlowSource, /forceClearAfterFailure\(dependencies\.forceClearLocal/);
  assert.match(supabaseSource, /clearSupabaseAuthStorage\(/);
  assert.match(supabaseSource, /storageKey: SUPABASE_AUTH_STORAGE_KEY/);
});
