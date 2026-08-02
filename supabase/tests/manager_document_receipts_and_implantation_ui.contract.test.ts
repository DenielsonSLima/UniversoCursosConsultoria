import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const baseMigrationUrl = new URL(
  '../migrations/20260731035500_generalize_document_receipts_and_require_complete_review.sql',
  import.meta.url,
);
const workflowMigrationUrl = new URL(
  '../migrations/20260731044628_fix_technical_enrollment_workflow.sql',
  import.meta.url,
);
const documentsPageUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDocumentos.tsx',
  import.meta.url,
);
const workflowHookUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/useParceiroAlunoDocumentosWorkflow.ts',
  import.meta.url,
);
const workflowRealtimeUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/useMatriculaTecnicaWorkflowRealtime.ts',
  import.meta.url,
);
const workflowCacheUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/matricula-tecnica-workflow-cache.ts',
  import.meta.url,
);
const documentsRealtimeUrl = new URL(
  '../../modules/shared/documentos-aluno/use-documentos-aluno-realtime.ts',
  import.meta.url,
);
const queryKeysUrl = new URL(
  '../../modules/shared/documentos-aluno/documentos-aluno.query-keys.ts',
  import.meta.url,
);
const serviceUrl = new URL(
  '../../modules/gestor/parceiros/documentos-aluno.service.ts',
  import.meta.url,
);
const receiptModalUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentoLegacyReceiptModal.tsx',
  import.meta.url,
);
const checklistCardUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentoChecklistCard.tsx',
  import.meta.url,
);
const implantationModalUrl = new URL(
  '../../modules/gestor/parceiros/components/viewparceiros/aluno/documentos/MatriculaImplantacaoDialog.tsx',
  import.meta.url,
);

Deno.test('gestor pode registrar entrega sem anexo somente pelo RPC auditado', async () => {
  const source = await Deno.readTextFile(baseMigrationUrl);
  const start = source.search(
    /create or replace function\s+public\.marcar_documento_recebido_sem_anexo/i,
  );
  const end = source.indexOf('$$;', start);
  const rpc = source.slice(start, end);

  assert.match(source, /GESTOR_CONFIRMACAO_SEM_ANEXO/);
  assert.match(rpc, /auth\.uid\(\) is null/i);
  assert.match(rpc, /gestor_pode_gerenciar_documento_aluno/i);
  assert.match(rpc, /length\(v_motivo\) not between 10 and 1000/i);
  assert.match(rpc, /documento_recebido_sem_anexo/i);
});

Deno.test('matrícula técnica financeira nasce pendente e ativa pela máquina canônica', async () => {
  const source = await Deno.readTextFile(workflowMigrationUrl);
  const coreStart = source.search(
    /CREATE OR REPLACE FUNCTION\s+internal_academic\.legacy_matricular_aluno_turma_financeiro/i,
  );
  const wrapperStart = source.search(
    /CREATE OR REPLACE FUNCTION\s+public\.matricular_aluno_turma_financeiro/i,
  );
  const core = source.slice(coreStart, wrapperStart);
  const activationStart = source.indexOf(
    'CREATE OR REPLACE FUNCTION public.ativar_matricula_tecnica_apos_documentos',
  );
  const activationEnd = source.indexOf('REVOKE ALL ON FUNCTION', activationStart);
  const activation = source.slice(activationStart, activationEnd);

  assert.match(core, /v_target_status[\s\S]*'PENDENTE'/i);
  assert.match(core, /PERFORM public\.gerar_cobranca_matricula\(v_matricula\.id\)/i);
  assert.match(source, /authorize_enrollment_upsert[\s\S]*v_target_status/i);
  assert.match(source, /Matrícula técnica nova deve iniciar pendente/i);
  assert.match(
    source,
    /Matrícula técnica deve ser criada pelo fluxo financeiro pendente ou pela implantação explícita/i,
  );
  assert.match(source, /ta\.entity = CASE[\s\S]*MATRICULA_INSERT/i);
  assert.match(activation, /matricula_tecnica_pagamento_confirmado/i);
  assert.match(activation, /documentacao_obrigatoria_aluno_concluida/i);
  assert.match(activation, /internal_academic\.authorize_enrollment_status/i);
  assert.match(activation, /SET status = 'ATIVO'/i);
});

Deno.test('flags financeiras não aceitam PATCH e implantação é estado explícito sem cobrança', async () => {
  const source = await Deno.readTextFile(workflowMigrationUrl);
  const implantationStart = source.indexOf(
    'CREATE OR REPLACE FUNCTION public.liberar_matricula_implantacao',
  );
  const implantationEnd = source.indexOf('REVOKE ALL ON FUNCTION', implantationStart);
  const implantation = source.slice(implantationStart, implantationEnd);

  assert.match(source, /CREATE OR REPLACE FUNCTION public\.protect_matricula_control_fields/i);
  assert.match(source, /Use a ação financeira ou de implantação oficial/i);
  assert.match(source, /fluxo_operacional[\s\S]*IN \('REGULAR', 'IMPLANTACAO'\)/i);
  assert.match(implantation, /matricula_possui_vinculo_financeiro/i);
  assert.match(implantation, /fluxo_operacional = 'IMPLANTACAO'/i);
  assert.match(implantation, /gerar_cobranca_inicial = false/i);
  assert.match(implantation, /GESTOR_IMPLANTACAO/i);
  assert.match(source, /FROM public\.inscricoes_online inscricao/i);
  assert.match(source, /authorize_matricula_control_update/i);
  assert.match(source, /ta\.entity = 'MATRICULA_CONTROL'/i);
  assert.match(
    source,
    /asaas_checkout_upsert_matricula[\s\S]*restrito à integração de encerramento/i,
  );
});

Deno.test('obrigatoriedade condicional é resolvida por código e regra no backend', async () => {
  const [migration, page] = await Promise.all([
    Deno.readTextFile(workflowMigrationUrl),
    Deno.readTextFile(documentsPageUrl),
  ]);

  assert.match(migration, /documento_codigo/i);
  assert.match(migration, /regra_obrigatoriedade/i);
  assert.match(migration, /HOMEM_MAIOR_18/i);
  assert.match(migration, /DADOS_INSUFICIENTES/i);
  assert.match(migration, /documento_aluno_regra_estado/i);
  assert.doesNotMatch(page, /documentationComplete/i);
  assert.doesNotMatch(
    page,
    /financeiro_liberado|financeiro_status|documentacao_liberada|podeLiberarImplantacao/i,
  );
  assert.match(page, /matricula\.acoes\.ativarRegular\.permitida/i);
  assert.match(page, /matricula\.acoes\.liberarImplantacao\.permitida/i);
});

Deno.test('TanStack Query separa audiências e Realtime reconcilia documentos e matrícula', async () => {
  const [hook, workflowCache, workflowRealtime, documentsRealtime, keys, migration] = await Promise.all([
    Deno.readTextFile(workflowHookUrl),
    Deno.readTextFile(workflowCacheUrl),
    Deno.readTextFile(workflowRealtimeUrl),
    Deno.readTextFile(documentsRealtimeUrl),
    Deno.readTextFile(queryKeysUrl),
    Deno.readTextFile(workflowMigrationUrl),
  ]);

  assert.match(keys, /painel: \(alunoId: string, audience:/i);
  assert.match(hook, /documentosAlunoKeys\.painel\(alunoId, 'gestor'\)/i);
  assert.match(hook, /matriculaTecnicaWorkflowKeys\.aluno\(alunoId\)/i);
  assert.match(hook, /onSuccess: async \(snapshot\)/i);
  assert.match(hook, /reconcileMatriculaTecnicaWorkflowCache/i);
  assert.match(workflowCache, /setQueryData<MatriculaTecnicaPendenteDocumento\[\]>/i);
  assert.match(workflowCache, /snapshot\.turmaId/i);
  assert.doesNotMatch(hook, /matricula\?\.\s*turmaId/i);
  assert.match(workflowRealtime, /table: 'matriculas'/i);
  assert.match(workflowRealtime, /table: 'matricula_liberacoes_diario'/i);
  assert.match(workflowRealtime, /filter: `aluno_id=eq\.\$\{alunoId\}`/i);
  assert.match(documentsRealtime, /REALTIME_INVALIDATION_DELAY_MS = 200/i);
  assert.match(documentsRealtime, /if \(subscribedOnce\) invalidate\(\)/i);
  assert.doesNotMatch(documentsRealtime, /table: 'documentos_aluno_versoes'/i);
  assert.match(migration, /ADD TABLE public\.matricula_liberacoes_diario/i);
});

Deno.test('interface expõe entrega administrativa e fluxos separados de ativação', async () => {
  const [page, checklistCard, receiptModal, implantationModal, service] = await Promise.all([
    Deno.readTextFile(documentsPageUrl),
    Deno.readTextFile(checklistCardUrl),
    Deno.readTextFile(receiptModalUrl),
    Deno.readTextFile(implantationModalUrl),
    Deno.readTextFile(serviceUrl),
  ]);

  assert.match(checklistCard, /Marcar entregue/i);
  assert.match(page, /Converter e liberar implantação/i);
  assert.match(page, /Reliberar acesso de implantação/i);
  assert.match(page, /Ativar matrícula regular/i);
  assert.match(page, /Acesso de implantação liberado/i);
  assert.match(page, /Revogar acesso/i);
  assert.match(receiptModal, /Registro administrativo sem anexo/i);
  assert.doesNotMatch(receiptModal, /Migração de sistema anterior/i);
  assert.match(implantationModal, /sem criar cobrança/i);
  assert.match(service, /liberar_matricula_implantacao/i);
  assert.match(service, /listar_fluxos_matriculas_tecnicas/i);
});

Deno.test('locks e restrição diferida protegem ativação contra revogação concorrente', async () => {
  const source = await Deno.readTextFile(workflowMigrationUrl);

  assert.match(source, /student_document_state:/i);
  assert.match(source, /matricula_workflow:/i);
  assert.match(source, /CREATE CONSTRAINT TRIGGER assert_receipt_removal_safe/i);
  assert.match(source, /DEFERRABLE INITIALLY DEFERRED/i);
  assert.match(source, /Não é permitido remover a última evidência de documento obrigatório/i);
});
