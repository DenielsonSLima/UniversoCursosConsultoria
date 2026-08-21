import assert from "node:assert/strict";
import {
  formatDocumentValidationUrlForDisplay,
  getDocumentValidationBaseUrl,
  getDocumentValidationUrl,
  resolveDocumentValidationPublicSiteUrl,
} from "./document-validation.url.ts";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const DEFAULT_PUBLIC_SITE_URL = "https://universocc.com.br";

Deno.test("normaliza a URL pública canônica configurada", () => {
  assert.equal(
    resolveDocumentValidationPublicSiteUrl(
      " HTTPS://VALIDADOR.Example.COM:443/subpasta/?origem=teste#secao ",
    ),
    "https://validador.example.com",
  );
  assert.equal(
    resolveDocumentValidationPublicSiteUrl("https://documentos.example.com/"),
    "https://documentos.example.com",
  );
});

Deno.test("configuração inválida usa o domínio público seguro", () => {
  for (
    const configuredUrl of [
      undefined,
      null,
      "",
      "   ",
      "universocc.com.br",
      "http://universocc.com.br",
      "https://localhost:4173",
      "https://192.168.3.107",
      "https://[::1]",
      "ftp://universocc.com.br",
      "javascript:alert(1)",
      "https://usuario:senha@universocc.com.br",
    ]
  ) {
    assert.equal(
      resolveDocumentValidationPublicSiteUrl(configuredUrl),
      DEFAULT_PUBLIC_SITE_URL,
    );
  }
});

Deno.test("IP da janela nunca entra na URL de validação", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: "http://192.168.3.107",
      },
    },
  });

  try {
    const validationUrl = getDocumentValidationUrl("CIE-IP-123");
    assert.equal(
      validationUrl,
      `${DEFAULT_PUBLIC_SITE_URL}/validador?code=CIE-IP-123`,
    );
    assert.doesNotMatch(validationUrl, /192\.168\.3\.107/);
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

Deno.test("rota e código do validador permanecem estáveis", () => {
  assert.equal(
    getDocumentValidationBaseUrl(),
    `${DEFAULT_PUBLIC_SITE_URL}/validador`,
  );
  assert.equal(
    getDocumentValidationUrl("DOC 01/2026"),
    `${DEFAULT_PUBLIC_SITE_URL}/validador?code=DOC%2001%2F2026`,
  );
});

Deno.test("endereço impresso usa www sem alterar a URL HTTPS canônica", () => {
  const canonicalUrl = getDocumentValidationUrl("SIG-ABC/2026");
  assert.equal(
    canonicalUrl,
    `${DEFAULT_PUBLIC_SITE_URL}/validador?code=SIG-ABC%2F2026`,
  );
  assert.equal(
    formatDocumentValidationUrlForDisplay(canonicalUrl),
    "www.universocc.com.br/validador?code=SIG-ABC%2F2026",
  );
  assert.equal(
    formatDocumentValidationUrlForDisplay(canonicalUrl, {
      includeSearch: false,
    }),
    "www.universocc.com.br/validador",
  );
});

Deno.test("endereço impresso recusa origem insegura", () => {
  assert.throws(
    () =>
      formatDocumentValidationUrlForDisplay(
        "http://universocc.com.br/validador",
      ),
    /não é segura/i,
  );
  assert.throws(
    () => formatDocumentValidationUrlForDisplay("https://localhost/validador"),
    /não é segura/i,
  );
});

Deno.test("emissores documentais usam somente o helper canônico", async () => {
  const sources = await Promise.all([
    "../../gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx",
    "../../gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditor.tsx",
    "../../gestor/cadastros/modelos-documentos/irpf/components/IRPFEditor.tsx",
    "../../gestor/cadastros/modelos-documentos/estagio/components/EstagioEditor.tsx",
    "../secretaria/document-template.helpers.ts",
  ].map((path) => Deno.readTextFile(new URL(path, import.meta.url))));

  for (const source of sources) {
    assert.match(source, /getDocumentValidationUrl/);
    assert.doesNotMatch(source, /academicConfigs\?\.validacaoUrl/);
    assert.doesNotMatch(source, /\?q=\$\{/);
    assert.doesNotMatch(source, /#\/validador/);
  }
});

Deno.test("configuração acadêmica persiste apenas a base canônica", async () => {
  const [serviceSource, pageSource] = await Promise.all([
    Deno.readTextFile(
      new URL(
        "../../gestor/configuracoes/academicos/academicos.service.ts",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../gestor/configuracoes/academicos/AcademicosConfig.tsx",
        import.meta.url,
      ),
    ),
  ]);

  assert.match(
    serviceSource,
    /validacaoUrl:\s*getDocumentValidationBaseUrl\(\)/,
  );
  assert.match(
    pageSource,
    /const validacaoUrl = getDocumentValidationBaseUrl\(\)/,
  );
  assert.match(pageSource, /readOnly/);
  assert.doesNotMatch(pageSource, /setValidacaoUrl/);
  assert.doesNotMatch(pageSource, /http:\/\/ ou https:\/\//);
});
