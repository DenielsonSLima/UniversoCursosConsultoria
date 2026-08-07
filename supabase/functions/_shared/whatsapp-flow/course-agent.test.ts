import {
  courseAgentModalityForChoice,
  courseAgentModalityFromText,
  formatCourseDetails,
  formatPublicCourseList,
  rankGuidedCourses,
  selectCourseAgentAnswer,
} from "./course-agent.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("prefere curso quando a correspondencia nominal e claramente superior", () => {
  const answer = selectCourseAgentAnswer(
    [{
      faq_id: "faq",
      question: "Qual o valor do curso?",
      answer: "Consulte o valor publicado.",
      category: "valor",
      confidence: 0.62,
    }],
    [{
      course_id: "curso",
      course_name: "Técnico em Enfermagem",
      confidence: 0.91,
    }],
    0.3,
  );
  assert(answer?.kind === "course", "deveria escolher o curso encontrado");
});

Deno.test("nao responde quando a confianca esta abaixo do limite", () => {
  const answer = selectCourseAgentAnswer(
    [{
      faq_id: "faq",
      question: "Documentos",
      answer: "Resposta",
      category: "documentos",
      confidence: 0.19,
    }],
    [],
    0.3,
  );
  assert(answer === null, "resposta insegura precisa ir para esclarecimento");
});

Deno.test("nao usa FAQ de um curso quando outro curso foi identificado", () => {
  const answer = selectCourseAgentAnswer(
    [{
      faq_id: "faq-enfermagem",
      curso_id: "enfermagem",
      question: "Qual o valor?",
      answer: "Resposta específica de Enfermagem",
      category: "valor",
      confidence: 0.95,
    }],
    [{
      course_id: "radiologia",
      course_name: "Técnico em Radiologia",
      confidence: 0.9,
    }],
    0.3,
  );
  assert(answer?.kind === "course", "FAQ de Enfermagem não pode responder Radiologia");
});

Deno.test("nao usa FAQ vinculada ao segundo candidato do catalogo", () => {
  const answer = selectCourseAgentAnswer(
    [{
      faq_id: "faq-enfermagem",
      curso_id: "enfermagem",
      question: "Qual o valor?",
      answer: "Resposta específica de Enfermagem",
      category: "valor",
      confidence: 0.8,
    }],
    [
      {
        course_id: "radiologia",
        course_name: "Técnico em Radiologia",
        confidence: 0.85,
      },
      {
        course_id: "enfermagem",
        course_name: "Técnico em Enfermagem",
        confidence: 0.31,
      },
    ],
    0.3,
  );
  assert(
    answer?.kind === "course" && answer.match.course_id === "radiologia",
    "FAQ do candidato secundário não pode vencer o curso principal",
  );
});

Deno.test("detalhe do curso respeita configuracao de preco e turmas", () => {
  const message = formatCourseDetails({
    course_id: "curso",
    course_name: "Técnico em Enfermagem",
    modality: "TECNICO",
    course_price: 199,
    confidence: 1,
    public_classes: [{ city: "Japoatã", shift: "NOITE" }],
  }, {
    enabled: true,
    confidenceThreshold: 0.3,
    maxClarifications: 1,
    showPrices: false,
    showOpenClasses: false,
    greetingMessage: "Olá",
    fallbackMessage: "Detalhe",
    handoffMessage: "Comercial",
  });
  assert(!message.includes("R$"), "preco nao pode aparecer quando desativado");
  assert(!message.includes("Japoatã"), "turma nao pode aparecer quando desativada");
});

Deno.test("lista publica nao inventa cursos quando a categoria esta vazia", () => {
  const message = formatPublicCourseList([], 3);
  assert(message.includes("não há"), "deve explicar que nao ha curso publicado");
});

Deno.test("identifica modalidade por numero e por texto natural", () => {
  assert(
    courseAgentModalityForChoice(4) === "especializacao",
    "opcao 4 deve selecionar especializacao",
  );
  assert(
    courseAgentModalityFromText("quero um curso técnico") === "tecnico",
    "deve reconhecer modalidade tecnica no texto",
  );
  assert(
    courseAgentModalityFromText("procuro pós-graduação") === "especializacao",
    "deve reconhecer pos-graduacao no texto",
  );
});

Deno.test("busca guiada limita resultados e prioriza area de interesse", () => {
  const courses = Array.from({ length: 12 }, (_, index) => ({
    id: `curso-${index}`,
    nome: index === 0 ? "Cuidador de Idosos" : `Curso Saúde ${index}`,
    modalidade: "EAD",
    area: index === 0 ? "Saúde" : "Saúde e Bem-estar",
    descricao: "Formação profissional na área da saúde",
    carga_horaria: 80,
    valor: 99.9,
  }));
  const result = rankGuidedCourses(courses, "curso_livre", "saúde", 5);
  assert(result.length === 5, "nunca deve listar mais que cinco cursos");
  assert(
    result.every((course) => course.area.toLocaleLowerCase("pt-BR").includes("saúde")),
    "resultados precisam corresponder à área informada",
  );
});

Deno.test("graduacao EAD exclui oferta superior que nao seja cem por cento online", () => {
  const result = rankGuidedCourses([
    {
      id: "ead",
      nome: "Administração",
      modalidade: "SUPERIOR",
      area: "Gestão | 100% Online",
    },
    {
      id: "presencial",
      nome: "Administração Presencial",
      modalidade: "SUPERIOR",
      area: "Gestão | Presencial",
    },
  ], "graduacao_ead", "administração", 5);
  assert(result.length === 1, "deve manter somente a graduação 100% online");
  assert(result[0].id === "ead", "deve retornar a oferta EAD");
});
