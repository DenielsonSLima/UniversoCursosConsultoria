import { spawnSync } from 'node:child_process';

const checks = [
  [process.execPath, [
    '--test',
    'modules/gestor/parceiros/components/viewparceiros/shared/student-access-state.test.ts',
    'modules/gestor/parceiros/utils/parceiro-mappers.test.ts',
  ]],
  ['deno', [
    'test', '--allow-read', '--allow-env',
    'supabase/functions/portal-user-management/handlers/student-first-access-state.test.ts',
    'supabase/functions/portal-user-management/handlers/send-student-invite.created-password.test.ts',
  ]],
  [process.execPath, [
    '--test', 'supabase/tests/student_email_confirmation.isolated.test.mjs',
  ]],
];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
