import assert from 'node:assert/strict';
import {
  isNewerDocumentValidationPolicyVersion,
  isDocumentValidationPolicyDraftDirty,
  shouldMarkPolicyDraftStaleAfterSaveError,
  shouldPreserveDraftOnRemotePolicyChange,
  shouldPreserveDraftDuringPolicyRefresh,
} from './document-validation-policies.draft.ts';
import type {
  DocumentValidationPolicy,
  DocumentValidationPolicyDraft,
} from './document-validation-policies.types.ts';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const policy: DocumentValidationPolicy = {
  documento: 'declaracao_matricula',
  prefixo: 'DEC-MAT',
  escopo_identidade: 'MATRICULA',
  validade_dias: 30,
  exige_vinculo_ativo: true,
  validacao_publica: true,
  consulta_publica_ativa: true,
  campos_publicos: ['institutionName', 'issuedAt', 'courseName'],
  versao_publica: 2,
};

const cleanDraft: DocumentValidationPolicyDraft = {
  prefixo: policy.prefixo,
  validacaoPublica: policy.validacao_publica,
  consultaPublicaAtiva: policy.consulta_publica_ativa,
  validadeDias: policy.validade_dias,
  camposPublicos: [...policy.campos_publicos],
  versaoPublica: policy.versao_publica,
  motivo: '',
};

Deno.test('guard preserva somente rascunho sujo em mudança remota', () => {
  const dirtyDraft = {
    ...cleanDraft,
    prefixo: 'DEC-NOVO',
  };

  assert.equal(isDocumentValidationPolicyDraftDirty(policy, cleanDraft), false);
  assert.equal(isDocumentValidationPolicyDraftDirty(policy, dirtyDraft), true);
  assert.equal(shouldPreserveDraftOnRemotePolicyChange({
    policy,
    draft: dirtyDraft,
    isOwnSavePending: false,
  }), true);
  assert.equal(shouldPreserveDraftOnRemotePolicyChange({
    policy,
    draft: cleanDraft,
    isOwnSavePending: false,
  }), false);
  assert.equal(shouldPreserveDraftOnRemotePolicyChange({
    policy,
    draft: dirtyDraft,
    isOwnSavePending: true,
  }), false);
  assert.equal(shouldPreserveDraftOnRemotePolicyChange({
    policy,
    draft: { ...cleanDraft, motivo: 'Motivo já digitado' },
    isOwnSavePending: false,
  }), true);
});

Deno.test('refresh preserva edição iniciada depois do evento e filtra versão atrasada', () => {
  const incomingPolicy = {
    ...policy,
    prefixo: 'DEC-REMOTO',
    versao_publica: 3,
  };

  assert.equal(shouldPreserveDraftDuringPolicyRefresh({
    previousPolicy: policy,
    incomingPolicy,
    draft: { ...cleanDraft, prefixo: 'DEC-LOCAL' },
    isAlreadyStale: false,
  }), true);
  assert.equal(shouldPreserveDraftDuringPolicyRefresh({
    previousPolicy: policy,
    incomingPolicy,
    draft: cleanDraft,
    isAlreadyStale: false,
  }), false);
  assert.equal(isNewerDocumentValidationPolicyVersion(5, 4), true);
  assert.equal(isNewerDocumentValidationPolicyVersion(4, 4), false);
  assert.equal(isNewerDocumentValidationPolicyVersion(3, 4), false);
});

Deno.test('erro HTTP pós-commit marca stale quando o Realtime já observou versão nova', () => {
  assert.equal(shouldMarkPolicyDraftStaleAfterSaveError({
    draftVersion: 2,
    highestObservedVersion: 3,
    isVersionConflict: false,
  }), true);
  assert.equal(shouldMarkPolicyDraftStaleAfterSaveError({
    draftVersion: 2,
    highestObservedVersion: 2,
    isVersionConflict: false,
  }), false);
  assert.equal(shouldMarkPolicyDraftStaleAfterSaveError({
    draftVersion: 2,
    highestObservedVersion: 0,
    isVersionConflict: true,
  }), true);
});

Deno.test('Realtime usa um único listener seguro e limpeza no unmount', async () => {
  const source = await Deno.readTextFile(
    new URL('./useDocumentValidationPoliciesRealtime.ts', import.meta.url),
  );

  assert.equal(source.match(/\.channel\(/g)?.length, 1);
  assert.equal(source.match(/\.on\(/g)?.length, 1);
  assert.match(source, /realtimeChannelInstance/);
  assert.match(source, /document-validation-policies-realtime-v2-/);
  assert.match(
    source,
    /event:\s*'UPDATE'[\s\S]*table:\s*'documentos_validacao_politicas'/,
  );
  assert.doesNotMatch(source, /documentos_validacao_politicas_historico/);
  assert.match(source, /documentValidationPolicyKeys\.list\(\)/);
  assert.match(source, /documentValidationPolicyKeys\.detail\(documento\)/);
  assert.match(source, /documentValidationPolicyKeys\.history\(documento\)/);
  assert.match(source, /exact:\s*true/);
  assert.match(source, /status === 'SUBSCRIBED'/);
  assert.match(source, /documentValidationPolicyKeys\.details\(\)/);
  assert.match(source, /documentValidationPolicyKeys\.histories\(\)/);
  assert.match(source, /if \(!active\) return/);
  assert.match(source, /supabase\.removeChannel\(channel\)/);
});

Deno.test('query keys e serviço expõem histórico documental dirigido', async () => {
  const serviceSource = await Deno.readTextFile(
    new URL('./document-validation-policies.service.ts', import.meta.url),
  );

  assert.match(serviceSource, /histories:\s*\(\)/);
  assert.match(serviceSource, /history:\s*\(documento:\s*string\)/);
  assert.match(
    serviceSource,
    /listar_historico_politica_validacao_documento/,
  );
  assert.match(serviceSource, /\{\s*p_documento:\s*documento\s*\}/);
});

Deno.test('histórico é montado apenas na aba selecionada e conflito preserva draft', async () => {
  const pageSource = await Deno.readTextFile(
    new URL('./DocumentValidationPoliciesPage.tsx', import.meta.url),
  );

  assert.match(
    pageSource,
    /section === 'history'[\s\S]*<PolicyHistoryPanel documento=\{item\.id\}/,
  );
  assert.match(pageSource, /staleDocumentsRef\.current\.has/);
  assert.match(pageSource, /shouldPreserveDraftDuringPolicyRefresh/);
  assert.match(pageSource, /isNewerDocumentValidationPolicyVersion/);
  assert.match(pageSource, /Carregar versão atual/);
  assert.match(pageSource, /disabled=\{readOnly \|\| stale \|\|/);
});

Deno.test('save serializa concorrência e preserva edição feita durante a mutation', async () => {
  const pageSource = await Deno.readTextFile(
    new URL('./DocumentValidationPoliciesPage.tsx', import.meta.url),
  );

  assert.match(
    pageSource,
    /queryClient\.cancelQueries\(\{\s*queryKey:\s*documentValidationPolicyKeys\.list\(\),\s*exact:\s*true/,
  );
  assert.match(
    pageSource,
    /queryClient\.cancelQueries\(\{\s*queryKey:\s*documentValidationPolicyKeys\.detail\(documento\),\s*exact:\s*true/,
  );
  assert.match(pageSource, /draftRevisionByDocumentRef/);
  assert.match(pageSource, /hasPostSubmitEdits/);
  assert.match(
    pageSource,
    /currentPolicy\.versao_publica\s*>\s*updated\.versao_publica/,
  );
  assert.match(pageSource, /pendingOwnSavesRef\.current\.size\s*>\s*0/);
  assert.match(pageSource, /onClick=\{\(\) => savePolicy\(item\.id, draft\)\}/);
});

Deno.test('recarregar versão atual não aceita cache após erro nem versão regressiva', async () => {
  const pageSource = await Deno.readTextFile(
    new URL('./DocumentValidationPoliciesPage.tsx', import.meta.url),
  );

  assert.match(pageSource, /if \(result\.error \|\| !result\.data\) return/);
  assert.match(
    pageSource,
    /currentPolicy\.versao_publica\s*<\s*minimumExpectedVersion/,
  );
  assert.match(pageSource, /previousPolicy\.versao_publica\s*>\s*policy\.versao_publica/);
});
