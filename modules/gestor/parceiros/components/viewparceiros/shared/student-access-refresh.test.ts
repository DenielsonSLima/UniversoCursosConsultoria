import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { QueryClient } from '@tanstack/react-query';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import type { PartnerEmailConfirmationStatus } from '../../../portal-activation.service';
import { refreshStudentAccess } from './student-access-refresh.ts';
import { buildStudentAccessState } from './student-access-state.ts';

const partnerId = 'review-student';
const emailStatus = {
  partnerId, status: 'confirmed' as const, authUserExists: true,
  emailConfirmed: true, emailValidatedByManager: true,
};
const currentPartner = {
  id: partnerId, email: 'review@example.invalid', trocaSenhaObrigatoria: false,
  senhaAtualizadaEm: '2026-10-11T12:00:00Z', senhaTemporariaPendente: false,
  aceitouTermosUso: false,
};
const newClient = () => new QueryClient({
  defaultOptions: { queries: { staleTime: 300_000, refetchOnWindowFocus: false, retry: false } },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
};

test('revalidação substitui initialData parcial da busca global mesmo com cache fresco de cinco minutos', async () => {
  const client = newClient();
  client.setQueryData(['parceiro', partnerId], { id: partnerId, nome: 'Fixture parcial' });
  client.setQueryData(['partner-email-confirmation-status', partnerId], { ...emailStatus, status: 'pending', emailConfirmed: false });
  let partnerReads = 0;
  let emailReads = 0;
  try {
    const partner = await refreshStudentAccess(client, partnerId, {
      getPartner: async () => { partnerReads += 1; return currentPartner; },
      getEmailStatus: async () => { emailReads += 1; return emailStatus; },
    });
    assert.equal(partnerReads, 1);
    assert.equal(emailReads, 1);
    assert.deepEqual(client.getQueryData(['parceiro', partnerId]), currentPartner);
    assert.deepEqual(client.getQueryData(['partner-email-confirmation-status', partnerId]), emailStatus);
    const state = buildStudentAccessState({
      hasContactEmail: Boolean(partner.email), emailConfirmed: true, emailValidatedByManager: true,
      emailConfirmationStatus: 'confirmed', requiresPasswordReset: partner.trocaSenhaObrigatoria,
      credentialEvidence: { passwordUpdatedAt: partner.senhaAtualizadaEm, temporaryPasswordPending: partner.senhaTemporariaPendente },
      acceptedTerms: partner.aceitouTermosUso,
    });
    assert.equal(state.actionLabel, 'Enviar recuperação de senha');
    assert.equal(state.termsStatus, 'pending');
    assert.equal(state.showTemporaryPasswordAssistance, false);
  } finally { client.clear(); }
});

test('nova entrada relê senha própria criada em outra sessão sem depender de foco ou expiração do cache', async () => {
  const client = newClient();
  let server = { ...currentPartner, trocaSenhaObrigatoria: true, senhaAtualizadaEm: '' };
  let reads = 0;
  const sources = {
    getPartner: async () => { reads += 1; return server; },
    getEmailStatus: async () => emailStatus,
  };
  try {
    await refreshStudentAccess(client, partnerId, sources);
    server = currentPartner;
    const refreshed = await refreshStudentAccess(client, partnerId, sources);
    assert.equal(reads, 2);
    assert.equal(refreshed.trocaSenhaObrigatoria, false);
    assert.equal(refreshed.senhaAtualizadaEm, currentPartner.senhaAtualizadaEm);
  } finally { client.clear(); }
});

test('reentrada cancela cadastro em voo e não aceita a senha anterior capturada pela primeira rodada', async () => {
  const client = newClient();
  const previousPartner = { ...currentPartner, trocaSenhaObrigatoria: true, senhaAtualizadaEm: '' };
  const oldRead = deferred<typeof currentPartner>();
  const started = deferred<void>();
  const controller = new AbortController();
  let partnerReads = 0;
  let emailReads = 0;
  const sources = {
    getPartner: async () => {
      partnerReads += 1;
      if (partnerReads === 1) { started.resolve(); return oldRead.promise; }
      return currentPartner;
    },
    getEmailStatus: async () => { emailReads += 1; return emailStatus; },
  };
  try {
    const firstRejected = assert.rejects(refreshStudentAccess(client, partnerId, sources, controller.signal));
    await started.promise;
    controller.abort();
    const refreshed = await refreshStudentAccess(client, partnerId, sources);
    await firstRejected;
    assert.equal(partnerReads, 2);
    assert.equal(emailReads, 1);
    assert.deepEqual(refreshed, currentPartner);
    oldRead.resolve(previousPartner);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(client.getQueryData(['parceiro', partnerId]), currentPartner);
  } finally { client.clear(); }
});

test('revalidação cancela e-mail anterior em voo, inclusive auto-query iniciada pelo cadastro recém-atualizado', async () => {
  for (const startAfterPartner of [false, true]) {
    const client = newClient();
    const oldRead = deferred<PartnerEmailConfirmationStatus>();
    const previousStatus = { ...emailStatus, status: 'pending' as const, emailConfirmed: false };
    let oldRejected: Promise<void> | undefined;
    let emailReads = 0;
    const startOldRead = () => {
      oldRejected = assert.rejects(client.fetchQuery({
        queryKey: ['partner-email-confirmation-status', partnerId],
        queryFn: () => oldRead.promise,
        staleTime: 0,
      }));
    };
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (startAfterPartner && !oldRejected && event.type === 'updated'
        && event.query.queryKey[0] === 'parceiro' && event.action.type === 'success') startOldRead();
    });
    try {
      if (!startAfterPartner) startOldRead();
      await refreshStudentAccess(client, partnerId, {
        getPartner: async () => currentPartner,
        getEmailStatus: async () => { emailReads += 1; return emailStatus; },
      });
      assert.ok(oldRejected);
      await oldRejected;
      assert.equal(emailReads, 1);
      oldRead.resolve(previousStatus);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(client.getQueryData(['partner-email-confirmation-status', partnerId]), emailStatus);
    } finally { unsubscribe(); client.clear(); }
  }
});

test('rodada abandonada não inicia consulta de e-mail nem conclui a revalidação após responder o cadastro', async () => {
  const client = newClient();
  const read = deferred<typeof currentPartner>();
  const started = deferred<void>();
  const controller = new AbortController();
  let emailReads = 0;
  try {
    const rejected = assert.rejects(refreshStudentAccess(client, partnerId, {
      getPartner: async () => { started.resolve(); return read.promise; },
      getEmailStatus: async () => { emailReads += 1; return emailStatus; },
    }, controller.signal), /cancelada/);
    await started.promise;
    controller.abort();
    read.resolve(currentPartner);
    await rejected;
    assert.equal(emailReads, 0);
  } finally { client.clear(); }
});

test('consulta de e-mail depende do cadastro fresco, inclusive quando snapshot antigo não tinha e-mail', async () => {
  const client = newClient();
  client.setQueryData(['parceiro', partnerId], { id: partnerId, email: null });
  let emailReads = 0;
  try {
    await refreshStudentAccess(client, partnerId, {
      getPartner: async () => currentPartner,
      getEmailStatus: async () => { emailReads += 1; return emailStatus; },
    });
    assert.equal(emailReads, 1);
    await refreshStudentAccess(client, partnerId, {
      getPartner: async () => ({ ...currentPartner, email: null }),
      getEmailStatus: async () => { emailReads += 1; return emailStatus; },
    });
    assert.equal(emailReads, 1);
  } finally { client.clear(); }
});

test('falha de leitura ou confirmação desconhecida rejeita revalidação em vez de aceitar o cache anterior', async () => {
  const client = newClient();
  client.setQueryData(['parceiro', partnerId], currentPartner);
  try {
    await assert.rejects(refreshStudentAccess(client, partnerId, {
      getPartner: async () => { throw new Error('offline'); },
      getEmailStatus: async () => emailStatus,
    }), /offline/);
    for (const status of [null, { ...emailStatus, status: 'unknown' as const }]) {
      await assert.rejects(refreshStudentAccess(client, partnerId, {
        getPartner: async () => currentPartner,
        getEmailStatus: async () => status,
      }), /confirmação do e-mail/);
    }
  } finally { client.clear(); }
});

const accessComponentPath = fileURLToPath(new URL('./ParceiroAcesso.tsx', import.meta.url));
const renderBundle = await build({
  stdin: {
    resolveDir: process.cwd(), sourcefile: 'access-refresh-render.tsx', loader: 'tsx',
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import ParceiroAcesso from ${JSON.stringify(accessComponentPath)};
      import { accessFailure } from 'access-query-fixture';
      export const render = (refreshStatus, failure = null) => {
        Object.assign(accessFailure, { error: failure, handled: false, refreshRequested: false });
        const client = new QueryClient();
        client.setQueryData(['partner-email-confirmation-status', 'review-student'], {
          partnerId: 'review-student', status: 'confirmed', emailConfirmed: true, emailValidatedByManager: true,
        });
        client.setQueryData(['partner-google-identity-status', 'review-student'], {
          email: 'review@example.invalid', has_auth_user: true, google_linked: false,
        });
        const html = renderToStaticMarkup(<QueryClientProvider client={client}><ParceiroAcesso
          parceiroId="review-student" email="review@example.invalid" tipo="Aluno" acessoStatus="ativo"
          trocaSenhaObrigatoria={false} credentialEvidence={{ passwordUpdatedAt: '2026-10-11T12:00:00Z', temporaryPasswordPending: false }}
          aceitouTermosUso={false} accessRefreshStatus={refreshStatus}
          onRefreshAccess={() => { accessFailure.refreshRequested = true; }}
        /></QueryClientProvider>);
        client.clear();
        return html;
      };
      export const renderFailure = (error) => {
        const html = render('loading', error);
        return { html, refreshRequested: accessFailure.refreshRequested };
      };
    `,
  },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent',
  banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(import.meta.url)});` },
  plugins: [{
    name: 'read-only-access-service-fixtures',
    setup(builder) {
      builder.onResolve({ filter: /^access-query-fixture$/ }, () => ({ path: 'access-query-fixture', namespace: 'access-query-fixture' }));
      builder.onResolve({ filter: /^@tanstack\/react-query$/ }, (args) => args.importer === accessComponentPath
        ? { path: 'access-query-fixture', namespace: 'access-query-fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'access-query-fixture' }, () => ({
        contents: `
          import { useMutation as useRealMutation } from '@tanstack/react-query';
          export { useQuery, useQueryClient } from '@tanstack/react-query';
          export const accessFailure = { error: null, handled: false, refreshRequested: false };
          export const useMutation = (options) => {
            if (accessFailure.error && !accessFailure.handled) {
              accessFailure.handled = true;
              options.onError(accessFailure.error);
            }
            return useRealMutation(options);
          };
        `,
        loader: 'js', resolveDir: process.cwd(),
      }));
      builder.onResolve({ filter: /(?:portal-activation\.service|app-url)$/ }, (args) => ({ path: args.path, namespace: 'access-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'access-fixture' }, (args) => ({
        contents: args.path.endsWith('app-url')
          ? "export const buildConfiguredAuthRedirectUrl = (path) => 'https://review.invalid' + path;"
          : "export const portalActivationService = new Proxy({}, { get: () => async () => { throw new Error('Nenhuma chamada remota permitida no teste.'); } });",
        loader: 'js',
      }));
    },
  }],
});
const renderedAccess = await import(`data:text/javascript;base64,${Buffer.from(renderBundle.outputFiles[0].text).toString('base64')}`);

test('UI bloqueia envio e confirmação durante entrada, revalidação e falha, apesar do cache confirmado', () => {
  for (const status of ['idle', 'loading', 'error']) {
    const html = renderedAccess.render(status);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Verificar acesso<\/button>/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Confirmar e-mail<\/button>/);
    assert.doesNotMatch(html, /Senha temporária assistida|Senha própria definida|Aceite pendente/);
    if (status === 'error') assert.match(html, /Tentar novamente/);
  }
});

test('UI libera somente recuperação após leitura fresca com senha própria e termos pendentes', () => {
  const html = renderedAccess.render('ready');
  assert.match(html, /Senha definida — termos de uso pendentes/);
  assert.match(html, /<button(?![^>]*\sdisabled=)[^>]*>Enviar recuperação de senha<\/button>/);
  assert.doesNotMatch(html, /Senha temporária assistida|Reenviar primeiro acesso/);
});

test('falha de envio solicita releitura, mantém aviso de envio real e bloqueia ações até a leitura concluir', () => {
  const { html, refreshRequested } = renderedAccess.renderFailure({
    status: 409, code: 'ALUNO_ACESSO_ALTERADO_DURANTE_ENVIO',
    message: 'O e-mail já foi enviado; seu envio não foi cancelado.',
  });
  assert.equal(refreshRequested, true);
  assert.match(html, /O e-mail já foi enviado; seu envio não foi cancelado\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Verificar acesso<\/button>/);
  assert.doesNotMatch(html, /Senha temporária assistida/);
});
