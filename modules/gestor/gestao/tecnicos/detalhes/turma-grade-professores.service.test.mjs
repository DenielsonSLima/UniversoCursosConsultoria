import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('./turma-grade.service.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const poloA = '00000000-0000-4000-8000-000000000001';
const poloB = '00000000-0000-4000-8000-000000000002';
const turmaA = '00000000-0000-4000-8000-000000000101';
const turmaB = '00000000-0000-4000-8000-000000000102';
const professor = (number, poloId, poloIds = [poloId], status = 'ATIVO') => ({
  id: `00000000-0000-4000-8000-${String(200 + number).padStart(12, '0')}`,
  nome: `Docente sintético ${String(number).padStart(2, '0')}`,
  tipo: 'Professor', status, polo_id: poloId, polo_ids: poloIds,
});
const teachers = [
  professor(1, poloA), professor(2, poloA), professor(3, poloA, [poloA, poloB]),
  ...Array.from({ length: 9 }, (_, index) => professor(index + 4, poloB)),
  professor(13, poloA, [poloA], 'INATIVO'),
];

const runtime = ({ missingPolo = false, missingClass = false, classError = null } = {}) => {
  const calls = [];
  const legacy = { disciplina_id: 'disciplina-legada', professor_id: teachers[3].id, professor_nome: teachers[3].nome, concluida: false };
  const records = {
    turmas: missingClass ? [] : [{ id: turmaA, polo_id: missingPolo ? null : poloA }, { id: turmaB, polo_id: poloB }],
    parceiros: teachers,
    turmas_disciplinas: [legacy], aulas_turma: [], atividades_extra_classe: [],
  };
  const supabase = {
    from(table) {
      const call = { table, equals: [], scope: null };
      calls.push(call);
      const resolve = () => {
        if (table === 'turmas' && classError) return { data: null, error: classError };
        let data = [...records[table]];
        for (const [key, value] of call.equals) {
          if (key !== 'turma_id') data = data.filter((row) => row[key] === value);
        }
        if (call.scope) {
          const match = /^polo_id\.eq\.([^,]+),polo_ids\.cs\.\{([^}]+)\}$/.exec(call.scope);
          assert.ok(match, 'O escopo deve usar a união do polo principal com os múltiplos vínculos.');
          assert.equal(match[1], match[2]);
          data = data.filter((row) => row.polo_id === match[1] || row.polo_ids.includes(match[1]));
        }
        if (call.order) data.sort((left, right) => left[call.order].localeCompare(right[call.order]));
        return { data, error: null };
      };
      const query = {
        select() { return query; },
        eq(key, value) { call.equals.push([key, value]); return query; },
        or(scope) { call.scope = scope; return query; },
        order(key) { call.order = key; return query; },
        async single() {
          const result = resolve();
          return result.error ? result : { data: result.data[0] || null, error: null };
        },
        then(onValue, onError) { return Promise.resolve().then(resolve).then(onValue, onError); },
      };
      return query;
    },
  };
  const module = { exports: {} };
  const require = (name) => {
    if (name.endsWith('/lib/supabase')) return { supabase };
    if (name.endsWith('/cadastros.service')) return { cadastrosService: {
      getCursoById: async () => ({ id: 'curso-sintetico', modalidade: 'TECNICO', modulos: [] }),
      getGrade: async () => [],
    } };
    if (name === './academic-lifecycle.service') return { academicLifecycleService: { getDiarios: async () => [] } };
    throw new Error(`Dependência inesperada: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return { service: module.exports.turmaGradeService, calls, legacy };
};

test('grade recebe os três docentes ativos do polo da turma, incluindo vínculo múltiplo', async () => {
  const { service, calls } = runtime();
  const grade = await service.getGradeData(turmaA, 'curso-sintetico');
  assert.deepEqual(grade.professores, teachers.slice(0, 3).map(({ id, nome }) => ({ id, nome })));
  assert.ok(calls.some((call) => call.table === 'turmas' && call.equals.some(([key, value]) => key === 'id' && value === turmaA)));
  assert.equal(calls.find((call) => call.table === 'parceiros').scope, `polo_id.eq.${poloA},polo_ids.cs.{${poloA}}`);
});

test('outra turma usa seu próprio polo e conserva docentes já atribuídos fora das novas opções', async () => {
  const { service, legacy } = runtime();
  const gradeA = await service.getGradeData(turmaA, 'curso-sintetico');
  const gradeB = await service.getGradeData(turmaB, 'curso-sintetico');
  assert.equal(gradeA.professores.length, 3);
  assert.deepEqual(gradeB.professores.map((row) => row.id), teachers.slice(2, 12).map((row) => row.id));
  assert.equal(gradeA.disciplinasConfig[legacy.disciplina_id].professorId, legacy.professor_id);
  assert.equal(gradeA.disciplinasConfig[legacy.disciplina_id].professor, legacy.professor_nome);
  assert.ok(!gradeA.professores.some((row) => row.id === legacy.professor_id));
});

test('polo ausente, turma ausente ou falha na consulta não liberam uma lista global', async () => {
  for (const options of [{ missingPolo: true }, { missingClass: true }, { classError: new Error('Consulta da turma indisponível.') }]) {
    const { service, calls } = runtime(options);
    await assert.rejects(service.getGradeData(turmaA, 'curso-sintetico'), /polo|Consulta da turma indisponível/);
    assert.ok(!calls.some((call) => call.table === 'parceiros'));
  }
});
