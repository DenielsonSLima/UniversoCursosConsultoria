import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPreceptorCrachaModel,
  getCrachaTemplateVariables,
  hasPreceptorCrachaLayout,
  PRECEPTOR_CRACHA_LAYOUT_VERSION,
  serializePreceptorCrachaModel,
} from './cracha-editor.model';

test('clone do Crachá de Preceptor preserva fundo/geometria e remove tokens de aluno', () => {
  const stageModel = {
    bgFrenteUrl: 'https://example.invalid/fundo-frente.jpg',
    bgVersoUrl: 'https://example.invalid/fundo-verso.jpg',
    hasVerso: true,
    fields: [
      { id: 'foto', type: 'foto', value: '{{ALUNO_FOTO}}', x: 22, y: 20, width: 40, height: 35, page: 'frente' },
      { id: 'nome', type: 'text', value: '{{ALUNO_NOME}}', x: 4, y: 62, width: 92, page: 'frente' },
      { id: 'cargo', type: 'text', value: 'ESTAGIÁRIO', x: 4, y: 68, width: 92, page: 'frente' },
      { id: 'matricula', type: 'text', value: 'MATRÍCULA\n{{ALUNO_MATRICULA}}', x: 8, y: 75, width: 40, page: 'frente' },
      { id: 'cpf', type: 'text', value: 'CPF\n{{ALUNO_CPF}}', x: 8, y: 81, width: 40, page: 'frente' },
      { id: 'curso', type: 'text', value: 'CURSO\n{{ALUNO_CURSO}}', x: 8, y: 87, width: 45, page: 'frente' },
      { id: 'qrcode', type: 'qrcode', value: 'QR_VALIDADOR_CRACHA', x: 66, y: 76, width: 24, height: 18, page: 'frente' },
    ],
  };

  const model = createPreceptorCrachaModel({ nomeModelo: 'Carteirinha de Preceptor' }, stageModel);
  const serializedFields = JSON.stringify(model.fields);

  assert.equal(model.layoutVersion, PRECEPTOR_CRACHA_LAYOUT_VERSION);
  assert.equal(model.nome, 'Crachá de Preceptor');
  assert.equal(model.bgFrenteUrl, stageModel.bgFrenteUrl);
  assert.equal(model.bgVersoUrl, stageModel.bgVersoUrl);
  assert.equal(hasPreceptorCrachaLayout(model), true);
  assert.match(serializedFields, /PRECEPTOR_NOME/);
  assert.match(serializedFields, /PRECEPTOR_REGISTRO/);
  assert.match(serializedFields, /PRECEPTOR_AREA/);
  assert.match(serializedFields, /POLO_NOME/);
  assert.doesNotMatch(serializedFields, /ALUNO_/);
  assert.equal(model.fields.find((field) => field.id === 'foto')?.value, '');
  assert.equal(model.fields.find((field) => field.id === 'cargo')?.value, '{{PRECEPTOR_CARGO}}');
  assert.deepEqual(getCrachaTemplateVariables('preceptor'), [
    '{{PRECEPTOR_NOME}}',
    '{{PRECEPTOR_CARGO}}',
    '{{PRECEPTOR_AREA}}',
    '{{PRECEPTOR_REGISTRO}}',
    '{{POLO_NOME}}',
    '{{DATA_HOJE}}',
    '{{DATA_VALIDADE}}',
    '{{VALIDACAO_CODIGO}}',
  ]);

  const withoutQr = serializePreceptorCrachaModel({
    ...model,
    fields: model.fields.filter((field) => field.type !== 'qrcode'),
  });
  assert.equal(withoutQr.qr.habilitado, false);
});
