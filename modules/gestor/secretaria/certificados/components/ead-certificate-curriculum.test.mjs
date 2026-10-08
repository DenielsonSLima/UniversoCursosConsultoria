import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeCurriculumHtml,
  curriculumTextToHtml,
  getCertificateCurriculumText,
  getEadCertificateCurriculum,
  getEadCertificateCurriculumTable,
  MISSING_EAD_CURRICULUM,
} from './ead-certificate-curriculum.ts';

const snapshot = {
  version: 1,
  source: 'cronograma',
  items: [{ id: 'b', title: 'Segundo nome cadastrado' }, { id: 'a', title: 'Primeiro nome cadastrado' }],
  totalHours: 120,
  pages: [
    { number: 1, lines: ['1. Segundo nome cadastrado'] },
    { number: 2, lines: ['2. Primeiro nome cadastrado'] },
  ],
};
const certificate = { modalidade: 'EAD', metadados: { eadCurriculum: snapshot } };

test('uses backend titles, ordering and page boundaries without rebuilding a course grade', () => {
  assert.equal(getEadCertificateCurriculum(certificate), snapshot);
  assert.equal(getCertificateCurriculumText(certificate, 'Inventado - 60h - Aprovado'),
    '1. Segundo nome cadastrado\n2. Primeiro nome cadastrado');
});

test('table rows and pagination are delivered by the backend without inferred hours or grades', () => {
  const rows = [{ nome: 'Componente B - prática', carga: '20h', status: 'Concluído' },
    { nome: 'Componente A & aplicação', carga: '—', status: '—' }];
  const table = { version: 2, rows, pages: [{ number: 1, rows: [rows[0]] }, { number: 2, rows: [rows[1]] }] };
  const current = { ...certificate, metadados: { ...certificate.metadados, eadCurriculumTable: table } };
  assert.equal(getEadCertificateCurriculumTable(current), table);
  assert.equal(table.rows[1].carga, '—');
  assert.equal(getEadCertificateCurriculumTable(certificate), null);
  assert.equal(getEadCertificateCurriculumTable(current, null), null);
  assert.equal(getEadCertificateCurriculumTable(current, { ...table, version: 1 }), null);
  assert.equal(getEadCertificateCurriculumTable(current, { ...table, pages: [{ number: 1, rows: [] }] }), null);
});

test('the emission snapshot takes precedence over the certificate for reprints', () => {
  const issued = { ...snapshot, totalHours: 160, pages: [{ number: 1, lines: ['Conteúdo congelado na emissão'] }] };
  assert.equal(getEadCertificateCurriculum(certificate, issued), issued);
  assert.equal(getCertificateCurriculumText(certificate, undefined, issued), 'Conteúdo congelado na emissão');
});

test('missing or incompatible EAD snapshots cannot fall back to live course data or legacy text', () => {
  const invalid = [undefined, null, {}, { ...snapshot, version: 2 },
    { ...snapshot, items: [] }, { ...snapshot, totalHours: '120' },
    { ...snapshot, pages: [] }, { ...snapshot, pages: [{ number: 2, lines: ['Título'] }] },
    { ...snapshot, pages: [{ number: 1, lines: [''] }] }];
  for (const eadCurriculum of invalid) {
    const unavailable = { modalidade: 'EAD', metadados: { eadCurriculum },
      curso: { carga_horaria: 120, ead_config: { conteudos: [{ titulo: 'Dado atual' }] } } };
    assert.equal(getEadCertificateCurriculum(unavailable), null);
    assert.equal(getCertificateCurriculumText(unavailable, 'Grade criada no navegador'), MISSING_EAD_CURRICULUM);
  }
  assert.equal(getEadCertificateCurriculum(certificate, null), null);
});

test('other modalities retain their existing curriculum and page contract', () => {
  const technical = { modalidade: 'TECNICO', metadados: { eadCurriculum: snapshot } };
  assert.equal(getEadCertificateCurriculum(technical), null);
  assert.equal(getCertificateCurriculumText(technical, 'Enfermagem - 120h - Aprovado'), 'Enfermagem - 120h - Aprovado');
});

test('curriculum titles remain literal data inside configured HTML templates', () => {
  assert.equal(escapeCurriculumHtml('Ética & <script> "A" \'B\' $&'),
    'Ética &amp; &lt;script&gt; &quot;A&quot; &#39;B&#39; $&amp;');
  assert.equal(curriculumTextToHtml('Linha 1\nLinha 2 & prática'), 'Linha 1<br />Linha 2 &amp; prática');
});
