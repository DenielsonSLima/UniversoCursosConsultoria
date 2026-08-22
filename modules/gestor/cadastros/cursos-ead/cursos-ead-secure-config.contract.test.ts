import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const serviceUrl = new URL("./cursos-ead.service.ts", import.meta.url);
const mutationsUrl = new URL(
  "./hooks/useCursosEadMutations.ts",
  import.meta.url,
);

const [service, mutations] = await Promise.all([
  Deno.readTextFile(serviceUrl),
  Deno.readTextFile(mutationsUrl),
]);

Deno.test("listagem gestora reconstitui configurações EAD por uma RPC batch autorizada", () => {
  assert.match(
    service,
    /supabase\.rpc\('get_ead_course_configs_for_management',[\s\S]*?p_course_ids: uniqueCourseIds/,
  );
  assert.match(
    service,
    /const managedConfigs = await getManagedEadConfigs\([\s\S]*?ead_config: managedConfigs\.get\(curso\.id\)/,
  );
  assert.match(
    service,
    /uniqueCourseIds\.find\(courseId => !configs\.has\(courseId\)\)[\s\S]*?throw new Error/,
  );
});

Deno.test("duplicação EAD não reutiliza configuração sanitizada da leitura pública", () => {
  assert.match(
    service,
    /async duplicateCourse\([\s\S]*?getManagedEadConfigs\(\[courseId\]\)[\s\S]*?ead_config: eadConfig/,
  );
  assert.doesNotMatch(
    service,
    /select\([^)]*ead_config[^)]*\)[\s\S]*?\.eq\('id', courseId\)/,
  );
  assert.match(
    mutations,
    /cursosEadService\.duplicateCourse\(cursoId, nome, versao\)/,
  );
  assert.doesNotMatch(mutations, /cadastrosService\.duplicateEadCurso/);
});
