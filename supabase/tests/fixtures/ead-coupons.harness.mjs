// In-memory PostgreSQL/WASM only. Never opens a network connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = name => source(`../../migrations/${name}`);
export const couponId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const extractFunction = (sql, name) => {
  const start = sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = sql.slice(start), tag = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0, tail.indexOf(`${tag};`) + tag.length + 1);
};

export const createCouponHarness = async (providedDb) => {
  const packageUrl = process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
  const db = providedDb || new (await import(packageUrl)).PGlite();
  // Synthetic payment dates follow the product's business timezone even when
  // UTC has already crossed midnight and America/Maceio has not.
  await db.exec("set timezone='America/Maceio'");
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const ids = {
    polo: '00000000-0000-0000-0000-000000000001',
    otherPolo: '00000000-0000-0000-0000-000000000002',
    course: '00000000-0000-0000-0000-000000000012',
    turma: '00000000-0000-0000-0000-000000000022',
    otherCourse: couponId(12), otherTurma: couponId(22),
    manager: couponId(900), otherManager: couponId(901),
    student: couponId(1), studentAuth: couponId(1001),
    secondStudent: couponId(2), secondStudentAuth: couponId(1002),
  };
  try {
    for (const name of ['caixa_monthly_optimization.fixture.sql', 'optional_ead_checkout.fixture.sql',
      'ead_checkout_expiration.fixture.sql', 'ead_checkout_attempts.fixture.sql']) {
      await db.exec(source(`../${name}`).replace('CREATE EXTENSION pgcrypto WITH SCHEMA extensions;', ''));
    }
    for (const name of ['20261005015448_ead_checkout_expiration_schema.sql',
      '20261005015533_ead_checkout_attempt_model.sql', '20261005015535_ead_checkout_attempt_reservation.sql',
      '20261005020046_ead_attempt_release_legacy_singletons.sql',
      '20261105230100_allow_manager_ead_private_course_checkout.sql']) await db.exec(migration(name));
    await db.exec(source('../ead_no_charge_enrollment.fixture.sql'));
    // Expiration writes are unavailable in this checkout-only fixture, matching
    // the existing manager checkout harness. No cancellation is fabricated.
    await db.exec(`create function internal_contas.ead_expiration_write_allowed(uuid)
      returns boolean language sql as $$select false$$`);
    await db.exec(`alter table public.polos add column company_id uuid,
        add column is_matriz boolean not null default false,
        add column status text not null default 'ATIVO';
      update public.polos set company_id='${couponId(99000)}';
      update public.polos set is_matriz=true where id='${ids.polo}';
      alter table public.parceiros add column auth_user_id uuid,add column polo_id uuid,add column polo_ids uuid[];
      alter table public.turmas add column data_inicio_inscricao date,add column data_fim_inscricao date,
        add column bloquear_matriculas_apos_completar_vagas boolean default true;
      create table internal_academic.ead_trust_access_audit(matricula_id uuid primary key);
      alter table public.financial_payment_events add column original_cents bigint,add column polo_id uuid,
        add column principal_cents bigint,add column discount_cents bigint;
      alter table public.receivable_manual_settlements add column receivable_id uuid,add column polo_id uuid,
        add column state text,add column completed_at timestamptz,add column reversed_at timestamptz,
        add column received_cents bigint,add column requires_remote_cancellation boolean,
        add column remote_canceled_at timestamptz;
      create table public.payment_gateway_runtime_config(id boolean primary key,enabled boolean,active_environment text);
      create table public.payment_gateway_credentials(id uuid primary key,provider_code text,environment text,
        configured boolean,client_id_configured boolean,client_secret_configured boolean);
      create table public.payment_gateway_routes(id uuid primary key,modalidade text,payment_method text,
        environment text,provider_code text,credential_id uuid,enabled boolean);
      insert into public.payment_gateway_runtime_config values(true,true,'sandbox');`);
    for (const [environment, number] of [['sandbox',980],['production',981]]) {
      await db.query(`insert into public.payment_gateway_credentials values($1,'banese_card',$2,true,true,true)`,[couponId(number),environment]);
      await db.query(`insert into public.payment_gateway_routes values($1,'EAD','BOLETO',$2,'banese_card',$3,true)`,
        [couponId(number+10),environment,couponId(number)]);
    }
    for (const column of ['qtd_parcelas_individual','valor_parcela_individual','dia_vencimento_individual',
      'cobrar_matricula_individual','cobrar_rematricula_individual','desconto_pontualidade_individual',
      'juros_atraso_individual','multa_atraso_individual','multa_atraso_percentual_individual',
      'aplicar_desconto_matricula_individual','aplicar_multa_juros_matricula_individual',
      'aplicar_desconto_mensalidade_individual','aplicar_multa_juros_mensalidade_individual',
      'aplicar_desconto_rematricula_individual','aplicar_multa_juros_rematricula_individual',
      'instrucao_boleto_carne_individual']) {
      await db.exec(`alter table public.matriculas add column ${column} text`);
    }
    const financialGuard = migration('20260809060000_create_deferred_technical_financial_activation.sql');
    await db.exec(extractFunction(financialGuard, 'internal_academic.ensure_technical_financial_pending')
      .replace('internal_academic.ensure_technical_financial_pending(',
        'internal_academic.ensure_technical_financial_pending_before_proesc_bootstrap('));
    await db.exec(extractFunction(migration('20260913191200_proesc_imported_cycle_configuration.sql'),
      'internal_academic.ensure_technical_financial_pending'));
    await db.exec(extractFunction(financialGuard, 'public.criar_financeiro_ao_matricular'));
    await db.exec(extractFunction(migration('20260812005933_create_nontechnical_single_plan_financial.sql'),
      'internal_academic.guard_nontechnical_single_plan_enrollment'));
    await db.exec(`create trigger test_actual_finance after insert or update of status on public.matriculas
      for each row when(new.status='ATIVO') execute function public.criar_financeiro_ao_matricular();
      create trigger test_actual_plan before insert or update or delete on public.matriculas
      for each row execute function internal_academic.guard_nontechnical_single_plan_enrollment();`);
    const paidContract = migration('20261112225925_ead_trust_manual_payment_projection.sql');
    for (const name of ['internal_academic.ead_has_own_trust_manual_payment',
      'internal_academic.ead_has_confirmed_payment','public.ead_activate_matricula_on_paid_inscricao']) {
      await db.exec(extractFunction(paidContract,name));
    }
    await db.exec(`create trigger test_actual_paid_projection after insert or update of status on public.inscricoes_online
      for each row execute function public.ead_activate_matricula_on_paid_inscricao();`);
    for (const name of ['20261116095340_ead_coupons_schema.sql', '20261116095344_ead_coupons_management.sql',
      '20261116095348_ead_coupons_quote.sql', '20261116095351_ead_coupons_free_redemption.sql',
      '20261116095355_ead_coupons_paid_checkout.sql','20261116095358_ead_coupons_production_capability.sql',
      '20261116095401_ead_coupons_authorized_checkout.sql','20261116095405_ead_coupons_payment_recovery.sql',
      '20261116180208_ead_coupon_resume_guards.sql','20261116180213_ead_coupon_resume_late_payment.sql',
      '20261116180219_ead_coupon_resume_quote.sql','20261116180226_ead_coupon_resume_free.sql',
      '20261117001402_ead_coupons_matrix_decimal_schema.sql','20261117001405_ead_coupons_matrix_decimal_management.sql',
      '20261117001407_ead_coupons_decimal_checkout.sql']) await db.exec(migration(name));
    // A production install remains disabled. Only this synthetic fixture enables it.
    await db.exec('update internal_contas.ead_coupon_runtime set enabled=true');
    for (const manager of [ids.manager, ids.otherManager]) {
      await db.query('insert into auth.users values($1)', [manager]);
      await db.query(`insert into public.usuarios_sistema(id,auth_user_id,perfil,status,personalizar_permissoes,permissoes)
        values($1,$1,'gestor','ATIVO',true,$2)`, [manager, JSON.stringify({ modules: ['secretaria', 'financeiro', 'gestao'] })]);
    }
    await db.query('update public.cursos set valor=200,nome=$2 where id=$1', [ids.course, 'Curso EAD fictício A']);
    await db.query(`insert into public.cursos(id,nome,modalidade,status,publicar_site,valor)
      values($1,'Curso EAD fictício B','EAD','ATIVO',true,99.9)`, [ids.otherCourse]);
    await db.query(`insert into public.turmas(id,curso_id,polo_id,status,vagas_totais)
      values($1,$2,$3,'EM_ANDAMENTO',100)`, [ids.otherTurma, ids.otherCourse, ids.polo]);
    for (let n = 1; n <= 16; n++) {
      await db.query('insert into auth.users values($1)', [couponId(1000 + n)]);
      await db.query(`insert into public.parceiros(id,nome,cpf_cnpj,auth_user_id)
        values($1,$2,'00000000000',$3)`, [couponId(n), `Aluno fictício ${n}`, couponId(1000 + n)]);
    }
    const asManager = async (actor = ids.manager) => db.query(
      `update test_caixa.access_state set actor=$1,aluno=null,role_name='authenticated',global_allowed=true,scoped_allowed=true`, [actor]);
    const asStudent = async (student = ids.student) => {
      const user = await scalar('select auth_user_id value from public.parceiros where id=$1', [student]);
      await db.query(`update test_caixa.access_state set actor=$1,aluno=$2,role_name='authenticated'`, [user, student]);
    };
    const asService = async () => db.exec("update test_caixa.access_state set role_name='service_role'");
    const recordSyntheticBankProof = async (receivableId, receivedAmount) => {
      const receipt = (await db.query('select * from public.contas_receber where id=$1',[receivableId])).rows[0];
      const attempt = (await db.query('select * from public.ead_checkout_attempts where id=$1',[receipt.ead_checkout_attempt_id])).rows[0];
      const existing = (await db.query('select * from public.payment_gateway_transactions where receivable_id=$1',[receipt.id])).rows[0];
      const transactionId = existing?.id || await scalar('select gen_random_uuid() value');
      const remote = existing?.remote_payment_id || `FICTICIO-NAO-PAGAVEL-${transactionId}`;
      await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,
        provider_code,environment,remote_payment_id,remote_status,payment_method,bank_slip_our_number,amount)
        values($1,$2,$3,'banese_card',$6,$4,'PAID','BOLETO',$4,$5)
        on conflict(id) do update set remote_status='PAID',payment_method='BOLETO',bank_slip_our_number=excluded.bank_slip_our_number,
          amount=excluded.amount`,
        [transactionId,receipt.id,attempt.inscription_id,remote,receipt.valor,receipt.gateway_environment]);
      await db.query(`update public.ead_checkout_attempts set transaction_id=$2,state='OPEN' where id=$1`,[attempt.id,transactionId]);
      await db.query(`update public.inscricoes_online set gateway_payment_id=$2 where id=$1`,[attempt.inscription_id,remote]);
      await db.query(`update public.contas_receber set status='PAGO',valor_pago=$2,data_pagamento=current_date,
        gateway_status='PAID',origem_pagamento='BANESE',gateway_payment_id=$3,gateway_boleto_nosso_numero=$3,
        gateway_settlement_source='API',gateway_settlement_evidence='{"paymentCount":1}'::jsonb where id=$1`,
        [receipt.id,receivedAmount ?? receipt.valor,remote]);
      return transactionId;
    };
    const rpc = async (name, args = {}) => {
      try {
        assert.match(name, /^ead_coupons?_[a-z_]+$/);
        const entries = Object.entries(args);
        for (const [key] of entries) assert.match(key, /^p_[a-z_]+$/);
        const parameters = entries.map(([key], index) => `${key} => $${index + 1}`).join(',');
        const data = await scalar(`select public.${name}(${parameters}) value`,
          entries.map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value));
        return { data, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code || 'TEST_ERROR' } };
      }
    };
    await asManager();
    return { db, ids, scalar, asManager, asStudent, asService, recordSyntheticBankProof, rpc, id: couponId };
  } catch (error) {
    await db.close();
    throw error;
  }
};
