import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')

const [
  turnstileWidget,
  institutionalLoginForm,
  studentLoginForm,
  passwordRecoveryPage,
  portalAuthFunction,
  loginService,
  portalSession,
  loginPage,
  indexHtml,
  envExample,
  appRouter,
  appLoginPage,
  appRecoveryPage,
  nativeOAuth,
  nativeAuthBridge,
  supabaseClient,
] = await Promise.all([
  readSource('modules/shared/auth/TurnstileWidget.tsx'),
  readSource('modules/login/components/LoginForm.tsx'),
  readSource('modules/public/login/AlunoLoginAuthCard.tsx'),
  readSource('modules/login/PasswordRecoveryPage.tsx'),
  readSource('supabase/functions/portal-auth/index.ts'),
  readSource('modules/login/login.service.ts'),
  readSource('modules/login/portal-session.ts'),
  readSource('modules/login/LoginPage.tsx'),
  readSource('index.html'),
  readSource('.env.example'),
  readSource('App.tsx'),
  readSource('modules/aluno/login-app/AlunoAppLoginPage.tsx'),
  readSource('modules/aluno/login-app/AlunoAppRecoveryPage.tsx'),
  readSource('modules/shared/auth/native-oauth.ts'),
  readSource('modules/shared/auth/NativeAuthBridge.tsx'),
  readSource('lib/supabase.ts'),
])

test('Turnstile exposes explicit loading, verification and recovery states', () => {
  for (const status of [
    'loading',
    'verifying',
    'interaction-required',
    'verified',
    'retrying',
    'error',
    'unsupported',
  ]) {
    assert.match(turnstileWidget, new RegExp(`'${status}'`))
  }

  assert.match(
    turnstileWidget,
    /appearance:\s*'always'/,
  )
  assert.doesNotMatch(turnstileWidget, /appearance:\s*'interaction-only'/)
  assert.match(turnstileWidget, /'retry-interval':\s*RETRY_INTERVAL_MS/)
  assert.match(turnstileWidget, /'refresh-expired':\s*'auto'/)
  assert.match(turnstileWidget, /'refresh-timeout':\s*'auto'/)
  assert.doesNotMatch(turnstileWidget, /VITE_TURNSTILE_LOCAL_HOSTNAMES/)
  assert.match(turnstileWidget, /'timeout-callback'/)
  assert.match(turnstileWidget, /'unsupported-callback'/)
  assert.match(turnstileWidget, /SCRIPT_LOAD_TIMEOUT_MS/)
  assert.match(turnstileWidget, /Tentar novamente/)
  assert.doesNotMatch(turnstileWidget, /style\.display\s*=\s*['"]none['"]/)
})

test('all credential flows wait for a verified Turnstile token', () => {
  for (const source of [
    institutionalLoginForm,
    studentLoginForm,
    passwordRecoveryPage,
  ]) {
    assert.match(source, /turnstileStatus\s*!==\s*'verified'/)
    assert.match(source, /setTurnstileToken\(''\)/)
  }

  assert.match(institutionalLoginForm, /Aguardando verificação/)
  assert.match(studentLoginForm, /Aguardando verificação/)
  assert.match(studentLoginForm, /action="signup"/)
  assert.doesNotMatch(
    institutionalLoginForm,
    /Não foi possível validar o acesso\. Atualize a página/,
  )
  assert.doesNotMatch(
    studentLoginForm,
    /Não foi possível validar o acesso\. Atualize a página/,
  )
})

test('installed student app keeps password recovery inside the aluno scope', () => {
  assert.match(appLoginPage, /to="\/aluno\/recuperar-senha-app"/)
  assert.match(appRouter, /path="\/aluno\/recuperar-senha-app"/)
  assert.match(appRecoveryPage, /<PasswordRecoveryPage appFlow \/>/)
  assert.match(
    passwordRecoveryPage,
    /appFlow \? '\/aluno\/recuperar-senha-app' : '\/recuperar-senha'/,
  )
  assert.match(loginService, /redirectPath = '\/recuperar-senha'/)
  assert.match(loginService, /buildAuthRedirectUrl\(redirectPath\)/)
})

test('native Google OAuth uses PKCE and never returns session tokens in the callback URL', () => {
  assert.match(supabaseClient, /flowType:\s*Capacitor\.isNativePlatform\(\)\s*\?\s*'pkce'/)
  assert.match(nativeOAuth, /exchangeCodeForSession\(callback\.code\)/)
  assert.match(nativeOAuth, /code:\s*read\('code'\)/)
  assert.doesNotMatch(nativeOAuth, /read\('access_token'\)/)
  assert.doesNotMatch(nativeOAuth, /read\('refresh_token'\)/)
  assert.doesNotMatch(nativeOAuth, /auth\.setSession/)
})

test('native OAuth callback bridge is single-flight and preserves pending state on browser close', () => {
  const claimIndex = nativeAuthBridge.indexOf('processedUrlsRef.current.add(url)')
  const queueIndex = nativeAuthBridge.indexOf('callbackQueue.then(')

  assert.ok(claimIndex >= 0)
  assert.ok(queueIndex > claimIndex)
  assert.match(nativeAuthBridge, /let callbackQueue:\s*Promise<void>\s*=\s*Promise\.resolve\(\)/)
  assert.match(
    nativeAuthBridge,
    /callbackQueue\.then\([\s\S]*?processUrl\(url, source\)[\s\S]*?processUrl\(url, source\)/,
  )
  assert.match(nativeAuthBridge, /logNativeOAuthEvent\('callback_deduplicated'/)

  const browserFinishedListener = nativeAuthBridge.slice(
    nativeAuthBridge.indexOf("Browser.addListener('browserFinished'"),
    nativeAuthBridge.indexOf("CapacitorApp.addListener('resume'"),
  )
  assert.ok(browserFinishedListener.length > 0)
  assert.doesNotMatch(browserFinishedListener, /clearPendingNativeOAuth/)
  assert.doesNotMatch(browserFinishedListener, /oauth_error|cancelled/)

  assert.doesNotMatch(nativeAuthBridge, /CapacitorApp\.addListener\('resume'/)
  assert.match(nativeAuthBridge, /await handleLaunchUrl\(\)/)
  assert.match(nativeOAuth, /NATIVE_OAUTH_STARTED_EVENT/)
  assert.match(nativeOAuth, /dispatchEvent\(new window\.CustomEvent\(NATIVE_OAUTH_STARTED_EVENT\)\)/)
  assert.match(nativeAuthBridge, /processedUrlsRef\.current\.clear\(\)/)
  assert.match(nativeAuthBridge, /removeEventListener\(NATIVE_OAUTH_STARTED_EVENT/)
  assert.match(nativeOAuth, /NATIVE_OAUTH_BROWSER_FINISHED_EVENT/)
  assert.match(
    nativeAuthBridge,
    /dispatchEvent\(new window\.CustomEvent\(NATIVE_OAUTH_BROWSER_FINISHED_EVENT\)\)/,
  )
  assert.match(appLoginPage, /addEventListener\(NATIVE_OAUTH_BROWSER_FINISHED_EVENT/)
  assert.match(appLoginPage, /handleBrowserFinished = \(\) => setLoading\(false\)/)
})

test('native OAuth bridge diagnostics never log callback secrets', () => {
  assert.match(nativeAuthBridge, /logNativeOAuthEvent\('callback_received'/)
  assert.match(nativeAuthBridge, /logNativeOAuthEvent\('callback_completed'/)
  assert.match(nativeAuthBridge, /logNativeOAuthEvent\('callback_failed'/)
  assert.doesNotMatch(nativeAuthBridge, /console\.(?:info|warn|error)\([^\n]*(?:url|code|token)/i)
})

test('portal-auth validates challenge before consuming identifier quota', () => {
  const handler = portalAuthFunction.slice(portalAuthFunction.indexOf('Deno.serve'))
  const ipRateLimitCall = handler.indexOf('await checkIpRateLimit(')
  const turnstileCall = handler.indexOf('await verifyTurnstile(')
  const identifierRateLimitCall = handler.indexOf('await checkIdentifierRateLimit(')

  assert.ok(ipRateLimitCall >= 0)
  assert.ok(turnstileCall > ipRateLimitCall)
  assert.ok(identifierRateLimitCall > turnstileCall)
  assert.doesNotMatch(portalAuthFunction, /isTurnstileRequired/)
  assert.match(portalAuthFunction, /TURNSTILE_ALLOWED_HOSTNAMES/)
  assert.match(portalAuthFunction, /TURNSTILE_LOCAL_HOSTNAMES/)
  assert.match(portalAuthFunction, /isUniversalTurnstileTestSecret/)
  assert.match(portalAuthFunction, /\/\^\[123\]x0\{31\}AA\$\//)
  assert.match(portalAuthFunction, /requestOrigin\.protocol === "https:"/)
  assert.match(portalAuthFunction, /challenge_failed/)
  assert.match(portalAuthFunction, /rate_limited/)
  assert.match(portalAuthFunction, /service_unavailable/)
  assert.match(portalAuthFunction, /cpf_already_registered/)
  assert.match(portalAuthFunction, /is_public_aluno_cpf_available/)
})

test('portal-auth emits non-sensitive timing breakdowns', () => {
  for (const timing of [
    'ipRateLimitMs',
    'turnstileMs',
    'identifierRateLimitMs',
    'identityMs',
    'authMs',
    'totalMs',
  ]) {
    assert.match(portalAuthFunction, new RegExp(timing))
  }

  assert.match(portalAuthFunction, /portal-auth: timing/)
})

test('authenticated user is reused while institutional access is resolved', () => {
  assert.match(portalSession, /authenticatedUser\?:\s*User\s*\|\s*null/)
  assert.match(
    portalSession,
    /getInstitutionalProfiles\s*=\s*async\s*\(\s*authenticatedUser\?:\s*User\s*\|\s*null/,
  )
  assert.match(loginPage, /resolveInstitutionalAccess\(user\)/)
  assert.match(loginPage, /resolveInstitutionalAccess\(session\.user\)/)
  assert.doesNotMatch(loginPage, /\balert\(/)
})

test('safe backend failure codes are translated without exposing credentials', () => {
  assert.match(loginService, /challenge_failed/)
  assert.match(loginService, /service_unavailable/)
  assert.match(loginService, /rate_limited/)
  assert.match(loginService, /transportFailure/)
  assert.match(loginService, /AUTH_GENERIC_ERROR/)
})

test('Cloudflare challenge origin is preconnected', () => {
  assert.match(
    indexHtml,
    /rel="preconnect"\s+href="https:\/\/challenges\.cloudflare\.com"/,
  )
  assert.match(
    indexHtml,
    /rel="dns-prefetch"\s+href="\/\/challenges\.cloudflare\.com"/,
  )
})

test('student login switches to the native Turnstile bridge inside the apps', () => {
  assert.match(studentLoginForm, /import AdaptiveTurnstileWidget/)
  assert.match(studentLoginForm, /<AdaptiveTurnstileWidget/)
  assert.doesNotMatch(studentLoginForm, /<TurnstileWidget/)
})

test('public configuration does not expose private LAN addresses', () => {
  assert.doesNotMatch(envExample, /\b192\.168\./)
  assert.doesNotMatch(turnstileWidget, /\b192\.168\./)
  assert.doesNotMatch(portalAuthFunction, /\b192\.168\./)
})
