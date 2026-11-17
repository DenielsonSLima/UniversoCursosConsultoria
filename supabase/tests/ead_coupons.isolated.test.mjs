import assert from 'node:assert/strict';
import test from 'node:test';
import { createCouponHarness } from './fixtures/ead-coupons.harness.mjs';

test('cupons EAD: contratos reais em PostgreSQL isolado e dados fictícios', async t => {
  const h = await createCouponHarness();
  const { db, ids, scalar, asManager, asStudent, asService, id } = h;
  let sequence = 10000;
  const next = () => id(sequence++);
  const call = async (name, args) => {
    const result = await h.rpc(name, args);
    if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result.data;
  };
  const draft = (code, overrides = {}) => ({ code, discountPercent: 100, totalLimit: null,
    startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', perStudentLimit: 2,
    active: true, allCourses: true, courseIds: [], ...overrides });
  const save = (coupon, request = next(), polo = ids.polo) => call('ead_coupons_save', {
    p_polo_id: polo, p_coupon: coupon, p_request_id: request,
  });
  const quote = (code, course = ids.course) => call('ead_coupon_quote', { p_code: code, p_course_id: course });
  const free = (code, turma = ids.turma, request = next()) => call('ead_coupon_redeem_free', {
    p_code: code, p_turma_id: turma, p_request_id: request,
  });
  const prepare = async (code, student = ids.student, turma = ids.turma, request = next(), overrides = {}) => {
    await asService();
    return call('ead_coupon_prepare_checkout', { p_code: code, p_aluno_id: student,
      p_turma_id: turma, p_request_id: request, p_provider: 'banese_card', p_environment: 'sandbox',
      p_payment_method: 'BOLETO', p_due_date: '2090-01-07', p_description: 'Curso fictício - inscrição', ...overrides });
  };
  const history = async couponId => {
    await asManager();
    return call('ead_coupons_history', { p_polo_id: ids.polo, p_coupon_id: couponId, p_page: 1 });
  };
  const rejected = (fn, code) => assert.rejects(fn, error => error.code === code);
  try {
    await t.test('runtime inativo impede leituras e mutações; instalação não ativa produção', async () => {
      await db.exec('update internal_contas.ead_coupon_runtime set enabled=false');
      await rejected(() => save(draft('LOCALOFF')), '42501');
      await asStudent(); await rejected(() => quote('LOCALOFF'), '42501');
      await db.exec('update internal_contas.ead_coupon_runtime set enabled=true'); await asManager();
    });

    await t.test('gestão exige Secretaria+Financeiro, identidade ativa e polo, inclusive em replay', async () => {
      const request = next(), payload = draft('AUTORIZADO');
      const coupon = await save(payload, request);
      assert.equal((await save(payload, request)).id, coupon.id);
      await rejected(() => save(draft('OUTROCODIGO'), request), '22023');
      for (const modules of [['secretaria'], ['financeiro'], []]) {
        await db.query('update public.usuarios_sistema set permissoes=$2 where id=$1',
          [ids.manager, JSON.stringify({ modules })]);
        await rejected(() => save(payload, request), '42501');
      }
      await db.query('update public.usuarios_sistema set permissoes=$2 where id=$1',
        [ids.manager, JSON.stringify({ modules: ['secretaria', 'financeiro', 'gestao'] })]);
      await db.exec('update test_caixa.access_state set scoped_allowed=false,global_allowed=false');
      await rejected(() => save(payload, request), '42501'); await asManager();
      await rejected(() => save({ ...coupon, code: 'OUTROPOLO' }, next(), ids.otherPolo), '42501');
      await db.query("update public.usuarios_sistema set status='INATIVO' where id=$1", [ids.manager]);
      await rejected(() => save(payload, request), '42501');
      await db.query("update public.usuarios_sistema set status='ATIVO' where id=$1", [ids.manager]);
      await asManager(ids.otherManager); await rejected(() => save(payload, request), '22023'); await asManager();
    });

    await t.test('validação de formulário é repetida no servidor e edição tem controle de versão', async () => {
      for (const invalid of [draft('__'), draft('BENEFICIO', { discountPercent: 100.01 }),
        draft('LIMITES', { totalLimit: 0 }), draft('ALUNOS', { perStudentLimit: 0 }),
        draft('DATAS', { endsAt: '2010-01-01T00:00:00Z' }), draft('SELECIONADO', { allCourses: false })]) {
        await rejected(() => save(invalid), '22023');
      }
      const saved = await save(draft('VERSAO'));
      const updated = await save({ ...saved, active: false });
      assert.equal(updated.active, false);
      await rejected(() => save({ ...saved, perStudentLimit: 3 }), 'PT409');
      await rejected(() => save(draft('AUTORIZADO')), '23505');
      const collisionId=next();
      const collided=await Promise.allSettled([
        save({...draft('POLOUM'),id:collisionId},next(),ids.polo),
        save({...draft('POLODOIS'),id:collisionId},next(),ids.otherPolo),
      ]);
      assert.equal(collided.filter(row=>row.status==='fulfilled').length,1);
      assert.equal(collided.find(row=>row.status==='rejected').reason.code,'42501');
    });

    await t.test('cotação calcula preço canônico e respeita validade, cursos e polo', async () => {
      const selected = await save(draft('METADE', { discountPercent: 50, allCourses: false, courseIds: [ids.course] }));
      await save(draft('INATIVO', { active: false }));
      await save(draft('EXPIRADO', { startsAt: '2000-01-01T00:00:00Z', endsAt: '2001-01-01T00:00:00Z' }));
      await save(draft('FUTURO', { startsAt: '2098-01-01T00:00:00Z' }));
      await asStudent();
      const price = await quote(' metade ');
      assert.equal(price.couponId, selected.id); assert.equal(price.turmaId, ids.turma);
      assert.equal(price.originalAmount, 200); assert.equal(price.discountAmount, 100); assert.equal(price.payableAmount, 100);
      for (const code of ['INATIVO', 'EXPIRADO', 'FUTURO', 'INEXISTENTE']) await rejected(() => quote(code), '22023');
      await rejected(() => quote('METADE', ids.otherCourse), '22023');
      await db.query('update public.turmas set polo_id=$2 where id=$1', [ids.turma, ids.otherPolo]);
      assert.equal((await quote('METADE')).poloId,ids.otherPolo,'cupom da Matriz também atende filial da mesma instituição');
      await db.query('update public.turmas set polo_id=$2 where id=$1', [ids.turma, ids.polo]);
      await db.query('update public.cursos set publicar_site=false where id=$1', [ids.course]);
      await rejected(() => quote('METADE'), '22023');
      await db.query('update public.cursos set publicar_site=true where id=$1', [ids.course]);
      await db.query('update public.cursos set modalidade=null where id=$1',[ids.course]);
      await rejected(()=>quote('METADE'),'22023');
      await db.query("update public.cursos set modalidade='EAD' where id=$1",[ids.course]);
      await asManager();
      await db.query("update public.cursos set status='INATIVO' where id=$1",[ids.course]);
      assert.equal((await save({...selected,active:false})).active,false,'preserved inactive links do not prevent disabling a campaign');
      await db.query("update public.cursos set status='ATIVO' where id=$1",[ids.course]);
    });

    await t.test('gratuidade ativa sem dívida, pagamento ou receita e replay preserva o mesmo resgate', async () => {
      await asManager(); const coupon = await save(draft('GRATUITO', { totalLimit: 2, perStudentLimit: 2 }));
      await asStudent(); const request = next(); const result = await free('GRATUITO', ids.turma, request);
      assert.equal(result.payableAmount, 0); assert.equal(result.status, 'CONFIRMED');
      assert.deepEqual(await free('GRATUITO', ids.turma, request), result);
      await rejected(() => free('GRATUITO', ids.otherTurma, request), '22023');
      assert.equal(await scalar('select count(*)::int value from public.contas_receber'), 0);
      assert.equal(await scalar('select count(*)::int value from public.inscricoes_online'), 0);
      assert.equal(await scalar('select count(*)::int value from public.ead_checkout_attempts'), 0);
      assert.equal(await scalar('select status value from public.matriculas where id=$1', [result.matriculaId]), 'ATIVO');
      assert.equal(await scalar('select count(*)::int value from public.ead_aluno_progresso where aluno_id=$1', [ids.student]), 1);
      await asStudent(ids.secondStudent); await rejected(() => free('GRATUITO', ids.turma, request), '22023');
      await asStudent(); await free('GRATUITO', ids.otherTurma);
      await asStudent(ids.secondStudent); await rejected(() => free('GRATUITO'), 'PT409');
      const log = await history(coupon.id);
      assert.equal(log.total, 2); assert.ok(log.items.every(row => row.receivedAmount === 0));
      await rejected(() => save({ ...coupon, totalLimit: 1 }), 'PT409');
      await rejected(() => save({ ...coupon, perStudentLimit: 1 }), 'PT409');
      await rejected(() => save({ ...coupon, discountPercent: 50 }), 'PT409');
      await db.query('update public.ead_coupons set active=false where id=$1', [coupon.id]);
      await asStudent(); assert.deepEqual(await free('GRATUITO', ids.turma, request), result);
    });

    await t.test('limites individuais, ilimitado e duas tentativas na última vaga não duplicam uso', async () => {
      await asManager(); const coupon = await save(draft('ULTIMAVAGA', { totalLimit: 1 }));
      await asStudent(id(3));
      // PGlite has one connection: queue both interleavings of actual RPCs.
      // The database row FOR UPDATE additionally serializes true PG sessions.
      const outcomes = await Promise.allSettled([free('ULTIMAVAGA'), free('ULTIMAVAGA')]);
      assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
      assert.equal(await scalar('select count(*)::int value from public.ead_coupon_redemptions where coupon_id=$1', [coupon.id]), 1);
      await asManager(); await save(draft('INDIVIDUAL', { perStudentLimit: 1 }));
      await save(draft('ILIMITADO', { totalLimit: null, perStudentLimit: 2 }));
      await asStudent(id(4)); await free('INDIVIDUAL'); await rejected(() => free('INDIVIDUAL', ids.otherTurma), 'PT409');
      await asStudent(id(5)); await free('ILIMITADO'); await free('ILIMITADO', ids.otherTurma);
      await asStudent(id(6)); await free('ILIMITADO');
    });

    await t.test('50% reserva valor, mantém acesso pendente e reabre reserva após erro ambíguo', async () => {
      await asManager(); const coupon = await save(draft('DESCONTO', { discountPercent: 50, totalLimit: 1 }));
      const request = next(), attempt = await prepare('DESCONTO', id(7), ids.turma, request);
      assert.equal(attempt.action, 'CREATE'); assert.equal(Number(attempt.receivable.valor), 100);
      assert.equal(await scalar('select status value from public.matriculas where id=$1', [attempt.matriculaId]), 'PENDENTE');
      assert.equal(await scalar('select count(*)::int value from public.ead_aluno_progresso where aluno_id=$1', [id(7)]), 0);
      await asStudent(id(8)); await rejected(() => quote('DESCONTO'), 'PT409');
      await asStudent(id(7)); const resumed = await quote('DESCONTO');
      assert.equal(resumed.requestId, request); assert.equal(resumed.payableAmount, 100);
      const repeated = await prepare('DESCONTO', id(7), ids.turma, request, { p_due_date: '2090-02-07', p_description: 'Nome alterado' });
      assert.equal(repeated.receivableId, attempt.receivableId);
      assert.equal(await scalar('select count(*)::int value from public.contas_receber where cliente_id=$1', [id(7)]), 1);
      await rejected(() => prepare('DESCONTO', id(8), ids.turma, request), '22023');
      await rejected(() => prepare('DESCONTO', id(7), ids.otherTurma, request), '22023');
      await asStudent(id(7)); await rejected(() => call('ead_coupon_prepare_checkout', {
        p_code:'DESCONTO',p_aluno_id:id(7),p_turma_id:ids.turma,p_request_id:request,
        p_provider:'banese_card',p_environment:'sandbox',p_payment_method:'BOLETO',
        p_due_date:'2090-01-07',p_description:'Curso fictício - inscrição',
      }), '42501');
      await rejected(() => free('DESCONTO'), 'PT409');
      assert.equal((await history(coupon.id)).items[0].receivedAmount, 0);
      await rejected(() => db.query("update public.inscricoes_online set status='PAGO' where id=$1", [attempt.inscricaoId]), 'PT409');
      await db.query(`update public.contas_receber set status='PAGO',valor_pago=10,data_pagamento=current_date,
        gateway_status='PAID',origem_pagamento='BANESE' where id=$1`, [attempt.receivableId]);
      await rejected(() => db.query("update public.inscricoes_online set status='PAGO' where id=$1", [attempt.inscricaoId]), 'PT409');
      assert.equal(await scalar('select status value from public.matriculas where id=$1', [attempt.matriculaId]), 'PENDENTE');
      await db.query('update public.contas_receber set valor_pago=100 where id=$1', [attempt.receivableId]);
      await rejected(() => db.query("update public.inscricoes_online set status='PAGO' where id=$1", [attempt.inscricaoId]), 'PT409');
      await h.recordSyntheticBankProof(attempt.receivableId);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=clock_timestamp() where id=$1", [attempt.inscricaoId]);
      assert.equal(await scalar('select status value from public.matriculas where id=$1', [attempt.matriculaId]), 'ATIVO');
      const log = await history(coupon.id);
      assert.equal(log.items[0].status, 'CONFIRMED'); assert.equal(log.items[0].receivedAmount, 100);
      assert.equal(log.items[0].discountAmount, 100);
      await db.query(`insert into public.financial_payment_events(id,source_kind,source_id,payment_cents,reversed_at)
        values($1,'RECEIVABLE',$2,10000,now())`, [next(), attempt.receivableId]);
      assert.equal((await history(coupon.id)).items[0].receivedAmount, 0, 'reversed ledger never falls back to stale received value');
    });

    await t.test('compras existentes não recebem cupom e checkout sem cupom preserva o preço integral', async () => {
      await asService(); const request = next();
      const normal = await scalar(`select public.ead_prepare_checkout_attempt($1,$2,$3,'banese_card','sandbox','BOLETO',
        200,'2090-01-07','Curso sem cupom',null,null,false) value`, [id(9), ids.turma, request]);
      assert.equal(Number(normal.receivable.valor), 200);
      await asStudent(id(9)); await rejected(() => free('ILIMITADO'), 'PT409');
      await asManager(); await save(draft('NOVODESCONTO', { discountPercent: 50 }));
      await rejected(() => prepare('NOVODESCONTO', id(9)), 'PT409');
      await rejected(() => prepare('NOVODESCONTO', id(10), ids.turma, next(), { p_environment: 'production' }), '42501');
    });

    await t.test('reserva só volta à quantidade disponível após cancelamento bancário comprovado', async () => {
      await asManager(); const coupon = await save(draft('RESERVACANCELADA', { discountPercent: 50, totalLimit: 1 }));
      const attempt = await prepare('RESERVACANCELADA', id(10));
      await db.query("update public.ead_checkout_attempts set state='EXPIRED' where id=$1", [attempt.attemptId]);
      assert.equal(await scalar('select status value from public.ead_coupon_redemptions where coupon_id=$1', [coupon.id]), 'RESERVED');
      await asStudent(id(11)); await rejected(() => quote('RESERVACANCELADA'), 'PT409');
      const transaction = next();
      await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,
        provider_code,environment,remote_payment_id,remote_status,amount)
        values($1,$2,$3,'banese_card','sandbox','FICTICIO-CANCELADO','CANCELED',100)`,
        [transaction,attempt.receivableId,attempt.inscricaoId]);
      await db.query(`insert into public.banese_ead_checkout_expiration_jobs(receivable_id,matricula_id,
        inscription_id,transaction_id,environment,state,snapshot,expected_receivable_updated_at,
        expected_transaction_updated_at,expected_inscription_updated_at,first_expiration_day,canceled_at,remote_status)
        values($1,$2,$3,$4,'sandbox','DONE','{}',now(),now(),now(),current_date,now(),'CANCELED')`,
        [attempt.receivableId,attempt.matriculaId,attempt.inscricaoId,transaction]);
      await db.query("update public.ead_checkout_attempts set state='OPEN' where id=$1", [attempt.attemptId]);
      await db.query("update public.ead_checkout_attempts set state='EXPIRED' where id=$1", [attempt.attemptId]);
      assert.equal(await scalar('select status value from public.ead_coupon_redemptions where coupon_id=$1', [coupon.id]), 'RELEASED');
      assert.equal((await quote('RESERVACANCELADA')).payableAmount, 100);
      assert.equal((await history(coupon.id)).items[0].receivedAmount, 0);
    });

    await t.test('liquidação manual canônica própria continua válida, sem fabricar pagamento Banese', async () => {
      const attempt = await prepare('NOVODESCONTO', id(11));
      const transactionId = await h.recordSyntheticBankProof(attempt.receivableId);
      await db.query('insert into internal_academic.ead_trust_access_audit values($1)', [attempt.matriculaId]);
      await db.query("update public.payment_gateway_transactions set remote_status='CANCELED' where id=$1", [transactionId]);
      await db.query("update public.contas_receber set gateway_status='CANCELED',origem_pagamento='MANUAL' where id=$1", [attempt.receivableId]);
      await rejected(() => db.query("update public.inscricoes_online set status='PAGO' where id=$1", [attempt.inscricaoId]), 'PT409');
      await db.query(`insert into public.financial_payment_events(id,source_kind,source_id,payment_cents,
        original_cents,polo_id,principal_cents,discount_cents) values($1,'RECEIVABLE',$2,10000,10000,$3,10000,0)`,
        [next(),attempt.receivableId,ids.polo]);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1", [attempt.inscricaoId]);
      assert.equal(await scalar('select status value from public.matriculas where id=$1', [attempt.matriculaId]), 'ATIVO');
      assert.equal(await scalar('select status value from public.ead_coupon_redemptions where attempt_id=$1', [attempt.attemptId]), 'CONFIRMED');
    });

    await t.test('RLS e grants bloqueiam leitura entre alunos, escrita direta e acesso anônimo', async () => {
      await db.exec('grant usage on schema auth,test_caixa to authenticated; grant select on test_caixa.access_state to authenticated');
      await asStudent(id(7)); await db.exec('set role authenticated');
      assert.equal(await scalar('select count(*)::int value from public.ead_coupon_redemptions'), 1);
      assert.equal(await scalar('select count(*)::int value from public.ead_coupons'), 0);
      await rejected(() => db.exec("insert into public.ead_coupons(code) values('FORJADO')"), '42501');
      await rejected(() => db.exec("update public.ead_coupon_redemptions set status='RELEASED'"), '42501');
      await rejected(() => db.exec("delete from public.ead_coupon_redemptions"), '42501'); await db.exec('reset role');
      await asManager(); await db.exec('set role authenticated');
      assert.ok(await scalar('select count(*)::int value from public.ead_coupons') > 0); await db.exec('reset role');
      assert.equal(await scalar("select has_function_privilege('anon','public.ead_coupon_redeem_free(text,uuid,uuid)','EXECUTE') value"), false);
      assert.equal(await scalar("select has_function_privilege('authenticated','public.ead_coupon_prepare_checkout(text,uuid,uuid,uuid,text,text,text,date,text)','EXECUTE') value"), false);
      await db.exec("update test_caixa.access_state set role_name='anon',actor=null,aluno=null");
      await rejected(() => quote('ILIMITADO'), '42501'); await rejected(() => save(draft('ANONIMO')), '42501');
    });
  } finally { await db.close(); }
});
