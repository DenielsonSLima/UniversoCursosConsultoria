// @ts-nocheck -- contrato estático de migration executado pelo Deno.

import assert from 'node:assert/strict';

const migrationUrl = new URL(
  '../migrations/20260818184706_extend_assinatura_eletronica_model_editor_v1.sql',
  import.meta.url,
);
const contractUrl = new URL(
  '../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts',
  import.meta.url,
);
const serviceUrl = new URL(
  '../../modules/shared/assinatura-eletronica/assinatura-eletronica.service.ts',
  import.meta.url,
);
const configurationUrl = new URL(
  '../../modules/gestor/configuracoes/assinatura-eletronica/AssinaturaEletronicaConfig.tsx',
  import.meta.url,
);
const pdfUrl = new URL(
  '../../modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.ts',
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const contract = await Deno.readTextFile(contractUrl);
const service = await Deno.readTextFile(serviceUrl);
const configuration = await Deno.readTextFile(configurationUrl);
const pdf = await Deno.readTextFile(pdfUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf('$function$;', start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test('editor versionado contém exatamente duas páginas e cinco blocos jurídicos fixos', () => {
  const defaults = functionBlock('public.assinatura_eletronica_editor_padrao()');
  const normalizer = functionBlock('public.assinatura_eletronica_normalizar_editor(');

  assert.match(defaults, /'schemaVersion', 1/i);
  assert.equal((defaults.match(/'page', [12]/g) || []).length, 2);
  assert.match(defaults, /'page', 1,[\s\S]*?'template', 'EVIDENCE'/i);
  assert.match(defaults, /'page', 2,[\s\S]*?'template', 'LEGAL_TEXTS'/i);
  for (const id of ['ownership', 'consent', 'terms_update', 'contact', 'copies']) {
    assert.match(defaults, new RegExp(`'id', '${id}'`, 'i'));
  }
  assert.match(normalizer, /jsonb_array_length\(p_editor -> 'pages'\) <> 2/i);
  assert.match(normalizer, /jsonb_array_length\(v_page_2 -> 'sections'\) <> 5/i);
  assert.match(normalizer, /jsonb_typeof\(v_page_1 -> 'page'\) is distinct from 'number'/i);
  assert.match(normalizer, /jsonb_typeof\(v_page_2 -> 'page'\) is distinct from 'number'/i);
  assert.match(normalizer, /v_total_body_length > 1000/i);
  assert.match(normalizer, /v_source not in \('TEXT', 'INSTITUTIONAL_BRAND'\)/i);
  assert.match(normalizer, /v_opacity < 0\.03 or v_opacity > 0\.15/i);
  assert.match(normalizer, /v_scale < 20 or v_scale > 65/i);
  assert.match(normalizer, /v_rotation not in \(-45, 0\)/i);
});

Deno.test('identidade da prévia é canônica, fail-closed e não é escolhida no navegador', () => {
  const identity = functionBlock('public.assinatura_eletronica_preview_identidade_matriz()');
  const presentation = functionBlock('public.assinatura_eletronica_apresentar_configuracao(');
  const getConfiguration = functionBlock('public.assinatura_eletronica_obter_configuracao(');

  assert.match(identity, /security invoker/i);
  assert.doesNotMatch(identity, /security definer/i);
  assert.match(identity, /set search_path = ''/i);
  assert.match(identity, /if v_matrix_count <> 1/i);
  assert.match(identity, /join public\.empresas as company/i);
  assert.match(identity, /coalesce\(pole\.is_matriz, false\)/i);
  assert.match(identity, /coalesce\(company\.ativo, false\)/i);
  assert.match(identity, /v_logo_url !~\* '\^https:\/\/'/i);
  assert.match(identity, /v_watermark_url !~\* '\^https:\/\/'/i);
  assert.match(presentation, /'previewIdentity', public\.assinatura_eletronica_preview_identidade_matriz\(\)/i);
  assert.match(getConfiguration, /'previewIdentity', public\.assinatura_eletronica_preview_identidade_matriz\(\)/i);
  assert.match(sql, /revoke all on function public\.assinatura_eletronica_preview_identidade_matriz\(\) from public, anon, authenticated, service_role/i);
  assert.match(service, /normalizePreviewIdentity/i);
  assert.doesNotMatch(configuration, /polosService|marcaDaguaService|FALLBACK_PREVIEW_IDENTITY/i);
  assert.match(configuration, /canonicalPreviewIdentity\.logoUrl/i);
  assert.match(configuration, /canonicalPreviewIdentity\.watermark\.url/i);
  assert.match(configuration, /isCanonicalInstitutionalWatermarkDataUri/i);
  assert.match(configuration, /institutionalWatermark/i);
  assert.match(configuration, /signatureStampAssets/i);
  assert.doesNotMatch(configuration, /watermarkAssets/i);
});

Deno.test('migration altera apenas a apresentação e preserva a fundação fail-closed', () => {
  const save = functionBlock('public.assinatura_eletronica_salvar_configuracao(');

  assert.doesNotMatch(sql, /create table|alter table|create policy|storage\.buckets|storage\.objects/i);
  assert.doesNotMatch(sql, /assinatura_eletronica_(envelopes|participantes|eventos|desafios|artefatos)\s*(?:\(|set|values)/i);
  assert.match(save, /v_habilitada boolean := false/i);
  assert.match(save, /v_status_juridico text := 'PENDENTE_MATRIZ_JURIDICA'/i);
  assert.match(save, /if v_documento <> 'MODELO_PADRAO' then[\s\S]*?bloqueadas nesta fundação/i);
  assert.doesNotMatch(save, /p_configuracao[\s\S]*?->>?\s*'enabled'/i);
  assert.match(save, /'metodo', 'BLOQUEADO'/i);
  assert.match(save, /'cadeiaEvidencias', false/i);
});

Deno.test('versão probatória é gerada no banco e não aceita valor do navegador', () => {
  const save = functionBlock('public.assinatura_eletronica_salvar_configuracao(');
  const presentation = functionBlock('public.assinatura_eletronica_apresentar_configuracao(');

  assert.match(
    save,
    /array\['confirmationMessage', 'editor', 'expectedVersion', 'name', 'receiptMessage', 'receiptTitle'\]::text\[\]/i,
  );
  assert.doesNotMatch(
    save,
    /array\[[^\]]*'versionLabel'[^\]]*\]::text\[\]/i,
  );
  assert.match(save, /'versionLabel', 'Versão ' \|\| v_versao::text/i);
  assert.match(presentation, /'versionLabel', 'Versão ' \|\| \(p_registro\)\.versao::text/i);
  assert.doesNotMatch(
    contract,
    /ElectronicSignatureAdministrationDraft[\s\S]*?'versionLabel'/i,
  );
  assert.doesNotMatch(configuration, /updateText\('versionLabel'/i);
});

Deno.test('salvamento continua autorizado, idempotente e versionado pela mesma RPC', () => {
  const save = functionBlock('public.assinatura_eletronica_salvar_configuracao(');

  assert.match(save, /assinatura_eletronica_autoriza_configuracao\(p_polo_id\)/i);
  assert.match(save, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(save, /where politica\.request_id = v_request_id/i);
  assert.match(save, /chave de idempotência já foi usada com dados diferentes/i);
  assert.match(save, /v_replay\.versao is distinct from v_expected_version \+ 1/i);
  assert.match(save, /select coalesce\(max\(politica\.versao\), 0\)[\s\S]*?into v_current_version/i);
  assert.match(save, /if v_current_version is distinct from v_expected_version/i);
  assert.match(save, /using errcode = '40001'/i);
  assert.match(save, /v_versao := v_current_version \+ 1/i);
  assert.match(save, /set arquivada_em = now\(\)/i);
  assert.match(sql, /revoke all on function public\.assinatura_eletronica_salvar_configuracao\(uuid, text, jsonb, uuid\)[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.assinatura_eletronica_salvar_configuracao\(uuid, text, jsonb, uuid\) to authenticated, service_role/i);
});

Deno.test('frontend normaliza o editor e continua sem acesso direto às tabelas', () => {
  assert.match(service, /normalizeEditor\(policy\.editor\)/i);
  assert.match(service, /deve conter exatamente duas páginas/i);
  assert.match(service, /A ordem dos blocos jurídicos não corresponde ao contrato autorizado/i);
  assert.match(service, /supabase\.rpc\(name, args\)/i);
  assert.doesNotMatch(service, /\.from\(['"]assinatura_eletronica_/i);
  assert.match(service, /expectedVersion: params\.expectedVersion/i);
  assert.match(configuration, /saveRequestId, setSaveRequestId/i);
  assert.match(configuration, /versionConflict, setVersionConflict/i);
  assert.match(configuration, /expectedVersion: presentation\.version/i);
  assert.match(configuration, /Recarregar versão atual/i);
  assert.match(configuration, /Salvar nova versão/i);
});

Deno.test('prévia possui factory própria e não aceita campos de evidência', () => {
  const previewInterface = pdf.slice(
    pdf.indexOf('export interface ElectronicSignatureTemplatePreviewPayload'),
    pdf.indexOf('interface PreparedElectronicSignatureReceipt'),
  );
  const previewFactory = pdf.slice(
    pdf.indexOf('export const createElectronicSignatureTemplatePreviewPdf'),
    pdf.indexOf('export const createElectronicSignatureReceiptPdf'),
  );

  assert.match(
    previewInterface,
    /institution:[\s\S]*?logo:[\s\S]*?institutionalWatermark:[\s\S]*?signatureStampAssets:[\s\S]*?presentation:/i,
  );
  assert.doesNotMatch(previewInterface, /status|participants|events|hash|validation/i);
  assert.match(previewFactory, /drawTemplatePreviewPageOne/i);
  assert.match(previewFactory, /drawTemplatePreviewPageTwo/i);
  assert.match(pdf, /PRÉVIA DO MODELO — SEM VALIDADE/i);
  assert.match(pdf, /QR Code, código e URL ficam disponíveis somente após a conclusão autorizada/i);
  assert.doesNotMatch(previewFactory, /prepareReceipt\(/i);
});
