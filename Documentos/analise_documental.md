# Análise Documental e Planejamento de Requisitos
**Universo Cursos e Consultoria**

Este documento apresenta a análise dos modelos de documentos físicos/manuais atualmente utilizados pela instituição e define quais novos documentos, regras e informações devem ser solicitados para garantir que o desenvolvimento do sistema seja o mais assertivo possível.

---

## 1. Análise dos Documentos Existentes

Identificamos 4 arquivos principais de modelo em Word (`.docx`) na pasta de documentos. A seguir está o mapeamento detalhado de cada um deles, os campos de dados necessários e as regras de negócio implícitas.

### A. Diário de Classe (`DIÁRIO.docx`)
Este documento é utilizado pelos professores para controle de presença e notas de cada disciplina (Unidade Educacional).
*   **Dados Identificados:**
    *   Identificação: Nome do Curso (ex: Técnico em Enfermagem), Módulo (ex: I), Área Temática, Unidade Educacional (Disciplina), Turma, Nome do Professor.
    *   Frequência: Lista de alunos, colunas de dias/meses para marcação de presença/falta, total de faltas, aulas previstas e aulas dadas.
    *   Rendimento Escolar: Notas dos "Instrumentos Avaliativos" (múltiplas avaliações), Média Parcial, nota de Recuperação (REC), Média Final, número total de faltas, porcentagem de faltas (%) e Resultado Final (Aprovado/Reprovado).
    *   Assinaturas: Professor e Coordenador do Curso.
*   **Implicações para o Sistema:**
    *   O sistema precisa de um módulo para o **Professor** lançar a frequência diária (por data) e as notas.
    *   Cálculo automático de porcentagem de faltas: `(Faltas / Aulas Dadas) * 100`.
    *   Regra de média e recuperação: Precisamos saber qual é a média mínima (ex: 6.0 ou 7.0) e como a nota de Recuperação (REC) é combinada com a Média Parcial (se substitui a nota mais baixa, se faz média aritmética, etc.).

### B. Histórico Escolar (`HISTÓRICO- JAPOATÃ.docx`)
Este é o registro consolidado da vida acadêmica do aluno, emitido após a conclusão do curso ou para fins de transferência.
*   **Dados Identificados:**
    *   Dados da Instituição: Resoluções de credenciamento (Resolução Nº 318/CEE de 14/09/2017) e autorização (Resolução Nº 319/CEE de 14/09/2017), Parecer CEE Nº 458.
    *   Dados Pessoais do Aluno: Matrícula, Nome, Sexo, Data de Nascimento, Naturalidade, Nacionalidade, Nome do Pai, Nome da Mãe, RG (Órgão Expedidor/Estado), CPF, Título de Eleitor (Zona/Seção), Certificado Militar (para homens).
    *   Dados de Conclusão do Ensino Médio: Nome da Escola de origem, Ano de conclusão.
    *   Matriz Curricular (Exemplo de Técnico em Enfermagem):
        *   **Módulo I**: Relações Humanas, Informática Básica, História da Enfermagem, Anatomia e Fisiologia Humana, Nutrição, Microbiologia/Patologia, Primeiros Socorros.
        *   **Módulo II**: Psicologia, Ética/Legislação, Fundamentos de Enfermagem, Técnicas Básicas, Teoria do Cuidado, Farmacologia, Enfermagem Médica, Cirúrgica, Saúde Mental, Saúde Coletiva, Idoso, Mulher/Obstetrícia, Urgência/Emergência.
        *   **Módulo III**: Administração em Enfermagem, Controle de Infecção, UTI, Humanização, Saúde da Criança/Adolescente, Oncologia, Projeto Científico (PCE).
    *   Carga Horária detalhada por disciplina dividida em: Teoria (T), Prática (P), Estágio (E) e total.
    *   Registro de Notas, Frequência e Situação (Aprovada/Reprovada).
    *   Perfil Profissional de Conclusão (competências do egresso descritas na segunda página).
*   **Implicações para o Sistema:**
    *   Cadastro detalhado do Aluno com todos os dados pessoais e acadêmicos de origem (Ensino Médio).
    *   Cadastro de Matrizes Curriculares flexíveis (permitindo definir a CH de Teoria, Prática e Estágio por disciplina).
    *   Geração automatizada de PDF formatado para impressão seguindo fielmente este layout de histórico.

### C. Diploma (`DIPLOMA -JAPOATÃ.docx`)
Documento oficial de certificação profissional do aluno.
*   **Dados Identificados:**
    *   Frente: Dados da instituição, portarias, Nome do Aluno, Nacionalidade, Naturalidade, Data de Nascimento, RG, Data de Conclusão do Curso, Eixo Tecnológico (Ambiente e Saúde).
    *   Verso: Nome do Aluno, dados de validação do SISTEC (Validação do SISTEC: ____), Livro de Registro, Página, Número do Diploma, dados do Ensino Médio, assinaturas da Secretária Escolar (Juliana Rebeka de Lima e Silva) e Diretora Geral (Ladja Maria de Lima Silva), além de espaço para o registro profissional (ex: COREN, etc.).
*   **Implicações para o Sistema:**
    *   Mecanismo de controle e registro de Diplomas (número, livro, folha, código SISTEC).
    *   Geração automatizada do arquivo de impressão do Diploma (frente e verso), garantindo o alinhamento exato para impressão no papel moeda ou papel especial da instituição.

### D. Instrumentos Avaliativos de Estágio (`Instrumentos Avaliativos Estágio.docx`)
Fichas de avaliação do aluno durante o estágio supervisionado em ambiente hospitalar/clínico.
*   **Dados Identificados:**
    *   Avaliação de Comportamento (Peso Máximo: 2,0): Assiduidade, Aparência, Iniciativa, Interesse, Responsabilidade, Sociabilidade, Espírito de Equipe, Equilíbrio Emocional, Ética, Aceitação ao Ensino.
    *   Avaliação de Desempenho nos Registros (Peso Máximo: 2,0): Prescrições, Registro de Enfermagem, Conhecimento Científico.
    *   Avaliação de Desempenho Técnico (Peso Máximo: 6,0): Destreza, Eficiência, Material Estéril, Economia, Organização, Teoria/Prática, Técnicas, Cuidados, Medicação, Passagem de Plantão.
    *   Checklist de Procedimentos Práticos por Unidade Curricular (ex: Fundamentos, Enfermagem Médica): Lista de procedimentos que o aluno deve cumprir no estágio, onde o instrutor marca se o aluno **A** (Ajudou), **E** (Executou) ou **O** (Observou) em cada data.
*   **Implicações para o Sistema:**
    *   **Módulo do Professor/Instrutor de Estágio**: Interface específica para avaliar os alunos nos critérios quantitativos (comportamento, técnica) e marcar o checklist de procedimentos diários.
    *   **Módulo do Aluno**: Acompanhamento do progresso das suas horas de estágio e dos procedimentos executados.

---

## 2. O Que Solicitar à Instituição (Lista de Pedidos)

Para que o sistema seja desenvolvido de forma 100% aderente à operação real da Universo Cursos e Consultoria, você deve solicitar os seguintes documentos e definições à instituição:

### 📑 1. Grades Curriculares (Matrizes Curriculares) de TODOS os Cursos Ativos
*   **Por que solicitar?** Atualmente, só temos a grade de "Técnico em Enfermagem" (do Histórico). Se a instituição oferece outros cursos (como Técnico em Radiologia, Técnico em Estética, Especializações, Cursos Livres, etc.), precisamos das matrizes curriculares completas de todos eles.
*   **O que deve conter:**
    *   Nome exato do curso.
    *   Lista de disciplinas/unidades curriculares divididas por Módulo/Semestre.
    *   Carga horária teórica, prática e de estágio para cada disciplina.
    *   Eixo tecnológico de cada curso.

### 📋 2. Regimento Acadêmico (Regras de Negócio de Notas e Frequências)
*   **Por que solicitar?** O sistema precisa calcular as aprovações de forma automática, e para isso as regras de cálculo devem estar programadas.
*   **Perguntas a serem respondidas pela instituição:**
    1.  **Qual a Média de Aprovação?** (ex: 6.0, 7.0?)
    2.  **Qual a Frequência Mínima para Aprovação?** (ex: 75% de presença?)
    3.  **Como funciona a Recuperação (REC)?** A nota da recuperação substitui a média final se for maior? Ela faz média aritmética simples com a média parcial? Existe uma nota mínima para ter direito à recuperação?
    4.  **Como é calculada a nota final quando há estágio?** A nota do estágio (dos Instrumentos Avaliativos) compõe a média de alguma disciplina específica ou é lançada como uma disciplina separada no histórico?

### 👥 3. Fichas de Cadastro e Requisitos de Matrícula (Alunos e Professores)
*   **Por que solicitar?** Precisamos saber exatamente quais campos de dados coletar nas telas de cadastro de alunos e professores, e quais arquivos de documento (upload) são obrigatórios na matrícula.
*   **O que solicitar:**
    *   Lista de documentos exigidos dos alunos (ex: Cópia do RG, CPF, Certificado de Ensino Médio, Comprovante de Residência, Foto 3x4).
    *   Modelo de Ficha de Matrícula ou Contrato de Prestação de Serviços Educacionais (para extrair os termos legais e cláusulas financeiras).

### 🏥 4. Modelo de Cadastro de Campos de Estágio e Convênios
*   **Por que solicitar?** Para o módulo de estágio, o sistema precisará gerenciar onde os alunos estão estagiando.
*   **O que solicitar:**
    *   Lista de informações necessárias para cadastrar um hospital/clínica parceira (Razão Social, CNPJ, Endereço, Nome do Supervisor de Estágio local).
    *   Modelo do Termo de Compromisso de Estágio (TCE) que o aluno assina antes de iniciar.

### 💳 5. Regras Financeiras e Cobrança
*   **Por que solicitar?** O sistema possui integração financeira (Asaas). Precisamos saber como as cobranças de mensalidades e taxas devem ser geradas.
*   **O que solicitar:**
    *   Regras de vencimento padrão (ex: todo dia 10).
    *   Política de descontos (ex: desconto de pontualidade).
    *   Regra para juros e multa por atraso (ex: 2% de multa + 1% de juros ao mês).
    *   Taxas extras cobradas pela secretaria (ex: taxa para emissão de 2ª via de histórico, declarações, diploma).

---

## 3. Mapeamento de Funcionalidades vs. Documentos

A tabela abaixo mostra como os documentos físicos analisados se transformarão em recursos de tela nos módulos do sistema:

| Documento Físico | Módulo do Sistema | Funcionalidade Digital |
| :--- | :--- | :--- |
| **Diário de Classe** | `gestor` / `professor` | Cadastro de turmas, diário digital de chamadas por data, lançamento de notas das avaliações e cálculo automático de médias/frequência. |
| **Histórico Escolar** | `gestor` / `aluno` | Visualização da ficha acadêmica, progresso do curso por módulo, e geração em PDF oficial do histórico assinado digitalmente. |
| **Diploma** | `gestor` | Livro de Registro de Diplomas digital, preenchimento de dados de conclusão (SISTEC, data), e exportação de PDF formatado para impressão. |
| **Instrumentos de Estágio**| `gestor` / `professor` / `aluno`| Cadastro de campos de estágio, checklist de competências/procedimentos realizados no hospital (A/E/O) via app do instrutor, e cálculo da nota de estágio. |

---

## 4. Próximos Passos Sugeridos para o Desenvolvedor

1.  **Apresentar este documento de requisitos à gestão** da Universo Cursos e Consultoria para colher as respostas das perguntas do item 2.
2.  **Desenhar a estrutura de tabelas do Banco de Dados (Supabase)** baseando-se nestes campos (tabela de matriculas, notas_diario, frequencia_diario, historico_escolar, registros_diploma, avaliacoes_estagio, checklist_estagio).
3.  **Configurar os templates de PDF** (usando bibliotecas como `react-to-print` ou geração no backend) para emitir os PDFs exatamente com o design institucional presente nos arquivos docx analisados.
