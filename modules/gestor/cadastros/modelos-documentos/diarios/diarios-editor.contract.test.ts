import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('editor separa fundos da capa e da contracapa sem perder edições concorrentes', async () => {
  const [page, hook, uploadTypes, service] = await Promise.all([
    Deno.readTextFile(new URL('./DiariosPage.tsx', import.meta.url)),
    Deno.readTextFile(new URL('./hooks/useDiarioTemplateEditor.ts', import.meta.url)),
    Deno.readTextFile(new URL('./diarios-editor.types.ts', import.meta.url)),
    Deno.readTextFile(new URL('./diarios.service.ts', import.meta.url)),
  ]);

  assert.match(uploadTypes, /'capa'\s*\|\s*'contracapa'\s*\|\s*'contracapa_custom'/u);
  assert.match(page, /handleUpload\(event, 'capa'\)/u);
  assert.match(
    page,
    /imageUrl=\{activeTab === 'capa' \? form\.capaUrl : form\.contracapaUrl\}/u,
  );
  assert.match(
    page,
    /capaUrl:\s*current\.contracapaUrl,[\s\S]*?contracapaUrl:\s*null/u,
  );
  assert.match(page, /Corrigir destino: mover esta imagem para a capa/u);
  assert.match(page, /disabled=\{Boolean\(uploading\) \|\| saveMutation\.isPending\}/u);
  assert.match(hook, /const targetKey = kind === 'capa' \? 'capaUrl' : 'contracapaUrl'/u);
  assert.match(hook, /setForm\(\(previous\) => \(\{ \.\.\.previous, \[targetKey\]: url \}\)\)/u);
  assert.match(hook, /const savedForm = formRef\.current/u);
  assert.match(hook, /const uploadCurso = selectedCursoRef\.current/u);
  assert.match(hook, /selectedCursoRef\.current !== uploadCurso/u);
  assert.match(hook, /saveTemplate\(uploadCurso, savedForm\)/u);
  assert.equal(
    (hook.match(/refetchType: formRef\.current === savedForm \? 'active' : 'none'/gu) || []).length,
    2,
  );
  assert.doesNotMatch(service, /if \(kind === 'capa'\)/u);
  assert.doesNotMatch(service, /String\(template\.capaUrl/u);
});

Deno.test('canvas usa a capa configurada sem duplicar sua arte e mantém campos variáveis', async () => {
  const canvas = await Deno.readTextFile(
    new URL('./components/DiarioEditorCanvas.tsx', import.meta.url),
  );

  assert.match(canvas, /<CoverDecorLayer imageUrl=\{props\.form\.capaUrl\} \/>/u);
  assert.match(canvas, /props\.activeTab !== 'capa' \|\| !props\.form\.capaUrl/u);
  assert.match(canvas, /props\.activeTab === 'capa' && !props\.form\.capaUrl/u);
  assert.match(canvas, /DIÁRIO DE CLASSE/u);
  assert.match(canvas, /height: field\.id\.startsWith\('contracapaAssinatura'\) \? '14%' : undefined/u);
});

Deno.test('contracapa expõe os dois slots digitais e respeita sua área segura', async () => {
  const [settings, properties] = await Promise.all([
    Deno.readTextFile(new URL('./components/DiarioBackCoverSettingsPanel.tsx', import.meta.url)),
    Deno.readTextFile(new URL('./components/DiarioFieldPropertiesPanel.tsx', import.meta.url)),
  ]);

  assert.match(settings, /Slots digitais de assinatura/u);
  assert.match(settings, /contracapaAssinaturaProfessor/u);
  assert.match(settings, /contracapaAssinaturaCoordenador/u);
  assert.doesNotMatch(settings, /manual/iu);
  assert.match(properties, /const maxY = currentField\.id\.startsWith\('contracapaAssinatura'\) \? 86 : 95/u);
  assert.match(properties, /altura fixa de 14% da página/u);
});
