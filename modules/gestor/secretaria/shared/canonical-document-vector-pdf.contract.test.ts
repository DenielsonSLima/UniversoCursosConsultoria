import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { TextDecoder } from "node:util";

import { createCarteirinhasPreceptorPdf } from "../carteirinhas-preceptor/carteirinhas-preceptor.pdf";
import {
  createContratosAlunoPdf,
  getContractWatermarkGeometry,
  resolveContractPresentationMode,
} from "../contratos-aluno/contratos-aluno.pdf";
import { parseContratoAlunoClosingLayout } from "../../../shared/contrato-aluno/closing-layout";
import { normalizeContractSectionHeader } from "../../../shared/contrato-aluno/section-header";
import {
  buildContractSemanticRuns,
  contractSemanticPlainText,
} from "../../../shared/contrato-aluno/semantic-format";
import { normalizeCanonicalPdfText } from "./canonical-document-vector-pdf";
import type { CarteirinhaPreceptorPreparedDocument } from "../carteirinhas-preceptor/types/carteirinhas-preceptor.types";
import type { ContratoAlunoPreparedDocument } from "../contratos-aluno/types/contratos-aluno.types";

const contractFixture = (): ContratoAlunoPreparedDocument => ({
  emissionId: "contrato-vetorial-teste",
  documentId: null,
  title: "Contrato de teste",
  targetName: "Aluno de teste",
  validationCode: "CON-TESTE-VETORIAL",
  validationUrl: null,
  validUntil: null,
  fileUrl: null,
  statusLabel: null,
  renderPayload: {
    template: {
      destaquesCriticos: [
        "O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA",
      ],
      destaquesAtencao: [
        "É devido pelo CONTRATANTE no caso de pedido de desistência",
      ],
    },
    snapshot: {
      curso: {
        nome: "Técnico em Enfermagem",
        modalidade: "TECNICO",
        cargaHoraria: 1800,
      },
      turma: { inicioExibicao: "10/08/2026" },
      financeiro: {
        valorMatriculaExibicao: "R$ 200,00",
        quantidadeParcelas: 24,
      },
      instituicao: {
        nome: "Instituição de Teste",
        razaoSocial: "Instituição de Teste Ltda.",
        cnpj: "00.000.000/0000-00",
        endereco: "Endereço institucional de teste",
        numero: "0",
        bairro: "Bairro de teste",
        cidade: "Cidade de teste",
        uf: "EX",
        cep: "00000-000",
        telefone: "(00) 00000-0000",
        email: "documento@example.invalid",
        isMatriz: true,
        presentationVersion: "CONTRATO_A4_INSTITUCIONAL_V2",
      },
      validacao: { validadeExibicao: "Sem vencimento" },
    },
    templateRevision: 1,
    rendered: {
      kind: "CONTRATO_ALUNO",
      pages: [{
        header: "Instituição de Teste",
        title: "Contrato de prestação de serviços educacionais",
        body:
          "ALUNO: Pessoa Exemplo\n\nOBJETO DO PRESENTE INSTRUMENTO:\nPrestação de serviços para o curso Técnico em Enfermagem.\n\nCLÁUSULA 5ª – O curso começa em 10/08/2026 e possui carga horária de 1800 horas.\n\nCLÁUSULA 6ª – Valor de matrícula: R$ 200,00; Quantidade prevista de parcelas: 24.\n\nPARÁGRAFO 1º - O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA.",
        footer: "Rodapé canônico de teste.",
      }],
      watermark: {
        enabled: true,
        label: "UNIVERSO",
        imageUrl: null,
        opacity: 0.06,
        scale: 50,
        rotate: true,
      },
      qr: {
        enabled: true,
        label: "Validar documento",
        validityLabel: "Sem vencimento",
      },
      front: null,
      back: null,
    },
  },
});

test("cabeçalho opcional do contrato elimina identidade repetida e preserva subtítulo próprio", () => {
  const institutionNames = [
    "Universo Cursos e Consultoria",
    "Universo Cursos e Consultoria Ltda.",
  ];

  assert.equal(normalizeContractSectionHeader("", institutionNames), "");
  assert.equal(
    normalizeContractSectionHeader("UNIVERSO CURSOS E CONSULTORIA", institutionNames),
    "",
  );
  assert.equal(
    normalizeContractSectionHeader("Universo Cursos e Consultoria Ltda.", institutionNames),
    "",
  );
  assert.equal(
    normalizeContractSectionHeader("Documento acadêmico oficial", institutionNames),
    "Documento acadêmico oficial",
  );
});

test("contrato preserva o texto e aplica hierarquia da minuta sem HTML ou rasterização", () => {
  const body = [
    "ALUNO: Pessoa Exemplo",
    "",
    "CLÁUSULA 5ª – Matrícula no curso Técnico em Enfermagem, com início em 10/08/2026.",
    "",
    "CLÁUSULA 6ª – Valor de matrícula: R$ 200,00; Quantidade prevista de parcelas: 24.",
    "",
    "PARÁGRAFO 1º - O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA.",
    "",
    "I - É devido pelo CONTRATANTE no caso de pedido de desistência o percentual contratual aplicável.",
  ].join("\n");
  const runs = buildContractSemanticRuns(body, {
    snapshot: {
      curso: { nome: "Técnico em Enfermagem" },
      turma: { inicioExibicao: "10/08/2026" },
      financeiro: {
        valorMatriculaExibicao: "R$ 200,00",
        quantidadeParcelas: 24,
      },
    },
  });

  assert.equal(contractSemanticPlainText(runs), body);
  assert.ok(runs.some((run) => run.bold && run.text.includes("ALUNO:")));
  assert.ok(runs.some((run) => run.bold && run.text.includes("CLÁUSULA 5ª")));
  assert.ok(runs.some((run) => run.bold && run.text.includes("PARÁGRAFO 1º")));
  assert.ok(runs.some((run) => run.accent && run.text.includes("Técnico em Enfermagem")));
  assert.ok(runs.some((run) => run.accent && run.text.includes("R$ 200,00")));
  assert.ok(runs.some((run) => run.accent && run.text.includes("24")));
  assert.ok(runs.some((run) => run.accent && run.text.includes("O pagamento será realizado")));
  assert.ok(runs.some((run) => run.attention && run.text.includes("É devido pelo CONTRATANTE")));
});

test("contrato preserva o compositor legado em snapshots anteriores à versão V2", async () => {
  assert.equal(resolveContractPresentationMode(undefined), "LEGACY");
  assert.equal(resolveContractPresentationMode(null), "LEGACY");
  assert.equal(resolveContractPresentationMode("CONTRATO_A4_INSTITUCIONAL_V1"), "LEGACY");
  assert.equal(resolveContractPresentationMode("CONTRATO_A4_INSTITUCIONAL_V2"), "V2");
  assert.equal(
    resolveContractPresentationMode("CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA"),
    "V3",
  );
  assert.throws(
    () => resolveContractPresentationMode("CONTRATO_A4_INSTITUCIONAL_V3_DESCONHECIDA"),
    /versão de apresentação.*não é suportada/i,
  );

  const fixture = contractFixture();
  const institution = fixture.renderPayload?.snapshot?.instituicao as Record<string, unknown>;
  delete institution.presentationVersion;
  const document = await createContratosAlunoPdf([fixture]);
  assert.ok(document.blob.size > 1_000);
  if (process.env.CANONICAL_CONTRACT_LEGACY_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CANONICAL_CONTRACT_LEGACY_FIXTURE_OUTPUT,
      new Uint8Array(await document.blob.arrayBuffer()),
    );
  }
});

const preceptorFixture = (
  suffix = "1",
): CarteirinhaPreceptorPreparedDocument => ({
  emissionId: `preceptor-vetorial-${suffix}`,
  documentId: null,
  title: "Carteirinha de preceptor",
  targetName: `Professor de teste ${suffix}`,
  validationCode: `PRE-VETORIAL-${suffix}`,
  validationUrl: null,
  validUntil: null,
  fileUrl: null,
  statusLabel: null,
  renderPayload: {
    template: {
      mostrarFoto: false,
      mostrarPolo: true,
      marcaDaguaHabilitada: true,
    },
    snapshot: {
      instituicao: { nome: "Universo Cursos e Consultoria" },
      validacao: { validadeExibicao: "Sem vencimento" },
    },
    templateRevision: 1,
    rendered: {
      kind: "CARTEIRINHA_PRECEPTOR",
      pages: [],
      watermark: {
        enabled: true,
        label: "UNIVERSO",
        imageUrl: null,
        opacity: 0.08,
      },
      qr: {
        enabled: true,
        label: "Validação",
        validityLabel: "Sem vencimento",
      },
      front: {
        subtitle: "Universo Cursos e Consultoria",
        title: "Preceptor(a)",
        holder_name: `Professor de teste ${suffix}`,
        role: "Preceptor(a)",
        area: "Enfermagem",
        institution: "Polo Matriz",
      },
      back: {
        message: "Credencial institucional de uso pessoal e intransferível.",
        footer: "Documento institucional",
        validity_label: "Sem vencimento",
      },
    },
  },
});

test("contrato gera PDF nativo e bloqueia paginação visual no navegador", async () => {
  const document = await createContratosAlunoPdf([contractFixture()]);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());

  assert.equal(document.fileName, "contrato-aluno-contrato-vetorial-teste.pdf");
  assert.match(new TextDecoder("latin1").decode(bytes.slice(0, 8)), /^%PDF-/);
  assert.ok(document.blob.size > 1_000);

  const tooLong = contractFixture();
  if (!tooLong.renderPayload?.rendered?.pages[0]) {
    throw new Error("Fixture inválida.");
  }
  tooLong.renderPayload.rendered.pages[0].body = "Cláusula canônica. ".repeat(
    4_000,
  );
  await assert.rejects(
    () => createContratosAlunoPdf([tooLong]),
    /ultrapassa a área segura.*paginação no servidor/i,
  );

  if (process.env.CANONICAL_CONTRACT_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.CANONICAL_CONTRACT_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test("contrato usa cabeçalho institucional congelado e mantém o cabeçalho do modelo separado", async () => {
  const fixture = contractFixture();
  if (!fixture.renderPayload?.rendered?.pages[0]) throw new Error("Fixture inválida.");
  fixture.renderPayload.rendered.pages[0].header = "Documento acadêmico oficial";

  const document = await createContratosAlunoPdf([fixture]);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());
  assert.ok(document.blob.size > 1_000);

  if (process.env.CANONICAL_CONTRACT_HEADER_FIXTURE_OUTPUT) {
    await writeFile(process.env.CANONICAL_CONTRACT_HEADER_FIXTURE_OUTPUT, bytes);
  }
});

test("encerramento do contrato preserva quebras e só recebe QR na folha final", async () => {
  const fixture = contractFixture();
  if (!fixture.renderPayload?.rendered) throw new Error("Fixture inválida.");
  fixture.renderPayload.rendered.pages = [
    {
      header: "Universo Cursos e Consultoria",
      title: "Contrato de prestação de serviços educacionais",
      body: "Primeira página canônica sem encerramento ou assinaturas.",
      footer: null,
    },
    {
      header: "Universo Cursos e Consultoria",
      title: "Contrato de prestação de serviços educacionais — continuação",
      body: "Última página canônica.",
      footer:
        "Japoatã/SE, 07/08/2026.\\n\\nCONTRATANTE: ____________________________\\nCONTRATADA: ____________________________\\n\\nTestemunhas: ____________________________\\n____________________________",
    },
  ];

  assert.equal(
    normalizeCanonicalPdfText(fixture.renderPayload.rendered.pages[1].footer),
    "Japoatã/SE, 07/08/2026.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________\n\nTestemunhas: ____________________________\n____________________________",
  );

  const document = await createContratosAlunoPdf([fixture]);
  assert.ok(document.blob.size > 1_000);

  if (process.env.CANONICAL_CONTRACT_LAST_PAGE_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CANONICAL_CONTRACT_LAST_PAGE_FIXTURE_OUTPUT,
      new Uint8Array(await document.blob.arrayBuffer()),
    );
  }
});

test("contrato V2 multipágina reserva título e traço decorativo somente à primeira folha", async () => {
  const fixture = contractFixture();
  if (!fixture.renderPayload?.rendered) throw new Error("Fixture inválida.");
  fixture.renderPayload.rendered.pages = Array.from({ length: 7 }, (_, index) => ({
    header: "Universo Cursos e Consultoria",
    title: index === 0
      ? "Contrato de prestação de serviços educacionais"
      : "Contrato de prestação de serviços educacionais — continuação",
    body: [
      `CLÁUSULA ${index + 1}ª – Conteúdo jurídico da página ${index + 1} para o curso Técnico em Enfermagem.`,
      "",
      "PARÁGRAFO 1º - O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA.",
    ].join("\n"),
    footer: index === 6
      ? "Japoatã/SE, 09/08/2026.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________"
      : null,
  }));

  const document = await createContratosAlunoPdf([fixture]);
  assert.ok(document.blob.size > 1_000);
  if (process.env.CANONICAL_CONTRACT_SEVEN_PAGE_OUTPUT) {
    await writeFile(
      process.env.CANONICAL_CONTRACT_SEVEN_PAGE_OUTPUT,
      new Uint8Array(await document.blob.arrayBuffer()),
    );
  }
});

test("marca do contrato respeita a escala congelada e ocupa a A4 em 100%", async () => {
  assert.deepEqual(getContractWatermarkGeometry(100), {
    scale: 100,
    x: 0,
    y: 0,
    width: 210,
    height: 297,
  });
  assert.deepEqual(getContractWatermarkGeometry(50), {
    scale: 50,
    x: 52.5,
    y: 74.25,
    width: 105,
    height: 148.5,
  });

  const frameDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABjCAMAAAARkYYzAAAACVBMVEX////tHE4AGjMFrW9BAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAUklEQVRYhe3QoQGAAAzAsG3/H80DVGEQyQEVnbu7+WR3d2ReedO8ad40b5o3zZvmTfOmedO8ad40b5o3zZvmTfOmedO8ad40b5o3zZvmTfvfmwcHuwSltX1/5wAAAABJRU5ErkJggg==";

  const fixture = contractFixture();
  fixture.validationCode = null;
  if (!fixture.renderPayload?.rendered) throw new Error("Fixture inválida.");
  fixture.renderPayload.rendered.qr = {
    enabled: false,
    label: null,
    validityLabel: null,
  };
  fixture.renderPayload.rendered.watermark = {
    enabled: true,
    label: "UNIVERSO",
    imageUrl: frameDataUrl,
    opacity: 1,
    scale: 100,
    rotate: false,
  };

  const document = await createContratosAlunoPdf([fixture]);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());
  const source = new TextDecoder("latin1").decode(bytes);
  assert.match(source, /\/Subtype \/Image/);
  assert.ok(document.blob.size > 1_000);

  if (process.env.CANONICAL_CONTRACT_BACKGROUND_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CANONICAL_CONTRACT_BACKGROUND_FIXTURE_OUTPUT,
      bytes,
    );
  }
});

test("encerramento da minuta separa assinaturas e testemunhas em duas colunas", () => {
  const layout = parseContratoAlunoClosingLayout(
    "Japoatã/SE, 07/08/2026.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________\n\nTestemunhas: ____________________________\n____________________________",
  );

  assert.equal(layout.fallbackText, null);
  assert.equal(layout.location, "Japoatã/SE, 07/08/2026.");
  assert.deepEqual(layout.parties.map((party) => party.label), [
    "CONTRATANTE",
    "CONTRATADA",
  ]);
  assert.deepEqual(layout.parties.map((party) => party.value), ["", ""]);
  assert.deepEqual(layout.witnesses.map((witness) => witness.label), [
    "TESTEMUNHA 1",
    "TESTEMUNHA 2",
  ]);
  assert.deepEqual(layout.witnesses.map((witness) => witness.value), ["", ""]);
});

test("carteirinhas geram PDF nativo com folhas físicas frente e verso", async () => {
  const document = await createCarteirinhasPreceptorPdf([
    preceptorFixture("1"),
    preceptorFixture("2"),
  ]);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());

  assert.equal(document.fileName, "carteirinhas-preceptor-lote-2.pdf");
  assert.match(new TextDecoder("latin1").decode(bytes.slice(0, 8)), /^%PDF-/);
  assert.ok(document.blob.size > 1_000);

  if (process.env.CANONICAL_PRECEPTOR_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.CANONICAL_PRECEPTOR_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test("preview oficial recebe um Blob PDF nativo, sem conversor de página em canvas", async () => {
  const [modal, contractPdf, preceptorPdf] = await Promise.all([
    readFile(
      new URL("./CanonicalDocumentPreviewModal.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../contratos-aluno/contratos-aluno.pdf.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../carteirinhas-preceptor/carteirinhas-preceptor.pdf.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(modal, /<iframe/);
  assert.match(modal, /createPdfRef\.current\(currentItems/);
  assert.match(modal, /createPortal\(modal, document\.body\)/);
  assert.match(modal, /id="canonical-document-preview-modal"/);
  assert.doesNotMatch(
    modal,
    /dom-to-selectable-pdf|createSelectablePdfBuilder|html2canvas/,
  );
  assert.doesNotMatch(
    contractPdf,
    /html2canvas|createElement\('canvas'\)|toDataURL\(/,
  );
  assert.doesNotMatch(
    preceptorPdf,
    /html2canvas|createElement\('canvas'\)|toDataURL\(/,
  );
  assert.match(contractPdf, /contrato-qr-\$\{document\.emissionId\}/);
  assert.match(contractPdf, /visualPageIndex === visual\.pages\.length - 1/);
  assert.match(contractPdf, /visualPageIndex === 0/);
  assert.match(contractPdf, /const shouldDrawAccent = presentationMode !== "V3"[\s\S]*?presentationMode === "LEGACY" \|\| isFirstPage/u);
  assert.match(contractPdf, /const hasClosing = isFinalPage/);
  assert.match(contractPdf, /drawContractClosing/);
  assert.match(contractPdf, /const CLOSING_TOP = 210/);
  assert.match(contractPdf, /drawCanonicalInstitutionalHeader/);
  assert.match(contractPdf, /drawContractInstitutionalHeaderLegacy/);
  assert.match(contractPdf, /drawContractWatermarkLegacy/);
  assert.match(contractPdf, /x: 25/);
  assert.match(contractPdf, /y: 62/);
  assert.match(contractPdf, /width: 160/);
  assert.match(contractPdf, /height: 172/);
  assert.match(contractPdf, /rotate: 35/);
  assert.doesNotMatch(contractPdf, /drawContractInstitutionalHeaderV2/);
  assert.match(contractPdf, /resolveContractPresentationMode/);
  assert.match(contractPdf, /watermark\.rotate \? -45 : 0/);
  assert.match(contractPdf, /normalizeContractSectionHeader\(page\.header/);
  assert.doesNotMatch(contractPdf, /showLegalName/);
  assert.match(contractPdf, /drawCanonicalPdfText\(pdf, sectionHeader/);
  assert.match(contractPdf, /resolveCanonicalPdfPhoto/);
  assert.doesNotMatch(contractPdf, /align: 'justify'/);
  assert.match(preceptorPdf, /preceptor-qr-\$\{card\.source\.emissionId\}/);
  assert.match(preceptorPdf, /CARDS_PER_SHEET = 10/);
});
