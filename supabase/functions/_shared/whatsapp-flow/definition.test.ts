import {
  findFlowBuilderOption,
  parseFlowBuilder,
  renderFlowBuilderNode,
  renderFlowBuilderTemplate,
} from "./definition.ts";

const sample = {
  version: 1,
  startNodeId: "menu",
  nodes: [
    {
      id: "menu",
      name: "Menu",
      message: "Como posso ajudar?",
      enabled: true,
      options: [
        {
          id: "student",
          label: "Já sou aluno",
          enabled: true,
          action: "goto",
          targetNodeId: "student_menu",
        },
        {
          id: "hidden",
          label: "Oculta",
          enabled: false,
          action: "handoff",
        },
      ],
    },
    {
      id: "student_menu",
      name: "Aluno",
      message: "Escolha a unidade",
      enabled: true,
      options: [],
    },
  ],
};

Deno.test("valida, renderiza e numera somente opções ativas", () => {
  const parsed = parseFlowBuilder(sample);
  if (!parsed) throw new Error("fluxo deveria ser válido");
  const menu = renderFlowBuilderNode(parsed.nodes[0]);
  if (!menu.includes("1️⃣ Já sou aluno")) throw new Error("opção ativa ausente");
  if (menu.includes("Oculta")) throw new Error("opção inativa foi renderizada");
  if (findFlowBuilderOption(parsed.nodes[0], 1)?.id !== "student") {
    throw new Error("numeração ativa não foi respeitada");
  }
});

Deno.test("rejeita fluxo com destino inexistente", () => {
  const invalid = JSON.parse(JSON.stringify(sample)) as typeof sample;
  invalid.nodes[0].options[0].targetNodeId = "missing";
  if (parseFlowBuilder(invalid)) throw new Error("destino inválido foi aceito");
});

Deno.test("substitui contexto sem executar expressão arbitrária", () => {
  const result = renderFlowBuilderTemplate(
    "{{modality}} — {{polo}} — {{missing}}",
    { modality: "Curso Técnico", polo: "Japoatã" },
  );
  if (result !== "Curso Técnico — Japoatã —") {
    throw new Error(`template inesperado: ${result}`);
  }
});
