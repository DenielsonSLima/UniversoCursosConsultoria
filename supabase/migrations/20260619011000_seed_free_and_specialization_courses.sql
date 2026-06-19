-- Cadastra dois cursos livres e duas especializações com grades completas.
-- A grade só é inicializada quando o curso ainda não possui módulos,
-- preservando ajustes manuais feitos posteriormente no portal.

CREATE OR REPLACE FUNCTION pg_temp.seed_catalog_course(
  p_course JSONB,
  p_modules JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_course_id UUID;
  v_module JSONB;
  v_module_id UUID;
  v_discipline JSONB;
  v_discipline_id UUID;
  v_lesson JSONB;
BEGIN
  SELECT id
    INTO v_course_id
  FROM public.cursos
  WHERE modalidade = p_course->>'modalidade'
    AND LOWER(nome) = LOWER(p_course->>'nome')
  ORDER BY created_at
  LIMIT 1;

  IF v_course_id IS NULL THEN
    INSERT INTO public.cursos (
      id,
      nome,
      modalidade,
      carga_horaria,
      status,
      area,
      descricao,
      versao,
      duracao_meses,
      publicar_site,
      imagem_url,
      imagem_detalhe_1,
      imagem_detalhe_2
    )
    VALUES (
      (p_course->>'id')::UUID,
      p_course->>'nome',
      p_course->>'modalidade',
      (p_course->>'carga_horaria')::INTEGER,
      'ativo',
      p_course->>'area',
      p_course->>'descricao',
      '1.0',
      (p_course->>'duracao_meses')::INTEGER,
      true,
      NULL,
      NULL,
      NULL
    )
    RETURNING id INTO v_course_id;
  ELSE
    UPDATE public.cursos
    SET
      nome = p_course->>'nome',
      carga_horaria = (p_course->>'carga_horaria')::INTEGER,
      status = 'ativo',
      area = p_course->>'area',
      descricao = p_course->>'descricao',
      versao = COALESCE(versao, '1.0'),
      duracao_meses = (p_course->>'duracao_meses')::INTEGER,
      publicar_site = true
    WHERE id = v_course_id;
  END IF;

  FOR v_module IN
    SELECT value
    FROM JSONB_ARRAY_ELEMENTS(p_modules)
  LOOP
    SELECT id
      INTO v_module_id
    FROM public.modulos
    WHERE curso_id = v_course_id
      AND LOWER(nome) = LOWER(v_module->>'nome')
    ORDER BY created_at
    LIMIT 1;

    IF v_module_id IS NULL THEN
      INSERT INTO public.modulos (curso_id, nome)
      VALUES (v_course_id, v_module->>'nome')
      RETURNING id INTO v_module_id;
    ELSE
      UPDATE public.modulos
      SET nome = v_module->>'nome'
      WHERE id = v_module_id;
    END IF;

    FOR v_discipline IN
      SELECT value
      FROM JSONB_ARRAY_ELEMENTS(v_module->'disciplinas')
    LOOP
      SELECT id
        INTO v_discipline_id
      FROM public.disciplinas
      WHERE modulo_id = v_module_id
        AND LOWER(nome) = LOWER(v_discipline->>'nome')
      ORDER BY created_at
      LIMIT 1;

      IF v_discipline_id IS NULL THEN
        INSERT INTO public.disciplinas (
          modulo_id,
          nome,
          carga_horaria,
          descricao
        )
        VALUES (
          v_module_id,
          v_discipline->>'nome',
          (v_discipline->>'carga_horaria')::INTEGER,
          COALESCE(v_discipline->>'descricao', '')
        )
        RETURNING id INTO v_discipline_id;
      ELSE
        UPDATE public.disciplinas
        SET
          nome = v_discipline->>'nome',
          carga_horaria = (v_discipline->>'carga_horaria')::INTEGER,
          descricao = COALESCE(v_discipline->>'descricao', '')
        WHERE id = v_discipline_id;
      END IF;

      FOR v_lesson IN
        SELECT value
        FROM JSONB_ARRAY_ELEMENTS(v_discipline->'aulas')
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.aulas
          WHERE disciplina_id = v_discipline_id
            AND LOWER(titulo) = LOWER(v_lesson->>'titulo')
        ) THEN
          INSERT INTO public.aulas (
            disciplina_id,
            titulo,
            carga_horaria
          )
          VALUES (
            v_discipline_id,
            v_lesson->>'titulo',
            (v_lesson->>'carga_horaria')::NUMERIC
          );
        ELSE
          UPDATE public.aulas
          SET carga_horaria = (v_lesson->>'carga_horaria')::NUMERIC
          WHERE disciplina_id = v_discipline_id
            AND LOWER(titulo) = LOWER(v_lesson->>'titulo');
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;

SELECT pg_temp.seed_catalog_course(
  '{
    "id": "d1000000-0000-0000-0000-000000000001",
    "nome": "Informática Básica",
    "modalidade": "LIVRE",
    "carga_horaria": 60,
    "area": "Tecnologia",
    "duracao_meses": 2,
    "descricao": "Capacitação prática para uso do computador, organização de arquivos, navegação segura na internet e produção de documentos, planilhas e apresentações."
  }'::JSONB,
  '[
    {
      "nome": "MÓDULO I - FUNDAMENTOS DE INFORMÁTICA",
      "disciplinas": [
        {
          "nome": "Introdução à Informática e ao Computador",
          "carga_horaria": 6,
          "descricao": "Componentes do computador, periféricos, conceitos de hardware, software e cuidados com os equipamentos.",
          "aulas": [
            {"titulo": "Hardware, software e periféricos", "carga_horaria": 3},
            {"titulo": "Uso responsável e cuidados com o computador", "carga_horaria": 3}
          ]
        },
        {
          "nome": "Sistema Operacional e Organização de Arquivos",
          "carga_horaria": 8,
          "descricao": "Área de trabalho, configurações, pastas, arquivos, armazenamento e operações básicas do sistema.",
          "aulas": [
            {"titulo": "Ambiente do sistema operacional", "carga_horaria": 4},
            {"titulo": "Pastas, arquivos e armazenamento", "carga_horaria": 4}
          ]
        },
        {
          "nome": "Internet, E-mail e Segurança Digital",
          "carga_horaria": 6,
          "descricao": "Navegação, pesquisa, comunicação por e-mail, privacidade, senhas e prevenção a golpes digitais.",
          "aulas": [
            {"titulo": "Navegação, pesquisa e correio eletrônico", "carga_horaria": 3},
            {"titulo": "Senhas, privacidade e prevenção a fraudes", "carga_horaria": 3}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO II - FERRAMENTAS DE PRODUTIVIDADE",
      "disciplinas": [
        {
          "nome": "Editor de Textos",
          "carga_horaria": 12,
          "descricao": "Criação, edição e formatação de documentos profissionais.",
          "aulas": [
            {"titulo": "Digitação, edição e formatação", "carga_horaria": 6},
            {"titulo": "Documentos, tabelas e impressão", "carga_horaria": 6}
          ]
        },
        {
          "nome": "Planilhas Eletrônicas",
          "carga_horaria": 14,
          "descricao": "Construção de planilhas, cálculos básicos, funções essenciais, filtros e gráficos.",
          "aulas": [
            {"titulo": "Células, fórmulas e funções básicas", "carga_horaria": 7},
            {"titulo": "Tabelas, filtros e gráficos", "carga_horaria": 7}
          ]
        },
        {
          "nome": "Apresentações Digitais",
          "carga_horaria": 8,
          "descricao": "Planejamento e criação de apresentações claras, organizadas e visualmente consistentes.",
          "aulas": [
            {"titulo": "Estrutura, texto e recursos visuais", "carga_horaria": 4},
            {"titulo": "Transições, apresentação e exportação", "carga_horaria": 4}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO III - PRÁTICA INTEGRADORA",
      "disciplinas": [
        {
          "nome": "Projeto Prático de Informática",
          "carga_horaria": 6,
          "descricao": "Aplicação integrada das ferramentas em uma atividade de rotina pessoal ou profissional.",
          "aulas": [
            {"titulo": "Planejamento e produção do projeto", "carga_horaria": 4},
            {"titulo": "Revisão, apresentação e avaliação", "carga_horaria": 2}
          ]
        }
      ]
    }
  ]'::JSONB
);

SELECT pg_temp.seed_catalog_course(
  '{
    "id": "d1000000-0000-0000-0000-000000000002",
    "nome": "Auxiliar Administrativo",
    "modalidade": "LIVRE",
    "carga_horaria": 80,
    "area": "Gestão",
    "duracao_meses": 2,
    "descricao": "Capacitação para apoio às rotinas administrativas, atendimento, organização documental, controles financeiros, estoque e uso de ferramentas digitais."
  }'::JSONB,
  '[
    {
      "nome": "MÓDULO I - AMBIENTE PROFISSIONAL",
      "disciplinas": [
        {
          "nome": "Comunicação Empresarial e Atendimento",
          "carga_horaria": 8,
          "descricao": "Comunicação oral e escrita, atendimento presencial e remoto e postura profissional.",
          "aulas": [
            {"titulo": "Comunicação no ambiente de trabalho", "carga_horaria": 4},
            {"titulo": "Atendimento ao cliente e resolução de demandas", "carga_horaria": 4}
          ]
        },
        {
          "nome": "Ética, Comportamento e Trabalho em Equipe",
          "carga_horaria": 4,
          "descricao": "Ética profissional, responsabilidade, colaboração e organização pessoal.",
          "aulas": [
            {"titulo": "Ética, postura e relações profissionais", "carga_horaria": 2},
            {"titulo": "Trabalho em equipe e gestão do tempo", "carga_horaria": 2}
          ]
        },
        {
          "nome": "Informática Aplicada ao Escritório",
          "carga_horaria": 8,
          "descricao": "Documentos, planilhas, e-mail, agenda e compartilhamento de arquivos aplicados à rotina administrativa.",
          "aulas": [
            {"titulo": "Documentos e comunicação digital", "carga_horaria": 4},
            {"titulo": "Planilhas e organização de informações", "carga_horaria": 4}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO II - ROTINAS ADMINISTRATIVAS",
      "disciplinas": [
        {
          "nome": "Documentação, Protocolo e Arquivo",
          "carga_horaria": 8,
          "descricao": "Produção, recebimento, classificação, arquivamento e controle de documentos.",
          "aulas": [
            {"titulo": "Documentos empresariais e protocolo", "carga_horaria": 4},
            {"titulo": "Métodos de arquivo e gestão documental", "carga_horaria": 4}
          ]
        },
        {
          "nome": "Rotinas Financeiras Básicas",
          "carga_horaria": 8,
          "descricao": "Contas a pagar e receber, fluxo de caixa, comprovantes e conciliação básica.",
          "aulas": [
            {"titulo": "Contas, documentos e controles financeiros", "carga_horaria": 4},
            {"titulo": "Fluxo de caixa e conferência de valores", "carga_horaria": 4}
          ]
        },
        {
          "nome": "Apoio às Rotinas de Recursos Humanos",
          "carga_horaria": 8,
          "descricao": "Noções de recrutamento, admissão, frequência, benefícios e organização de documentos funcionais.",
          "aulas": [
            {"titulo": "Recrutamento, admissão e documentação", "carga_horaria": 4},
            {"titulo": "Frequência, benefícios e atendimento interno", "carga_horaria": 4}
          ]
        },
        {
          "nome": "Compras, Estoque e Logística Básica",
          "carga_horaria": 8,
          "descricao": "Solicitações de compra, fornecedores, entrada e saída de materiais e inventário.",
          "aulas": [
            {"titulo": "Compras, cotações e fornecedores", "carga_horaria": 4},
            {"titulo": "Controle de estoque e inventário", "carga_horaria": 4}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO III - PRÁTICA ADMINISTRATIVA",
      "disciplinas": [
        {
          "nome": "Empreendedorismo e Organização de Pequenos Negócios",
          "carga_horaria": 8,
          "descricao": "Noções de modelo de negócio, custos, atendimento e organização operacional.",
          "aulas": [
            {"titulo": "Modelo de negócio e proposta de valor", "carga_horaria": 4},
            {"titulo": "Custos, atendimento e controles básicos", "carga_horaria": 4}
          ]
        },
        {
          "nome": "Projeto Integrador Administrativo",
          "carga_horaria": 20,
          "descricao": "Simulação integrada de atendimento, documentação, finanças, estoque e organização de escritório.",
          "aulas": [
            {"titulo": "Planejamento e execução da rotina simulada", "carga_horaria": 12},
            {"titulo": "Apresentação, revisão e avaliação do projeto", "carga_horaria": 8}
          ]
        }
      ]
    }
  ]'::JSONB
);

SELECT pg_temp.seed_catalog_course(
  '{
    "id": "e1000000-0000-0000-0000-000000000001",
    "nome": "Especialização em Enfermagem do Trabalho",
    "modalidade": "ESPECIALIZACAO",
    "carga_horaria": 360,
    "area": "Saúde",
    "duracao_meses": 12,
    "descricao": "Especialização voltada à promoção e vigilância da saúde do trabalhador, prevenção de riscos ocupacionais, assistência de enfermagem e gestão de programas de saúde ocupacional. Requisito: formação concluída em Enfermagem compatível com a habilitação pretendida."
  }'::JSONB,
  '[
    {
      "nome": "MÓDULO I - FUNDAMENTOS DA SAÚDE DO TRABALHADOR",
      "disciplinas": [
        {
          "nome": "Saúde do Trabalhador e Processo Saúde-Doença",
          "carga_horaria": 30,
          "descricao": "Evolução da saúde ocupacional, determinantes do processo saúde-doença e organização do cuidado ao trabalhador.",
          "aulas": [
            {"titulo": "Fundamentos e políticas de saúde do trabalhador", "carga_horaria": 15},
            {"titulo": "Processo de trabalho, saúde e adoecimento", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Legislação Trabalhista, Previdenciária e Ética",
          "carga_horaria": 30,
          "descricao": "Normas aplicáveis, responsabilidades profissionais, registros e princípios éticos da atuação em saúde ocupacional.",
          "aulas": [
            {"titulo": "Legislação e responsabilidades em saúde ocupacional", "carga_horaria": 15},
            {"titulo": "Ética, sigilo e documentação profissional", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO II - RISCOS E PREVENÇÃO",
      "disciplinas": [
        {
          "nome": "Riscos Ocupacionais e Prevenção de Acidentes",
          "carga_horaria": 30,
          "descricao": "Identificação de riscos físicos, químicos, biológicos, ergonômicos e de acidentes e planejamento preventivo.",
          "aulas": [
            {"titulo": "Classificação e reconhecimento de riscos", "carga_horaria": 15},
            {"titulo": "Medidas de prevenção e investigação de acidentes", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Higiene Ocupacional e Ergonomia",
          "carga_horaria": 30,
          "descricao": "Agentes ambientais, medidas de controle, ergonomia e adaptação das condições de trabalho.",
          "aulas": [
            {"titulo": "Higiene ocupacional e controle de exposições", "carga_horaria": 15},
            {"titulo": "Ergonomia e análise das atividades de trabalho", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO III - ASSISTÊNCIA DE ENFERMAGEM OCUPACIONAL",
      "disciplinas": [
        {
          "nome": "Doenças Relacionadas ao Trabalho",
          "carga_horaria": 30,
          "descricao": "Principais agravos ocupacionais, sinais de alerta, prevenção, acompanhamento e encaminhamento.",
          "aulas": [
            {"titulo": "Agravos físicos e biológicos relacionados ao trabalho", "carga_horaria": 15},
            {"titulo": "Saúde mental, prevenção e acompanhamento", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Urgência, Emergência e Primeiros Socorros no Trabalho",
          "carga_horaria": 30,
          "descricao": "Organização da resposta a emergências e assistência inicial em acidentes e intercorrências ocupacionais.",
          "aulas": [
            {"titulo": "Avaliação inicial e suporte básico", "carga_horaria": 15},
            {"titulo": "Protocolos de emergência no ambiente laboral", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO IV - VIGILÂNCIA E PROGRAMAS OCUPACIONAIS",
      "disciplinas": [
        {
          "nome": "Programas de Saúde Ocupacional",
          "carga_horaria": 30,
          "descricao": "Planejamento, integração e acompanhamento de programas de prevenção e monitoramento da saúde dos trabalhadores.",
          "aulas": [
            {"titulo": "Planejamento de programas e ações ocupacionais", "carga_horaria": 15},
            {"titulo": "Indicadores, acompanhamento e melhoria contínua", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Epidemiologia e Vigilância em Saúde do Trabalhador",
          "carga_horaria": 30,
          "descricao": "Coleta e interpretação de dados, indicadores, investigação e notificação de agravos relacionados ao trabalho.",
          "aulas": [
            {"titulo": "Epidemiologia e indicadores ocupacionais", "carga_horaria": 15},
            {"titulo": "Vigilância, investigação e notificação", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO V - GESTÃO E BIOSSEGURANÇA",
      "disciplinas": [
        {
          "nome": "Biossegurança e Controle de Infecções",
          "carga_horaria": 30,
          "descricao": "Precauções, imunização ocupacional, gerenciamento de exposições e controle de infecções.",
          "aulas": [
            {"titulo": "Precauções, imunização e exposição ocupacional", "carga_horaria": 15},
            {"titulo": "Controle de infecções e gerenciamento de resíduos", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Gestão do Serviço de Enfermagem do Trabalho",
          "carga_horaria": 30,
          "descricao": "Organização do serviço, dimensionamento, prontuários, auditoria, qualidade e comunicação interdisciplinar.",
          "aulas": [
            {"titulo": "Organização, registros e gestão da equipe", "carga_horaria": 15},
            {"titulo": "Qualidade, auditoria e atuação interdisciplinar", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO VI - EDUCAÇÃO E PROJETO INTEGRADOR",
      "disciplinas": [
        {
          "nome": "Educação em Saúde e Promoção da Qualidade de Vida",
          "carga_horaria": 30,
          "descricao": "Planejamento de campanhas, treinamentos, comunicação de riscos e ações de promoção da saúde.",
          "aulas": [
            {"titulo": "Educação em saúde e comunicação de riscos", "carga_horaria": 15},
            {"titulo": "Campanhas e programas de qualidade de vida", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Projeto Integrador em Enfermagem do Trabalho",
          "carga_horaria": 30,
          "descricao": "Diagnóstico de uma situação ocupacional e elaboração de proposta técnica de intervenção.",
          "aulas": [
            {"titulo": "Diagnóstico e planejamento da intervenção", "carga_horaria": 15},
            {"titulo": "Desenvolvimento, apresentação e avaliação", "carga_horaria": 15}
          ]
        }
      ]
    }
  ]'::JSONB
);

SELECT pg_temp.seed_catalog_course(
  '{
    "id": "e1000000-0000-0000-0000-000000000002",
    "nome": "Especialização em Educação Especial e Inclusiva",
    "modalidade": "ESPECIALIZACAO",
    "carga_horaria": 360,
    "area": "Educação",
    "duracao_meses": 12,
    "descricao": "Especialização para profissionais da educação interessados em práticas pedagógicas inclusivas, atendimento educacional especializado, acessibilidade, tecnologia assistiva e articulação entre escola, família e rede de apoio. Requisito: formação concluída na área de Educação ou área compatível."
  }'::JSONB,
  '[
    {
      "nome": "MÓDULO I - FUNDAMENTOS E POLÍTICAS DE INCLUSÃO",
      "disciplinas": [
        {
          "nome": "Fundamentos da Educação Especial e Inclusiva",
          "carga_horaria": 30,
          "descricao": "Concepções históricas, sociais e pedagógicas da deficiência, diversidade e inclusão escolar.",
          "aulas": [
            {"titulo": "História, conceitos e paradigmas da educação especial", "carga_horaria": 15},
            {"titulo": "Inclusão, diversidade e eliminação de barreiras", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Legislação e Políticas Educacionais Inclusivas",
          "carga_horaria": 30,
          "descricao": "Marcos legais, direitos educacionais, organização dos sistemas de ensino e responsabilidades institucionais.",
          "aulas": [
            {"titulo": "Direitos, legislação e políticas de inclusão", "carga_horaria": 15},
            {"titulo": "Organização escolar e garantia de acessibilidade", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO II - DESENVOLVIMENTO E APRENDIZAGEM",
      "disciplinas": [
        {
          "nome": "Desenvolvimento Humano e Processos de Aprendizagem",
          "carga_horaria": 30,
          "descricao": "Desenvolvimento cognitivo, afetivo, social e motor e suas relações com a aprendizagem.",
          "aulas": [
            {"titulo": "Desenvolvimento e aprendizagem ao longo da vida", "carga_horaria": 15},
            {"titulo": "Mediação pedagógica e potencialidades do estudante", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Neurodiversidade e Necessidades Educacionais Específicas",
          "carga_horaria": 30,
          "descricao": "Compreensão pedagógica da neurodiversidade, transtornos do desenvolvimento e dificuldades de aprendizagem.",
          "aulas": [
            {"titulo": "Neurodiversidade e transtornos do desenvolvimento", "carga_horaria": 15},
            {"titulo": "Dificuldades de aprendizagem e estratégias de apoio", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO III - PÚBLICO DA EDUCAÇÃO ESPECIAL",
      "disciplinas": [
        {
          "nome": "Deficiências Intelectual, Física e Múltipla",
          "carga_horaria": 30,
          "descricao": "Características, barreiras, recursos e estratégias pedagógicas para participação e aprendizagem.",
          "aulas": [
            {"titulo": "Deficiência intelectual e múltipla", "carga_horaria": 15},
            {"titulo": "Deficiência física, mobilidade e autonomia", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Deficiências Sensorial, TEA e Altas Habilidades",
          "carga_horaria": 30,
          "descricao": "Práticas pedagógicas para estudantes com deficiência visual, auditiva, TEA e altas habilidades ou superdotação.",
          "aulas": [
            {"titulo": "Deficiências visual e auditiva", "carga_horaria": 15},
            {"titulo": "TEA, altas habilidades e superdotação", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO IV - PRÁTICAS PEDAGÓGICAS ACESSÍVEIS",
      "disciplinas": [
        {
          "nome": "Currículo, Planejamento e Avaliação Inclusiva",
          "carga_horaria": 30,
          "descricao": "Flexibilização curricular, planejamento, avaliação formativa e desenho de experiências acessíveis.",
          "aulas": [
            {"titulo": "Planejamento e flexibilização curricular", "carga_horaria": 15},
            {"titulo": "Avaliação inclusiva e acompanhamento da aprendizagem", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Tecnologia Assistiva e Recursos de Acessibilidade",
          "carga_horaria": 30,
          "descricao": "Recursos de baixa e alta tecnologia, comunicação alternativa e materiais pedagógicos acessíveis.",
          "aulas": [
            {"titulo": "Tecnologia assistiva e comunicação alternativa", "carga_horaria": 15},
            {"titulo": "Produção e seleção de recursos acessíveis", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO V - ATENDIMENTO E REDE DE APOIO",
      "disciplinas": [
        {
          "nome": "Atendimento Educacional Especializado",
          "carga_horaria": 30,
          "descricao": "Funções do AEE, identificação de barreiras, plano de atendimento e articulação com a sala comum.",
          "aulas": [
            {"titulo": "Organização, objetivos e práticas do AEE", "carga_horaria": 15},
            {"titulo": "Plano de atendimento e articulação pedagógica", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Família, Escola e Trabalho Interdisciplinar",
          "carga_horaria": 30,
          "descricao": "Participação familiar, gestão inclusiva e articulação entre profissionais, serviços e comunidade.",
          "aulas": [
            {"titulo": "Relação família-escola e participação comunitária", "carga_horaria": 15},
            {"titulo": "Rede de apoio e trabalho interdisciplinar", "carga_horaria": 15}
          ]
        }
      ]
    },
    {
      "nome": "MÓDULO VI - PESQUISA E INTERVENÇÃO PEDAGÓGICA",
      "disciplinas": [
        {
          "nome": "Metodologia da Pesquisa em Educação",
          "carga_horaria": 30,
          "descricao": "Problematização da prática, métodos de investigação e elaboração de projetos educacionais.",
          "aulas": [
            {"titulo": "Pesquisa educacional e análise da prática", "carga_horaria": 15},
            {"titulo": "Elaboração de projeto e produção acadêmica", "carga_horaria": 15}
          ]
        },
        {
          "nome": "Projeto Integrador em Educação Inclusiva",
          "carga_horaria": 30,
          "descricao": "Diagnóstico de barreiras e desenvolvimento de proposta de intervenção inclusiva em contexto educacional.",
          "aulas": [
            {"titulo": "Diagnóstico e planejamento da intervenção", "carga_horaria": 15},
            {"titulo": "Desenvolvimento, apresentação e avaliação", "carga_horaria": 15}
          ]
        }
      ]
    }
  ]'::JSONB
);
