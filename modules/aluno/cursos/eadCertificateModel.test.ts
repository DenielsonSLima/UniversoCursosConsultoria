import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ALUNO_CERTIFICATE_MODEL_LOAD_ERROR,
  ALUNO_CERTIFICATE_MODEL_UNAVAILABLE,
  alunoCertificateModelQueryOptions,
  alunoCertificateModelState,
  getAlunoCertificateActions,
  parseAlunoEadCertificateModel,
} from './eadCertificateModel.ts';

const requireTool = createRequire(process.env.EAD_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.EAD_UI_NODE_MODULES, '../ead-student-model-runner.mjs')) : import.meta.url);
const { QueryClient, QueryObserver } = requireTool('@tanstack/react-query');

const model = { id: 'ead-synthetic', textoFrente: 'Texto salvo', blocks: [{ id: 'text', x: 12 }] };
const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Estado esperado não foi alcançado');
};

test('o contrato aceita um modelo único e preserva sua configuração sem fallback', () => {
  assert.equal(parseAlunoEadCertificateModel(model), model);
  for (const value of [null, undefined, [], [model], {}, { id: '' }, { id: 4 }, 'model']) {
    assert.throws(() => parseAlunoEadCertificateModel(value), /modelo deste certificado/);
  }
});

test('consulta é isolada por aluno e certificado e não envia alunoId para o servidor', async () => {
  const received: unknown[] = [];
  const fetch = async (...args: unknown[]) => { received.push(args); return model; };
  const options = alunoCertificateModelQueryOptions('student-a', 'certificate-a', fetch);
  const signal = new AbortController().signal;
  assert.deepEqual(options.queryKey, ['aluno-ead-certificate-model', 'student-a', 'certificate-a']);
  assert.equal(await options.queryFn({ signal }), model);
  assert.deepEqual(received, [['certificate-a', signal]]);
  for (const [student, certificate, allowed] of [
    ['', 'certificate-a', true], ['student-a', '', true], ['student-a', 'certificate-a', false],
  ] as const) {
    const disabled = alunoCertificateModelQueryOptions(student, certificate, fetch, allowed);
    assert.equal(disabled.enabled, false);
    await assert.rejects(disabled.queryFn({ signal }));
  }
  assert.equal(received.length, 1);
});

test('erro transitório não repete sozinho; repetição explícita recupera e erro novo oculta cache antigo', async () => {
  let requests = 0;
  let fails = true;
  const client = new QueryClient();
  const options = alunoCertificateModelQueryOptions('student-a', 'certificate-a', async () => {
    requests++;
    if (fails) throw new Error('Falha sintética de rede');
    return model;
  });
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    await waitFor(() => observer.getCurrentResult().isError);
    assert.equal(alunoCertificateModelState(true, observer.getCurrentResult()).certificateModelError,
      ALUNO_CERTIFICATE_MODEL_LOAD_ERROR);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests, 1, 'não há retry automático em loop');
    fails = false;
    await observer.refetch();
    assert.equal(requests, 2);
    assert.deepEqual(alunoCertificateModelState(true, observer.getCurrentResult()).eadCertificateModel, model);
    fails = true;
    await observer.refetch();
    const errorState = alunoCertificateModelState(true, observer.getCurrentResult());
    assert.equal(errorState.eadCertificateModel, undefined);
    assert.equal(errorState.certificateModelLoading, false);
    assert.equal(errorState.certificateModelError, ALUNO_CERTIFICATE_MODEL_LOAD_ERROR);
  } finally { unsubscribe(); client.clear(); }
});

test('trocar conta ou certificado não reutiliza o modelo de outro contexto', async () => {
  const client = new QueryClient();
  const first = alunoCertificateModelQueryOptions('student-a', 'certificate-a', async () => model);
  const observer = new QueryObserver(client, first);
  const unsubscribe = observer.subscribe(() => {});
  try {
    await waitFor(() => observer.getCurrentResult().isSuccess);
    let resolveNext!: (value: typeof model) => void;
    const pending = new Promise<typeof model>(resolve => { resolveNext = resolve; });
    observer.setOptions(alunoCertificateModelQueryOptions('student-b', 'certificate-a', () => pending));
    assert.equal(alunoCertificateModelState(true, observer.getCurrentResult()).eadCertificateModel, undefined);
    assert.equal(alunoCertificateModelState(true, observer.getCurrentResult()).certificateModelLoading, true);
    resolveNext({ ...model, id: 'model-b' });
    await waitFor(() => observer.getCurrentResult().isSuccess);
    assert.equal(observer.getCurrentResult().data?.id, 'model-b');
    observer.setOptions(alunoCertificateModelQueryOptions('student-b', 'certificate-b', async () => {
      throw { code: 'P0002' };
    }));
    await waitFor(() => observer.getCurrentResult().isError);
    const missing = alunoCertificateModelState(true, observer.getCurrentResult());
    assert.equal(missing.eadCertificateModel, undefined);
    assert.equal(missing.certificateModelError, ALUNO_CERTIFICATE_MODEL_UNAVAILABLE);
  } finally { unsubscribe(); client.clear(); }
});

test('consulta desabilitada não parece carregando e erro de autorização falha fechado', () => {
  assert.deepEqual(alunoCertificateModelState(false, {
    data: model, isPending: true, isFetching: false, isError: false,
  }), { eadCertificateModel: undefined, certificateModelLoading: false, certificateModelError: '' });
  const denied = alunoCertificateModelState(true, {
    data: model, isPending: false, isFetching: false, isError: true, error: { code: '42501' },
  });
  assert.equal(denied.eadCertificateModel, undefined);
  assert.equal(denied.certificateModelError, ALUNO_CERTIFICATE_MODEL_LOAD_ERROR);
});

test('ações distinguem indisponível, modelo, geração, impressão e PDF pronto', () => {
  const ready = {
    hasCertificate: true, modelLoading: false, modelError: '', pdfReady: true,
    pdfLoading: false, pdfError: '', printing: false,
  };
  assert.deepEqual(getAlunoCertificateActions(ready), { disabled: false, busy: false, label: 'Baixar PDF' });
  for (const [patch, expected] of [
    [{ hasCertificate: false }, { disabled: true, busy: false, label: 'Baixar PDF' }],
    [{ modelLoading: true }, { disabled: true, busy: true, label: 'Carregando modelo' }],
    [{ pdfReady: false, pdfLoading: true }, { disabled: true, busy: true, label: 'Gerando PDF' }],
    [{ printing: true }, { disabled: true, busy: true, label: 'Imprimindo' }],
    [{ modelError: 'Erro', pdfReady: false }, { disabled: true, busy: false, label: 'PDF indisponível' }],
    [{ pdfError: 'Erro PDF', pdfReady: false }, { disabled: true, busy: false, label: 'PDF indisponível' }],
    [{ pdfReady: false }, { disabled: true, busy: false, label: 'PDF indisponível' }],
  ] as const) assert.deepEqual(getAlunoCertificateActions({ ...ready, ...patch }), expected);
});
