import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfilePhotoFetch, profilePhotoPath, profilePhotoReference } from './profile-photo-transport.ts';

const base = 'https://photo-project.supabase.co';
const path = '11111111-1111-4111-8111-111111111111/perfil/foto.jpg';
const marker = profilePhotoReference(path);
const signed = `${base}/storage/v1/object/sign/fotos-perfil/${path}?token=short-lived`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'x-test-header': 'preserved' },
});

test('referência aceita somente caminho de foto; não aceita traversal ou URL externa', () => {
  assert.equal(profilePhotoPath(marker), path);
  assert.equal(profilePhotoPath('profile-photo://../file'), null);
  assert.equal(profilePhotoPath('profile-photo://11111111-1111-4111-8111-111111111111/perfil/..'), null);
  assert.equal(profilePhotoPath('https://external.test/photo'), null);
  assert.throws(() => profilePhotoReference('quarentena/file.jpg'));
});

test('assina referência dedicada com JWT da chamada e preserva resposta, sem cache entre sessões', async () => {
  const calls: Request[] = [];
  const transport = createProfilePhotoFetch(base, async (input, init) => {
    const request = new Request(input, init); calls.push(request);
    return request.url.includes('/rest/v1/')
      ? json([{ foto_url: marker, nested: { photo_url: marker } }])
      : json([{ path, signedURL: `/object/sign/fotos-perfil/${path}?token=short-lived`, error: null }]);
  });
  for (const token of ['user-a', 'user-b']) {
    const response = await transport(`${base}/rest/v1/parceiros`, {
      headers: { Authorization: `Bearer ${token}`, apikey: 'public-key' },
    });
    assert.equal(response.headers.get('x-test-header'), 'preserved');
    assert.deepEqual(await response.json(), [{ foto_url: signed, nested: { photo_url: signed } }]);
  }
  const signs = calls.filter(call => call.url.includes('/object/sign/'));
  assert.equal(signs.length, 2);
  assert.equal(signs[0].headers.get('authorization'), 'Bearer user-a');
  assert.equal(signs[1].headers.get('authorization'), 'Bearer user-b');
  assert.deepEqual(await signs[0].json(), { expiresIn: 300, paths: [path] });
});

test('não assina marker fora das chaves de foto nem URLs externas ou fora da origem', async () => {
  let calls = 0;
  const payload = { content: marker, foto_url: 'https://external.test/photo', studentPhotoUrl: 'javascript:bad()' };
  const transport = createProfilePhotoFetch(base, async () => { calls++; return json(payload); });
  assert.deepEqual(await (await transport(`${base}/rest/v1/parceiros`)).json(), payload);
  assert.deepEqual(await (await transport('https://external.test/rest/v1/parceiros')).json(), payload);
  assert.equal(calls, 2);
});

test('erro HTTP permanece íntegro e falha na assinatura oculta referência privada', async () => {
  const error = json({ error: 'denied', foto_url: marker }, 403);
  let sourceResponse = error;
  const transport = createProfilePhotoFetch(base, async input => {
    const url = input instanceof Request ? input.url : String(input);
    return url.includes('/rest/v1/') ? sourceResponse : json({ error: 'denied' }, 403);
  });
  assert.equal(await transport(`${base}/rest/v1/parceiros`), error);
  sourceResponse = json({ foto_url: marker });
  assert.deepEqual(await (await transport(`${base}/rest/v1/parceiros`)).json(), { foto_url: null });
});

test('normaliza só URLs assinadas próprias antes de gravar cadastro e snapshot', async () => {
  let captured: Request | null = null;
  const transport = createProfilePhotoFetch(base, async input => {
    captured = input as Request; return json({ ok: true });
  });
  await transport(`${base}/rest/v1/rpc/emitir_documento`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ foto_url: signed, p_dados: { studentPhotoUrl: signed, content: signed }, foto: 'https://external.test/photo' }),
  });
  assert.deepEqual(await captured!.json(), {
    foto_url: marker, p_dados: { studentPhotoUrl: marker, content: signed }, foto: 'https://external.test/photo',
  });
});

test('capability pública só acompanha resposta ativa da RPC exata e código correspondente', async () => {
  const requests: Request[] = [];
  let result = { code: 'DOC-CODE', status: 'ACTIVE', visibleFields: ['studentPhotoUrl'], studentPhotoUrl: marker };
  const transport = createProfilePhotoFetch(base, async (input, init) => {
    const request = new Request(input, init); requests.push(request);
    return request.url.includes('/rest/v1/') ? json(result) : json({ signedURL: signed });
  });
  const validate = () => transport(`${base}/rest/v1/rpc/validar_documento_por_codigo`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer anon-key' },
    body: JSON.stringify({ p_codigo: 'doc-code' }),
  });
  await validate();
  assert.equal(requests.at(-1)!.url, `${base}/functions/v1/profile-photo-access`);
  assert.deepEqual(await requests.at(-1)!.clone().json(), { code: 'DOC-CODE', path });
  for (const change of [
    { code: 'OTHER', status: 'ACTIVE', visibleFields: ['studentPhotoUrl'] },
    { code: 'DOC-CODE', status: 'REVOKED', visibleFields: ['studentPhotoUrl'] },
    { code: 'DOC-CODE', status: 'ACTIVE', visibleFields: [] },
  ]) {
    result = { ...result, ...change };
    await validate();
    assert.ok(requests.at(-1)!.url.includes('/storage/v1/object/sign/'));
  }
});

test('não aceita redirecionamento de assinatura para outra origem', async () => {
  const transport = createProfilePhotoFetch(base, async input => {
    const request = new Request(input);
    return request.url.includes('/rest/v1/') ? json({ foto_url: marker })
      : json([{ path, signedURL: 'https://attacker.test/object/sign/fotos-perfil/file' }]);
  });
  assert.deepEqual(await (await transport(`${base}/rest/v1/parceiros`)).json(), { foto_url: null });
});

test('lista com 21 fotos usa um POST em lote e deduplica referências repetidas', async () => {
  const paths = Array.from({ length: 21 }, (_, n) => path.replace('foto.jpg', `photo_${n}.jpg`));
  const calls: Request[] = [];
  const transport = createProfilePhotoFetch(base, async (input, init) => {
    const request = new Request(input, init); calls.push(request);
    if (request.url.includes('/rest/v1/')) {
      return json([...paths, paths[0]].map(value => ({ foto_url: profilePhotoReference(value) })));
    }
    assert.equal(request.url, `${base}/storage/v1/object/sign/fotos-perfil`);
    assert.deepEqual(await request.clone().json(), { expiresIn: 300, paths });
    return json(paths.map(value => ({ path: value, signedURL: `/object/sign/fotos-perfil/${value}?token=synthetic` })));
  });
  const response = await transport(`${base}/rest/v1/parceiros`, { headers: { Authorization: 'Bearer user-a' } });
  const data = await response.json();
  assert.equal(calls.length, 2);
  assert.equal(data.length, 22);
  assert.equal(data[0].foto_url, data[21].foto_url);
  assert.ok(data.every((item: any) => item.foto_url.startsWith(`${base}/storage/v1/object/sign/fotos-perfil/`)));
});

test('negação parcial oculta foto não autorizada sem bloquear outra nem conservar URL pública', async () => {
  const forbiddenPath = path.replace('foto.jpg', 'forbidden.jpg');
  const legacy = `${base}/storage/v1/object/public/documentos/${forbiddenPath}`;
  const transport = createProfilePhotoFetch(base, async (input, init) => {
    const request = new Request(input, init);
    if (request.url.includes('/rest/v1/')) return json([{ foto_url: marker }, { foto_url: legacy }], 201);
    return json([
      { path, signedURL: `/object/sign/fotos-perfil/${path}?token=short-lived`, error: null },
      { path: forbiddenPath, signedURL: null, error: 'not authorized' },
    ]);
  });
  const response = await transport(`${base}/rest/v1/parceiros`, { method: 'PATCH',
    headers: { Authorization: 'Bearer user-a', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test-header'), 'preserved');
  assert.deepEqual(await response.json(), [{ foto_url: signed }, { foto_url: null }]);
});

test('assinatura retornada deve pertencer ao path solicitado, além da origem própria', async () => {
  const transport = createProfilePhotoFetch(base, async input => {
    const request = new Request(input);
    return request.url.includes('/rest/v1/') ? json({ foto_url: marker })
      : json([{ path, signedURL: `/object/sign/fotos-perfil/${path.replace('foto.jpg', 'other.jpg')}?token=synthetic` }]);
  });
  assert.deepEqual(await (await transport(`${base}/rest/v1/parceiros`)).json(), { foto_url: null });
});

test('cadastro individual single hidrata a mesma foto da lista com o MIME de objeto PostgREST', async () => {
  for (const mediaType of ['application/vnd.pgrst.object+json', 'application/vnd.pgrst.object+json; charset=utf-8']) {
    const calls: Request[] = [];
    const transport = createProfilePhotoFetch(base, async (input, init) => {
      const request = new Request(input, init); calls.push(request);
      return request.url.includes('/rest/v1/')
        ? new Response(JSON.stringify({ id: 'student-demo', foto_url: marker }), {
          headers: { 'content-type': mediaType, 'x-test-header': 'preserved' },
        })
        : json([{ path, signedURL: `/object/sign/fotos-perfil/${path}?token=short-lived`, error: null }]);
    });
    const response = await transport(`${base}/rest/v1/parceiros?id=eq.student-demo`, {
      headers: { Accept: 'application/vnd.pgrst.object+json', Authorization: 'Bearer student-reader', apikey: 'public-key' },
    });
    assert.deepEqual(await response.json(), { id: 'student-demo', foto_url: signed });
    assert.equal(response.headers.get('content-type'), mediaType);
    assert.equal(response.headers.get('x-test-header'), 'preserved');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].headers.get('authorization'), 'Bearer student-reader');
    assert.deepEqual(await calls[1].json(), { expiresIn: 300, paths: [path] });
  }
});

test('objeto PostgREST não expõe a referência quando a assinatura é negada', async () => {
  const transport = createProfilePhotoFetch(base, async input => {
    const request = new Request(input);
    return request.url.includes('/rest/v1/')
      ? new Response(JSON.stringify({ foto_url: marker }), { headers: { 'content-type': 'application/vnd.pgrst.object+json' } })
      : json({ error: 'denied' }, 403);
  });
  assert.deepEqual(await (await transport(`${base}/rest/v1/parceiros?id=eq.student-demo`)).json(), { foto_url: null });
});
