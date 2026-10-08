import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeCurriculumHtml,
  curriculumTextToHtml,
  getCertificateCurriculumText,
  getCertificatePreviewPageCount,
  getEadCertificateCurriculum,
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
  assert.equal(getCertificatePreviewPageCount(certificate, { hasVerso: true }), 3);
  assert.equal(getCertificatePreviewPageCount(certificate, { hasVerso: false }), 1);
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
  assert.equal(getCertificatePreviewPageCount(technical, { hasVerso: false }), 2);
  assert.equal(getCertificatePreviewPageCount({ modalidade: 'LIVRE' }, {}), 2);
});

test('curriculum titles remain literal data inside configured HTML templates', () => {
  assert.equal(escapeCurriculumHtml('Ética & <script> "A" \'B\' $&'),
    'Ética &amp; &lt;script&gt; &quot;A&quot; &#39;B&#39; $&amp;');
  assert.equal(curriculumTextToHtml('Linha 1\nLinha 2 & prática'), 'Linha 1<br />Linha 2 &amp; prática');
});
