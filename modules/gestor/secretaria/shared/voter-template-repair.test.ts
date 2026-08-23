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

  const canonicalOrder = [
    '{{ALUNO_RG}}',
    '{{ALUNO_RG_ORGAO}}',
    '{{ALUNO_RG_EMISSAO}}',
    '{{ALUNO_CPF}}',
    '{{ALUNO_TITULO_ELEITOR}}',
    '{{ALUNO_TITULO_ZONA}}',
    '{{ALUNO_TITULO_SECAO}}',
    '{{ALUNO_TITULO_EMISSAO}}',
    '{{ALUNO_RESERVISTA}}',
  ].map((token) => repaired.indexOf(token));
  assert.ok(canonicalOrder.every((position) => position >= 0));
  assert.deepEqual([...canonicalOrder].sort((a, b) => a - b), canonicalOrder);

  const cellFor = (token: string) => {
    const tokenIndex = repaired.indexOf(token);
    const cellStart = repaired.lastIndexOf('<div', tokenIndex);
    const cellEnd = repaired.indexOf('</div>', tokenIndex);
    return repaired.slice(cellStart, cellEnd + '</div>'.length);
  };
  for (const token of ['{{ALUNO_RG}}', '{{ALUNO_RG_ORGAO}}', '{{ALUNO_TITULO_ELEITOR}}']) {
    assert.match(cellFor(token), /grid-column\s*:\s*span\s+2/i);
  }
  for (const token of [
    '{{ALUNO_RG_EMISSAO}}',
    '{{ALUNO_CPF}}',
    '{{ALUNO_TITULO_ZONA}}',
    '{{ALUNO_TITULO_SECAO}}',
    '{{ALUNO_TITULO_EMISSAO}}',
    '{{ALUNO_RESERVISTA}}',
  ]) {
    assert.doesNotMatch(cellFor(token), /grid-column\s*:/i);
  }
  assert.match(cellFor('{{ALUNO_TITULO_EMISSAO}}'), /\{\{ALUNO_TITULO_UF\}\}/);
  assert.equal(repairFichaVoterGrid(repaired), repaired);
});

test('grade já migrada mas com ordem e spans legados também é canonizada', () => {
  const brokenMigratedGrid = `
    <section>
      <div style="display:grid;grid-template-columns:1.15fr 1.15fr .6fr .6fr 1fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));">
        <div><strong>RG custom</strong>{{ALUNO_RG}}</div>
        <div><strong>Órgão custom</strong>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</div>
        <div><strong>Expedição custom</strong>{{ALUNO_RG_EMISSAO}}</div>
        <div><strong>CPF custom</strong>{{ALUNO_CPF}}</div>
        <div style="grid-column:span 2"><strong>Título custom</strong>{{ALUNO_TITULO_ELEITOR}}</div>
        <div style="grid-column:span 2"><strong>Reservista custom</strong>{{ALUNO_RESERVISTA}}</div>
        <div><strong>Zona custom</strong>{{ALUNO_TITULO_ZONA}}</div>
        <div><strong>Seção custom</strong>{{ALUNO_TITULO_SECAO}}</div>
        <div style="grid-column:span 2"><strong>Emissão custom / UF</strong>{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}</div>
      </div>
    </section>
  `;
  const repaired = repairFichaVoterGrid(brokenMigratedGrid);

  assert.ok(repaired.indexOf('{{ALUNO_TITULO_ELEITOR}}') < repaired.indexOf('{{ALUNO_RESERVISTA}}'));
  assert.ok(repaired.indexOf('{{ALUNO_TITULO_ZONA}}') < repaired.indexOf('{{ALUNO_RESERVISTA}}'));
  assert.ok(repaired.indexOf('{{ALUNO_TITULO_SECAO}}') < repaired.indexOf('{{ALUNO_RESERVISTA}}'));
  assert.ok(repaired.indexOf('{{ALUNO_TITULO_EMISSAO}}') < repaired.indexOf('{{ALUNO_RESERVISTA}}'));
  assert.match(repaired, /RG custom/);
  assert.match(repaired, /Zona custom/);
  assert.match(repaired, /Emissão custom \/ UF/);
  assert.equal(repairFichaVoterGrid(repaired), repaired);
});

test('reparo público preserva conteúdo extra e não força topologia customizada completa', () => {
  const completeGridWithLegalNotice = `
    <section>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,minmax(0,1fr));">
        <div>{{ALUNO_RG}}</div>
        <div>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</div>
        <div>{{ALUNO_RG_EMISSAO}}</div>
        <div>{{ALUNO_CPF}}</div>
        <div>{{ALUNO_TITULO_ELEITOR}}</div>
        <aside data-x="1">AVISO LEGAL</aside>
        <div>{{ALUNO_TITULO_ZONA}}</div>
        <div>{{ALUNO_TITULO_SECAO}}</div>
        <div>{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}</div>
        <div>{{ALUNO_RESERVISTA}}</div>
      </div>
    </section>
  `;

  const repaired = repairFichaVoterGrid(completeGridWithLegalNotice);
  assert.equal(repaired, completeGridWithLegalNotice);
  assert.equal((repaired.match(/<aside data-x="1">AVISO LEGAL<\/aside>/g) || []).length, 1);
  assert.equal(repairFichaVoterGrid(repaired), repaired);
});

test('Emissão e UF em células separadas mantêm markup ou recusam estado parcial', () => {
  const separateIssueStateGrid = `
    <section>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(2,1fr);">
        <div>{{ALUNO_RG}}</div>
        <div>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</div>
        <div>{{ALUNO_RG_EMISSAO}}</div>
        <div>{{ALUNO_CPF}}</div>
        <div>{{ALUNO_TITULO_ELEITOR}}</div>
        <div>{{ALUNO_TITULO_ZONA}}</div>
        <div>{{ALUNO_TITULO_SECAO}}</div>
        <div class="emissao-custom"><strong>Data eleitoral própria</strong>{{ALUNO_TITULO_EMISSAO}}</div>
        <div class="uf-custom"><strong>Estado eleitoral próprio</strong>{{ALUNO_TITULO_UF}}</div>
        <div>{{ALUNO_RESERVISTA}}</div>
      </div>
    </section>
  `;

  assert.equal(repairFichaVoterGrid(separateIssueStateGrid), separateIssueStateGrid);
  assert.throws(
    () => repairFichaVoterGrid(separateIssueStateGrid.replace(
      '<div class="uf-custom"><strong>Estado eleitoral próprio</strong>{{ALUNO_TITULO_UF}}</div>',
      '',
    )),
    /não possui uma topologia segura/i,
  );
});

test('célula ambígua não é duplicada e reparo incompleto é recusado', () => {
  const ambiguousCompleteGrid = `
    <section>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(2,1fr);">
        <div>RG {{ALUNO_RG}} / Órgão {{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</div>
        <div>{{ALUNO_RG_EMISSAO}}</div>
        <div>{{ALUNO_CPF}}</div>
        <div>{{ALUNO_TITULO_ELEITOR}}</div>
        <div>{{ALUNO_TITULO_ZONA}}</div>
        <div>{{ALUNO_TITULO_SECAO}}</div>
        <div>{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}</div>
        <div>{{ALUNO_RESERVISTA}}</div>
      </div>
    </section>
  `;

  const unchanged = repairFichaVoterGrid(ambiguousCompleteGrid);
  assert.equal(unchanged, ambiguousCompleteGrid);
  assert.equal((unchanged.match(/\{\{ALUNO_RG\}\}/g) || []).length, 1);
  assert.equal((unchanged.match(/\{\{ALUNO_RG_ORGAO\}\}/g) || []).length, 1);

  const ambiguousIncompleteGrid = ambiguousCompleteGrid
    .replace('<div>{{ALUNO_TITULO_ZONA}}</div>', '')
    .replace('<div>{{ALUNO_TITULO_SECAO}}</div>', '');
  assert.throws(
    () => repairFichaVoterGrid(ambiguousIncompleteGrid),
    /não possui uma topologia segura/i,
  );
});

test('wrapper grid externo permanece intacto e somente a grade eleitoral interna é reparada', () => {
  const nestedGrid = `
    <section>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px" data-wrapper="intacto">
        <div data-inner-holder="sim">
          <div style="display:grid;grid-template-columns:1fr 1fr .8fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));">
            <div>{{ALUNO_RG}}</div>
            <div>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</div>
            <div>{{ALUNO_RG_EMISSAO}}</div>
            <div>{{ALUNO_CPF}}</div>
            <div style="grid-column:span 2">{{ALUNO_TITULO_ELEITOR}}</div>
            <div style="grid-column:span 2">{{ALUNO_RESERVISTA}}</div>
          </div>
        </div>
        <div>RESUMO EXTERNO</div>
      </div>
    </section>
  `;

  const repaired = repairFichaVoterGrid(nestedGrid);
  assert.match(repaired, /style="display:grid;grid-template-columns:2fr 1fr;gap:12px" data-wrapper="intacto"/);
  assert.match(repaired, /grid-template-columns:1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/);
  assert.equal((repaired.match(/RESUMO EXTERNO/g) || []).length, 1);
  assert.equal(repairFichaVoterGrid(repaired), repaired);
});

test('duas grades eleitorais compatíveis são recusadas por ambiguidade', () => {
  const grid = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);">
      <div>{{ALUNO_RG}}</div>
      <div>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</div>
      <div>{{ALUNO_RG_EMISSAO}}</div>
      <div>{{ALUNO_CPF}}</div>
      <div>{{ALUNO_TITULO_ELEITOR}}</div>
      <div>{{ALUNO_RESERVISTA}}</div>
    </div>
  `;
  assert.throws(
    () => repairFichaVoterGrid(`<section>${grid}${grid}</section>`),
    /mais de uma grade eleitoral compatível/i,
  );
});
