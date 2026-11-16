import { randomUUID } from 'node:crypto';
import { createCouponHarness } from '../../supabase/tests/fixtures/ead-coupons.harness.mjs';

const allowedRpc = new Set(['ead_coupons_available', 'ead_coupons_list', 'ead_coupons_save', 'ead_coupons_history',
  'ead_coupons_courses', 'ead_coupon_quote', 'ead_coupon_redeem_free']);

export async function createPreviewDatabase() {
  const h = await createCouponHarness();
  const { db, ids, rpc } = h;
  let queue = Promise.resolve();
  const serial = operation => {
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  };
  const studentId = identity => {
    if (!/^student-[1-4]$/.test(identity)) throw new Error('Identidade fictícia inválida.');
    return h.id(Number(identity.split('-')[1]));
  };
  const identify = async identity => identity === 'manager' ? h.asManager() : h.asStudent(studentId(identity));
  const courses = async () => (await db.query(`select c.id,c.nome,c.valor::float8 valor,t.id as "turmaId"
    from public.cursos c join public.turmas t on t.curso_id=c.id
    where t.polo_id=$1 and c.modalidade='EAD' order by c.nome`, [ids.polo])).rows;
  await h.asManager();
  for (const [code, discountPercent] of [['LOCALGRATIS', 100], ['LOCAL50', 50]]) {
    const result = await rpc('ead_coupons_save', { p_polo_id: ids.polo, p_request_id: randomUUID(), p_coupon: {
      code, discountPercent, totalLimit: 20, perStudentLimit: 2, active: true, allCourses: true, courseIds: [],
      startsAt: new Date(Date.now() - 86_400_000).toISOString(), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    } });
    if (result.error) { await db.close(); throw new Error(result.error.message); }
  }
  const state = identity => serial(async () => {
    await identify(identity);
    const alunoId = identity === 'manager' ? null : studentId(identity);
    const enrollments = alunoId ? (await db.query(`select m.id,m.status,t.curso_id as "courseId"
      from public.matriculas m join public.turmas t on t.id=m.turma_id where m.aluno_id=$1`, [alunoId])).rows : [];
    const payments = alunoId ? (await db.query(`select r.id,r.status,r.valor::float8 amount,r.valor_pago::float8 as "receivedAmount",
      c.nome as "courseName",red.status as "redemptionStatus" from public.contas_receber r
      join public.ead_coupon_redemptions red on red.receivable_id=r.id
      join public.cursos c on c.id=red.curso_id where red.aluno_id=$1 order by r.created_at desc`, [alunoId])).rows : [];
    return { poloId: ids.polo, alunoId, identity, courses: await courses(), enrollments, payments };
  });
  const call = (identity, name, args) => serial(async () => {
    await identify(identity);
    if (!allowedRpc.has(name)) throw new Error('RPC fora da lista permitida nesta prévia.');
    return rpc(name, args);
  });
  const checkout = (identity, body, origin) => serial(async () => {
    const alunoId = studentId(identity);
    if (body.alunoId !== alunoId || !body.couponCode || body.method !== 'BOLETO') {
      throw new Error('Esta prévia aceita somente compra fictícia do aluno selecionado com cupom.');
    }
    const course = (await courses()).find(item => item.id === body.courseId && item.turmaId === body.turmaId);
    if (!course) throw new Error('Curso fictício não encontrado.');
    await h.asService();
    const result = await rpc('ead_coupon_prepare_checkout', {
      p_code: body.couponCode, p_aluno_id: alunoId, p_turma_id: course.turmaId, p_request_id: body.requestId,
      p_provider: 'banese_card', p_environment: 'sandbox', p_payment_method: 'BOLETO',
      p_due_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      p_description: 'Cobrança fictícia local — não pagável',
    });
    await h.asStudent(alunoId);
    if (result.error) return result;
    return { error: null, data: { url: `${origin}/cobranca-ficticia`, awaitingConfirmation: true,
      matriculaId: result.data.matriculaId, receivableId: result.data.receivableId } };
  });
  const simulatePayment = (identity, receivableId) => serial(async () => {
    const alunoId = studentId(identity);
    const receipt = (await db.query(`select r.id,red.status from public.contas_receber r
      join public.ead_coupon_redemptions red on red.receivable_id=r.id
      where r.id=$1 and red.aluno_id=$2`, [receivableId, alunoId])).rows[0];
    if (!receipt) throw new Error('Cobrança fictícia fora do aluno selecionado.');
    if (receipt.status === 'CONFIRMED') return { confirmed: true };
    await h.asService();
    try {
      await db.exec('begin');
      await h.recordSyntheticBankProof(receivableId);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=clock_timestamp() where receivable_id=$1", [receivableId]);
      await db.exec('commit');
    } catch (error) { await db.exec('rollback'); throw error; }
    finally { await h.asStudent(alunoId); }
    return { confirmed: true };
  });
  return { ids, state, call, checkout, simulatePayment, close: () => db.close() };
}
