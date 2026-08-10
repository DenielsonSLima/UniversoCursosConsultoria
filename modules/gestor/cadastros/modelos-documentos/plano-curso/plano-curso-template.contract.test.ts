import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const root = new URL('.', import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
const migrationUrl = new URL(
  '../../../../../supabase/migrations/20260808234500_create_plano_curso_docente.sql',
  import.meta.url,
);

Deno.test('modelo Plano de Curso usa somente as RPCs versionadas e idempotentes', async () => {
  const service = await read('./services/plano-curso-template.service.ts');
  const hook = await read('./hooks/usePlanoCursoTemplate.ts');
  const migration = await Deno.readTextFile(migrationUrl);

  assert.match(service, /PLANO_CURSO_TEMPLATE_KEY = 'plano_curso'/);
  assert.match(service, /get_modelo_documento_template_secure/);
  assert.match(service, /save_modelo_documento_template_secure/);
  assert.match(service, /p_expected_revision: input\.revisaoEsperada/);
  assert.match(service, /p_request_id: input\.requestId/);
  assert.match(hook, /crypto\.randomUUID/);
  assert.match(hook, /pendingSave/);
  assert(!service.includes(".from('documentos_templates')"));
  assert.match(migration, /template_key in \([\s\S]*'plano_curso'/i);
  assert.match(migration, /v_template_key = 'plano_curso' and v_modality <> 'GERAL'/i);
  assert.match(migration, /insert into public\.documentos_modelos_configuracoes[\s\S]*'plano_curso'[\s\S]*'GERAL'/i);
});

Deno.test('editor mantém paginação como configuração enviada ao backend', async () => {
  const types = await read('./types/plano-curso.types.ts');
  const service = await read('./services/plano-curso-template.service.ts');
  const editor = await read('./components/PlanoCursoTemplateEditor.tsx');
  const migration = await Deno.readTextFile(migrationUrl);

  assert.match(types, /encontrosPrimeiraPagina: number/);
  assert.match(types, /encontrosDemaisPaginas: number/);
  assert.match(service, /encontrosPrimeiraPagina: 0/);
  assert.match(service, /encontrosDemaisPaginas: 9/);
  assert.match(editor, /somente o backend distribui os encontros nas páginas/);
  assert.match(migration, /encontrosPrimeiraPagina[\s\S]*not between 0 and 12/i);
  assert.match(migration, /encontrosDemaisPaginas[\s\S]*not between 1 and 12/i);
});

Deno.test('editor apresenta somente as variáveis de subtítulo autorizadas pelo backend', async () => {
  const editor = await read('./components/PlanoCursoTemplateEditor.tsx');
  assert.ok(editor.includes("{'{{CURSO}}'}"));
  assert.ok(editor.includes("{'{{TURMA}}'}"));
  assert.match(editor, /Outros marcadores são rejeitados pelo servidor/);
});

Deno.test('prévia do modelo preserva cabeçalho, marca e assinatura em camadas', async () => {
  const editor = await read('./components/PlanoCursoTemplateEditor.tsx');

  assert.match(editor, /<DocumentHeader/);
  assert.match(editor, /PreviewWatermark/);
  assert.match(editor, /exibirMarcaDagua/);
  assert.match(editor, /exibirAssinaturaDocente/);
  assert.match(editor, /className="text-left">Japoatã, 8 de agosto de 2026\.<\/p>/);
  assert.match(editor, /className="mx-auto mt-9 w-\[390px\] border-t/);
  assert(!editor.includes('— continuação'));
  assert(!editor.includes('html2canvas'));
  assert(!editor.includes('canvas'));
});
