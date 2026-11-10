import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// The NFS-e runner bundles tests in /tmp while retaining the repository cwd.
const componentDirectory='modules/gestor/configuracoes/nfse-portal-contribuinte/components';
const source=readFileSync(resolve(componentDirectory,'NfseCertificateModal.tsx'),'utf8');
const css=readFileSync(resolve(componentDirectory,'nfse-certificate-modal.css'),'utf8');

test('certificate modal loads its own visible input styles independently of invoice navigation',()=>{
  assert.match(source,/import '\.\/nfse-certificate-modal\.css'/);
  assert.match(source,/className="nfse-certificate-field"/);
  for (const className of ['config-dialog-overlay','config-dialog-header','config-dialog-body','config-dialog-footer']) {
    assert.ok(source.includes(className), `Missing Configurações dialog class: ${className}`);
  }
  assert.match(source,/aria-label="Fechar cadastro de certificado"/);
  assert.match(css,/\.nfse-certificate-field input\s*\{[^}]*min-height: 44px/s);
  assert.match(css,/\.nfse-certificate-field input\s*\{[^}]*border: 1px solid/s);
  assert.match(css,/\.nfse-certificate-field input\s*\{[^}]*background: #fff/s);
  assert.match(css,/\.nfse-certificate-field input\s*\{[^}]*color: #18334b/s);
  assert.doesNotMatch(source,/className="nfse-field"/);
});

test('password stays literal and transient, and certificate expiry is handed off after saving',()=>{
  assert.match(source,/uploadNfseCertificate\(scope,file,passwordInput\.current\.value,requestId\.current\)/);
  assert.match(source,/onSaved\(result\)/);
  assert.match(source,/autoComplete="off"/);
  assert.match(source,/autoCapitalize="none"/);
  assert.match(source,/aria-controls="nfse-a1-password"/);
  assert.match(source,/submitting\.current=true/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|passwordInput\.current\.value\.trim\(/);
});
