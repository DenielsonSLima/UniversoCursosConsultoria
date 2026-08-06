import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('atendimento público preserva o protocolo e usa Realtime sem expor conteúdo', async () => {
  const [page, service, migration] = await Promise.all([
    readFile(new URL('./AlunoPublicSupportPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./public-support.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/20260805203000_public_support_realtime_and_idempotency.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(service, /Preferences\.get\(\{ key: PUBLIC_SUPPORT_STORAGE_KEY \}\)/);
  assert.match(service, /Preferences\.set\(\{ key: PUBLIC_SUPPORT_STORAGE_KEY, value: accessToken \}\)/);
  assert.match(service, /status === 404 \|\| status === 410/);
  assert.match(page, /isPublicSupportAccessExpiredError\(history\.error\)/);
  assert.doesNotMatch(page, /history\.isError && accessToken[\s\S]{0,200}setAccessToken\(''\)/);
  assert.match(page, /\.on\('broadcast', \{ event: 'history-changed' \}/);
  assert.match(page, /refetchInterval: accessToken \? 60_000 : false/);
  assert.match(migration, /realtime\.send\([\s\S]*jsonb_build_object\('changed', true\)/);
  assert.match(migration, /'public-support:' \|\| v_access_hash/);
  assert.doesNotMatch(migration, /conteudo|remetente_nome|anexo_path/i);
});

test('abertura pública é idempotente e o chat autenticado ressincroniza ao retomar o app', async () => {
  const [page, service, edgeFunction, migration, atomicMigration, realtimeHook] = await Promise.all([
    readFile(new URL('./AlunoPublicSupportPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./public-support.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/functions/public-student-support/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/20260805203000_public_support_realtime_and_idempotency.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/20260805214500_create_public_support_ticket_atomic.sql', import.meta.url), 'utf8'),
    readFile(new URL('../comunicacao/useAlunoComunicacaoRealtime.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(service, /PUBLIC_SUPPORT_PENDING_REQUEST_KEY/);
  assert.match(service, /persistPublicSupportPendingRequest/);
  assert.match(service, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(service, /accessToken: string/);
  assert.match(page, /persistPublicSupportPendingRequest\(\{[\s\S]*accessToken: requestAccessToken/);
  assert.match(page, /createTicket\(\{[\s\S]*accessToken: requestAccessToken/);
  assert.match(page, /await persistPublicSupportAccessToken\(result\.accessToken\);[\s\S]*await clearPublicSupportPendingRequest\(\)/);
  assert.match(edgeFunction, /ACCESS_TOKEN_PATTERN/);
  assert.match(edgeFunction, /sha256\(accessToken\)/);
  assert.match(edgeFunction, /legacy-public-support-access/);
  assert.doesNotMatch(edgeFunction, /PUBLIC_SUPPORT_TOKEN_SECRET/);
  assert.doesNotMatch(edgeFunction, /deriveRequestAccessToken/);
  assert.match(edgeFunction, /"create_public_support_ticket_idempotent"/);
  assert.match(edgeFunction, /access:\$\{accessAction\}:\$\{accessHash\}/);
  assert.match(migration, /comunicacao_chats_public_request_id_uidx/);
  assert.match(atomicMigration, /pg_advisory_xact_lock/);
  assert.match(atomicMigration, /insert into public\.comunicacao_chats/);
  assert.match(atomicMigration, /insert into public\.comunicacao_mensagens/);
  assert.doesNotMatch(edgeFunction, /await admin\.from\("comunicacao_chats"\)\.delete/);
  assert.match(realtimeHook, /CapacitorApp\.addListener\('appStateChange'/);
  assert.match(realtimeHook, /reconnectVersion/);
  assert.doesNotMatch(realtimeHook, /\.channel\('aluno_comunicacao_msgs_global_realtime'\)/);
});

test('projetos nativos declaram as permissões de gravação', async () => {
  const [iosInfo, androidManifest] = await Promise.all([
    readFile(new URL('../../../ios/App/App/Info.plist', import.meta.url), 'utf8'),
    readFile(new URL('../../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8'),
  ]);

  assert.match(iosInfo, /<key>NSMicrophoneUsageDescription<\/key>/);
  assert.match(iosInfo, /O aplicativo usa o microfone para gravar mensagens de voz no atendimento\./);
  assert.match(androidManifest, /android\.permission\.RECORD_AUDIO/);
});

test('chat pré-login permanece visitante e nunca herda a identidade encontrada por CPF', async () => {
  const [page, edgeFunction, gestorView, unlinkMigration] = await Promise.all([
    readFile(new URL('./AlunoPublicSupportPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/functions/public-student-support/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../gestor/comunicacao/GestorComunicacaoParts.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/migrations/20260805222000_unlink_unauthenticated_public_support_chats.sql', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(page, /<CpfField/);
  assert.match(page, /atendimento público e não confirma sua identidade/);
  assert.doesNotMatch(edgeFunction, /resolve_public_support_identity_by_cpf/);
  assert.match(edgeFunction, /const requesterType = "Visitante"/);
  assert.match(edgeFunction, /const requesterId = null/);
  assert.match(gestorView, /Visitante não autenticado/);
  assert.match(unlinkMigration, /when\s*\(new\.origem = 'publico'\)/);
  assert.match(unlinkMigration, /and chat\.origem = 'publico'/);
  assert.match(unlinkMigration, /new\.remetente_id := null/);
});
