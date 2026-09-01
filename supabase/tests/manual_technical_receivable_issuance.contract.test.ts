import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migration = await Deno.readTextFile(new URL(
  '../migrations/20260901120400_authorize_manual_technical_receivable_issuance.sql',
  import.meta.url,
));
const service = await Deno.readTextFile(new URL(
  '../../modules/asaas/asaas.service.ts',
  import.meta.url,
));

const functionBody = (qualifiedName: string) => {
  const marker = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${qualifiedName.replaceAll('.', '\\.')}`,
    'i',
  );
  const match = marker.exec(migration);
  assert.ok(match, `função ausente: ${qualifiedName}`);
  const end = migration.indexOf('$function$;', match.index);
  assert.ok(end > match.index, `fim ausente: ${qualifiedName}`);
  return migration.slice(match.index, end + '$function$;'.length);
};

const authorizationRpc = functionBody(
  'public.authorize_technical_manual_receivable_issuance_secure',
);
const claimGuard = functionBody(
  'internal_academic.guard_manual_technical_receivable_first_bank_claim',
);

Deno.test('consentimento é persistido pelo ID exato e fingerprint material', () => {
  assert.match(
    migration,
    /technical_manual_receivable_issuance_authorizations[\s\S]*?receivable_id uuid primary key/i,
  );
  assert.match(
    authorizationRpc,
    /p_receivable_id\s+uuid[\s\S]*?p_request_id\s+uuid/i,
  );
  assert.match(
    authorizationRpc,
    /v_receivable\.id\s*=\s*any\(run\.receivable_ids\)/i,
  );
  assert.match(authorizationRpc, /run\.state in \('LOCAL_CREATED', 'PROTECTED_EXISTING'\)/i);
  assert.match(authorizationRpc, /where authz\.receivable_id = p_receivable_id/i);
  assert.match(authorizationRpc, /as authz/i);
  assert.match(authorizationRpc, /for update/i);
  assert.match(authorizationRpc, /pg_advisory_xact_lock[\s\S]*?p_request_id/i);

  for (const field of [
    "'receivableId'", "'matriculaId'", "'turmaId'", "'poloId'",
    "'clienteId'", "'tipo'", "'parcelaNumero'", "'origem'",
    "'descricao'", "'valor'", "'vencimento'",
  ]) assert.match(migration, new RegExp(field, 'i'));
  assert.match(migration, /extensions\.digest[\s\S]*?'sha256'/i);
});

Deno.test('RPC exige RBAC financeiro, aba receber, polo e status acadêmico', () => {
  assert.match(authorizationRpc, /v_actor\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(authorizationRpc, /gestor_has_financeiro_tab\('receber'\)/i);
  assert.match(authorizationRpc, /is_gestor_for_polo\(v_receivable\.polo_id\)/i);
  assert.match(authorizationRpc, /not in \('PENDENTE', 'ATIVO'\)/i);
  assert.match(authorizationRpc, /registrar_turma_financeiro_auditoria/i);
  assert.match(authorizationRpc, /EMISSAO_RECEBIVEL_CICLO_TECNICO_MANUAL_AUTORIZADA/i);
  assert.match(
    migration,
    /grant execute on function[\s\S]*?authorize_technical_manual_receivable_issuance_secure\(uuid, uuid\)[\s\S]*?to authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function[\s\S]*?authorize_technical_manual_receivable_issuance_secure\(uuid, uuid\)[\s\S]*?to service_role/i,
  );
});

Deno.test('não manual é no-op e protegido nunca recebe nova autorização', () => {
  const noRun = authorizationRpc.indexOf(
    "select run.* into v_run",
  );
  const permission = authorizationRpc.indexOf("gestor_has_financeiro_tab('receber')");
  assert.ok(noRun >= 0 && noRun < permission, 'no-op não manual deve anteceder o RBAC específico');
  assert.match(
    authorizationRpc,
    /is_technical_manual_cycle_protected\([\s\S]*?v_receivable\.matricula_id[\s\S]*?nova emissão bancária bloqueada/i,
  );
  assert.match(
    authorizationRpc,
    /'required', false, 'authorized', false, 'replayed', false/i,
  );
});

Deno.test('LOCAL_CREATED sem autorização falha antes do primeiro claim API ou CNAB', () => {
  assert.match(claimGuard, /run\.state in \('LOCAL_CREATED', 'PROTECTED_EXISTING'\)/i);
  assert.match(
    claimGuard,
    /old\.gateway_creation_token is null[\s\S]*?new\.gateway_creation_token is not null/i,
  );
  assert.match(
    claimGuard,
    /old\.gateway_cnab_file_id is null[\s\S]*?new\.gateway_cnab_file_id is not null/i,
  );
  assert.match(
    claimGuard,
    /old\.gateway_submission_channel is null[\s\S]*?new\.gateway_submission_channel = 'CNAB'/i,
  );
  assert.match(
    claimGuard,
    /new\.gateway_submission_channel = 'API'[\s\S]*?new\.gateway_submission_status in \([\s\S]*?'API_REGISTERED'[\s\S]*?'API_AMBIGUOUS'/i,
  );
  assert.match(
    claimGuard,
    /if v_authorization\.receivable_id is null[\s\S]*?consentimento explícito por recebível/i,
  );
  assert.match(
    claimGuard,
    /receivable_fingerprint is distinct from v_fingerprint[\s\S]*?não corresponde mais ao recebível/i,
  );
  assert.match(
    migration,
    /before update of gateway_creation_token, gateway_cnab_file_id,[\s\S]*?gateway_submission_channel, gateway_submission_status/i,
  );
});

Deno.test('PROTECTED bloqueia reemissão e preserva atualização de título existente', () => {
  assert.match(
    claimGuard,
    /v_protected_enrollment\s*:=[\s\S]*?is_technical_manual_cycle_protected[\s\S]*?if v_protected_enrollment then[\s\S]*?if v_protected_claim[\s\S]*?novo claim bancário bloqueado/i,
  );
  assert.match(
    claimGuard,
    /v_old_remote_identity\s*:=[\s\S]*?gateway_payment_id is not null[\s\S]*?asaas_payment_id is not null/i,
  );
  assert.match(
    claimGuard,
    /not v_old_remote_identity[\s\S]*?gateway_submission_status in \([\s\S]*?'API_REGISTERED'/i,
  );
  assert.match(
    claimGuard,
    /if not v_first_claim then[\s\S]*?return new/i,
  );
  assert.doesNotMatch(
    migration,
    /before update of[\s\S]*?\bstatus\b[\s\S]*?on public\.contas_receber/i,
  );
});

Deno.test('ação explícita da UI autoriza antes do sync e mantém não manuais', () => {
  const methodStart = service.indexOf('async syncReceivable(receivableId: string)');
  const methodEnd = service.indexOf('\n  async createOtherCredit', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = service.slice(methodStart, methodEnd);
  assert.match(method, /createReceivableIssuanceRequestId\(\)/i);
  assert.match(method, /authorize:\s*authorizeManualTechnicalReceivableIssuance/i);
  assert.match(method, /invokeAdmin[\s\S]*?'sync-receivable'/i);

  const rpcStart = service.indexOf(
    "'authorize_technical_manual_receivable_issuance_secure'",
  );
  assert.ok(rpcStart >= 0 && rpcStart < methodStart);
  assert.match(service, /data\.required === true && data\.authorized !== true/i);
});
