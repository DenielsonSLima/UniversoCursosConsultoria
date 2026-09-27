import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrinterEditor, defaultPdvPrinterDraft } from './PrinterEditor';
import { ReceiptTemplateEditor } from './ReceiptTemplateEditor';
import { pdvPrinterService } from './printer.service';
import type { PdvPrinter } from './printer.types';
import { PdvReceiptActions, type PdvReceiptActionsProps } from '../../financeiro/outros-creditos/PdvReceiptActions';
import { supabase } from '../../../../lib/supabase';

const settings = {
  version: 1, context: 'OUTROS_CREDITOS', canManage: true, canUse: true,
  workstations: [], printers: [], selectedWorkstationId: null, defaultPrinterId: null,
};
const actions: PdvReceiptActionsProps = {
  behavior: 'PERGUNTAR', automaticReady: false, state: 'ready', receiptAvailable: true,
  onPrint() { throw new Error('Impressão proibida no render'); },
  onOpenReceipt() { throw new Error('Prévia proibida no render'); },
  onComplete() { throw new Error('Fechamento proibido no render'); },
};
const renderActions = (changes: Partial<PdvReceiptActionsProps> = {}) => renderToStaticMarkup(<PdvReceiptActions {...actions} {...changes} />);

test('PERGUNTAR oferece imprimir, acessar comprovante ou concluir sem imprimir', () => {
  const html = renderActions();
  assert.match(html, /Imprimir comprovante\?/);
  assert.match(html, /Ver \/ baixar comprovante/);
  assert.match(html, /Concluir sem imprimir/);
});

test('AUTOMATICO sem prontidão retorna escolha; transporte pronto não expõe envio manual concorrente', () => {
  const unavailable = renderActions({ behavior: 'AUTOMATICO' });
  assert.match(unavailable, /ainda não está pronta/);
  assert.match(unavailable, />Imprimir comprovante|> Imprimir comprovante/);
  const available = renderActions({ behavior: 'AUTOMATICO', automaticReady: true });
  assert.match(available, /Impressão automática preparada/);
  assert.doesNotMatch(available, /> Imprimir comprovante/);
});

test('NAO mantém comprovante acessível e não oferece impressão', () => {
  const html = renderActions({ behavior: 'NAO' });
  assert.match(html, /Nenhuma impressão será iniciada/);
  assert.match(html, /Ver \/ baixar comprovante/);
  assert.match(html, /Concluir atendimento/);
  assert.doesNotMatch(html, /Imprimir comprovante|Tentar imprimir/);
});

test('resultado desconhecido preserva pagamento e não oferece repetição', () => {
  const html = renderActions({ state: 'unknown' });
  assert.match(html, /pagamento está preservado/);
  assert.match(html, /nenhum novo envio será feito automaticamente/);
  assert.match(html, /Ver \/ baixar comprovante/);
  assert.doesNotMatch(html, /Imprimir comprovante|Tentar imprimir novamente/);
});

test('diálogo aberto e envio aceito não afirmam impressão física', () => {
  assert.match(renderActions({ state: 'dialog-opened' }), /não confirma que o papel foi impresso/);
  assert.match(renderActions({ state: 'accepted' }), /O envio foi aceito/);
  for (const state of ['preparing', 'printing'] as const) {
    const html = renderActions({ state });
    assert.ok((html.match(/disabled=""/g) || []).length >= 2);
    assert.doesNotMatch(html, /> Imprimir comprovante/);
  }
});

test('reimpressão exige decisão explícita e motivo válido, inclusive após resultado desconhecido', () => {
  const props = { state: 'unknown' as const, requiresReprint: true, onReprintReasonChange() {} };
  const empty = renderActions(props);
  assert.match(empty, /Motivo da reimpressão/);
  assert.match(empty, /Conferi a impressora e quero reimprimir/);
  const emptyButton = (empty.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []).find(button => button.includes('quero reimprimir'));
  assert.match(emptyButton!, /disabled=""/);
  for (const reason of ['Papel não saiu', 'Cliente solicitou segunda via']) {
    const html = renderActions({ ...props, reprintReason: reason });
    const button = (html.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []).find(item => item.includes('quero reimprimir'));
    assert.doesNotMatch(button!, /disabled=""/);
  }
});

test('falha sem recibo permite preparar novamente, sem solicitar impressão inexistente', () => {
  const html = renderActions({ state: 'error', receiptAvailable: false, error: 'Falha de teste', onRetry() {} });
  assert.match(html, /Preparar comprovante novamente/);
  assert.match(html, /pagamento está confirmado/);
  assert.doesNotMatch(html, /Tentar imprimir novamente|Ver \/ baixar comprovante/);
});

test('cadastro inicia PERGUNTAR e automático fica indisponível sem evidência do servidor', () => {
  assert.equal(defaultPdvPrinterDraft().behavior, 'PERGUNTAR');
  const html = renderToStaticMarkup(<PrinterEditor printer={null} pending={false} onSave={() => {}} onClose={() => {}} />);
  const automatic = (html.match(/<input[^>]+>/g) || []).find(input => input.includes('value="AUTOMATICO"'));
  assert.ok(automatic?.includes('disabled=""'));
  assert.match(html, /Modelo do recibo/);
  assert.match(html, /Diálogo de impressão do navegador/);
  assert.doesNotMatch(html, /Imprimir teste|Testar conexão/);
});

test('editor recebe versão e configuração canônica sem permitir alterar prontidão', () => {
  const printer: PdvPrinter = {
    ...defaultPdvPrinterDraft(), id: 'printer', poloId: 'polo', workstationId: 'station',
    name: 'Impressora de teste', version: 7, transportReady: false, automaticReady: false, readinessReason: null,
  };
  const html = renderToStaticMarkup(<PrinterEditor printer={printer} pending onSave={() => {}} onClose={() => {}} />);
  assert.match(html, /<fieldset[^>]+disabled=""/);
  assert.match(html, /Salvando/);
  assert.doesNotMatch(html, /name="automaticReady"|name="transportReady"/);
});

test('modelo limita campos de apresentação; dados financeiros permanecem protegidos', () => {
  const html = renderToStaticMarkup(<ReceiptTemplateEditor value={defaultPdvPrinterDraft().template} onChange={() => {}} onPreview={() => {}} />);
  assert.match(html, /58 mm/); assert.match(html, /80 mm/);
  assert.match(html, /min="2" max="6"/); assert.match(html, /min="8" max="12"/);
  assert.match(html, /maxLength="240"/);
  assert.match(html, /valor recebido e data vêm do pagamento confirmado/);
  assert.match(html, /Prévia do recibo/);
});

test('service envia escopo, locator e AbortSignal à RPC autorizada', async t => {
  const controller = new AbortController();
  const calls: Array<{ name: string; args: unknown; signal: AbortSignal }> = [];
  t.mock.method(supabase, 'rpc', (name: string, args: unknown) => ({
    abortSignal(signal: AbortSignal) { calls.push({ name, args, signal }); return Promise.resolve({ data: settings, error: null }); },
  }));
  assert.equal(await pdvPrinterService.getSettings('polo', 'station', controller.signal), settings);
  assert.deepEqual(calls[0].args, { p_polo_id: 'polo', p_workstation_id: 'station' });
  assert.equal(calls[0].name, 'get_pdv_printer_settings');
  assert.ok(calls[0].signal instanceof AbortSignal);
  assert.equal(calls.length, 1);
});

test('save mantém CAS e chave de replay e não chama emissão ou impressão', async t => {
  const calls: Array<{ name: string; args: any }> = [];
  t.mock.method(supabase, 'rpc', (name: string, args: unknown) => ({
    abortSignal() { calls.push({ name, args }); return Promise.resolve({ data: { id: 'printer', version: 8 }, error: null }); },
  }));
  const input = { ...defaultPdvPrinterDraft(), id: 'printer', poloId: 'polo', workstationId: 'station', expectedVersion: 7 };
  await pdvPrinterService.savePrinter(input, 'stable-request');
  await pdvPrinterService.savePrinter(input, 'stable-request');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'save_pdv_printer');
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].args.p_input.expectedVersion, 7);
  assert.equal(calls[0].args.p_request_id, 'stable-request');
});
