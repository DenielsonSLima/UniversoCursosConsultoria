import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, actor, id, migrations, sqlFile } from './lgpd_internal_chat.fixture.mjs';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
await fixture(db);
const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
const count = async (table) => Number((await one(`select count(*) as n from ${table}`)).n);
const path = (n) => `comunicacao/chats/${id(n)}/gestor/sintetico.pdf`;
async function denied(sql, values = [], pattern = /42501|permiss|autorizad|imut|row.level|titular|público/i) {
  await db.exec('savepoint rejection');
  try { await assert.rejects(() => db.query(sql, values), pattern); }
  finally { await db.exec('rollback to savepoint rejection; release savepoint rejection'); }
}
async function scenario(name, run) {
  await test(name, async () => {
    await db.exec('reset role; begin');
    try { await run(); }
    finally { await db.exec('reset role; rollback'); }
  });
}

await scenario('RLS limita gestor por polo e setor em chats, mensagens e arquivos', async () => {
  for (const [manager, expected] of [[31, 2], [32, 1], [33, 6], [34, 3], [35, 0], [36, 0], [37, 0]]) {
    await actor(db, manager);
    assert.equal(await count('comunicacao_chats'), expected, `chats para gestor ${manager}`);
    assert.equal(await count('comunicacao_mensagens'), expected, `mensagens para gestor ${manager}`);
    assert.equal(await count('storage.objects'), expected, `arquivos para gestor ${manager}`);
  }
});

await scenario('sem aba, identidade ativa ou polo não há abrangência implícita', async () => {
  for (const manager of [35, 36, 37]) {
    await actor(db, manager);
    const result = await one(`select public.comunicacao_gestor_can_access('financeiro',$1) as ok`, [id(1)]);
    assert.equal(result.ok, false);
  }
  await actor(db, null);
  assert.equal((await one('select public.can_access_comunicacao_chat($1) as ok', [id(41)])).ok, false);
});

await scenario('aluno e professor mantêm acesso só às próprias conversas e anexos', async () => {
  for (const [n, kind, expected] of [[11, 'aluno', 4], [12, 'aluno', 1], [13, 'professor', 1]]) {
    await actor(db, n, kind);
    assert.equal(await count('comunicacao_chats'), expected);
    assert.equal(await count('comunicacao_mensagens'), expected);
    assert.equal(await count('storage.objects'), expected);
  }
});

await scenario('gestor não consulta, altera ou apaga conversa de outro polo/setor por ID', async () => {
  await actor(db, 31);
  for (const chat of [42, 43, 45, 46]) {
    assert.equal((await db.query('select * from comunicacao_chats where id=$1', [id(chat)])).rows.length, 0);
    assert.equal((await db.query("update comunicacao_chats set status='solucionada' where id=$1 returning id", [id(chat)])).rows.length, 0);
    assert.equal((await db.query('delete from comunicacao_chats where id=$1 returning id', [id(chat)])).rows.length, 0);
    await denied("insert into comunicacao_mensagens(chat_id,conteudo) values($1,'Sintética')", [id(chat)]);
  }
});

await scenario('conhecer o caminho não permite assinar/ler/upload/deletar anexo fora do escopo', async () => {
  await actor(db, 31);
  assert.deepEqual(await one(`select public.can_read_anexo_storage_object($1) as read,
    public.can_upload_anexo_storage_object($1) as upload,
    public.can_delete_anexo_storage_object($1) as del`, [path(42)]), { read: false, upload: false, del: false });
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [path(42)])).rows.length, 0);
  await denied("insert into storage.objects(bucket_id,name,owner) values('anexos',$1,$2)",
    [`comunicacao/chats/${id(42)}/gestor/novo.pdf`, id(31)]);
  assert.equal((await one("select public.can_upload_anexo_storage_object('comunicacao/chats/invalido/gestor/x') as ok")).ok, false);
});

await scenario('upload de aluno confere participação e o segmento do ator', async () => {
  await actor(db, 11, 'aluno');
  const ownPath = `comunicacao/chats/${id(41)}/aluno/${id(11)}/novo.pdf`;
  await db.query("insert into storage.objects(bucket_id,name,owner) values('anexos',$1,$2)", [ownPath,id(11)]);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [ownPath])).rows.length, 1);
  for (const invalid of [`comunicacao/chats/${id(42)}/aluno/${id(11)}/x`,
    `comunicacao/chats/${id(41)}/aluno/${id(12)}/x`, `comunicacao/chats/${id(41)}/gestor/x`]) {
    assert.equal((await one('select public.can_upload_anexo_storage_object($1) as ok', [invalid])).ok, false);
  }
});

await scenario('mensagem força identidade canônica e impede anexo de outro atendimento', async () => {
  await actor(db, 11, 'aluno');
  const message = await one(`insert into comunicacao_mensagens(chat_id,conteudo,remetente_id,remetente_tipo)
    values($1,'Mensagem de teste',$2,'gestor') returning remetente_id,remetente_tipo`, [id(41),id(31)]);
  assert.equal(message.remetente_id, id(11)); assert.equal(message.remetente_tipo, 'aluno');
  await denied(`insert into comunicacao_mensagens(chat_id,conteudo,anexo_path)
    values($1,'Sintética',$2)`, [id(41),path(42)]);
  await denied('update comunicacao_mensagens set conteudo=$1 where chat_id=$2', ['Modificada',id(41)], /Somente o status/);
  await db.query('update comunicacao_mensagens set lida=true where chat_id=$1', [id(41)]);
});

await scenario('abertura antiga de professor ganha polo/setor no banco, sem alterar a UI', async () => {
  await actor(db, 13, 'professor');
  const chat = await one(`insert into comunicacao_chats(remetente_id,remetente_nome,remetente_tipo,categoria_id)
    values($1,'Nome controlado pelo cliente','Aluno',$2)
    returning id,polo_id,setor,remetente_nome,remetente_tipo`, [id(13),id(21)]);
  assert.equal(chat.polo_id,id(1)); assert.equal(chat.setor,'financeiro');
  assert.equal(chat.remetente_nome,'Pessoa sintética'); assert.equal(chat.remetente_tipo,'Professor');
  await db.query("insert into comunicacao_mensagens(chat_id,conteudo) values($1,'Professor sintético')", [chat.id]);
});

await scenario('gestor cria apenas dentro do polo/setor e identidade do destinatário', async () => {
  await actor(db, 31);
  const chat = await one(`insert into comunicacao_chats(remetente_id,categoria_id)
    values($1,$2) returning polo_id,setor`, [id(11),id(21)]);
  assert.deepEqual(chat, {polo_id:id(1),setor:'financeiro'});
  await denied('insert into comunicacao_chats(remetente_id,categoria_id) values($1,$2)', [id(12),id(21)]);
  await denied('insert into comunicacao_chats(remetente_id,categoria_id) values($1,$2)', [id(11),id(22)]);
  await denied('insert into comunicacao_chats(remetente_id,categoria_id,polo_id) values($1,$2,$3)', [id(12),id(21),id(1)]);
});

await scenario('opção Geral sem categoria continua criando conversa com setor canônico', async () => {
  await actor(db,33);
  const chat=await one('insert into comunicacao_chats(remetente_id) values($1) returning categoria_id,polo_id,setor', [id(11)]);
  assert.deepEqual(chat,{categoria_id:null,polo_id:id(1),setor:'atendimento_geral'});
  await actor(db,13,'professor');
  assert.equal((await one('insert into comunicacao_chats(remetente_id) values($1) returning setor',[id(13)])).setor,'atendimento_geral');
});

await scenario('titular não troca dono, setor, polo ou tokens e usa exclusão apenas visual', async () => {
  await actor(db, 11, 'aluno');
  await db.query('update comunicacao_chats set deleted_by_aluno=true,notificar_resposta=true where id=$1', [id(41)]);
  for (const clause of [`remetente_id='${id(12)}'`, "setor='secretaria'", `polo_id='${id(2)}'`,
    "public_access_hash='token-controlado'", "status='solucionada'", `categoria_id='${id(22)}'`]) {
    await denied(`update comunicacao_chats set ${clause} where id=$1`, [id(41)]);
  }
  assert.equal((await db.query('delete from comunicacao_chats where id=$1 returning id', [id(41)])).rows.length, 0);
});

await scenario('gestor restrito não transfere para destino inacessível; global explícito transfere', async () => {
  await actor(db, 31);
  await denied('update comunicacao_chats set categoria_id=$1 where id=$2', [id(22),id(41)]);
  await actor(db,33);
  const chat = await one('update comunicacao_chats set categoria_id=$1 where id=$2 returning setor', [id(22),id(41)]);
  assert.equal(chat.setor,'secretaria');
});

await scenario('hard-delete autorizado remove mensagens em cascata sem perder o escopo', async () => {
  await actor(db,31);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [path(41)])).rows.length,1);
  assert.equal((await db.query('delete from comunicacao_chats where id=$1 returning id',[id(41)])).rows.length,1);
  assert.equal((await db.query('select * from comunicacao_mensagens where chat_id=$1',[id(41)])).rows.length,0);
});

await scenario('atendimento público continua exclusivo da Edge service_role e não do usuário direto', async () => {
  await actor(db,11,'aluno');
  await denied(`insert into comunicacao_chats(remetente_id,categoria_id,origem,public_access_hash)
    values($1,$2,'publico','sintetico')`,[id(11),id(21)]);
  await actor(db,null,'visitante','service_role');
  const chat=await one(`insert into comunicacao_chats(remetente_nome,remetente_tipo,polo_id,setor,origem,public_access_hash)
    values('Visitante sintético','Visitante',$1,'secretaria','publico','hash-sintetico') returning id`,[id(2)]);
  await db.query("insert into comunicacao_mensagens(chat_id,remetente_tipo,conteudo) values($1,'aluno','Sintética')",[chat.id]);
  await actor(db,31);
  assert.equal((await db.query('select * from comunicacao_chats where id=$1',[chat.id])).rows.length,0);
});

await scenario('diretório de conversa expõe só identificação textual e respeita polo/aba', async () => {
  for(const [manager,expected] of [[31,[id(11)]],[32,[id(12)]],[33,[id(11),id(12)]],[34,[id(11),id(12)]]]){
    await actor(db,manager);
    const contacts=(await db.query('select * from comunicacao_contatos_internos_listar()')).rows;
    assert.deepEqual(contacts.map(contact=>contact.id).sort(),expected.sort());
    for(const contact of contacts)assert.deepEqual(Object.keys(contact),['id','nome','tipo','status','cidade']);
  }
  await actor(db,35);
  assert.equal((await db.query('select * from comunicacao_contatos_internos_listar()')).rows.length,0);
  await actor(db,36);
  await denied('select * from comunicacao_contatos_internos_listar()');
  await actor(db,11,'aluno');
  await denied('select * from comunicacao_contatos_internos_listar()');
});

await scenario('categorias canônicas impedem default de outro setor e reservam Geral ao autorizado', async () => {
  for(const [manager,expected] of [[31,[id(21)]],[38,[id(22)]],[33,[null,id(21),id(22)]],
    [34,[id(21)]],[35,[]],[37,[]]]){
    await actor(db,manager);
    const categories=(await db.query('select * from comunicacao_categorias_internas_listar()')).rows;
    assert.deepEqual(categories.map(category=>category.id),expected);
  }
  await actor(db,36);await denied('select * from comunicacao_categorias_internas_listar()');
  await actor(db,11,'aluno');await denied('select * from comunicacao_categorias_internas_listar()');
});

await scenario('perfil inicio+comunicacao usa diretório mesmo quando cadastro completo é negado', async () => {
  await db.exec(`reset role;
    alter table usuarios_sistema add column modules text[] default array['inicio','comunicacao'];
    create function public.gestor_has_any_module(text[]) returns boolean
    language sql stable security definer set search_path='' as $$
      select coalesce((select u.modules && $1 from public.usuarios_sistema u where u.auth_user_id=auth.uid()),false);
    $$;
    create function public.is_gestor_global() returns boolean language sql stable as $$select false;$$;
    create function public.gestor_allowed_polo_ids() returns uuid[]
    language sql stable security definer set search_path='' as $$
      select array[u.polo_comunicacao_id] from public.usuarios_sistema u where u.auth_user_id=auth.uid();
    $$;
    alter table parceiros enable row level security;
    grant select on parceiros to authenticated;
  `);
  await db.exec(sqlFile('20261101030418_lgpd_partner_purpose_scope.sql')
    .replace(/^\s*(BEGIN|COMMIT);\s*$/gim,''));
  await db.exec(`
    create policy portal_parceiros_select on parceiros for select to authenticated using (
      id=public.current_aluno_id() or id=public.current_professor_id()
      or public.is_partner_in_gestor_read_scope(polo_id,polo_ids));
  `);
  await actor(db,31);
  assert.equal(await count('parceiros'),0,'comunicação não reabre leitura completa');
  const contacts=(await db.query('select * from comunicacao_contatos_internos_listar()')).rows;
  assert.deepEqual(contacts.map(contact=>contact.id),[id(11)]);
  assert.deepEqual(Object.keys(contacts[0]),['id','nome','tipo','status','cidade']);
});

await scenario('helpers privilegiados têm ACL mínima e search_path fechado',async()=>{
  await db.exec('reset role');
  for(const name of ['comunicacao_gestor_can_access(text,uuid)','can_access_comunicacao_chat(uuid)',
    'can_manage_comunicacao_chat(uuid)','can_upload_anexo_storage_object(text)',
    'can_read_anexo_storage_object(text)','can_delete_anexo_storage_object(text)',
    'comunicacao_contatos_internos_listar()','comunicacao_categorias_internas_listar()']){
    const metadata=await one(`select has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('authenticated',$1,'execute') as authenticated,
      prosecdef,proconfig from pg_proc where oid=$1::regprocedure`,[`public.${name}`]);
    assert.equal(metadata.anon,false);assert.equal(metadata.authenticated,true);assert.equal(metadata.prosecdef,true);
    assert.ok(metadata.proconfig.includes('search_path=""'));
  }
  for(const name of migrations)assert.ok(sqlFile(name).split('\n').length<=500);
});
await db.close();
