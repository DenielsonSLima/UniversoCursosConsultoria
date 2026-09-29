import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
async function load(file, hooks = false) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['react', 'lucide-react'] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (id) => id === 'react' && hooks
      ? { ...React, useId: () => 'upload-test', useRef: () => ({ current: null }) }
      : require(id), module, module.exports,
  );
  return module.exports;
}
const Card = (await load('./DocumentoChecklistCard.tsx', true)).default;
const { excluirAnexosDocumento } = await load('./excluir-anexos-documento.ts');
const item = (overrides = {}) => ({ id: 'doc-a', nome: 'RG', status: 'nao_enviado', versaoAtual: null, versoes: [], ...overrides });
const version = (file = 'file-a') => ({ id: 'version-a', numero: 1, status: 'pendente', fontes: [{ id: 'source-a', arquivo: { id: file }, ordem: 0 }] });
const elements = (node) => React.isValidElement(node)
  ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
const text = (node) => React.isValidElement(node)
  ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '');
const directButtons = (tree) => {
  const menu = elements(tree).find((node) => node.type === 'details');
  const menuElements = elements(menu);
  return elements(tree).filter((node) => node.type === 'button' && !menuElements.includes(node));
};

test('entrega tem ação direta sem arquivo nem menu intermediário', () => {
  const document = item();
  let received;
  const tree = Card({ item: document, onUpload() {}, onMarkReceived: (value) => { received = value; } });
  const button = directButtons(tree).find((node) => text(node).includes('Marcar entregue'));
  assert.ok(button);
  button.props.onClick();
  assert.equal(received, document);
  assert.equal(button.props.disabled, false);
});

test('entregue sem anexo permite corrigir diretamente e anexar depois', () => {
  let revoked;
  const tree = Card({ item: item({ status: 'aprovado', recebimentoSemAnexo: {
    motivo: '', recebidoEm: '2026-01-01T12:00:00Z',
  } }), onUpload() {}, onMarkReceived() {}, onRevokeReceived(value) { revoked = value; } });
  const buttons = directButtons(tree);
  const received = buttons.find((node) => text(node).includes('Entregue'));
  assert.equal(received.props['aria-pressed'], true);
  assert.equal(received.props.disabled, false);
  received.props.onClick();
  assert.equal(revoked.id, 'doc-a');
  assert.ok(buttons.some((node) => text(node).includes('Anexar')));
  assert.ok(!buttons.some((node) => text(node).includes('Excluir')));
});

test('versão com anexo expõe visualizar e excluir fora do menu', () => {
  const document = item({ status: 'pendente', versaoAtual: version(), versoes: [version()] });
  let preview; let deleted;
  const tree = Card({ item: document, onPreview: (value) => { preview = value; }, onDelete: (value) => { deleted = value; } });
  const buttons = directButtons(tree);
  buttons.find((node) => text(node).includes('Visualizar')).props.onClick();
  buttons.find((node) => text(node).includes('Excluir anexo')).props.onClick();
  assert.equal(preview, document);
  assert.equal(deleted, document);
});

test('exclusão arquiva versão antes de excluir e deduplica arquivo', async () => {
  const calls = [];
  await excluirAnexosDocumento({ documentoId: 'doc-a', versaoAtualId: 'version-a', arquivoIds: ['file-a', 'file-a'], motivo: 'Teste' },
    [item({ versaoAtual: version() })], {
      async arquivar(...args) { calls.push(['archive', ...args]); },
      async excluirArquivos(...args) { calls.push(['delete', ...args]); },
    });
  assert.deepEqual(calls, [['archive', 'version-a', 'Teste'], ['delete', ['file-a'], 'Teste']]);
});

test('arquivo compartilhado bloqueia antes de qualquer alteração', async () => {
  let mutations = 0;
  await assert.rejects(excluirAnexosDocumento({ documentoId: 'doc-a', versaoAtualId: 'version-a', arquivoIds: ['file-a'], motivo: 'Teste' },
    [item({ versaoAtual: version() }), item({ id: 'doc-b', versaoAtual: version() })], {
      async arquivar() { mutations++; }, async excluirArquivos() { mutations++; },
    }), /outro documento ativo/);
  assert.equal(mutations, 0);
});

test('falha no arquivamento impede exclusão e retry arquivado não arquiva novamente', async () => {
  let deletes = 0;
  const service = { async arquivar() { throw new Error('Falha'); }, async excluirArquivos() { deletes++; } };
  const input = { documentoId: 'doc-a', versaoAtualId: 'version-a', arquivoIds: ['file-a'], motivo: 'Teste' };
  await assert.rejects(excluirAnexosDocumento(input, [item({ versaoAtual: version() })], service), /Falha/);
  assert.equal(deletes, 0);
  await excluirAnexosDocumento({ ...input, versaoAtualId: undefined }, [item()], service);
  assert.equal(deletes, 1);
});


test('Histórico não arquiva a versão atual que compartilha o mesmo arquivo', async () => {
  let mutations = 0;
  await assert.rejects(excluirAnexosDocumento({ documentoId: 'doc-a', arquivoIds: ['file-a'], motivo: 'Teste' },
    [item({ versaoAtual: version() })], {
      async arquivar() { mutations++; }, async excluirArquivos() { mutations++; },
    }), /pertence à versão atual/);
  assert.equal(mutations, 0);
});

test('mudança da versão após abrir diálogo impede arquivar outra versão', async () => {
  let mutations = 0;
  await assert.rejects(excluirAnexosDocumento({ documentoId: 'doc-a', versaoAtualId: 'version-old', arquivoIds: ['file-a'], motivo: 'Teste' },
    [item({ versaoAtual: version() })], {
      async arquivar() { mutations++; }, async excluirArquivos() { mutations++; },
    }), /versão atual mudou/);
  assert.equal(mutations, 0);
});

test('falha após arquivamento explica estado parcial e recuperação pelo Histórico', async () => {
  let archived = false;
  await assert.rejects(excluirAnexosDocumento({ documentoId: 'doc-a', versaoAtualId: 'version-a', arquivoIds: ['file-a'], motivo: 'Teste' },
    [item({ versaoAtual: version() })], {
      async arquivar() { archived = true; }, async excluirArquivos() { throw new Error('Falha de rede'); },
    }), /Versão arquivada, exclusão não concluída.*Histórico/);
  assert.equal(archived, true);
});
