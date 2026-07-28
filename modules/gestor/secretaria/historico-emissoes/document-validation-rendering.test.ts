import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasExplicitQrCodeField,
  isPublicDocumentValidationEnabled,
} from './document-validation-rendering.ts';
import type { EmissionLog } from './historico-emissoes.types.ts';
import {
  initializeCrachaModel,
  resolveCrachaFields,
} from '../../cadastros/modelos-documentos/cracha/components/cracha-editor.model.ts';
import { getBlocks } from '../../cadastros/modelos-documentos/diploma/components/diploma-preview.blocks.ts';
import {
  getMissingRequiredSignatureSources,
  removePublicValidationReferences,
  shouldRenderCertificateQrBlock,
} from '../certificados/components/certificate-validation-rendering.ts';

const emission = (overrides: Partial<EmissionLog> = {}): EmissionLog => ({
  id: 'id',
  identidade: 'identidade',
  codigo: 'BOL-0000-0000-0000',
  documento: 'boletim',
  matricula_id: 'matricula',
  aluno_id: 'aluno',
  polo_id: 'polo',
  periodo_referencia: null,
  referencia_externa: null,
  status: 'ATIVO',
  emitido_em: '2026-07-27T00:00:00.000Z',
  ultima_emissao_em: '2026-07-27T00:00:00.000Z',
  validade_ate: null,
  revogado_em: null,
  emitido_por: null,
  quantidade_emissoes: 1,
  dados_emissao: {},
  ...overrides,
});

test('o snapshot desativado impede a validação pública', () => {
  assert.equal(
    isPublicDocumentValidationEnabled(emission({
      validacao_publica: false,
      dados_emissao: { validationPublic: true },
    })),
    false,
  );
});

test('emissões legadas continuam válidas quando não possuem snapshot', () => {
  assert.equal(isPublicDocumentValidationEnabled(emission()), true);
});

test('um modelo sem elemento QR não é considerado configurado para QR', () => {
  assert.equal(hasExplicitQrCodeField({ absoluteFields: [] }), false);
  assert.equal(hasExplicitQrCodeField({ textContent: '<p>Boletim</p>' }), false);
});

test('o QR só é reconhecido quando existe explicitamente no modelo', () => {
  assert.equal(
    hasExplicitQrCodeField({
      absoluteFields: [{ id: 'assinatura', type: 'image' }, { id: 'qr', type: 'qrcode' }],
    }),
    true,
  );
});

test('o crachá não recria QR quando o modelo salvo não possui esse elemento', () => {
  assert.deepEqual(resolveCrachaFields({ fields: [] }), []);
  assert.equal(
    resolveCrachaFields({
      fields: [{ id: 'nome', type: 'text', value: '{{ALUNO_NOME}}', page: 'frente' }],
    }).some((field: any) => field.type === 'qrcode'),
    false,
  );
});

test('um crachá novo ainda nasce com o QR explicitamente configurado', () => {
  assert.equal(
    initializeCrachaModel(null).fields.some((field: any) => field.type === 'qrcode'),
    true,
  );
});

test('o editor de certificados não recria blocos de validação removidos', () => {
  const blocks = getBlocks({
    tipoCurso: 'Cursos Livres',
    blocks: [{ id: 'texto', type: 'text', page: 'frente', visible: true }],
  });
  assert.equal(
    blocks.some((block: any) => (
      block.type === 'qrcode' || block.id === 'validacaoSite'
    )),
    false,
  );
});

test('certificado interno não expõe código nem endereço do validador', () => {
  const content = [
    '<br /><br />Código de verificação do certificado: <strong>{{codigo_certificado}}</strong>.',
    'Validador: <strong style="color:red">www.universocc.com.br/validador</strong>',
    'Código de verificação: {{codigo_certificado}}',
  ].join('\n');
  const sanitized = removePublicValidationReferences(content);
  assert.doesNotMatch(sanitized, /codigo_certificado/i);
  assert.doesNotMatch(sanitized, /universocc\.com\.br\/validador/i);
});

test('bloco QR frontal permanece obrigatório quando a validação pública está ativa', () => {
  const model = {
    hasVerso: false,
    blocks: [{ id: 'qrcode', type: 'qrcode', visible: true, page: 'frente' }],
  };
  assert.equal(
    shouldRenderCertificateQrBlock(model.blocks[0], true, model),
    true,
  );
  assert.equal(
    shouldRenderCertificateQrBlock(model.blocks[0], false, model),
    false,
  );
});

test('assinatura configurada sem imagem mantém o certificado indisponível', () => {
  const blocks = [{
    id: 'assinatura-diretoria',
    type: 'signatureImage',
    visible: true,
    signatureSource: 'diretoriaGeral',
    label: 'Diretoria',
  }];
  assert.deepEqual(
    getMissingRequiredSignatureSources(blocks, { diretoriaGeral: '' }),
    ['assinatura institucional "Diretoria"'],
  );
  assert.deepEqual(
    getMissingRequiredSignatureSources(blocks, { diretoriaGeral: 'https://cdn/assinatura.png' }),
    [],
  );
});
