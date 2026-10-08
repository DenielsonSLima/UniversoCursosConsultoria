import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractClosingPreview } from '../../../../shared/contrato-aluno/ContractClosingPreview';
import { normalizeContractClosingPositions, validateContractClosingPositions } from '../../../../shared/contrato-aluno/closing-positions';
import { ContratoAlunoCanvas } from './components/ContratoAlunoCanvas';
import { ContratoAlunoClosingControls } from './components/ContratoAlunoClosingControls';
import { moveContractClosingPosition, useContractClosingDrag } from './hooks/useContractClosingDrag';
import ContratoAlunoDocumentRenderer, { isContratoAlunoRenderPayloadReady } from '../../../secretaria/contratos-aluno/components/ContratoAlunoDocumentRenderer';
import type { ContratoAlunoPreparedDocument } from '../../../secretaria/contratos-aluno/types/contratos-aluno.types';

const footer = 'Cidade, data.\nCONTRATANTE: Aluno Exemplo\nCONTRATADA: Instituição Exemplo\nTESTEMUNHAS:\n1: _____\n2: _____';
const defaults = () => normalizeContractClosingPositions(undefined, footer);

test('arraste usa dimensões A4 sob zoom sem deslocar os outros campos', () => {
  const position = { x: 100, y: 240, width: 30 };
  for (const zoom of [0.35, 0.58, 1]) {
    const moved = moveContractClosingPosition('contratada', position,
      10 * 794 / 210 * zoom, 5 * 1123 / 297 * zoom, 794 * zoom, 1123 * zoom);
    assert.deepEqual(moved, { x: 110, y: 245, width: 30 });
  }
  assert.deepEqual(moveContractClosingPosition('qr', { x: 172, y: 210.5, width: 20 },
    9999, 9999, 794, 1123), { x: 172, y: 254, width: 20 });
});

test('handlers reais capturam pointer, preservam slots vizinhos e encerram no cancelamento', () => {
  const positions = defaults();
  const updates: ReturnType<typeof defaults>[] = [];
  const selected: string[] = [];
  let handlers: ReturnType<typeof useContractClosingDrag>;
  const Probe = () => { handlers = useContractClosingDrag(positions,
    (value) => updates.push(value), (id) => selected.push(id)); return null; };
  renderToStaticMarkup(<Probe />);
  const captured = new Set<number>();
  const target = {
    closest: () => ({ getBoundingClientRect: () => ({ width: 397, height: 561.5 }) }),
    focus: () => {}, setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id), releasePointerCapture: (id: number) => captured.delete(id),
  };
  const event = (extra = {}) => ({ button: 0, pointerId: 1, clientX: 10, clientY: 20,
    currentTarget: target, preventDefault() {}, stopPropagation() {}, ...extra } as never);
  const qr = handlers!('qr');
  qr.onPointerDown(event());
  assert.deepEqual(selected, ['qr']);
  assert.ok(captured.has(1));
  qr.onPointerMove(event({ clientX: 10 - 5 * 397 / 210, clientY: 20 + 10 * 561.5 / 297 }));
  assert.equal(updates[0].elements.qr.x, 167);
  assert.equal(updates[0].elements.qr.y, 220.5);
  assert.deepEqual(updates[0].elements.contratante, positions.elements.contratante);
  qr.onPointerCancel(event());
  assert.equal(captured.size, 0);
  qr.onPointerMove(event({ clientY: 60 }));
  assert.equal(updates.length, 1);
  qr.onKeyDown(event({ key: 'ArrowDown', shiftKey: true }));
  assert.equal(updates[1].elements.qr.y, 215.5);
});

test('prévia e controles usam cinco caixas canônicas e identificam colisão antes de salvar', () => {
  const positions = defaults();
  positions.elements.qr = { x: 110, y: 250, width: 24 };
  const markup = renderToStaticMarkup(<ContractClosingPreview footer={footer} positions={positions}
    hasQr qrImage={<span>QR</span>} qrLabel="Validar" validationCode="EXEMPLO" />);
  assert.equal((markup.match(/data-contract-closing-element=/g) || []).length, 5);
  assert.match(markup, /left:110mm;top:250mm;width:24mm;height:31mm/);
  assert.match(markup, /TESTEMUNHA 1/);
  assert.doesNotMatch(markup, />1:|>2:/);
  assert.match(markup, /top:8\.2mm/);
  assert.match(markup, /top:7\.8mm/);
  positions.elements.qr = { ...positions.elements.qr, x: 18, y: 221 };
  const errors = validateContractClosingPositions(positions, footer);
  assert.ok(errors.some((error) => /sobre/.test(error)));
  const controls = renderToStaticMarkup(<ContratoAlunoClosingControls footer={footer} hasQr
    positions={positions} selected="qr" onSelect={() => {}} onChange={() => {}} errors={errors} />);
  assert.match(controls, /role="alert"/);
  assert.match(controls, /Ajuste as posições antes de salvar/);
  assert.match(controls, /Horizontal/);
  assert.match(controls, /Restaurar posição/);
});

test('nomes e códigos extensos ficam limitados à própria caixa na prévia', () => {
  const longName = 'NOME EXEMPLIFICATIVO '.repeat(8).trim();
  const longCode = 'CONTRATO-EXEMPLO-'.repeat(5);
  const markup = renderToStaticMarkup(<ContractClosingPreview
    footer={footer.replace('Aluno Exemplo', longName)} hasQr qrImage={<span>QR</span>}
    qrLabel="Validar documento" validationCode={longCode} />);
  assert.ok(markup.includes(`title="${longName}"`));
  assert.ok(markup.includes(`title="${longCode}"`));
  assert.match(markup, /overflow:hidden;white-space:nowrap;text-overflow:ellipsis/);
});

test('canvas conserva paginação e desenha elementos móveis somente na última página', () => {
  const markup = renderToStaticMarkup(<ContratoAlunoCanvas tituloDocumento="Contrato exemplo" cabecalho=""
    corpo="Primeira página.---QUEBRA_DE_PAGINA---Segunda página." destaquesCriticos={[]}
    destaquesAtencao={[]} rodape={footer} observacaoEscopo="" qr={{ habilitado: true,
      rotulo: 'Validar', caminhoValidacao: '/validar', modoValidade: 'SEM_VENCIMENTO', diasValidade: null }}
    layoutEncerramento={defaults()} onChangeClosingPositions={() => {}} />);
  assert.equal((markup.match(/data-contract-page="true"/g) || []).length, 2);
  assert.equal((markup.match(/data-contract-closing-element=/g) || []).length, 5);
  const firstArticle = markup.slice(markup.indexOf('<article'), markup.indexOf('</article>'));
  assert.doesNotMatch(firstArticle, /data-contract-closing-element/);
  assert.match(markup, /Mover QR Code/);
});

test('prévia de documento pronto rejeita posições inválidas sem esconder o motivo', () => {
  const prepared = (positions: unknown): ContratoAlunoPreparedDocument => ({
    emissionId: 'fixture', documentId: null, title: 'Contrato exemplo', targetName: 'Aluno exemplo',
    validationCode: 'CON-EXEMPLO', validationUrl: null, validUntil: null, fileUrl: null, statusLabel: null,
    renderPayload: { templateRevision: 1, template: { layoutEncerramento: positions }, snapshot: {},
      rendered: { kind: 'contrato_aluno', front: null, back: null, watermark: null,
        pages: [{ header: '', title: 'Contrato exemplo', body: 'Texto de exemplo.', footer }],
        qr: { enabled: true, label: 'Validar', validityLabel: null } } },
  });
  assert.ok(isContratoAlunoRenderPayloadReady(prepared(defaults())));
  const outside = defaults();
  outside.elements.qr.x = 0;
  for (const positions of [outside, { version: 99, elements: {} }]) {
    const document = prepared(positions);
    assert.equal(isContratoAlunoRenderPayloadReady(document), false);
    const markup = renderToStaticMarkup(<ContratoAlunoDocumentRenderer document={document} />);
    assert.match(markup, /data-render-error="As posições do contrato não podem ser exibidas:/);
    assert.doesNotMatch(markup, /data-contract-closing-element/);
  }
});
