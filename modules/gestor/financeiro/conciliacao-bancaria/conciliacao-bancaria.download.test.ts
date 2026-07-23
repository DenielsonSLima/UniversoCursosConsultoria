import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBaneseRemittanceFileName,
  fetchBaneseRemittanceBlob,
  triggerBaneseRemittanceDownload,
} from './conciliacao-bancaria.download.ts';

const FILE_NAME = 'COB.240.123456.20260722.00017.12345.REM';
const SIGNED_URL = 'https://projeto.supabase.co/storage/v1/object/sign/banese/arquivo.rem?token=seguro';

test('preserva exatamente o nome oficial da remessa Banese', () => {
  assert.equal(assertBaneseRemittanceFileName(FILE_NAME), FILE_NAME);
  assert.throws(
    () => assertBaneseRemittanceFileName('arquivo.rem'),
    /nome de remessa inválido/i,
  );
  assert.throws(
    () => assertBaneseRemittanceFileName('../COB.240.123456.20260722.00017.12345.REM'),
    /nome de remessa inválido/i,
  );
});

test('baixa o blob pelo link assinado sem credenciais ou cache do navegador', async () => {
  let receivedUrl = '';
  let receivedInit: RequestInit | undefined;
  const expectedBlob = new Blob(['CNAB240']);

  const blob = await fetchBaneseRemittanceBlob(
    { signedUrl: SIGNED_URL, fileName: FILE_NAME, expiresIn: 60 },
    async (url, init) => {
      receivedUrl = url;
      receivedInit = init;
      return { ok: true, status: 200, blob: async () => expectedBlob };
    },
  );

  assert.equal(blob, expectedBlob);
  assert.equal(receivedUrl, SIGNED_URL);
  assert.deepEqual(receivedInit, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
  });
});

test('recusa link expirado, resposta HTTP inválida e arquivo vazio', async () => {
  await assert.rejects(
    fetchBaneseRemittanceBlob(
      { signedUrl: SIGNED_URL, fileName: FILE_NAME, expiresIn: 61 },
      async () => ({ ok: true, status: 200, blob: async () => new Blob(['CNAB240']) }),
    ),
    /validade segura/i,
  );

  await assert.rejects(
    fetchBaneseRemittanceBlob(
      { signedUrl: SIGNED_URL, fileName: FILE_NAME, expiresIn: 60 },
      async () => ({ ok: false, status: 403, blob: async () => new Blob() }),
    ),
    /HTTP 403/i,
  );

  await assert.rejects(
    fetchBaneseRemittanceBlob(
      { signedUrl: SIGNED_URL, fileName: FILE_NAME, expiresIn: 60 },
      async () => ({ ok: true, status: 200, blob: async () => new Blob() }),
    ),
    /arquivo de remessa vazio/i,
  );
});

test('aciona o download com o nome oficial e revoga a URL temporária', () => {
  const events: string[] = [];
  const anchor = {
    href: '',
    download: '',
    rel: '',
    style: { display: '' },
    click: () => { events.push('click'); },
    remove: () => { events.push('remove'); },
  };

  triggerBaneseRemittanceDownload(new Blob(['CNAB240']), FILE_NAME, {
    createObjectUrl: () => {
      events.push('create');
      return 'blob:remessa-segura';
    },
    revokeObjectUrl: (url) => { events.push(`revoke:${url}`); },
    createAnchor: () => anchor,
    appendAnchor: () => { events.push('append'); },
    defer: (callback) => {
      events.push('defer');
      callback();
    },
  });

  assert.equal(anchor.href, 'blob:remessa-segura');
  assert.equal(anchor.download, FILE_NAME);
  assert.equal(anchor.rel, 'noopener noreferrer');
  assert.equal(anchor.style.display, 'none');
  assert.deepEqual(events, [
    'create',
    'append',
    'click',
    'remove',
    'defer',
    'revoke:blob:remessa-segura',
  ]);
});
