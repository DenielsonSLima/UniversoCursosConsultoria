import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCalendarioAulasExportacaoPayload } from './calendarioAulasExportacao.mapper.ts';

const document = {
  titulo: 'Calendário de aulas', subtitulo: 'Enfermagem · T46', rodape: 'Universo',
  instituicao: 'Universo', polo: 'Matriz', curso: 'Enfermagem', turma: 'T46', modulo: 'Módulos I e II',
  exibir_marca_dagua: false, exibir_modulo: true,
  cabecalhos_tabela: { componente: 'Componente', data: 'Data', horario: 'Horário', professor_observacao: 'Professor(a)' },
  arquivo_nome: 'calendario-t46.pdf', template_revision: 8, template: { title: 'Modelo configurado' },
};
const line = { componente_curricular: 'Ética', data_exibicao: '19/12/2026', horario_exibicao: '08:00 – 16:00', professores_observacao: 'Professor não informado' };
const makeChronological = () => ({
  status: 'PRONTO', documento: {
    ...document, modo_exportacao: 'CRONOLOGICO', alcance: '29/08/2026 a 19/12/2026',
    data_inicio: '2026-08-29', data_fim: '2026-12-19',
    modulos_selecionados: [
      { modulo_id: 'i', modulo_nome: 'Módulo I - Ambientação', modulo_rotulo: 'Módulo I', modulo_ordem: 1, total_aulas: 1 },
      { modulo_id: 'ii', modulo_nome: 'Módulo II - Especialidades', modulo_rotulo: 'Módulo II', modulo_ordem: 2, total_aulas: 1 },
      { modulo_id: 'iii', modulo_nome: 'Módulo III - Gerenciamento', modulo_rotulo: 'Módulo III', modulo_ordem: 3, total_aulas: 0 },
    ],
  },
  linhas: [
    { ...line, encontro_id: 'aula-1', disciplina_id: 'd1', modulo_id: 'ii', modulo_nome: 'Módulo II - Especialidades', modulo_rotulo: 'Módulo II', data_iso: '2026-12-19', hora_inicio: '08:00:00' },
    { ...line, encontro_id: 'aula-2', disciplina_id: 'd2', modulo_id: 'i', modulo_nome: 'Módulo I - Ambientação', modulo_rotulo: 'Módulo I', data_iso: '2026-12-19', hora_inicio: null },
  ],
});

test('mantém encontros distintos e ordem canônica mesmo com apresentação igual', () => {
  const result = mapCalendarioAulasExportacaoPayload(makeChronological());
  assert.deepEqual(result.linhas.map((item) => item.encontroId), ['aula-1', 'aula-2']);
  assert.deepEqual(result.linhas.map((item) => item.moduloRotulo), ['Módulo II', 'Módulo I']);
  assert.equal(result.linhas[1].horaInicio, null);
  assert.equal(result.documento?.modulosSelecionados?.[2].totalAulas, 0);
  assert.equal(result.documento?.alcance, '29/08/2026 a 19/12/2026');
  assert.equal(result.documento?.templateRevision, 8);
  assert.deepEqual(result.documento?.template, { title: 'Modelo configurado' });
});

test('payload misto incompleto falha explicitamente em vez de esconder módulo', () => {
  const payload = makeChronological();
  payload.linhas[0].modulo_id = '';
  assert.throws(() => mapCalendarioAulasExportacaoPayload(payload), /modulo_id/);
  const missingScope = makeChronological();
  missingScope.documento.alcance = '';
  assert.throws(() => mapCalendarioAulasExportacaoPayload(missingScope), /alcance/);
  const invalidCount = makeChronological();
  invalidCount.documento.modulos_selecionados[0].total_aulas = -1;
  assert.throws(() => mapCalendarioAulasExportacaoPayload(invalidCount), /quantidade/);
});

test('preserva o envelope legado por módulo e estados sem grade', () => {
  const legacy = mapCalendarioAulasExportacaoPayload({ status: 'PRONTO', documento: document, linhas: [line] });
  assert.equal(legacy.documento?.modoExportacao, undefined);
  assert.equal(legacy.linhas[0].componenteCurricular, 'Ética');
  assert.equal(legacy.linhas[0].moduloId, undefined);
  assert.deepEqual(mapCalendarioAulasExportacaoPayload({ status: 'SEM_GRADE', mensagem: 'Sem aulas' }), {
    status: 'SEM_GRADE', mensagem: 'Sem aulas', documento: null, linhas: [],
  });
});
