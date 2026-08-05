import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCompatibleAudioFile,
  validateCapturedAudioFile,
} from './native-audio-file.ts';

test('normaliza o alias M4A produzido pelo seletor nativo do iOS', () => {
  const source = new File([new Uint8Array([1, 2, 3])], 'gravacao.m4a', {
    type: 'audio/x-m4a',
    lastModified: 123,
  });

  const normalized = normalizeCompatibleAudioFile(source);

  assert.ok(normalized);
  assert.equal(normalized.type, 'audio/mp4');
  assert.equal(normalized.name, 'gravacao.m4a');
  assert.equal(normalized.size, source.size);
  assert.equal(normalized.lastModified, source.lastModified);
});

test('infere o MIME somente quando a WebView omite o tipo do áudio', () => {
  const source = new File([new Uint8Array([1])], 'voz.MP3', { type: '' });
  const normalized = normalizeCompatibleAudioFile(source);

  assert.ok(normalized);
  assert.equal(normalized.type, 'audio/mpeg');
  assert.equal(normalized.name, 'voz.MP3');
});

test('não disfarça formatos de áudio incompatíveis como MP4', () => {
  const source = new File([new Uint8Array([1])], 'voz.3gp', { type: 'audio/3gpp' });
  const result = validateCapturedAudioFile(source, 1024);

  assert.equal(result.file, null);
  assert.match(result.error || '', /Formato de áudio não aceito/);
});

test('mantém o limite de tamanho antes de preparar o envio', () => {
  const source = new File([new Uint8Array(5)], 'voz.m4a', { type: 'audio/mp4' });
  const result = validateCapturedAudioFile(source, 4);

  assert.equal(result.file, null);
  assert.match(result.error || '', /no máximo/);
});
