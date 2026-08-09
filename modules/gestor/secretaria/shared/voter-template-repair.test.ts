import assert from 'node:assert/strict';
import test from 'node:test';

import {
  injectMissingVoterFields,
  repairFichaVoterGrid,
} from '../../cadastros/ficha-matricula/voter-template-repair.ts';

const fields = [
  { token: '{{ALUNO_TITULO_ELEITOR}}', markup: '<div>Título {{ALUNO_TITULO_ELEITOR}}</div>' },
  { token: '{{ALUNO_TITULO_ZONA}}', markup: '<div>Zona {{ALUNO_TITULO_ZONA}}</div>' },
  { token: '{{ALUNO_TITULO_SECAO}}', markup: '<div>Seção {{ALUNO_TITULO_SECAO}}</div>' },
  { token: '{{ALUNO_TITULO_EMISSAO}}', markup: '<div>Emissão {{ALUNO_TITULO_EMISSAO}}</div>' },
  { token: '{{ALUNO_TITULO_UF}}', markup: '<div>UF {{ALUNO_TITULO_UF}}</div>' },
] as const;

test('reparo eleitoral preserva markup customizado e injeta somente tokens ausentes', () => {
  const customHtml = '<section class="modelo-custom"><h4>Documentação personalizada</h4><div class="grade-custom"><div data-cor="azul"><b>Meu rótulo eleitoral</b>{{ALUNO_TITULO_ELEITOR}}</div><aside>Observação jurídica preservada</aside></div></section>';
  const repaired = injectMissingVoterFields(customHtml, fields, 'INNER_GRID');

  assert.ok(repaired.startsWith(customHtml.slice(0, customHtml.indexOf('</div></section>'))));
  assert.match(repaired, /class="modelo-custom"/);
  assert.match(repaired, /data-cor="azul"/);
  assert.match(repaired, /Meu rótulo eleitoral/);
  assert.match(repaired, /Observação jurídica preservada/);
  assert.equal(repaired.match(/\{\{ALUNO_TITULO_ELEITOR\}\}/g)?.length, 1);
  for (const { token } of fields) {
    assert.equal(repaired.split(token).length - 1, 1, `${token} deve aparecer uma vez`);
  }
});

test('reparo eleitoral é idempotente quando todos os tokens já existem', () => {
  const completeHtml = `<section>${fields.map(({ token }) => token).join('')}</section>`;
  assert.equal(injectMissingVoterFields(completeHtml, fields), completeHtml);
});

test('grade legada 4x2 da Ficha vira grade canônica 6x2 sem terceira linha', () => {
  const legacyGrid = `
    <section style="height:100%;border:1px solid #cbd5e1;overflow:hidden">
      <h4>Documentos</h4>
      <div style="height:calc(100% - 18px);display:grid;grid-template-columns:1fr 1fr .8fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));gap:5px 12px;padding:6px 8px">
        <div><strong>RG personalizado</strong><span>{{ALUNO_RG}}</span></div>
        <div><strong>Órgão custom</strong><span>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span></div>
        <div><strong>Expedição custom</strong><span>{{ALUNO_RG_EMISSAO}}</span></div>
        <div><strong>CPF custom</strong><span>{{ALUNO_CPF}}</span></div>
        <div style="grid-column:span 2"><strong>Meu título</strong><span>{{ALUNO_TITULO_ELEITOR}}</span></div>
        <div style="grid-column:span 2"><strong>Reservista custom</strong><span>{{ALUNO_RESERVISTA}}</span></div>
      </div>
    </section>
  `;
  const repaired = repairFichaVoterGrid(legacyGrid);

  assert.match(repaired, /grid-template-columns:1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/);
  assert.match(repaired, /grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((repaired.match(/<strong/g) || []).length, 9);
  assert.match(repaired, /RG personalizado/);
  assert.match(repaired, /Meu título/);
  assert.match(repaired, /Reservista custom/);
  for (const { token } of fields) assert.ok(repaired.includes(token));
});
