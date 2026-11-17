import assert from 'node:assert/strict';
import test from 'node:test';
import { createCuponsFixture, makeCoupon, makeCouponHistoryItem } from './cupons-ead.ui.fixture.mjs';

test('acesso negado, polo ausente e gate desligado não consultam nem assinam Supabase', async () => {
  const fixture = createCuponsFixture();
  const { window, document } = fixture;
  try {
    await window.mount({ canManage: false });
    assert.match(document.querySelector('[role=alert]').textContent, /Secretaria e ao Financeiro/);
    await window.mount({ poloId: null });
    assert.match(document.body.textContent, /Selecione um polo/);
    window.localEnabled = false;
    await window.mount();
    assert.match(document.body.textContent, /indisponíveis nesta conexão/);
    assert.equal(window.requests.length, 0);
    assert.equal(window.channelNames.length, 0);
  } finally { await fixture.close(); }
});

test('capacidade desativada não monta gestão e modo incorporado preserva ação sem repetir título', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button } = fixture;
  try {
    window.couponsAvailable = false;
    await window.mount(); await fixture.flush();
    assert.match(document.body.textContent, /indisponíveis no momento/);
    assert.equal(window.requests.length, 1);
    assert.equal(window.requests[0].name, 'ead_coupons_available');
    assert.equal(window.channelNames.length, 0);
    window.couponsAvailable = true;
    await window.mount({ contextId: 'outro-gestor', showHeading: false }); await fixture.flush(); await fixture.flush();
    assert.equal(document.querySelector('.cupons-ead-header'), null);
    assert.ok(button('Novo cupom'));
    assert.match(document.body.textContent, /FICTICIO50/);
  } finally { await fixture.close(); }
});

test('lista, filtro e troca de polo mantêm consultas isoladas e limpam canal anterior', async () => {
  const fixture = createCuponsFixture();
  const { window, document, setValue } = fixture;
  try {
    window.coupons['polo-a'][0].discountPercent = 12.5;
    await window.mount(); await fixture.flush();
    assert.match(document.body.textContent, /FICTICIO50/);
    assert.match(document.body.textContent, /12,5% de desconto/);
    await setValue(document.querySelector('input[type=search]'), 'inexistente');
    await fixture.flush(300); await fixture.flush();
    assert.match(document.body.textContent, /Nenhum cupom encontrado/);
    assert.equal(window.requests.at(-1).args.p_search, 'inexistente');
    await window.mount({ poloId: 'polo-b' }); await fixture.flush();
    assert.match(document.body.textContent, /OUTROPOLO/);
    assert.doesNotMatch(document.body.textContent, /FICTICIO50/);
    assert.equal(document.querySelector('input[type=search]').value, '');
    assert.equal(window.requests.at(-1).args.p_polo_id, 'polo-b');
    assert.equal(window.removedChannels.length, 1);
    assert.ok(window.channelHandlers.every(item => item.spec.filter === 'polo_id=eq.polo-b'));
  } finally { await fixture.close(); }
});

test('cadastro real usa formulário e serviço, IDs de idempotência e invalidação automática', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button, click, setValue } = fixture;
  try {
    await window.mount(); await fixture.flush();
    await click(button('Novo cupom')); await fixture.flush();
    assert.equal(document.querySelectorAll('select,datalist').length, 0);
    assert.ok(document.querySelector('[role=dialog]'));
    assert.equal(document.getElementById('cupom-benefit').value, '');
    await setValue(document.getElementById('cupom-code'), 'novo25');
    await setValue(document.getElementById('cupom-benefit'), '101');
    await click(button('Salvar cupom')); await fixture.flush();
    assert.match(document.querySelector('[role=alert]').textContent, /percentual/);
    assert.equal(window.requests.filter(item => item.name === 'ead_coupons_save').length, 0);
    await setValue(document.getElementById('cupom-benefit'), '25');
    await setValue(document.getElementById('cupom-student-limit'), '3');
    await click(button('Salvar cupom')); await fixture.flush();
    const saved = window.requests.find(item => item.name === 'ead_coupons_save');
    assert.equal(saved.args.p_coupon.code, 'NOVO25');
    assert.equal(saved.args.p_coupon.perStudentLimit, 3);
    assert.equal(saved.args.p_coupon.discountPercent, 25);
    assert.equal(saved.args.p_coupon.totalLimit, 100);
    assert.equal(saved.args.p_coupon.allCourses, true);
    assert.match(saved.args.p_request_id, /^[\da-f-]{36}$/);
    assert.equal('payableAmount' in saved.args.p_coupon, false);
    assert.equal(document.querySelector('[role=dialog]'), null);
    assert.match(document.body.textContent, /NOVO25/);
    assert.match(document.body.textContent, /25% de desconto/);
    assert.ok(window.requests.filter(item => item.name === 'ead_coupons_list').length >= 2);
  } finally { await fixture.close(); }
});

test('percentual manual de 100 libera gratuidade com quantidade e cursos configurados em combobox próprio', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button, click, setValue } = fixture;
  const choose = async (label, value) => {
    const input = document.querySelector(`input[aria-label="${label}"]`);
    await click(input);
    const option = Array.from(document.querySelectorAll('[role=option]')).find(item => item.textContent.includes(value));
    assert.ok(option, value);
    await click(option);
  };
  try {
    await window.mount(); await fixture.flush();
    await click(button('Novo cupom')); await fixture.flush();
    await setValue(document.getElementById('cupom-code'), 'GRATIS');
    await setValue(document.getElementById('cupom-benefit'), '100');
    await choose('Tipo de quantidade total', 'Ilimitada');
    await choose('Abrangência de cursos', 'Selecionar cursos');
    assert.equal(document.querySelector('input[aria-label="Total de utilizações"]'), null);
    await click(button('Salvar cupom'));
    assert.match(document.querySelector('[role=alert]').textContent, /Selecione ao menos um curso/);
    const picker = document.querySelector('input[aria-label="Adicionar curso participante"]');
    await click(picker);
    await setValue(picker, 'Administração');
    await fixture.flush(300); await fixture.flush();
    await window.interact(() => {
      picker.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await window.interact(() => picker.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.match(document.querySelector('[aria-label="Cursos selecionados"]').textContent, /Administração fictícia/);
    await click(button('Salvar cupom')); await fixture.flush();
    const saved = window.requests.find(item => item.name === 'ead_coupons_save');
    assert.equal(saved.args.p_coupon.discountPercent, 100);
    assert.equal(saved.args.p_coupon.totalLimit, null);
    assert.equal(saved.args.p_coupon.allCourses, false);
    assert.deepEqual(saved.args.p_coupon.courseIds, ['course-a']);
  } finally { await fixture.close(); }
});

test('falha de edição mantém rascunho e request, e conflito orienta reabrir a versão atual', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button, click } = fixture;
  try {
    await window.mount(); await fixture.flush();
    await click(button('Editar')); await fixture.flush();
    assert.equal(document.getElementById('cupom-code').readOnly, true);
    assert.equal(document.getElementById('cupom-benefit').readOnly, true);
    window.saveErrors.push({ code: 'NETWORK', message: 'Falha simulada de conexão.' });
    await click(button('Salvar cupom')); await fixture.flush();
    assert.match(document.querySelector('[role=alert]').textContent, /Falha simulada/);
    window.saveErrors.push({ code: 'PT409', message: 'Versão antiga.' });
    await click(button('Salvar cupom')); await fixture.flush();
    const saves = window.requests.filter(item => item.name === 'ead_coupons_save');
    assert.equal(saves.length, 2);
    assert.equal(saves[0].args.p_request_id, saves[1].args.p_request_id);
    assert.equal(saves[0].args.p_coupon.updatedAt, '2026-11-01T03:00:00.000Z');
    assert.match(document.querySelector('[role=alert]').textContent, /Feche e reabra/);
    assert.equal(document.getElementById('cupom-code').value, 'FICTICIO50');
    window.saveErrors.push({ code: '23505', message: 'duplicate key value violates unique constraint ead_coupons_code_key' });
    await click(button('Salvar cupom')); await fixture.flush();
    assert.equal(document.querySelector('[role=alert]').textContent, 'Este código de cupom já está em uso. Escolha outro código.');
    window.saveErrors.push({ code: '22023', message: 'O fim da validade deve ser posterior ao início.' });
    await click(button('Salvar cupom')); await fixture.flush();
    assert.equal(document.querySelector('[role=alert]').textContent, 'O fim da validade deve ser posterior ao início.');
  } finally { await fixture.close(); }
});

test('gravação pendente bloqueia campos, fechamento e segundo envio até o retorno canônico', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button, click, setValue } = fixture;
  let finish;
  try {
    await window.mount(); await fixture.flush();
    await click(button('Novo cupom')); await fixture.flush();
    await setValue(document.getElementById('cupom-code'), 'PENDENTE');
    await setValue(document.getElementById('cupom-benefit'), '37,5');
    window.saveDelay = new Promise(resolve => { finish = resolve; });
    await click(button('Salvar cupom'));
    assert.equal(document.querySelector('fieldset').disabled, true);
    assert.equal(document.querySelector('[aria-label="Fechar formulário"]').disabled, true);
    assert.match(document.querySelector('button[type=submit]').textContent, /Salvando/);
    await window.interact(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await click(button('Salvando'));
    assert.ok(document.querySelector('[role=dialog]'));
    assert.equal(window.requests.filter(item => item.name === 'ead_coupons_save').length, 1);
    assert.equal(window.requests.find(item => item.name === 'ead_coupons_save').args.p_coupon.discountPercent, 37.5);
    await window.interact(() => finish()); await fixture.flush();
    assert.equal(document.querySelector('[role=dialog]'), null);
    assert.match(document.body.textContent, /PENDENTE/);
  } finally { finish?.(); await fixture.close(); }
});

test('histórico apresenta recebido canônico separado do benefício e da cobrança', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button, click } = fixture;
  try {
    window.histories['coupon-a'] = [{ id: 'redemption-a', studentId: 'student-fake', studentName: 'Aluno Fictício',
      courseId: 'course-fake', courseName: 'Curso Fictício', status: 'CONFIRMED', originalAmount: 99.90,
      discountAmount: 49.95, payableAmount: 49.95, receivedAmount: 49.95, receivableId: 'receivable-fake', matriculaId: 'enrollment-fake',
      createdAt: '2026-11-16T12:00:00.000Z', confirmedAt: '2026-11-16T12:05:00.000Z',
      releasedAt: '2026-11-16T12:03:00.000Z', reviewRequired: true }];
    await window.mount(); await fixture.flush();
    await click(button('Histórico')); await fixture.flush();
    const dialog = document.querySelector('[role=dialog]');
    assert.match(dialog.textContent, /Aluno Fictício/);
    assert.match(dialog.textContent, /Recebido/);
    assert.match(dialog.textContent, /Em revisão/);
    assert.match(dialog.textContent, /Confirmada/);
    assert.match(dialog.textContent, /Reserva liberada em/);
    assert.equal(dialog.querySelectorAll('dd').length, 7);
    assert.match(dialog.textContent, /Gratuidade não representa entrada financeira/);
  } finally { await fixture.close(); }
});

test('gestão da Matriz mostra uso da campanha em curso e aluno de outro polo', async () => {
  const fixture = createCuponsFixture();
  const { window, document, button, click } = fixture;
  try {
    const coupon = makeCoupon({ id: 'coupon-matriz', poloId: 'polo-matriz', code: 'MATRIZ375', discountPercent: 37.5 });
    window.coupons['polo-matriz'] = [coupon];
    window.histories[coupon.id] = [makeCouponHistoryItem({ id: 'redemption-filial', studentId: 'student-filial',
      studentName: 'Aluno fictício da filial', courseId: 'course-filial', courseName: 'Curso EAD da filial',
      status: 'RESERVED', receivedAmount: 0, confirmedAt: null })];
    await window.mount({ poloId: 'polo-matriz' }); await fixture.flush();
    await click(button('Histórico')); await fixture.flush();
    const request = window.requests.find(item => item.name === 'ead_coupons_history');
    assert.equal(request.args.p_polo_id, 'polo-matriz');
    assert.equal(request.args.p_coupon_id, coupon.id);
    const dialog = document.querySelector('[role=dialog]');
    assert.match(dialog.textContent, /Aluno fictício da filial/);
    assert.match(dialog.textContent, /Curso EAD da filial/);
    assert.match(dialog.textContent, /62,44/);
    assert.match(dialog.textContent, /Reservada/);
    assert.equal(dialog.querySelectorAll('article').length, 1);
    assert.ok(window.channelHandlers.every(item => item.spec.filter === 'polo_id=eq.polo-matriz'));
    const handler = window.channelHandlers.find(item => item.spec.table === 'ead_coupon_events');
    assert.deepEqual(JSON.parse(JSON.stringify(handler.spec)), { event: '*', schema: 'public', table: 'ead_coupon_events', filter: 'polo_id=eq.polo-matriz' });
    const listCount = window.requests.filter(item => item.name === 'ead_coupons_list').length;
    const historyCount = window.requests.filter(item => item.name === 'ead_coupons_history').length;
    window.histories[coupon.id][0] = makeCouponHistoryItem({ ...window.histories[coupon.id][0], status: 'CONFIRMED',
      receivedAmount: 62.44, confirmedAt: '2026-11-16T12:05:00.000Z' });
    window.coupons['polo-matriz'][0] = { ...coupon, reservedCount: 0, confirmedCount: 1 };
    await window.interact(() => handler.callback({ new: { polo_id: 'polo-matriz', coupon_id: coupon.id } }));
    await fixture.flush(240); await fixture.flush();
    assert.equal(window.requests.filter(item => item.name === 'ead_coupons_list').length, listCount + 1);
    assert.equal(window.requests.filter(item => item.name === 'ead_coupons_history').length, historyCount + 1);
    assert.match(document.querySelector('[role=dialog]').textContent, /Confirmada/);
    assert.match(document.querySelector('.cupons-list').textContent, /0 reservadas · 1 confirmadas/);
  } finally { await fixture.close(); }
});

test('paginação consulta página correta e Realtime/reconexão refazem somente polo ativo', async () => {
  const fixture = createCuponsFixture();
  const { window, document, click } = fixture;
  try {
    window.coupons['polo-a'] = Array.from({ length: 21 }, (_, index) => makeCoupon({ id: 'coupon-' + index, code: 'CUPOM' + index }));
    await window.mount(); await fixture.flush();
    await click(document.querySelector('[aria-label="Próxima página"]')); await fixture.flush();
    assert.equal(window.requests.at(-1).args.p_page, 2);
    assert.match(document.body.textContent, /CUPOM20/);
    const before = window.requests.length;
    await window.interact(() => window.channelHandlers.find(item => item.spec.table === 'ead_coupon_events').callback({ new: {} }));
    await fixture.flush(240); await fixture.flush();
    assert.equal(window.requests.length, before + 1);
    assert.equal(window.requests.at(-1).args.p_polo_id, 'polo-a');
    await window.interact(() => window.subscriptions[0]('SUBSCRIBED'));
    await fixture.flush(240); await fixture.flush();
    assert.equal(window.requests.length, before + 2);
  } finally { await fixture.close(); }
});
