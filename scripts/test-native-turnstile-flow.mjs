import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [
  bridge,
  nativeWidget,
  challengePage,
  adaptiveWidget,
  appRouter,
  appLogin,
  appSignup,
  recoveryEntry,
  supportPage,
  loginService,
  publicAlunoAuthEntry,
  publicSupportService,
  cors,
  portalAuthEntry,
  portalAuthSecurity,
  publicSupport,
  vercel,
  nativeAppBridge,
  nativeAppService,
  androidManifest,
  alunoPortalProfile,
  alunoConnectivityStatus,
  nativePushPermissionBootstrap,
  alunoCommunication,
  alunoMobileCommunication,
  supportAvailabilityCard,
  supabaseClient,
  pushDispatcher,
  publicPushMigration,
  notificationPage,
  notificationDetail,
  notificationService,
  dedicatedChallengeHtml,
  dedicatedChallengeScript,
  viteConfig,
] = await Promise.all([
  readSource('modules/shared/auth/native-turnstile-bridge.ts'),
  readSource('modules/shared/auth/NativeTurnstileWidget.tsx'),
  readSource('modules/shared/auth/NativeTurnstileChallengePage.tsx'),
  readSource('modules/shared/auth/AdaptiveTurnstileWidget.tsx'),
  readSource('App.tsx'),
  readSource('modules/aluno/login-app/AlunoAppLoginPage.tsx'),
  readSource('modules/aluno/login-app/AlunoAppSignupPage.tsx'),
  readSource('modules/login/PasswordRecoveryPage.tsx'),
  readSource('modules/aluno/login-app/AlunoPublicSupportPage.tsx'),
  readSource('modules/login/login.service.ts'),
  readSource('modules/public/login/aluno-public-auth.service.ts'),
  readSource('modules/aluno/login-app/public-support.service.ts'),
  readSource('supabase/functions/_shared/http.ts'),
  readSource('supabase/functions/portal-auth/index.ts'),
  readSource('supabase/functions/portal-auth/request-security.ts'),
  readSource('supabase/functions/public-student-support/index.ts'),
  readSource('vercel.json'),
  readSource('modules/aluno/native-app/native-app.bridge.ts'),
  readSource('modules/aluno/native-app/native-app.service.ts'),
  readSource('android/app/src/main/AndroidManifest.xml'),
  readSource('modules/aluno/hooks/useAlunoPortalProfile.ts'),
  readSource('modules/aluno/pwa/AlunoConnectivityStatus.tsx'),
  readSource('modules/aluno/native-app/NativePushPermissionBootstrap.tsx'),
  readSource('modules/aluno/comunicacao/ComunicacaoPage.tsx'),
  readSource('modules/aluno/comunicacao/mobile/AlunoMobileComunicacao.tsx'),
  readSource('modules/aluno/comunicacao/AlunoSupportAvailabilityCard.tsx'),
  readSource('lib/supabase.ts'),
  readSource('supabase/functions/push-notification-dispatcher/index.ts'),
  readSource('supabase/migrations/20260803224500_add_scoped_public_support_push.sql'),
  readSource('modules/aluno/notificacoes/NotificacoesPage.tsx'),
  readSource('modules/aluno/notificacoes/AlunoNotificationDetail.tsx'),
  readSource('modules/aluno/notificacoes/notificacoes.service.ts'),
  readSource('native-turnstile.html'),
  readSource('native-turnstile.ts'),
  readSource('vite.config.ts'),
])

const portalAuth = `${portalAuthEntry}\n${portalAuthSecurity}`
const recoveryPage = [
  recoveryEntry,
  await readSource('modules/login/password-recovery/usePasswordRecovery.ts'),
  await readSource('modules/login/password-recovery/PasswordRecoveryAppView.tsx'),
  await readSource('modules/login/password-recovery/PasswordRecoveryWebView.tsx'),
].join('\n')
const publicAlunoAuth = [
  publicAlunoAuthEntry,
  await readSource('modules/public/login/aluno-public-auth.contract.ts'),
  await readSource('modules/public/login/aluno-public-auth.helpers.ts'),
  await readSource('modules/public/login/aluno-public-auth-session.helpers.ts'),
  await readSource('modules/public/login/aluno-public-first-access.service.ts'),
  await readSource('modules/public/login/aluno-public-session.service.ts'),
  await readSource('modules/public/login/aluno-public-signup.service.ts'),
].join('\n')

test('native challenge bridge binds messages to origin, frame, nonce and action', () => {
  assert.match(nativeWidget, /event\.origin !== challengeOrigin/)
  assert.match(nativeWidget, /event\.source !== iframeRef\.current\?\.contentWindow/)
  assert.match(nativeWidget, /event\.data\.nonce !== nonce/)
  assert.match(nativeWidget, /event\.data\.action !== action/)
  assert.match(challengePage, /postMessage\([\s\S]+parentOrigin\)/)
  assert.match(challengePage, /NATIVE_APP_ORIGINS\.has\(parentOrigin\)/)
  assert.match(bridge, /crypto\.getRandomValues/)
  assert.match(bridge, /\{32,128\}/)
})

test('native route and all installed student flows use the adaptive widget', () => {
  assert.match(appRouter, /window\.location\.pathname === '\/native-auth\/turnstile'/)
  assert.match(appRouter, /return <NativeTurnstileChallengePage \/>/)
  assert.doesNotMatch(appRouter, /lazy\(\(\) => import\('\.\/modules\/shared\/auth\/NativeTurnstileChallengePage'\)\)/)
  assert.match(adaptiveWidget, /Capacitor\.isNativePlatform\(\)/)
  assert.match(adaptiveWidget, /<NativeTurnstileWidget/)
  assert.match(adaptiveWidget, /<TurnstileWidget/)

  for (const source of [appLogin, appSignup, recoveryPage, supportPage]) {
    assert.match(source, /AdaptiveTurnstileWidget/)
  }
  assert.doesNotMatch(appLogin, /<TurnstileWidget/)
  assert.doesNotMatch(appSignup, /<TurnstileWidget/)
  assert.doesNotMatch(supportPage, /<TurnstileWidget/)
  assert.match(challengePage, /language:\s*'pt-BR'/)
  assert.match(nativeWidget, /Verificação de segurança/)
})

test('native challenge exposes progress and cannot remain loading indefinitely', () => {
  assert.match(nativeWidget, /lastChallengeRef/)
  assert.match(nativeWidget, /CHALLENGE_RESPONSE_TIMEOUT_MS/)
  assert.match(nativeWidget, /onErrorRef\.current\?\.\('challenge-timeout'\)/)
  assert.match(challengePage, /status:\s*'verifying'/)
  assert.match(challengePage, /status:\s*'interaction-required'/)
  assert.match(challengePage, /appearance:\s*'always'/)
  assert.match(challengePage, /'timeout-callback'/)
  assert.match(challengePage, /CHALLENGE_WATCHDOG_TIMEOUT_MS/)
  assert.match(challengePage, /errorCode:\s*'challenge-timeout'/)
})

test('native verified state stays refreshable without leaving a blank challenge panel', () => {
  assert.match(nativeWidget, /const isVerified = status === 'verified'/)
  assert.match(nativeWidget, /isVerified\s*\? 'relative h-0 overflow-hidden'/)
  assert.match(nativeWidget, /iframeRef\.current\?\.blur\(\)/)
  assert.match(nativeWidget, /!isVerified \? \(/)
  assert.match(nativeWidget, /verifiedTokenCache\.set\(action/)
  assert.match(nativeWidget, /CACHED_TOKEN_MAX_AGE_MS/)
  assert.match(nativeWidget, /border-emerald-200 bg-emerald-50/)
  assert.match(challengePage, /className="sr-only"/)
})

test('native credential, signup, recovery and support requests declare challenge context', () => {
  for (const source of [loginService, publicAlunoAuth, publicSupportService]) {
    assert.match(source, /challengeContext:\s*Capacitor\.isNativePlatform\(\)\s*\?\s*'native'\s*:\s*'web'/)
  }
  assert.match(loginService, /action:\s*'login'[\s\S]+challengeContext/)
  assert.match(loginService, /action:\s*'recover'[\s\S]+challengeContext/)
  assert.match(publicAlunoAuth, /action:\s*'signup'[\s\S]+challengeContext/)
  assert.match(publicSupportService, /action:\s*'create-ticket'[\s\S]+challengeContext/)
})

test('native app CORS allowlist is exact and contains both Capacitor origins', () => {
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    assert.match(cors, new RegExp(origin.replace(/[/:.]/g, '\\$&')))
  }
  assert.match(cors, /NATIVE_APP_ORIGINS\.has\(normalizedRequestOrigin\)/)
  assert.doesNotMatch(cors, /requestOrigin\.startsWith\(['"]capacitor:/)
})

test('native tokens use a dedicated secret and verified challenge hostname', () => {
  for (const source of [portalAuth, publicSupport]) {
    assert.match(source, /TURNSTILE_NATIVE_SECRET_KEY/)
    assert.match(source, /TURNSTILE_NATIVE_ALLOWED_HOSTNAMES/)
    assert.match(source, /native|isNativeChallenge/)
    assert.match(source, /Deno\.env\.get\("TURNSTILE_SECRET_KEY"\)/)
    assert.match(source, /challengeContext/)
    assert.match(source, /NATIVE_APP_ORIGINS\.has/)
    assert.match(source, /!native[^\n]*NATIVE_APP_ORIGINS\.has|!isNativeChallenge[^\n]*NATIVE_APP_ORIGINS\.has/)
  }
  assert.match(portalAuth, /getNativeTurnstileHostnames\(\)\.has\(verifiedHostname\)/)
  assert.match(publicSupport, /NATIVE_TURNSTILE_HOSTS\.has\(verifiedHostname\)/)
})

test('hosted challenge is the only cross-origin embeddable application route', () => {
  const config = JSON.parse(vercel)
  const globalHeaderEntry = config.headers.find((entry) => entry.source.includes('(?!native-auth/turnstile$)'))
  const globalHeaders = globalHeaderEntry.headers
  const challengeHeaders = config.headers.find((entry) => entry.source === '/native-auth/turnstile').headers
  const globalCsp = globalHeaders.find((header) => header.key === 'Content-Security-Policy').value
  const challengeCsp = challengeHeaders.find((header) => header.key === 'Content-Security-Policy').value

  assert.match(globalCsp, /frame-ancestors 'self'/)
  assert.match(globalHeaderEntry.source, /^\/\(\(\?!native-auth\/turnstile\$\)/)
  assert.match(challengeCsp, /frame-ancestors capacitor: https:\/\/localhost/)
  assert.match(challengeCsp, /default-src 'none'/)
  assert.match(challengeCsp, /script-src 'self' 'sha256-[A-Za-z0-9+/]+=*' https:\/\/challenges\.cloudflare\.com/)
  assert.doesNotMatch(challengeCsp, /script-src[^;]*'unsafe-inline'/)
  assert.match(challengeCsp, /img-src 'self' data: https:\/\/challenges\.cloudflare\.com/)
  assert.ok(!globalHeaders.some((header) => header.key === 'X-Frame-Options'))
  assert.equal(challengeHeaders.find((header) => header.key === 'Cache-Control').value, 'no-store, max-age=0')

  const challengeRewrite = config.rewrites.find((entry) => entry.source === '/native-auth/turnstile')
  assert.equal(challengeRewrite?.destination, '/native-turnstile.html')
  assert.match(viteConfig, /nativeTurnstile:\s*path\.resolve\(__dirname, 'native-turnstile\.html'\)/)
  assert.match(dedicatedChallengeHtml, /id="native-turnstile-container"/)
  assert.match(dedicatedChallengeHtml, /src="\/native-turnstile\.ts"/)
  assert.doesNotMatch(dedicatedChallengeHtml, /LogoUniverso|aluno-app-bootstrap-splash|Portal do Aluno/)
  assert.match(dedicatedChallengeScript, /NATIVE_APP_ORIGINS\.has\(parentOrigin\)/)
  assert.match(dedicatedChallengeScript, /appearance:\s*'always'/)
  assert.match(dedicatedChallengeScript, /postMessage\([\s\S]+parentOrigin\)/)
})

test('native logout and external student links fail closed', () => {
  assert.match(nativeAppService, /const localRevocation = bridge\.revokePushToken\(\)/)
  assert.match(nativeAppService, /Promise\.all\(\[serverLogout, localRevocation\]\)/)

  assert.match(nativeAppBridge, /CapacitorApp\.addListener\('appUrlOpen'/)
  assert.match(nativeAppBridge, /CapacitorApp\.getLaunchUrl\(\)/)
  assert.match(nativeAppBridge, /url\.hostname === 'aluno'/)
  assert.match(nativeAppBridge, /nativePath !== '\/' && nativePath !== '\/comunicacao'/)

  assert.match(androidManifest, /android:host="auth"[\s\S]+android:path="\/callback"/)
  assert.match(androidManifest, /android:host="aluno"[\s\S]+android:path="\/"/)
  assert.match(androidManifest, /android:host="aluno"[\s\S]+android:path="\/comunicacao"/)
  assert.doesNotMatch(androidManifest, /android:host="aluno"\s*\/>/)
})

test('unauthenticated native deep links do not wait for network logout', () => {
  assert.match(alunoPortalProfile, /clearPortalSession\(\);\s*if \(mounted\) navigateRef\.current\(buildLoginRedirect\(\), \{ replace: true \}\);/)
  assert.match(alunoPortalProfile, /\}, \[retrySignal\]\);/)
  assert.match(alunoPortalProfile, /void loginService\.logout\(\)\.catch\(\(\) => undefined\);/)
  assert.doesNotMatch(alunoPortalProfile, /await loginService\.logout\(\)/)
  assert.match(alunoPortalProfile, /supabase\.auth\.getSession\(\)/)
  assert.match(alunoPortalProfile, /!sessionData\.session/)
  assert.match(alunoPortalProfile, /withAuthTimeout\(supabase\.auth\.getUser\(\)\)/)
})

test('student app explains offline state and recovers when connectivity returns', () => {
  assert.match(appRouter, /<AlunoConnectivityStatus \/>/)
  assert.match(alunoConnectivityStatus, /navigator\.onLine/)
  assert.match(alunoConnectivityStatus, /addEventListener\('online'/)
  assert.match(alunoConnectivityStatus, /addEventListener\('offline'/)
  assert.match(alunoConnectivityStatus, /Você está sem internet/)
  assert.match(alunoConnectivityStatus, /Tentar novamente/)
})

test('native notification permission is a one-time app bootstrap, not an Atendimento prompt', () => {
  assert.match(appRouter, /<NativePushPermissionBootstrap \/>/)
  assert.match(nativePushPermissionBootstrap, /push-permission-onboarding-v1/)
  assert.match(nativePushPermissionBootstrap, /push\.permissionStatus === 'not_determined'/)
  assert.match(nativePushPermissionBootstrap, /bridge\.requestPushPermission\(\)/)
  assert.match(nativePushPermissionBootstrap, /Preferences\.set\(/)
  assert.match(nativeAppService, /setConsent\(push, true\)/)
  assert.match(alunoCommunication, /notifyOnResponse: isNativeApp && \(nativePushAllowed \|\| appNotificationsEnabled\)/)
  assert.doesNotMatch(alunoCommunication, /showNotificationOption|onNotificationChange/)
  assert.doesNotMatch(alunoCommunication, /AlunoAppNotificationCard/)
  assert.doesNotMatch(alunoMobileCommunication, /AlunoAppNotificationCard/)
  assert.doesNotMatch(supportAvailabilityCard, /texto_notificacao_optin|Ative as notificações/)
  assert.doesNotMatch(supportPage, /Quero ativar as notificações|BellRing|type="checkbox" checked=\{notifyReply\}/)
})

test('non-chat notifications open a persistent detail while chat keeps its conversation deep link', () => {
  assert.match(notificationPage, /module=notificacoes&notificationId=/)
  assert.match(notificationPage, /<AlunoNotificationDetail/)
  assert.match(notificationDetail, /Voltar às notificações/)
  assert.match(notificationDetail, /notification\.body/)
  assert.match(notificationDetail, /Abrir Financeiro/)

  assert.match(notificationService, /source_job_id/)
  assert.match(notificationService, /query\.eq\('source_job_id', sourceJobId\)/)
  assert.match(nativeAppBridge, /scope === 'student' && category !== 'chat'/)
  assert.match(nativeAppBridge, /module=notificacoes&notificationId=/)
  assert.match(nativeAppBridge, /module=notificacoes&sourceJobId=/)
  assert.match(nativeAppBridge, /readString\(data, \['deepLink', 'deep_link', 'route', 'path', 'url'\]\)/)

  for (const field of ['deepLink', 'jobId', 'category', 'scope']) {
    assert.match(pushDispatcher, new RegExp(`result\\.${field} = delivery\\.`))
  }
  assert.match(pushDispatcher, /result\.notificationId = notificationId/)
  assert.match(pushDispatcher, /delete result\[reservedKey\]/)
  assert.match(pushDispatcher, /result\.deep_link = delivery\.deep_link/)
  assert.match(pushDispatcher, /\.from\("aluno_notificacoes"\)/)
  assert.match(pushDispatcher, /notificationIdByJob\.get\(delivery\.job_id\)/)
  assert.match(pushDispatcher, /data: stringData\(/)
})

test('public support push is automatically scoped to the public chat access token', () => {
  assert.match(nativeAppService, /getPublicPushRegistration/)
  assert.match(publicSupportService, /action:\s*'register-push'/)
  assert.match(supportPage, /publicSupportService\.registerPush\(accessToken, publicPushRegistration\)/)
  assert.match(publicSupport, /action === "register-push"/)
  assert.match(publicSupport, /public_support_push_devices/)
  assert.match(publicSupport, /notificar_resposta:\s*true/)
  assert.match(publicPushMigration, /enable row level security/)
  assert.match(publicPushMigration, /revoke all on public\.public_support_push_devices from public, anon, authenticated/)
  assert.match(publicPushMigration, /enqueue_public_support_push_notification/)
  assert.match(pushDispatcher, /claim_public_support_push_deliveries/)
  assert.match(pushDispatcher, /complete_public_support_push_delivery/)
})

test('native login restores an existing persisted Supabase session', () => {
  assert.match(supabaseClient, /persistSession:\s*true/)
  assert.match(supabaseClient, /autoRefreshToken:\s*true/)
  assert.match(appLogin, /supabase\.auth\.getSession\(\)/)
  assert.match(
    appLogin,
    /navigate\(resolveProfilePostLoginRoute\(profile\.tipo, redirectPath\), \{ replace: true \}\)/,
  )
})
