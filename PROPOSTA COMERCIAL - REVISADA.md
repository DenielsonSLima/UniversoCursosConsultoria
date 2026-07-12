# PROPOSTA COMERCIAL REVISADA
## Plataforma de Gestão Educacional e Operacional
## Cliente: Universo Cursos e Consultoria

### 1) Apresentação

A proposta é para uma plataforma de gestão educacional já estruturada por módulos, com operação contínua e foco em governança, controle e automação.  

Ela organiza a instituição em fluxos distintos de acesso:

- Portal público institucional (site e páginas de cursos).
- Área de validação pública de documentos.
- Portal interno para gestão (Gestor).
- Portal interno de operações acadêmicas (Professor).
- Portal interno do aluno (Aluno).

Em vez de um sistema isolado por área, o modelo atual unifica dados e decisões para reduzir retrabalho entre áreas administrativas, acadêmicas e financeiras.

---

### 2) O que o sistema já faz (organização real da operação)

O sistema está estruturado com módulos funcionais reais já previstos para operação diária:

#### 2.1 Portal público e serviços institucionais
- Página institucional com páginas de cursos e trilhas de entrada.
- Página de validação de documentos com checagem por código/QR para documentos acadêmicos e financeiros (carteira, matrícula, frequência, boletim, certificados, termos, transferências etc.).
- Autenticação para áreas internas da plataforma.

#### 2.2 Módulos do Gestor
- Dashboard gerencial e visão consolidada da operação.
- Gestão de cadastros:
  - alunos (responsáveis e dados complementares),
  - cursos por modalidade (EAD, técnico, livre, superior, especialização),
  - matrículas e ficha de matrícula,
  - parceiros, documentos e modelos.
- Gestão acadêmica:
  - turmas, cronogramas, coordenadores, disciplina e atribuição de aulas,
  - controle de notas e frequência conforme modalidade/fluxo,
  - estágios, certificados e emissão de documentos.
- Secretaria:
  - matrículas e rematrículas,
  - consultas de situação financeira por aluno,
  - emissão de declarações, boletins, certificados e histórico de documentos,
  - fluxos de matrícula, conclusão e documentação.
- Caixa e financeiro:
  - visão consolidada de recebimentos e pagamentos,
  - repasses e ajustes por tipo de operação,
  - controle de inadimplência e visão de fluxo.
- Relatórios:
  - relatórios de acadêmico, turmas, cursos, polos, financeiro, DRE/fluxo, inadimplência e indicadores de desempenho.
- Biblioteca institucional:
  - organização de materiais por área e polo,
  - permissões por vínculo e rastreabilidade de compartilhamento/acessos.
- Comunicação e configuração:
  - mensagens internas e canais de aviso,
  - parametrização de ambiente (empresas, polos, usuários, permissões, contas, regras, taxas, APIs, templates e monitoramento).

#### 2.3 Módulo do Professor
- Acesso às turmas sob responsabilidade.
- Gestão de rotina pedagógica:
  - diário de classe, aulas e planejamento,
  - lançamento de avaliações/notas e atividades.

#### 2.4 Módulo do Aluno
- Acesso às turmas e cursos em andamento.
- Acompanhamento de status de matrículas e documentos.
- Consulta de pagamentos, boletos/parcelas e histórico financeiro.
- Progresso acadêmico por módulo/curso (incluindo recursos específicos de EAD já estruturados).

#### 2.5 Organização por responsabilidade e unidade
- Acesso por perfil/permutações de permissão (controle por função).
- Escopo por polo para operações descentralizadas com governança central.
- Estrutura preparada para operação distribuída por unidades sem quebrar a visão consolidada.

#### 2.6 Proteção de risco corporativo (terceiros)

O contrato de desenvolvimento e operação da plataforma não inclui seguro como garantia de correção automática de bugs.
- Correções e estabilidade estão cobertas por SLA, suporte e evolução contratual.
- Há proposta de seguro de responsabilidade civil profissional (cotação de mercado) com prêmio total de **R$ 2.095,99** (LMI principal de **R$ 250.000,00**).
- Esse seguro cobre, de forma contratada, **indenizações por falha profissional e danos a terceiros** vinculados à atividade, incluindo cobertura de defesa/assistência jurídica conforme apólice (ex.: custos de defesa).
- Não cobre como “garantia técnica” do sistema: erros de programação, indisponibilidade e ajustes funcionais continuam sob responsabilidade do contrato de desenvolvimento/suporte.
- Em resumo: o seguro reduz risco financeiro de sinistro externo; o time da solução cobre prazo, correção e estabilidade operacional conforme SLA.
- **Exemplo prático de acionamento do seguro**: se por falha no sistema um aluno for cobrado valor incorreto e entrar com reclamação/ação por prejuízo financeiro, a responsabilidade pode ser tratada como sinistro da apólice de RC; a seguradora pode assumir defesa e eventual indenização dentro do limite contratual, enquanto a equipe corrige imediatamente o bug via atendimento técnico.

---

### 3) Pontos fortes de controle, governança e organização

1. **Controle por perfis e permissões**
   - Regras de acesso por módulo/funcionalidade para reduzir risco operacional.
2. **Separação de responsabilidade por papel**
   - Aluno, professor e gestor com fluxos e telas diferentes, sem misturar etapas críticas.
3. **Rastreabilidade das operações**
   - Telas e fluxos críticos passam por registros de ação e trilhas de auditoria (incluindo dados de emissão/alteração de documentos e operações sensíveis).
4. **Padronização administrativa**
   - Cadastros e rotinas unificados em módulos, reduzindo duplicidade de dados.
5. **Controle financeiro mais claro**
   - Separação de recebimentos, despesas, repasses e débitos com indicadores por período.
6. **Visão executiva por módulos**
- Relatórios padronizados com foco em decisão rápida da gestão.
7. **Governança da unidade**
   - Configuração de regras por polo/área e base única para auditoria de operação.
8. **Segurança operacional**
   - Estrutura de autenticação e controle de acesso já integrada ao ecossistema da plataforma.
9. **Responsabilidade contratual definida**
   - O contrato cobre implantação, evolução, suporte e melhoria contínua do sistema; riscos de responsabilidade civil externa são tratados por instrumento próprio da empresa.

---

### 4) Entrega e evolução da solução

Além da base já operacional, está previsto um ciclo contínuo de evolução com priorização por sprint mensal.

#### Entregas iniciais incluídas
- Parametrização completa de cadastros essenciais.
- Ativação dos fluxos de matriz acadêmico-financeira.
- Integração e estabilização inicial de emissão/validação/documentação.
- Treinamento por perfil de usuário (gestor, professor, aluno).

#### Entregas contínuas (durante contrato)
- Ajustes de telas e fluxos com base no uso real.
- Correções corretivas e preventivas.
- Melhoria progressiva de relatórios e automações.
- Ajustes de desempenho e experiência de uso.

---

### 5) Entregáveis fora do escopo inicial

Para manter previsibilidade, não entram neste escopo:
- Desenvolvimento de apps nativos (iOS/Android para loja pública).
- Implantação e operação de infraestrutura de terceiros não contratada.
- Integrações com ERPs de terceiros que não forem previamente definidos.
- Serviços legais, fiscais ou contábeis fora da plataforma.
- Campanhas comerciais externas de mídia e prospecção (quando não vinculadas à operação do sistema).

Integrações com gateway de pagamento, mensageria, serviços de emissão de boletos/PIX e eventuais APIs de vídeo/EAD externo serão tratadas conforme os contratos e regras do fornecedor vigente.

---

### 6) Modelo Comercial

#### 6.1 Investimento inicial
- Desenvolvimento e implantação inicial: **R$ 35.000,00**
- Benefício de parceria (24 meses): taxa de implantação e entrada concedidas como isenção inicial
- Entrada: **R$ 0,00**
- Taxa de implantação: **R$ 0,00**

#### 6.2 Mensalidade de operação
- Mensalidade: **R$ 2.500,00**
- Período: **24 meses**
- Vencimento inicial: **05/09/2026**
- Demais vencimentos: **todo dia 05** de cada mês

#### 6.3 Serviços de terceiros (custo adicional para cliente)
- Gateways de pagamento (ex.: emissão de boletos/PIX, taxa transacional).
- Serviços de mensageria (SMS/WhatsApp/e-mail).
- Armazenamento complementar ou serviços específicos externos.
- Infraestrutura complementar eventualmente necessária fora do escopo da plataforma.

#### 6.4 Infraestrutura e Banco de Dados (Supabase)

- O banco de dados principal da solução é **Supabase (PostgreSQL)**, com autenticação e serviços de dados centralizados na plataforma.
- A operação da proposta considera como base o **plano de referência de US$ 25,00/mês** do provedor, sujeito a revisão conforme o uso real do projeto e condições comerciais da Supabase no período.
- O contrato cobre a operação do sistema; já os custos de infraestrutura do Supabase entram como custo de terceiros e podem variar por consumo.
- Se o volume de dados, armazenamento, requisições ou conexões ultrapassar os limites do plano de referência, haverá:
  - aumento de custo do plano;
  - ou incidência de cobrança variável por consumo;
  - e eventual necessidade de upgrade de recursos.
- Em qualquer cenário de extrapolação, aplicaremos **cláusula de reajuste** com:
  - aviso prévio com a projeção de impacto,
  - apresentação da nova fatura estimada,
  - ajuste a partir da competência seguinte, sem surpresa para a gestão.

---

### 7) Níveis de suporte e rotina de atendimento

- Atendimento remoto prioritário por canal definido com a direção.
- Priorização por criticidade:
  - **demanda operacional corrente:** conforme backlog acordado;
  - **falha crítica:** resposta e contenção imediata.
- Ajustes e suporte presencial sob agendamento, com custo de deslocamento apenas em demandas fora de falha operacional do sistema e com aprovação prévia.

---

### 8) Cronograma de implantação

#### Fase 1 — Aterragem operacional (Semanas 1–2)
- Validação final dos fluxos por unidade.
- Definição de matriz de responsabilidade e prioridades.
- Ajustes de estrutura de usuários e polos.

#### Fase 2 — Ativação de base (Semanas 3–6)
- Configuração de cadastros e usuários.
- Ativação de financeiro, secretaria e gestão acadêmica.
- Validação de fluxo de emissão/validação de documentos.

#### Fase 3 — Homologação orientada a processo (Semanas 7–9)
- Testes com usuários-chave.
- Ajustes de processo de matrícula, notas, financeiro e comunicação.
- Treinamento de operação e rotinas administrativas.

#### Fase 4 — Entrada em produção (Semanas 10–12)
- Entrada escalonada em produção.
- Acompanhamento inicial de operação com correções rápidas.

#### Fase 5 — Evolução contínua (após implantação)
- Rotina mensal de evolução, estabilidade, segurança e performance.

---

### 9) Indicadores de sucesso

- Taxa de conclusão de matrícula em 1º contato.
- Percentual de inadimplência por curso/turma/polo.
- Tempo médio de resposta das rotinas críticas.
- Tempo entre abertura de demanda e correção.
- Índice de emissão documental correta sem retrabalho.
- Aderência de professores aos registros de sala/turma.
- Satisfação operacional interna por equipe.

---

### 10) Observações importantes

- O sistema já está estruturado com governança multi-portal e fluxos separados por papel.
- Algumas funções de EAD podem operar com conectores/serviços complementares conforme a arquitetura atual definida para cada curso/modalidade.
- Não será vendida funcionalidade fora da realidade implementada sem prévia revisão de escopo e termo adicional.
- Segurança da plataforma e seguro empresarial são camadas diferentes: o primeiro é governança tecnológica e operação; o segundo, gestão de risco jurídico/financeiro fora do escopo técnico contratado.

---

### 11) Próximos passos

1. Aprovação da versão revisada desta proposta.
2. Validação do escopo final em reunião com responsáveis administrativos, financeiro e pedagógico.
3. Protocolo de início.
4. Início da Fase 1 imediatamente após o protocolo de início.

**Universo Cursos e Consultoria**  
**Data base de referência: 10 de julho de 2026**
