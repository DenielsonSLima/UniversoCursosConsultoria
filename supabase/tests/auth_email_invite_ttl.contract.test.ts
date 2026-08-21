// @ts-nocheck -- contrato estático de configuração executado pelo Deno.
import assert from "node:assert/strict";

const config = await Deno.readTextFile(
  new URL("../config.toml", import.meta.url),
);

Deno.test("configuração local dá ao convite de e-mail uma janela de 24 horas sem remover uso único", () => {
  assert.match(config, /\[auth\.email\][\s\S]*?otp_expiry\s*=\s*86400/);
  assert.match(
    config,
    /additional_redirect_urls\s*=\s*\[[\s\S]*?https:\/\/universocc\.com\.br\/login/,
  );
  assert.match(
    config,
    /additional_redirect_urls\s*=\s*\[[\s\S]*?https:\/\/universocc\.com\.br\/recuperar-senha/,
  );
});
