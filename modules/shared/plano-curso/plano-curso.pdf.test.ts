import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { TextDecoder } from 'node:util';

import { createPlanoCursoPdf } from './plano-curso.pdf';
import type { PlanoCursoDocumentoPayload } from './plano-curso.types';

const documento: PlanoCursoDocumentoPayload = {
  arquivoNome: 'plano-curso-teste.pdf',
  titulo: 'Plano de Curso',
  subtitulo: 'Curso Técnico · Turma T01',
  orientacao: 'A4_RETRATO',
  templateRevision: 1,
  template: null,
  cabecalho: {
    titulo: 'PLANO DE CURSO',
    subtitulo: 'Curso Técnico · Turma T01',
    instituicao: 'Universo Cursos e Consultoria',
    logoUrl: null,
    logoDataUri: null,
  },
  rotulos: {
    curso: 'Curso',
    turma: 'Turma',
    componenteCurricular: 'Componente curricular',
    docente: 'Docente',
    diasAulas: 'Dias de aula',
    objetivos: 'Objetivos',
    objetivosDisciplina: 'Objetivos',
    criteriosAvaliacao: 'Critérios de avaliação',
    insumosRecursos: 'Insumos e recursos',
    conteudoProgramatico: 'Conteúdo programático por encontro',
    dataLocal: 'Local e data',
    assinaturaDocente: 'Assinatura do docente',
  },
  instrucoesConteudo: 'Registre o conteúdo programático previsto para cada encontro.',
  instituicao: {
    poloId: 'polo-1',
    nome: 'Universo Cursos e Consultoria',
    razaoSocial: 'Universo Cursos e Consultoria Ltda.',
    cnpj: '00.000.000/0001-00',
    endereco: 'Rua de Teste, 100',
    cidade: 'Aracaju',
    uf: 'SE',
    logoUrl: null,
    logoDataUri: null,
  },
  marcaDagua: {
    exibir: true,
    texto: 'UNIVERSO',
    url: null,
    dataUri: null,
    opacidade: 0.08,
    escala: 32,
    rotacionar: true,
  },
  componente: {
    turmaId: 'turma-1',
    turmaNome: 'Turma T01',
    turmaCodigo: 'T01',
    cursoNome: 'Curso Técnico',
    disciplinaId: 'disciplina-1',
    disciplinaNome: 'Farmacologia',
  },
  docente: {
    id: 'professor-1',
    nome: 'Docente de Teste',
    assinatura: {
      exibir: true,
      path: 'professores/professor-1/assinatura',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    },
  },
  diasAulas: ['10/08/2026', '11/08/2026'],
  totalDias: 2,
  totalAulas: 2,
  objetivos: ['Compreender fundamentos da disciplina.'],
  criteriosAvaliacao: ['Participação e atividade prática.'],
  insumosRecursos: ['Projetor e material didático.'],
  localData: {
    cidade: 'Aracaju',
    uf: 'SE',
    dataISO: '2026-08-08',
    dataExibicao: '8 de agosto de 2026',
    texto: 'Aracaju/SE, 8 de agosto de 2026',
  },
  paginas: [
    {
      numero: 1,
      tipo: 'IDENTIFICACAO',
      encontros: [{
        aulaId: 'aula-1',
        dataAula: '2026-08-10',
        dataExibicao: '10/08/2026',
        sessao: 'M',
        titulo: 'Primeiro encontro',
        cargaHoraria: 4,
        horaInicio: '08:00',
        horaFim: '12:00',
        conteudo: 'Conteúdo introdutório.',
      }],
    },
    {
      numero: 2,
      tipo: 'CONTEUDO',
      encontros: [{
        aulaId: 'aula-2',
        dataAula: '2026-08-11',
        dataExibicao: '11/08/2026',
        sessao: 'M',
        titulo: 'Segundo encontro',
        cargaHoraria: 4,
        horaInicio: '08:00',
        horaFim: '12:00',
        conteudo: 'Conceitos fundamentais e aplicações profissionais.',
      }],
    },
  ],
  totalPaginas: 2,
  emitidoEm: '2026-08-08T12:00:00.000Z',
};

test('compositor gera PDF vetorial paginado pelo backend e com texto selecionável', async () => {
  const result = await createPlanoCursoPdf(documento);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const source = new TextDecoder('latin1').decode(bytes);
  assert.equal(result.fileName, 'plano-curso-teste.pdf');
  assert.match(source.slice(0, 8), /^%PDF-/);
  assert.ok(result.blob.size > 1_000);
  assert.match(source, /Primeiro encontro/);
  assert.match(source, /Segundo encontro/);
  assert.equal(source.match(/\/Subtype\s*\/Image/g)?.length, 1);

  const overflow = JSON.parse(JSON.stringify(documento)) as PlanoCursoDocumentoPayload;
  overflow.paginas[1].encontros[0].conteudo = 'Conteúdo canônico extenso. '.repeat(1_000);
  await assert.rejects(
    () => createPlanoCursoPdf(overflow),
    /não cabe na página preparada pelo backend/i,
  );

  if (process.env.PLANO_CURSO_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.PLANO_CURSO_PDF_FIXTURE_OUTPUT, bytes);
  }
});
