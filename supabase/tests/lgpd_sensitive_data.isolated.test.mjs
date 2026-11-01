import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [poloA, poloB, alunoA, alunoB, curso] = [1, 2, 11, 12, 30].map(id);
const oldPartners = await read('../migrations/20260822162200_close_null_partner_polo_gestor_scope.sql');
const oldVaccines = await read('../migrations/20260714235500_secure_vaccine_records_and_storage.sql');
const dashboardSql = await read('../migrations/20260727142849_personalize_dashboard_by_gestor_profile.sql');
const partnerPatch = await read('../migrations/20261101030418_lgpd_partner_purpose_scope.sql');
const vaccinePatch = await read('../migrations/20261101030422_lgpd_vaccine_permissions.sql');

const functionSql = (source, name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} ausente`);
  const tail = source.slice(start);
  const delimiter = tail.match(/AS (\$[a-z_]*\$)/i)?.[1];
  assert.ok(delimiter);
  const end = tail.indexOf(`${delimiter};`, tail.indexOf(delimiter) + delimiter.length);
  return tail.slice(0, end + delimiter.length + 1);
};
const policiesSql = source => [...source.matchAll(/CREATE POLICY "portal_(?:aluno_vacinas|vacinas_storage)_[^"]+"[\s\S]*?;/g)]
  .map(match => match[0]).join('\n');
const actor = async (db, overrides = {}) => {
  await db.exec('RESET ROLE');
  const values = {
    uid: id(900), role: 'authenticated', active: 'true', global: 'false',
    polos: `{${poloA}}`, aluno: '',
    permissions: { modules: ['inicio'], dashboardWidgets: ['alunos-ativos'] }, ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    await db.query('SELECT set_config($1,$2,false)', [`test.${key}`, typeof value === 'object' ? JSON.stringify(value) : value]);
  }
  await db.exec(`SET ROLE ${values.role}`);
};
const path = aluno => `${aluno}/${curso}/dose.jpg`;
const visible = async (db, table) => (await db.query(`SELECT id FROM ${table} ORDER BY id`)).rows.map(row => row.id);
const setup = async () => {
  const db = new PGlite();
  await db.exec(await read('./fixtures/lgpd-sensitive-data.sql'));
  await db.exec(functionSql(oldPartners, 'is_partner_in_gestor_read_scope'));
  await db.exec(`CREATE POLICY portal_parceiros_select ON public.parceiros FOR SELECT TO authenticated
    USING (id=public.current_aluno_id() OR public.is_partner_in_gestor_read_scope(polo_id,polo_ids));`);
  for (const name of ['can_manage_aluno_vacina', 'vacina_storage_aluno_id', 'vacina_storage_curso_id',
    'can_access_vacina_storage_object', 'can_mutate_vacina_storage_object', 'guard_aluno_vacinas']) {
    await db.exec(functionSql(oldVaccines, name));
  }
  await db.exec(policiesSql(oldVaccines));
  await db.exec(`CREATE TRIGGER guard_aluno_vacinas_trigger BEFORE INSERT OR UPDATE OR DELETE
    ON public.aluno_vacinas FOR EACH ROW EXECUTE FUNCTION public.guard_aluno_vacinas();`);
  await db.exec(functionSql(dashboardSql, 'get_dashboard_kpis'));
  await db.exec(functionSql(dashboardSql, 'get_dashboard_chart_data'));
  for (const [n, polo] of [[11, poloA], [12, poloB], [13, null]]) {
    await db.query(`INSERT INTO public.parceiros VALUES
      ($1,'Aluno','Aluno sintético','ATIVO',$2,$3,'2026-01-01',
      'informação sintética','não declarado','CPF SINTÉTICO','PIX SINTÉTICO')`,
    [id(n), polo, n === 13 ? [poloA] : []]);
  }
  await db.query('INSERT INTO public.cursos VALUES ($1,$2)', [curso, 'Curso sintético']);
  await db.query('INSERT INTO public.turmas VALUES ($1,$2,$3)', [id(40), curso, 'Turma sintética']);
  await db.query('INSERT INTO public.matriculas VALUES ($1,$2,$3,$4,current_date)', [id(50), alunoA, id(40), 'ATIVO']);
  await db.query(`SELECT set_config('test.role','service_role',false),set_config('test.uid',$1,false)`, [id(900)]);
  for (const [n, aluno] of [[21, alunoA], [22, alunoB]]) {
    await db.query(`INSERT INTO public.aluno_vacinas(id,aluno_id,curso_id,vacina_codigo,vacina_nome,
      dose_numero,dose_label,arquivo_url,status,origem) VALUES ($1,$2,$3,'TEST','Vacina sintética',1,'Dose',
      $4,'em_analise','aluno')`, [id(n), aluno, curso, path(aluno)]);
    await db.query('INSERT INTO storage.objects VALUES ($1,$2,$3)', [id(n), 'vacinas', path(aluno)]);
  }
  return db;
};
const patch = async db => { await db.exec('RESET ROLE'); await db.exec(partnerPatch); await db.exec(vaccinePatch); };
const close = async db => { await db.exec('RESET ROLE'); await db.close(); };

test('reproduz leitura indevida de início e mantém agregados depois de fechar a RLS', async () => {
  const db = await setup();
  try {
    await actor(db);
    const original = await db.query('SELECT id,pcd_tipo,raca_cor,cpf_cnpj,chave_pix FROM public.parceiros');
    assert.equal(original.rows.length, 2, 'início lia dados sensíveis do polo e vínculo multipolo');
    await patch(db);
    for (const modules of [['inicio'], ['dashboard']]) {
      await actor(db, { permissions: { modules, dashboardWidgets: ['alunos-ativos'] } });
      assert.deepEqual(await visible(db, 'public.parceiros'), []);
      const kpi = (await db.query('SELECT * FROM public.get_dashboard_kpis($1)', [poloA])).rows[0];
      assert.equal(Number(kpi.alunos_ativos), 2, 'RPC agregada autorizada ignora a leitura direta negada');
      assert.deepEqual(Object.keys(kpi), ['alunos_ativos', 'alunos_ativos_mudanca', 'receita_mes',
        'receita_mes_mudanca', 'taxa_inadimplencia', 'taxa_inadimplencia_mudanca',
        'novas_matriculas', 'novas_matriculas_mudanca']);
      await assert.rejects(() => db.query('SELECT * FROM public.get_dashboard_kpis($1)', [poloB]), /não autorizado/);
      await assert.rejects(() => db.query('SELECT * FROM public.get_dashboard_kpis(NULL)'), /não autorizado/);
    }
    await actor(db, { permissions: { modules: ['inicio'], dashboardWidgets: ['fluxo-caixa'] } });
    const chart = await db.query('SELECT * FROM public.get_dashboard_chart_data($1,2)', [poloA]);
    assert.equal(chart.rows.length, 2);
    assert.deepEqual(Object.keys(chart.rows[0]), ['mes_num', 'ano_num', 'mes_nome', 'receitas', 'despesas']);
  } finally { await close(db); }
});

test('leitura operacional conserva polo, multipolo e dono; global não contorna função/atividade', async () => {
  const db = await setup();
  try {
    await patch(db);
    for (const module of ['parceiros', 'cadastros', 'gestao', 'secretaria', 'financeiro', 'caixa', 'relatorios']) {
      await actor(db, { permissions: { modules: [module] } });
      assert.deepEqual(await visible(db, 'public.parceiros'), [alunoA, id(13)]);
    }
    await actor(db, { permissions: { modules: ['parceiros'] }, global: 'true' });
    assert.deepEqual(await visible(db, 'public.parceiros'), [alunoA, alunoB, id(13)]);
    for (const overrides of [{ active: 'false' }, { uid: '' }, { permissions: { modules: ['inicio'] } }]) {
      await actor(db, { permissions: { modules: ['parceiros'] }, global: 'true', ...overrides });
      assert.deepEqual(await visible(db, 'public.parceiros'), []);
    }
    await actor(db, { active: 'false', aluno: alunoB, permissions: {} });
    assert.deepEqual(await visible(db, 'public.parceiros'), [alunoB], 'preserva ramo de acesso do titular');
  } finally { await close(db); }
});

test('vacinas reproduzem falha antiga e passam a exigir atribuição explícita mesmo para global', async () => {
  const db = await setup();
  try {
    await actor(db);
    assert.deepEqual(await visible(db, 'public.aluno_vacinas'), [id(21)], 'gestor só início lia vacina');
    assert.deepEqual(await visible(db, 'storage.objects'), [id(21)], 'gestor só início lia arquivo privado');
    await patch(db);
    for (const overrides of [
      {}, { global: 'true' },
      { permissions: { modules: ['gestao'] } },
      { global: 'true', permissions: { modules: ['gestao'], tabs: { gestao: [] } } },
      { permissions: { modules: ['gestao'], tabs: { gestao: ['resumo'] } } },
      { permissions: { modules: ['gestao'], tabs: { gestao: { vacinas: true } } } },
    ]) {
      await actor(db, overrides);
      assert.deepEqual(await visible(db, 'public.aluno_vacinas'), []);
      assert.deepEqual(await visible(db, 'storage.objects'), []);
      assert.equal((await db.query('SELECT public.can_manage_aluno_vacina($1) AS allowed', [alunoA])).rows[0].allowed, false);
    }
    const permission = { modules: ['gestao'], tabs: { gestao: ['vacinas'] } };
    await actor(db, { permissions: permission });
    assert.deepEqual(await visible(db, 'public.aluno_vacinas'), [id(21)]);
    assert.deepEqual(await visible(db, 'storage.objects'), [id(21)]);
    for (const overrides of [{ active: 'false' }, { uid: '' }, { polos: '{}' }]) {
      await actor(db, { permissions: permission, ...overrides });
      assert.deepEqual(await visible(db, 'public.aluno_vacinas'), []);
    }
    await actor(db, { permissions: permission, global: 'true' });
    assert.deepEqual(await visible(db, 'public.aluno_vacinas'), [id(21), id(22)]);
  } finally { await close(db); }
});

test('RLS/gatilho/Storage bloqueiam escrita sem atribuição e preservam titular sem poder de validador', async () => {
  const db = await setup();
  try {
    await patch(db);
    await actor(db);
    for (const table of ['public.aluno_vacinas', 'storage.objects']) {
      assert.equal((await db.query(`DELETE FROM ${table} RETURNING id`)).rows.length, 0);
    }
    assert.equal((await db.query("UPDATE public.aluno_vacinas SET status='aprovado' RETURNING id")).rows.length, 0);
    await assert.rejects(() => db.query(`INSERT INTO public.aluno_vacinas(id,aluno_id,curso_id)
      VALUES ($1,$2,$3)`, [id(23), alunoA, curso]), /permissão|row-level security/);
    await assert.rejects(() => db.query('INSERT INTO storage.objects VALUES ($1,$2,$3)',
      [id(23), 'vacinas', `${alunoA}/${curso}/novo.jpg`]), /row-level security/);

    await actor(db, { active: 'false', aluno: alunoA, permissions: {} });
    assert.deepEqual(await visible(db, 'public.aluno_vacinas'), [id(21)]);
    assert.deepEqual(await visible(db, 'storage.objects'), [id(21)]);
    await assert.rejects(() => db.query("UPDATE public.aluno_vacinas SET status='aprovado' WHERE id=$1", [id(21)]), /não pode alterar/);
    await db.query('INSERT INTO storage.objects VALUES ($1,$2,$3)', [id(23), 'vacinas', `${alunoA}/${curso}/novo.jpg`]);
    await actor(db, { permissions: { modules: ['gestao'], tabs: { gestao: ['vacinas'] } } });
    assert.equal((await db.query("UPDATE public.aluno_vacinas SET status='aprovado' WHERE id=$1 RETURNING id", [id(21)])).rows.length, 1);
    await actor(db, { active: 'false', aluno: alunoA, permissions: {} });
    assert.equal((await db.query('DELETE FROM public.aluno_vacinas WHERE id=$1 RETURNING id', [id(21)])).rows.length, 0);
    assert.equal((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id', [id(21)])).rows.length, 0);
  } finally { await close(db); }
});

test('helpers corrigidos mantêm ACL mínima e search_path vazio', async () => {
  const db = await setup();
  try {
    await patch(db);
    for (const signature of ['public.is_partner_in_gestor_read_scope(uuid,uuid[])', 'public.can_manage_aluno_vacina(uuid)']) {
      const row = (await db.query(`SELECT proconfig,prosecdef,
        has_function_privilege('anon',oid,'EXECUTE') AS anon_allowed,
        has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated_allowed
        FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows[0];
      assert.deepEqual(row.proconfig, ['search_path=""']);
      assert.equal(row.prosecdef, true);
      assert.equal(row.anon_allowed, false);
      assert.equal(row.authenticated_allowed, true);
    }
  } finally { await close(db); }
});

test('fotos privadas reutilizam o escopo real de cadastros sem reabrir acesso por início/comunicação', async () => {
  const db = await setup();
  try {
    await patch(db);
    const photos = await read('../migrations/20261101030405_lgpd_private_profile_photos.sql');
    const extract = name => {
      const start = photos.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      const end = photos.indexOf('$$;', start) + 3;
      assert.ok(start >= 0 && end > start);
      return photos.slice(start, end);
    };
    // A exceção documental não participa dos perfis deste cenário. Sua
    // autorização própria é coberta pela suíte de fotos/Secretaria.
    await db.exec(`CREATE FUNCTION public.can_manage_secretaria_document(text,uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false;$$;`);
    await db.exec(extract('profile_photo_partner_id'));
    await db.exec(extract('can_read_private_profile_photo'));
    await db.exec(`CREATE POLICY fotos_perfil_select ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id='fotos-perfil' AND public.can_read_private_profile_photo(name));`);
    for (const [n, aluno] of [[31, alunoA], [32, alunoB]]) {
      await db.query('INSERT INTO storage.objects VALUES ($1,$2,$3)', [id(n), 'fotos-perfil', `${aluno}/perfil/photo.jpg`]);
    }
    const photoIds = async () => (await db.query("SELECT id FROM storage.objects WHERE bucket_id='fotos-perfil' ORDER BY id")).rows.map(row => row.id);
    for (const modules of [['inicio'], ['dashboard'], ['inicio', 'comunicacao']]) {
      await actor(db, { permissions: { modules } });
      assert.deepEqual(await photoIds(), []);
    }
    await actor(db, { permissions: { modules: ['gestao'], tabs: { gestao: ['vacinas'] } } });
    assert.deepEqual(await photoIds(), [id(31)]);
    assert.deepEqual(await visible(db, 'public.aluno_vacinas'), [id(21)]);
    await actor(db, { permissions: { modules: ['parceiros'] }, global: 'true' });
    assert.deepEqual(await photoIds(), [id(31), id(32)]);
    await actor(db, { active: 'false', aluno: alunoB, permissions: {} });
    assert.deepEqual(await photoIds(), [id(32)]);
  } finally { await close(db); }
});
