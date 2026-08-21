// @ts-nocheck -- contrato estático de migration/PDF/UI executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819013000_add_assinatura_eletronica_signature_stamp_editor_v3.sql",
  import.meta.url,
);
const v5MigrationUrl = new URL(
  "../migrations/20260820113000_add_signature_editor_v5_global_stamp_template.sql",
  import.meta.url,
);
const contractUrl = new URL(
  "../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts",
  import.meta.url,
);
const templateUrl = new URL(
  "../../modules/shared/assinatura-eletronica/signature-stamp-template.ts",
  import.meta.url,
);
const templateEditorUrl = new URL(
  "../../modules/shared/pdf/SignatureStampTemplateEditor.tsx",
  import.meta.url,
);
const configurationUrl = new URL(
  "../../modules/gestor/configuracoes/assinatura-eletronica/AssinaturaEletronicaConfig.tsx",
  import.meta.url,
);
const editorFieldsUrl = new URL(
  "../../modules/gestor/configuracoes/assinatura-eletronica/signature-stamp-editor-fields.ts",
  import.meta.url,
);
const previewUrl = new URL(
  "../../modules/gestor/configuracoes/assinatura-eletronica/ElectronicSignatureTemplatePreview.tsx",
  import.meta.url,
);
const pdfUrl = new URL(
  "../../modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.ts",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const v5Sql = await Deno.readTextFile(v5MigrationUrl);
const contract = await Deno.readTextFile(contractUrl);
const template = await Deno.readTextFile(templateUrl);
const templateEditor = await Deno.readTextFile(templateEditorUrl);
const configuration = await Deno.readTextFile(configurationUrl);
const editorFields = await Deno.readTextFile(editorFieldsUrl);
const preview = await Deno.readTextFile(previewUrl);
const pdf = await Deno.readTextFile(pdfUrl);

const functionBlock = (signature: string, source = sql) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = source.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return source.slice(start, end);
};

Deno.test("schema v5 preserva duas páginas e aplica um template global no PDF original", () => {
  const defaults = functionBlock(
    "public.assinatura_eletronica_editor_padrao()",
    v5Sql,
  );
  const converter = functionBlock(
    "public.assinatura_eletronica_editor_v5_a_partir_v4(",
    v5Sql,
  );
  const normalizer = functionBlock(
    "public.assinatura_eletronica_normalizar_editor(",
    v5Sql,
  );
  const stampEditor = contract.slice(
    contract.indexOf("export interface ElectronicSignatureStampEditor"),
    contract.indexOf("export interface ElectronicSignatureDocumentEditor"),
  );
  const documentEditor = contract.slice(
    contract.indexOf("export interface ElectronicSignatureDocumentEditor"),
    contract.indexOf("export const ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS"),
  );

  assert.match(defaults, /assinatura_eletronica_editor_v5_a_partir_v4/i);
  assert.match(converter, /'schemaVersion',\s*5/i);
  assert.match(converter, /'template',\s*public\.assinatura_eletronica_template_carimbo_v5_padrao\(\)/i);
  assert.match(converter, /'autoLayout',\s*v_auto_layout/i);
  assert.doesNotMatch(converter, /PROFESSOR|COORDENADOR|slots/i);
  assert.match(converter, /'enabled',\s*false/i);
  assert.match(
    converter,
    /'canonicalLabel',\s*'Documento assinado eletronicamente'/i,
  );
  assert.match(normalizer, /v_schema <= 4/i);
  assert.match(
    normalizer,
    /ARRAY\[\s*'pages',\s*'schemaVersion',\s*'signatureStamp'\s*\]::text\[\]/i,
  );
  assert.match(
    normalizer,
    /'assetId', 'autoLayout', 'canonicalLabel', 'enabled', 'template'/i,
  );
  assert.match(normalizer, /assinatura_eletronica_template_carimbo_v5_valido/i);
  assert.match(normalizer, /assinatura_eletronica_auto_layout_carimbo_v5_valido/i);
  assert.match(contract, /schemaVersion:\s*5/i);
  assert.match(
    contract,
    /template:\s*ElectronicSignatureStampTemplateV1/i,
  );
  assert.match(contract, /autoLayout:\s*ElectronicSignatureStampAutoLayoutV1/i);
  assert.doesNotMatch(stampEditor, /role|slots/i);
  assert.doesNotMatch(documentEditor, /watermark/i);
});

Deno.test("imagem própria do carimbo tem vínculo versionado separado e lifecycle protegido", () => {
  const referenced = functionBlock(
    "public.assinatura_eletronica_modelo_asset_referenciado(",
  );
  const authorizeCleanup = functionBlock(
    "public.assinatura_eletronica_modelo_asset_cleanup_autorizar(",
  );
  const finalizeCleanup = functionBlock(
    "public.assinatura_eletronica_modelo_asset_cleanup_finalizar(",
  );
  const reconcile = functionBlock(
    "public.assinatura_eletronica_modelo_asset_reconciliar_reivindicar(",
  );
  const save = functionBlock(
    "public.assinatura_eletronica_salvar_configuracao(",
  );

  assert.match(
    sql,
    /CREATE TABLE public\.assinatura_eletronica_politica_carimbo_assets/i,
  );
  assert.match(
    sql,
    /REFERENCES public\.assinatura_eletronica_modelo_assets\(id\) ON DELETE RESTRICT/i,
  );
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(
    sql,
    /AS RESTRICTIVE FOR ALL TO anon, authenticated[\s\S]*?USING \(false\)[\s\S]*?WITH CHECK \(false\)/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.assinatura_eletronica_politica_carimbo_assets[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(referenced, /assinatura_eletronica_politica_assets/i);
  assert.match(referenced, /assinatura_eletronica_politica_carimbo_assets/i);
  assert.match(
    authorizeCleanup,
    /assinatura_eletronica_modelo_asset_referenciado\(v_asset\.id\)/i,
  );
  assert.match(
    finalizeCleanup,
    /assinatura_eletronica_modelo_asset_referenciado\(v_asset\.id\)/i,
  );
  assert.match(
    reconcile,
    /NOT public\.assinatura_eletronica_modelo_asset_referenciado\(asset\.id\)/i,
  );
  assert.match(save, /asset\.status = 'PRONTO'[\s\S]*?FOR UPDATE/i);
  assert.match(save, /'signatureStampAssetSnapshot', v_stamp_snapshot/i);
  assert.match(
    save,
    /INSERT INTO public\.assinatura_eletronica_politica_carimbo_assets/i,
  );
  assert.match(save, /v_stamp_asset\.sha256/i);
  assert.doesNotMatch(save, /'storagePath'|'bucketId'/i);
});

Deno.test("RPC v3 histórica continua autorizada, idempotente e juridicamente bloqueada", () => {
  const save = functionBlock(
    "public.assinatura_eletronica_salvar_configuracao(",
  );

  assert.ok(
    save.indexOf("assinatura_eletronica_autoriza_configuracao(p_polo_id)") <
      save.indexOf("FROM public.assinatura_eletronica_modelo_assets"),
  );
  assert.match(save, /v_documento <> 'MODELO_PADRAO'/i);
  assert.match(save, /p_polo_id IS NOT NULL/i);
  assert.match(save, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(save, /WHERE politica\.request_id = v_request_id/i);
  assert.match(save, /v_replay\.habilitada IS DISTINCT FROM false/i);
  assert.match(
    save,
    /v_replay\.status_juridico IS DISTINCT FROM 'PENDENTE_MATRIZ_JURIDICA'/i,
  );
  assert.match(save, /v_resultado\.habilitada IS DISTINCT FROM false/i);
  assert.match(
    save,
    /v_resultado\.status_juridico IS DISTINCT FROM 'PENDENTE_MATRIZ_JURIDICA'/i,
  );
  assert.doesNotMatch(
    save,
    /assinatura_eletronica_envelopes|assinatura_eletronica_participantes|assinatura_eletronica_eventos/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assinatura_eletronica_salvar_configuracao_v2_legacy[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_salvar_configuracao\(uuid, text, jsonb, uuid\)[\s\S]*?TO authenticated, service_role/i,
  );
});

Deno.test("editor global v5 move e redimensiona elementos sem alterar vínculos canônicos", () => {
  assert.match(template, /SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE = 100_000/i);
  assert.match(template, /moveSignatureStampTemplateElement/i);
  assert.match(template, /resizeSignatureStampTemplateElement/i);
  assert.match(template, /isSignatureStampTemplateQrClear/i);
  assert.match(template, /SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS/i);
  assert.match(
    template,
    /SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE - widthBp/i,
  );
  assert.match(templateEditor, /setPointerCapture\(event\.pointerId\)/i);
  assert.match(templateEditor, /releasePointerCapture\(event\.pointerId\)/i);
  assert.match(templateEditor, /interaction\.latestTemplate = nextTemplate/i);
  assert.match(
    templateEditor,
    /onCommit\(cloneElectronicSignatureStampTemplate\(interaction\.latestTemplate\)\)/i,
  );
  assert.match(
    templateEditor,
    /onPointerCancel=\{\(event\) => finishInteraction\(event, true\)\}/i,
  );
  assert.match(
    templateEditor,
    /isSignatureStampTemplateQrClear\(nextTemplate\)/i,
  );
  assert.match(
    templateEditor,
    /ArrowLeft[\s\S]*?ArrowRight[\s\S]*?ArrowUp[\s\S]*?ArrowDown/i,
  );
  assert.match(templateEditor, /Shift mais seta\s*move em passos maiores/i);
  assert.match(templateEditor, /aria-live="polite"/i);
  assert.match(templateEditor, /element\.kind === "IMAGE"/i);
  assert.match(templateEditor, /element\.kind === "LINE"/i);
  assert.match(templateEditor, /element\.kind === "QR"/i);
  assert.doesNotMatch(templateEditor, /PROFESSOR|COORDENADOR|slot/i);
});

Deno.test("aba exclusiva do carimbo global não cria página 3 e bloqueia dados probatórios", () => {
  assert.match(
    configuration,
    /type EditorTab = ["']PAGE_1["'] \| ["']PAGE_2["'] \| ["']SIGNATURE_STAMP["']/i,
  );
  assert.match(configuration, /Editor livre do carimbo/i);
  assert.match(configuration, /Não cria uma terceira página/i);
  assert.doesNotMatch(
    configuration,
    /activePage=\{3\}|page:\s*3|Página 3 de 3/i,
  );
  assert.match(configuration, /Campos canônicos bloqueados/i);
  assert.match(configuration, /getElectronicSignatureStampLockedFields/i);
  assert.match(
    editorFields,
    /ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS\.signerCpfMasked/i,
  );
  assert.match(
    editorFields,
    /ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS\.signedAt/i,
  );
  assert.match(
    editorFields,
    /ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS\.signatureHash/i,
  );
  assert.match(
    editorFields,
    /ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS\.verificationUrl/i,
  );
  assert.match(editorFields, /id:\s*["']signatureQrCode["'][\s\S]*?kind:\s*["']DERIVED_QR["']/i);
  assert.match(
    configuration,
    /CPF mascarado[\s\S]*?hash individual[\s\S]*?QR próprio[\s\S]*?à direita/i,
  );
  assert.match(
    configuration,
    /O mesmo template é repetido para todos os signatários autorizados/i,
  );
  assert.match(configuration, /sem separar Professor e\s*Coordenador/i);
  assert.match(configuration, /institutionalWatermark/i);
  assert.match(configuration, /isCanonicalInstitutionalWatermarkDataUri/i);
  assert.doesNotMatch(configuration, /PdfStampPlacementEditor/i);
  assert.match(configuration, /uploadModelAsset\(file\)/i);
  assert.match(configuration, /handleSignatureStampAssetUploaded/i);
  assert.match(configuration, /signatureStampAssets/i);
  assert.match(
    preview,
    /mode === "SIGNATURE_STAMP"[\s\S]*?<SignatureStampTemplateEditor/i,
  );
  assert.doesNotMatch(preview, /createElectronicSignatureStampTemplatePreviewPdf/i);
  assert.match(preview, /SignatureStampTemplateEditor/i);
});

Deno.test("prévia vetorial do template global preserva o cabeçalho canônico", () => {
  const stampFactory = pdf.slice(
    pdf.indexOf(
      "export const createElectronicSignatureStampTemplatePreviewPdf",
    ),
    pdf.indexOf("export const createElectronicSignatureReceiptPdf"),
  );
  const stampDrawer = pdf.slice(
    pdf.indexOf("const drawGlobalSignatureStamp ="),
    pdf.indexOf("const drawSignatureStampPlacementPreview ="),
  );
  const placementPreview = pdf.slice(
    pdf.indexOf("const drawSignatureStampPlacementPreview ="),
    pdf.indexOf("const toSafeFileSegment ="),
  );

  assert.match(stampFactory, /new jsPDF/i);
  assert.doesNotMatch(stampFactory, /addPage\(/i);
  assert.match(stampFactory, /drawSignatureStampPlacementPreview/i);
  assert.match(
    pdf,
    /drawCanonicalInstitutionalHeader\(\s*pdf,\s*payload\.institution,\s*payload\.logo/iu,
  );
  assert.match(
    pdf,
    /Esta folha A4 representa somente a última página do PDF original/i,
  );
  assert.match(stampDrawer, /pdf\.addImage\(/i);
  assert.match(stampDrawer, /element\.kind === "IMAGE"/i);
  assert.match(stampDrawer, /element\.kind === "LINE"/i);
  assert.match(stampDrawer, /element\.kind === "QR"/i);
  assert.match(stampDrawer, /STAMP_PREVIEW_BINDING_VALUES\[element\.binding\]/i);
  assert.match(placementPreview, /deriveAutomaticSignatureStampPlacements/i);
  assert.match(placementPreview, /drawGlobalSignatureStamp/i);
  assert.match(placementPreview, /sampleSignerCount/i);
  assert.doesNotMatch(stampDrawer, /PROFESSOR|COORDENADOR|slots/i);
  assert.doesNotMatch(stampDrawer, /html2canvas|dom-to-image|foreignObject/i);
});
