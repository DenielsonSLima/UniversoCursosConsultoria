import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(
  new URL('./professor-documentos.service.ts', import.meta.url),
  'utf8',
);
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const file = { name: 'diploma.pdf', type: 'application/pdf', size: 42 };
const input = {
  documentoId: 'documento-sintetico',
  file,
  reservaRequestId: 'reserva-sintetica',
  confirmarRequestId: 'confirmacao-sintetica',
};

const runtime = ({ throwOnReplay = false } = {}) => {
  const calls = [];
  let uploadCount = 0;
  let committed = false;
  const supabase = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (params.p_acao === 'reservar') {
        return {
          data: { id: 'arquivo-sintetico', bucket: 'documentos-professores', path: 'reserva.pdf' },
          error: null,
        };
      }
      if (!committed) {
        committed = true;
        return { data: null, error: new Error('Resposta da confirmação perdida após commit') };
      }
      return {
        data: { documentoId: input.documentoId, arquivoId: 'arquivo-sintetico' },
        error: null,
      };
    },
    storage: {
      from() {
        return {
          async upload(path, receivedFile, options) {
            assert.equal(path, 'reserva.pdf');
            assert.equal(receivedFile, file);
            assert.equal(options.upsert, false, 'Versões nunca são substituídas');
            uploadCount += 1;
            if (uploadCount > 1 && throwOnReplay) {
              throw new Error('Falha de transporte no novo upload');
            }
            return {
              error: uploadCount === 1
                ? null
                : { statusCode: '403', message: 'RLS: reserva já confirmada' },
            };
          },
        };
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(() => ({ supabase }), module, module.exports);
  return { ...module.exports, calls };
};

test('reenvio recupera confirmação comitada sem resposta mesmo se Storage negar novo upload', async () => {
  const { professorDocumentosService: service, calls } = runtime();
  await assert.rejects(service.enviar('professor-sintetico', input), /perdida após commit/);
  assert.deepEqual(await service.enviar('professor-sintetico', input), {
    documentoId: input.documentoId,
    arquivoId: 'arquivo-sintetico',
  });
  assert.equal(calls.length, 4);
  const reservations = calls.filter((call) => call.params.p_acao === 'reservar');
  const confirmations = calls.filter((call) => call.params.p_acao === 'confirmar');
  assert.deepEqual(reservations[0], reservations[1], 'Reserva mantém request e payload');
  assert.deepEqual(confirmations[0], confirmations[1], 'Confirmação mantém request e payload');
});

test('replay da confirmação também recupera sucesso após exceção de transporte no upload', async () => {
  const { professorDocumentosService: service } = runtime({ throwOnReplay: true });
  await assert.rejects(service.enviar('professor-sintetico', input), /perdida após commit/);
  assert.equal((await service.enviar('professor-sintetico', input)).arquivoId, 'arquivo-sintetico');
});

test('arquivos inválidos não reservam nem enviam para o Storage', async () => {
  const { professorDocumentosService: service, calls, validateProfessorDocumentFile } = runtime();
  for (
    const invalid of [
      { ...file, size: 0 },
      { ...file, size: 10485761 },
      { ...file, type: 'application/octet-stream' },
      { ...file, name: 'x'.repeat(241) },
    ]
  ) {
    assert.throws(() => validateProfessorDocumentFile(invalid));
    await assert.rejects(service.enviar('professor-sintetico', { ...input, file: invalid }));
  }
  assert.equal(calls.length, 0);
  validateProfessorDocumentFile({ ...file, size: 10485760 });
});
