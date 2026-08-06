import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('gatilhos do cadastro público não interceptam convites criados pelo gestor', async () => {
  const [migration, syncMigration, inviteHandler] = await Promise.all([
    readFile(
      new URL('../../../supabase/migrations/20260805212000_scope_public_student_auth_triggers.sql', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../../supabase/migrations/20260805215000_scope_public_student_profile_sync.sql', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../../supabase/functions/portal-user-management/handlers/send-student-invite.ts', import.meta.url),
      'utf8',
    ),
  ]);

  const exactPublicScope = /if v_origin <> 'cadastro_publico_ead' or v_tipo <> 'Aluno' then/g;

  assert.equal([...migration.matchAll(exactPublicScope)].length, 2);
  assert.match(syncMigration, /v_bad_guard constant text/);
  assert.match(syncMigration, /v_exact_guard constant text/);
  assert.match(syncMigration, /execute v_patched_definition/);
  assert.match(inviteHandler, /origem: "cadastro_gestor"/);
  assert.match(inviteHandler, /origem: "cadastro_gestor_matricula"/);
  assert.doesNotMatch(inviteHandler, /origem: "cadastro_publico_ead"/);
});

test('atendimento público mantém verificação JWT desativada na configuração versionada', async () => {
  const config = await readFile(
    new URL('../../../supabase/config.toml', import.meta.url),
    'utf8',
  );

  assert.match(
    config,
    /\[functions\.public-student-support\]\s*verify_jwt = false/,
  );
});
