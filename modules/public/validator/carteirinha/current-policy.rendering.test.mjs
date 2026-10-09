import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const dependencies = process.env.ALUNO_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../public-card-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const compiled = await build({
  stdin: { contents: `import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import Card from './CarteirinhaValidationResult';
    import {mapCanonicalValidationRecord} from '../validator.mapper';
    export const render = (record) => {
      const result = mapCanonicalValidationRecord(record, record.code);
      if (!result || result.type !== 'carteirinha') throw new Error('Invalid card payload');
      return renderToStaticMarkup(<Card result={result}/>);
    };`, loader: 'tsx', resolveDir: directory },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom/server'], nodePaths: dependencies ? [dependencies] : [],
});
const exported = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  requireTool, exported, exported.exports,
);
const { render } = exported.exports;
const record = {
  type: 'carteirinha', code: 'CIE-QA-0001', status: 'ACTIVE', schemaVersion: 2,
  visibleFields: ['studentName', 'studentCpf', 'studentBirthDate', 'maskedMotherName',
    'maskedEnrollmentNumber', 'institutionName', 'issuedAt'],
  studentName: 'Aluna S***', studentCpf: '***.***.***-09',
  studentBirthDate: '**/**/2000', maskedMotherName: 'Mãe S***',
  maskedEnrollmentNumber: 'UNIV****23', institutionName: 'Instituição de teste',
  issuedAt: '2026-09-01T12:00:00Z',
};

test('consulta de CIE exibe os campos mascarados do perfil atual retornado pelo backend', () => {
  const html = render(record);
  for (const value of ['Aluna S***', '***.***.***-09', '**/**/2000', 'Mãe S***', 'UN****23']) {
    assert.ok(html.includes(value), `Missing configured field: ${value}`);
  }
  assert.match(html, /Carteirinha válida/);
});

test('consulta de CIE oculta campos desmarcados na reconsulta do mesmo código', () => {
  const html = render({ ...record, schemaVersion: 3,
    visibleFields: ['institutionName', 'issuedAt'] });
  for (const value of ['Aluna', 'CPF:', 'Nascimento:', 'Mãe:', 'Matrícula:']) {
    assert.ok(!html.includes(value), `Unselected field appeared: ${value}`);
  }
  assert.ok(html.includes('Instituição de teste'));
  assert.ok(html.includes('01/09/2026'));
});
