import { readFile } from 'node:fs/promises';
import { createStudentEmailDatabase, seedStudentEmailDatabase, ids } from './student-email-confirmation-harness.mjs';
import { handleSendStudentInvite } from '../../functions/portal-user-management/handlers/send-student-invite.ts';

export { ids };

export async function createInviteFixture(options = {}) {
  const db = await createStudentEmailDatabase();
  // Produção substituiu o contexto inicial para exigir primeiro acesso institucional.
  // O override é exclusivo deste fixture; o harness histórico de e-mail fica intacto.
  const actorSql = await readFile(new URL('../../migrations/20260822113020_close_institutional_gate_bypasses.sql', import.meta.url), 'utf8');
  const actorStart = actorSql.indexOf('CREATE OR REPLACE FUNCTION public.portal_identidade_actor_gestor_contexto(');
  const actorEnd = actorSql.indexOf('$function$;', actorStart);
  if (actorStart < 0 || actorEnd < 0) throw new Error('Guard institucional vigente ausente');
  await db.exec(actorSql.slice(actorStart, actorEnd + '$function$;'.length));
  await seedStudentEmailDatabase(db);
  await db.exec(`ALTER TABLE public.parceiros ADD COLUMN convite_enviado_em timestamptz;
    UPDATE public.usuarios_sistema SET primeiro_acesso_institucional_pendente=false,
      acesso_institucional_origem='LEGADO' WHERE id='${ids.actorRecord}';
    UPDATE auth.users SET email_confirmed_at='2026-10-01' WHERE id='${ids.auth}';
    UPDATE public.parceiros SET senha_atualizada_em=NULL, troca_senha_obrigatoria=true,
      acesso_status='pendente' WHERE id='${ids.student}';
    DELETE FROM public.portal_identidade_institucional_senha_eventos WHERE auth_user_id='${ids.auth}';`);
  await db.exec(await readFile(new URL('../../migrations/20261011160000_guard_student_invite_actor_cas.sql', import.meta.url), 'utf8'));
  if (options.unlinked) await db.query('UPDATE public.parceiros SET auth_user_id=NULL WHERE id=$1', [ids.student]);
  if (options.poloIds) await db.query('UPDATE public.parceiros SET polo_ids=$1::uuid[] WHERE id=$2',
    [`{${options.poloIds.join(',')}}`, ids.student]);
  if (options.shared) await db.query(`INSERT INTO public.parceiros(
    id,tipo,auth_user_id,email,auth_login_email,cpf_cnpj,
    primeiro_acesso_institucional_pendente,senha_institucional_criada_em,acesso_institucional_origem)
    VALUES ($1,'Professor',$2,'aluno@example.com','aluno@example.com','52998224725',
      false,'2026-10-01','SENHA_CRIADA')`, [ids.other, ids.auth]);

  const row = async () => (await db.query('SELECT to_jsonb(p) AS row FROM public.parceiros p WHERE id=$1', [ids.student])).rows[0].row;
  const snapshot = await row();
  const hooks = {};
  const counts = { writes: 0, applied: 0, recovery: 0, emails: 0, invites: 0, checkpoints: 0 };
  const completePassword = () => db.query('UPDATE auth.users SET encrypted_password=$1 WHERE id=$2',
    ['opaque-own-hash-created-during-request', ids.auth]);
  const authUser = async () => {
    const user = (await db.query('SELECT to_jsonb(u) AS row FROM auth.users u WHERE id=$1', [ids.auth])).rows[0].row;
    return { id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at,
      user_metadata: user.raw_user_meta_data };
  };
  const write = async args => {
    const checkpoint = Object.keys(args.p_patch).length === 0;
    if (checkpoint) {
      counts.checkpoints += 1;
      await hooks.beforeCheckpoint?.(counts.checkpoints);
    } else {
      counts.writes += 1;
      const injectedError = await hooks.beforeWrite?.(counts.writes, args.p_patch);
      if (injectedError) return { data: null, error: injectedError };
    }
    try {
      const result = await db.query('SELECT public.portal_atualizar_acesso_aluno_por_gestor_cas($1,$2,$3::jsonb,$4::jsonb) AS row',
        [args.p_actor_auth_user_id,args.p_partner_id,JSON.stringify(args.p_expected_snapshot),JSON.stringify(args.p_patch)]);
      if (!checkpoint) counts.applied += 1;
      return { data: result.rows[0].row, error: null };
    } catch (error) {
      return { data: null, error: { code: error.code, message: error.message } };
    }
  };
  const admin = {
    rpc: async (name, args) => {
      if (name === 'portal_atualizar_acesso_aluno_por_gestor_cas') return options.rpcMissing
        ? { data: null, error: { code: 'PGRST202', message: 'RPC ausente' } } : write(args);
      if (name === 'portal_identidade_listar_responsaveis_vinculados') return { data: [], error: null };
      if (name === 'portal_identidade_credencial_compartilhada_liberada') {
        await hooks.sharedProof?.();
        return { data: true, error: null };
      }
      return { data: 'a'.repeat(64), error: null };
    },
    from: table => ({ update: () => { throw new Error("UPDATE direto não é autorizado no fixture de convite"); }, select: () => {
      const query = { eq: () => query, neq: () => query,
        limit: async () => ({ data: options.shared && table === 'parceiros' ? [{
          id: ids.other, tipo: 'Professor', cpf_cnpj: snapshot.cpf_cnpj,
          email: snapshot.email, auth_login_email: snapshot.auth_login_email,
        }] : [], error: null }) };
      return query;
    } }),
    auth: { admin: {
      getUserById: async () => { await hooks.getAuth?.(); return { data: { user: await authUser() }, error: null }; },
      listUsers: async () => ({ data: { users: [] }, error: null }),
      inviteUserByEmail: async (_email, { data }) => {
        counts.invites += 1;
        await hooks.invite?.();
        return { data: { user: { ...await authUser(), user_metadata: data } }, error: null };
      },
      generateLink: async () => {
        counts.recovery += 1;
        await hooks.generateLink?.();
        return { data: { user: { id: ids.auth }, properties: { action_link: 'https://example.test/recovery' } }, error: null };
      },
    } },
  };
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  globalThis.Deno = { env: { get: name => process.env[name] } };
  if (options.email) globalThis.fetch = async () => {
    counts.emails += 1;
    await hooks.email?.();
    return new Response('{}', { status: 200 });
  };
  return {
    db, row, snapshot, hooks, counts, completePassword,
    run: () => handleSendStudentInvite({ admin,
      gestor: { id: ids.actorRecord, auth_user_id: ids.actor }, gestorEmail: 'gestor@example.com',
      json: (payload, status = 200) => new Response(JSON.stringify(payload), { status }),
    }, snapshot, { supabaseUrl: 'https://example.test', redirectTo: '/recuperar-senha',
      publicApiKey: { apiKey: options.email ? 'synthetic-public-key' : null, message: 'Sem envio no teste.' } }),
    close: async () => { globalThis.Deno = originalDeno; globalThis.fetch = originalFetch; await db.close(); },
  };
}
