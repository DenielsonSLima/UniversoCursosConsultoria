import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test("configuração de usuários registra listeners antes de assinar canal único", async () => {
  const source = await Deno.readTextFile(
    new URL("./UsuariosConfig.tsx", import.meta.url),
  );
  const queryHookSource = await Deno.readTextFile(
    new URL("./hooks/useUsuariosConfigQueries.ts", import.meta.url),
  );

  assert.equal(source.match(/\.channel\(/g)?.length, 1);
  assert.equal(source.match(/\.on\(/g)?.length, 2);
  assert.match(source, /usuariosConfigRealtimeInstance/);
  assert.match(source, /channelNameRef/);
  assert.match(source, /usuarios-config-realtime-v2-/);
  assert.match(source, /selectedContextRef/);
  assert.match(source, /status !== 'SUBSCRIBED'/);
  assert.match(source, /active = false/);
  assert.match(source, /supabase\.removeChannel\(channel\)/);

  const subscribeIndex = source.indexOf(".subscribe(");
  const lastListenerIndex = source.lastIndexOf(".on(");
  assert.ok(lastListenerIndex >= 0);
  assert.ok(subscribeIndex > lastListenerIndex);

  assert.doesNotMatch(queryHookSource, /\.channel\(/);
  assert.doesNotMatch(queryHookSource, /usuarios_config_polos_realtime/);
});
