import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';

import { createCalendarioAulasPdf } from './calendarioAulasExportacao.pdf';
import type { CalendarioAulasExportacaoPayload } from './types';

const makeChronologicalPayload = (): CalendarioAulasExportacaoPayload => ({
  status: 'PRONTO',
  mensagem: null,
  documento: {
    titulo: 'TITULO-MODELO-ATIVO',
    subtitulo: 'CURSO-TURMA-CANONICOS',
    rodape: 'RODAPE-MODELO-ATIVO',
    instituicao: 'Universo Cursos e Consultoria',
    polo: 'Matriz',
    curso: 'Técnico em Enfermagem',
    turma: '2026.2-ENF-INT-JAP',
    modulo: 'Módulo I - Ambientação profissional • Módulo II - Especialidades técnicas',
    modoExportacao: 'CRONOLOGICO',
    alcance: 'Todas as aulas programadas: 29/08/2026 a 19/12/2026',
    dataInicio: '2026-08-29',
    dataFim: '2026-12-19',
    exibirMarcaDagua: false,
    exibirModulo: true,
    cabecalhosTabela: {
      componente: 'COMPONENTE-MODELO',
      data: 'DATA-MODELO',
      horario: 'HORARIO-MODELO',
      professorObservacao: 'DOCENTE-MODELO',
    },
    marcaDaguaTexto: null,
    marcaDaguaDataUri: null,
    marcaDaguaUrl: null,
    marcaDaguaOpacidade: 0.1,
    marcaDaguaEscala: 50,
    marcaDaguaRotacionar: true,
    logoDataUri: null,
    cabecalhoInstitucional: {
      nome: 'Universo Cursos e Consultoria',
      cnpj: '13.278.137/0001-54',
      contato: '(79) 99602-8316',
      email: 'universo.cursoseconsultoria@gmail.com',
      endereco: 'Rua C',
      numero: 'S/N',
      bairro: 'Centro',
      cidade: 'Japoatã',
      estado: 'SE',
      cep: '49950-000',
      isMatriz: true,
      logoUrl: null,
    },
    arquivoNome: 'calendario-t46-cronologico.pdf',
    emitidoEm: '05/10/2026 22:00',
  },
  linhas: [
    ['ETICA-26-SET', '26/09/2026', 'Módulo II'],
    ['ETICA-10-OUT', '10/10/2026', 'Módulo II'],
    ['HISTORIA-17-OUT', '17/10/2026', 'Módulo I'],
    ['TEORIA-19-DEZ', '19/12/2026', 'Módulo II'],
    ['PRATICA-19-DEZ', '19/12/2026', 'Módulo I'],
  ].map(([componenteCurricular, dataExibicao, moduloRotulo], index) => ({
    encontroId: `encontro-${index}`,
    disciplinaId: `disciplina-${index}`,
    componenteCurricular,
    dataExibicao,
    horarioExibicao: '08:00 - 16:00',
    professoresObservacao: 'Professor não informado',
    moduloRotulo,
  })),
});

const pdfSource = async (payload: CalendarioAulasExportacaoPayload) => {
  const document = await createCalendarioAulasPdf(payload);
  return Buffer.from(await document.blob.arrayBuffer()).toString('latin1');
};

test('imprime uma lista mista na ordem canônica sem agrupar, filtrar ou deduplicar aulas', async () => {
  const payload = makeChronologicalPayload();
  payload.linhas.push({ ...payload.linhas[4], encontroId: 'encontro-distinto-mesmo-conteudo' });
  const source = await pdfSource(payload);

  assert.ok(source.indexOf('ETICA-26-SET') < source.indexOf('ETICA-10-OUT'));
  assert.ok(source.indexOf('ETICA-10-OUT') < source.indexOf('HISTORIA-17-OUT'));
  assert.ok(source.indexOf('HISTORIA-17-OUT') < source.indexOf('TEORIA-19-DEZ'));
  assert.equal(source.match(/PRATICA-19-DEZ/g)?.length, 2);
  assert.match(source, /Todas as aulas programadas: 29\/08\/2026 a 19\/12\/2026/);
  assert.match(source, /TITULO-MODELO-ATIVO/);
  assert.match(source, /COMPONENTE-MODELO/);
  assert.match(source, /DOCENTE-MODELO/);
  assert.match(source, /HORARIO-MODELO/);
  assert.match(source, /Módulo II/);
  assert.match(source, /Módulo I/);
});

test('exibirModulo oculta resumo e rótulos no modo novo sem ocultar alcance e aulas', async () => {
  const payload = makeChronologicalPayload();
  if (!payload.documento) throw new Error('Fixture inválida');
  payload.documento.exibirModulo = false;
  payload.documento.modulo = 'RESUMO-MODULO-OCULTO';
  payload.linhas = payload.linhas.map((linha) => ({ ...linha, moduloRotulo: 'ROTULO-MODULO-OCULTO' }));
  const source = await pdfSource(payload);

  assert.doesNotMatch(source, /RESUMO-MODULO-OCULTO|ROTULO-MODULO-OCULTO/);
  assert.match(source, /Todas as aulas programadas/);
  assert.match(source, /ETICA-26-SET/);
});

test('modo legado continua usando somente o módulo global e não adiciona rótulo à aula', async () => {
  const payload = makeChronologicalPayload();
  if (!payload.documento) throw new Error('Fixture inválida');
  delete payload.documento.modoExportacao;
  delete payload.documento.alcance;
  payload.documento.modulo = 'MODULO-LEGADO-GLOBAL';
  payload.linhas = payload.linhas.map((linha) => ({ ...linha, moduloRotulo: 'ROTULO-IGNORADO-NO-LEGADO' }));
  const source = await pdfSource(payload);

  assert.match(source, /MODULO-LEGADO-GLOBAL/);
  assert.doesNotMatch(source, /ROTULO-IGNORADO-NO-LEGADO/);
  assert.doesNotMatch(source, /Todas as aulas programadas/);
});

test('paginação cronológica mantém componente e módulo na mesma página e repete contexto', async () => {
  const payload = makeChronologicalPayload();
  payload.linhas = Array.from({ length: 40 }, (_, index) => ({
    componenteCurricular: `COMPONENTE-${String(index).padStart(3, '0')}`,
    dataExibicao: '19/12/2026',
    horarioExibicao: '08:00 - 16:00',
    professoresObservacao: 'Professor não informado',
    moduloRotulo: `ROTULO-${String(index).padStart(3, '0')}`,
  }));
  const document = await createCalendarioAulasPdf(payload);
  const bytes = Buffer.from(await document.blob.arrayBuffer());
  const source = bytes.toString('latin1');
  if (process.env.CALENDARIO_CRONOLOGICO_MULTIPAGE_OUTPUT) {
    await writeFile(process.env.CALENDARIO_CRONOLOGICO_MULTIPAGE_OUTPUT, bytes);
  }
  const pages = source.match(/\/Type \/Page\b/g)?.length || 0;
  const streams = [...source.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((match) => match[1]);

  assert.ok(pages >= 3);
  assert.equal(source.match(/TITULO-MODELO-ATIVO/g)?.length, pages);
  assert.equal(source.match(/COMPONENTE-MODELO/g)?.length, pages);
  assert.equal(source.match(/HORARIO-MODELO/g)?.length, pages);
  assert.equal(source.match(/Todas as aulas programadas/g)?.length, pages);
  for (let index = 0; index < 40; index += 1) {
    const suffix = String(index).padStart(3, '0');
    assert.ok(streams.some((stream) => (
      stream.includes(`COMPONENTE-${suffix}`) && stream.includes(`ROTULO-${suffix}`)
    )), `aula ${suffix} precisa manter componente e módulo na mesma página`);
  }
});

test('payload cronológico incompatível falha explicitamente', async () => {
  const payload = makeChronologicalPayload();
  if (!payload.documento) throw new Error('Fixture inválida');
  delete payload.documento.alcance;
  await assert.rejects(createCalendarioAulasPdf(payload), /alcance das aulas/);
  payload.documento.alcance = 'Período solicitado';
  delete payload.linhas[0].moduloRotulo;
  await assert.rejects(createCalendarioAulasPdf(payload), /não informou seu módulo/);
});

test('fixture de inspeção usa marca isolada e os parâmetros institucionais do snapshot', async () => {
  const payload = makeChronologicalPayload();
  if (!payload.documento) throw new Error('Fixture inválida');
  const document = payload.documento;
  const logo = await readFile('public/LogoUniverso.png');
  document.logoDataUri = `data:image/png;base64,${logo.toString('base64')}`;
  document.exibirMarcaDagua = true;
  document.marcaDaguaDataUri = document.logoDataUri;
  if (process.env.CALENDARIO_CRONOLOGICO_BRAND_SNAPSHOT) {
    const snapshot = JSON.parse(await readFile(process.env.CALENDARIO_CRONOLOGICO_BRAND_SNAPSHOT, 'utf8'));
    document.marcaDaguaUrl = snapshot.turma.watermark_url;
    document.marcaDaguaOpacidade = Number(snapshot.turma.watermark_opacity);
    document.marcaDaguaEscala = snapshot.turma.watermark_scale;
    document.marcaDaguaRotacionar = snapshot.turma.watermark_rotate;
  }
  const result = await createCalendarioAulasPdf(payload);
  if (process.env.CALENDARIO_CRONOLOGICO_PDF_OUTPUT) {
    await writeFile(process.env.CALENDARIO_CRONOLOGICO_PDF_OUTPUT, Buffer.from(await result.blob.arrayBuffer()));
  }
  assert.ok(result.blob.size > 1000);
});
