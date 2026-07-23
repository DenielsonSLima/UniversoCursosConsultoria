import assert from 'node:assert/strict';
import test from 'node:test';
import {
  embeddedSignupErrorMessage,
  isTrustedFacebookOrigin,
  parseSessionPayload,
} from './sessionPayload.ts';

test('aceita somente origens HTTPS reais do Facebook', () => {
  assert.equal(isTrustedFacebookOrigin('https://www.facebook.com'), true);
  assert.equal(isTrustedFacebookOrigin('https://business.facebook.com'), true);
  assert.equal(isTrustedFacebookOrigin('https://evilfacebook.com'), false);
  assert.equal(isTrustedFacebookOrigin('http://facebook.com'), false);
  assert.equal(isTrustedFacebookOrigin('not-an-origin'), false);
});

test('interpreta o evento serializado do Embedded Signup', () => {
  assert.deepEqual(parseSessionPayload(JSON.stringify({
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  })), {
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  });
  assert.equal(parseSessionPayload('{invalid'), null);
});

test('exibe o erro detalhado retornado pela Meta', () => {
  assert.equal(embeddedSignupErrorMessage({
    data: {
      error_message: 'Numero nao elegivel',
      error_code: '123',
    },
  }), 'Numero nao elegivel (codigo 123)');
});
