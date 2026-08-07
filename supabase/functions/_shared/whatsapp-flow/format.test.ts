import { normalizeCpf, normalizePersonName, parseMenuNumber } from "./format.ts";

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
};

Deno.test("interpreta resposta numerica simples do menu", () => {
  assertEquals(parseMenuNumber("4"), 4, "numero simples");
});

Deno.test("interpreta numero acompanhado pelo rotulo da opcao", () => {
  assertEquals(parseMenuNumber("4 cursos"), 4, "rotulo sem separador");
  assertEquals(parseMenuNumber("4 - Cursos disponíveis"), 4, "rotulo com hífen");
  assertEquals(parseMenuNumber("opção 4 cursos"), 4, "prefixo opção");
});

Deno.test("nao extrai numero solto de uma frase", () => {
  assertEquals(parseMenuNumber("tenho 4 cursos"), null, "frase livre");
});

Deno.test("valida CPF pelos digitos verificadores", () => {
  assertEquals(normalizeCpf("529.982.247-25"), "52998224725", "CPF válido formatado");
  assertEquals(normalizeCpf("111.111.111-11"), "", "sequência repetida");
  assertEquals(normalizeCpf("529.982.247-24"), "", "dígito verificador inválido");
});

Deno.test("exige nome completo sem aceitar números", () => {
  assertEquals(normalizePersonName("  Maria   da Silva  "), "Maria da Silva", "normalização do nome");
  assertEquals(normalizePersonName("Maria"), "", "nome incompleto");
  assertEquals(normalizePersonName("Maria Silva 2"), "", "nome com número");
});
