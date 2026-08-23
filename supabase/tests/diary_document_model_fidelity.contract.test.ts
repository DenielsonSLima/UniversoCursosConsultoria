// @ts-nocheck -- contrato estático de implementação e migration incremental.

import { assert, assertMatch } from "jsr:@std/assert";

const root = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));

Deno.test("modelo do Diário persiste posições distintas para Professor e Coordenador", async () => {
  const [service, defaults, editor, migration, manifest] = await Promise.all([
    read("modules/gestor/cadastros/modelos-documentos/diarios/diarios.service.ts"),
    read("modules/gestor/cadastros/modelos-documentos/diarios/diarios-template-defaults.ts"),
    read("modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioEditorCanvas.tsx"),
    read("supabase/migrations/20260823170700_add_diary_signature_positions_to_templates.sql"),
    read("modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts"),
  ]);

  for (const id of [
    "contracapaAssinaturaProfessor",
    "contracapaAssinaturaCoordenador",
  ]) {
    assertMatch(defaults, new RegExp(id));
    assertMatch(service, /assertVectorDiaryTemplate/);
    assertMatch(migration, new RegExp(id));
    assertMatch(manifest, new RegExp(id));
  }
  assertMatch(editor, /fields\s*\.filter\(\(field\) => field\.visible\)/);
  assert(!editor.includes("CONFIGURABLE_BACK_COVER_FIELD_IDS"));
  assert(!editor.includes("BackCoverValidationCard"));
  assertMatch(manifest, /semanticTarget: 'DIARIO_BACK_COVER'/);
  assertMatch(manifest, /targetPageIndex: 1/);
});

Deno.test("editor e compositor usam capa vetorial e contracapa sem card paralelo", async () => {
  const [page, editorTypes, service, coverPages, backFields] = await Promise.all([
    read("modules/gestor/cadastros/modelos-documentos/diarios/DiariosPage.tsx"),
    read("modules/gestor/cadastros/modelos-documentos/diarios/diarios-editor.types.ts"),
    read("modules/gestor/cadastros/modelos-documentos/diarios/diarios.service.ts"),
    read("modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-cover-pages.ts"),
    read("modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-back-cover-fields.ts"),
  ]);

  assert(!page.includes("Capa-Diario.jpg"));
  assert(!editorTypes.includes("DiarioUploadKind = 'capa'"));
  assertMatch(page, /Capa vetorial oficial/);
  assertMatch(page, /Remover capa legada/);
  assertMatch(service, /Upload de capa completa foi desativado/);
  assertMatch(service, /modelo histórico usa uma capa de página inteira/);
  assert(!coverPages.includes("DADOS DO DOCUMENTO"));
  assert(!coverPages.includes("drawCanonicalInstitutionalHeader"));
  for (const id of [
    "contracapaTitulo", "contracapaCurso", "contracapaTurma",
    "contracapaDisciplina", "contracapaModulo", "contracapaProfessor",
    "contracapaRegulamento", "contracapaAutenticacao", "contracapaQrCode",
  ]) assertMatch(backFields, new RegExp(id));
  assertMatch(backFields, /field\.x/);
  assertMatch(backFields, /field\.width/);
  assertMatch(backFields, /field\.fontSize/);
  assertMatch(backFields, /field\.color/);
  assertMatch(backFields, /field\.bold/);
  assertMatch(backFields, /field\.borderTop/);
  assertMatch(backFields, /field\.align/);
});

Deno.test("emissão do Diário falha sem modelo e watermark paisagem configurados", async () => {
  const [service, diaryService, diary] = await Promise.all([
    read("modules/gestor/cadastros/modelos-documentos/diarios/diarios.service.ts"),
    read("modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.service.ts"),
    read("modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx"),
  ]);

  assertMatch(service, /getTemplateForEmission/);
  assertMatch(service, /getLandscapeWatermarkForEmission/);
  assertMatch(service, /não foi configurado em Modelos Documentos/);
  assertMatch(service, /marca d’água em paisagem do Diário não está configurada corretamente/);
  assertMatch(diaryService, /getTemplateForEmission/);
  assertMatch(diary, /getLandscapeWatermarkForEmission/);
});

Deno.test("editor e banco recusam geometria de contracapa fora da página", async () => {
  const [service, migration, compositor] = await Promise.all([
    read("modules/gestor/cadastros/modelos-documentos/diarios/diarios.service.ts"),
    read("supabase/migrations/20260823171200_validate_diary_back_cover_geometry.sql"),
    read("modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-back-cover-fields.ts"),
  ]);

  assertMatch(service, /field\.x \+ field\.width > 100/);
  assertMatch(service, /field\.y \+ SIGNATURE_SLOT_HEIGHT_PERCENT > 100/);
  assertMatch(
    service,
    /qrField\.y \+ qrHeightPercent \+ qrLabelHeightPercent > 100/,
  );
  assertMatch(service, /QR_LABEL_SAFE_MARGIN_MM = 1/);
  assertMatch(
    migration,
    /\(field ->> 'x'\)::numeric \+ \(field ->> 'width'\)::numeric > 100/,
  );
  assertMatch(
    migration,
    /\(v_qr ->> 'fontSize'\)::numeric \* 0\.3528 \+ 1/,
  );
  assertMatch(migration, /GROUP BY field ->> 'id'[\s\S]*?HAVING count\(\*\) > 1/);
  assertMatch(compositor, /x \+ width > 100/);
});
