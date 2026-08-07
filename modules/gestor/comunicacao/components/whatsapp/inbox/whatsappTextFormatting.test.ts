import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWhatsAppText } from './whatsappTextFormatting.ts';

test('converte a formatação principal do WhatsApp sem exibir os marcadores', () => {
  assert.deepEqual(
    parseWhatsAppText(
      'Pagamento de *R$ 289,90*, parcela *02*, curso *Técnico em Enfermagem*.',
    ),
    [
      { type: 'text', value: 'Pagamento de ' },
      { type: 'bold', children: [{ type: 'text', value: 'R$ 289,90' }] },
      { type: 'text', value: ', parcela ' },
      { type: 'bold', children: [{ type: 'text', value: '02' }] },
      { type: 'text', value: ', curso ' },
      {
        type: 'bold',
        children: [{ type: 'text', value: 'Técnico em Enfermagem' }],
      },
      { type: 'text', value: '.' },
    ],
  );
});

test('reconhece os demais estilos de texto usados pelo WhatsApp', () => {
  assert.deepEqual(
    parseWhatsAppText('_itálico_ ~tachado~ `código` ```monoespaçado```'),
    [
      { type: 'italic', children: [{ type: 'text', value: 'itálico' }] },
      { type: 'text', value: ' ' },
      { type: 'strikethrough', children: [{ type: 'text', value: 'tachado' }] },
      { type: 'text', value: ' ' },
      { type: 'monospace', children: [{ type: 'text', value: 'código' }] },
      { type: 'text', value: ' ' },
      { type: 'monospace', children: [{ type: 'text', value: 'monoespaçado' }] },
    ],
  );
});

test('transforma URL completa em link e mantém pontuação fora do endereço', () => {
  const address = 'https://universocc.com.br/aluno?module=financeiro&banesePayment=abc-123';
  assert.deepEqual(
    parseWhatsAppText(`Pague em ${address}.`),
    [
      { type: 'text', value: 'Pague em ' },
      { type: 'link', value: address, href: address },
      { type: 'text', value: '.' },
    ],
  );
});

test('aceita endereço iniciado por www e não interpreta sublinhado dentro de URL', () => {
  assert.deepEqual(
    parseWhatsAppText('www.exemplo.com/arquivo_com_nome'),
    [{
      type: 'link',
      value: 'www.exemplo.com/arquivo_com_nome',
      href: 'https://www.exemplo.com/arquivo_com_nome',
    }],
  );
});

test('preserva marcadores incompletos e evita formatar caracteres dentro de palavras', () => {
  assert.deepEqual(
    parseWhatsAppText('Valor *sem fechamento e arquivo_com_nome'),
    [{ type: 'text', value: 'Valor *sem fechamento e arquivo_com_nome' }],
  );
});
