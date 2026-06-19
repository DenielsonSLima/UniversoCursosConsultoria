-- Migração: Seed do Curso Técnico em Segurança do Trabalho e Grade Curricular
-- Autor: Antigravity

-- 1. Inserir ou atualizar o Curso de Técnico em Segurança do Trabalho com o ID existente
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria, status, area, descricao, versao, duracao_meses, publicar_site)
VALUES (
  '706a6e63-e204-4be4-80b7-29ae864ac841',
  'Técnico em Segurança do Trabalho',
  'TECNICO',
  1280,
  'ativo',
  'Gestão',
  'Formação voltada para a identificação, avaliação e controle dos riscos ocupacionais, visando a integridade física e a saúde do trabalhador no ambiente corporativo.',
  '1.0',
  24,
  true
) ON CONFLICT (id) DO UPDATE SET
  carga_horaria = 1280,
  area = 'Gestão',
  duracao_meses = 24,
  publicar_site = true,
  descricao = 'Formação voltada para a identificação, avaliação e controle dos riscos ocupacionais, visando a integridade física e a saúde do trabalhador no ambiente corporativo.';

-- 2. Inserir Módulos, Disciplinas e Aulas associados
DO $$
DECLARE
  v_curso_id UUID := '706a6e63-e204-4be4-80b7-29ae864ac841';
  v_mod1_id UUID;
  v_mod2_id UUID;
  v_mod3_id UUID;
  v_mod4_id UUID;
  v_disc_id UUID;
BEGIN
  -- Se já existirem módulos cadastrados para este curso, nós limpamos antes de reinserir (garantindo o preenchimento correto)
  DELETE FROM public.modulos WHERE curso_id = v_curso_id;
    
  -- ==========================================
  -- MÓDULO BÁSICO (Carga Horária: 360h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO BÁSICO')
  RETURNING id INTO v_mod1_id;

  -- Redação Oficial
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Redação Oficial', 60, 'Estudo e aplicação das normas e padrões de comunicação escrita oficial.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- Informática básica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Informática básica', 40, 'Fundamentos de informática, sistemas operacionais e ferramentas de escritório.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 10),
    (v_disc_id, 'Aulas Práticas', 30);

  -- Psicologia Aplicada a segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Psicologia Aplicada a segurança do trabalho', 40, 'Comportamento humano, percepção de risco e relações interpessoais no trabalho.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Normas técnicas aplicadas a segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Normas técnicas aplicadas a segurança do trabalho', 80, 'Estudo detalhado das Normas Regulamentadoras (NRs) e legislação de SST.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 80);

  -- Princípio de segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Princípio de segurança do trabalho', 40, 'Conceitos básicos de acidentes, doenças profissionais e prevenção.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Técnicas de treinamento
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Técnicas de treinamento', 40, 'Planejamento e didática para realização de palestras, DDS e treinamentos de segurança.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Metodologia do ensino
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Metodologia do ensino', 20, 'Fundamentos teóricos e práticos do processo ensino-aprendizagem.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Inglês Técnico
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Inglês Técnico', 40, 'Leitura e interpretação de manuais e documentações técnicas em inglês.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);


  -- ==========================================
  -- MÓDULO II - AUXILIAR DE SEGURANÇA DO TRABALHO (Carga Horária: 320h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO II - AUXILIAR DE SEGURANÇA DO TRABALHO')
  RETURNING id INTO v_mod2_id;

  -- Ergonomia Aplicada a segurança do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Ergonomia Aplicada a segurança do Trabalho', 40, 'Conceitos de ergonomia física, cognitiva e organizacional no ambiente laboral.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Prevenção e controle de riscos em maquinas e equipamentos
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Prevenção e controle de riscos em maquinas e equipamentos', 40, 'Proteção de máquinas, ferramentas e conformidade com a NR-12.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 32),
    (v_disc_id, 'Aulas Práticas', 8);

  -- Proteção Contra Incêndio e Explosões
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Proteção Contra Incêndio e Explosões', 60, 'Sistemas de prevenção, combate a incêndio, rota de fuga e saídas de emergência.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Análise e Gerenciamento de Riscos (Ajustado de "Análise & Guernica de Riscos")
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Análise e Gerenciamento de Riscos', 80, 'Técnicas de análise de riscos (APR, HAZOP, Árvore de Falhas) e gerenciamento preventivo.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Computação Gráfica Aplicada
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Computação Gráfica Aplicada', 40, 'Desenho técnico e representação de plantas e layouts através de softwares CAD.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Segurança na construção civil
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Segurança na construção civil', 60, 'Prevenção de acidentes e normas de segurança em canteiros de obras (NR-18).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);


  -- ==========================================
  -- MÓDULO III – MÓDULO ESPECÍFICO (Carga Horária: 320h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO III – MÓDULO ESPECÍFICO')
  RETURNING id INTO v_mod3_id;

  -- Técnicas de uso em equipamentos de medição
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Técnicas de uso em equipamentos de medição', 60, 'Operação e calibração de instrumentos de avaliação ambiental (decibelímetro, dosímetro, termômetro, etc.).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Educação Ambiental
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Educação Ambiental', 40, 'Sustentabilidade, gestão de resíduos e responsabilidade ambiental nas empresas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Doenças Ocupacionais
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Doenças Ocupacionais', 60, 'Estudo das patologias relacionadas ao trabalho e medidas de nexo causal.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- Primeiros Socorros
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Primeiros Socorros', 60, 'Procedimentos básicos de atendimento emergencial em casos de acidentes ou mal súbito.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Higiene do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Higiene do Trabalho', 60, 'Reconhecimento, avaliação e controle de riscos físicos, químicos e biológicos.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- TCC I
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'TCC I', 40, 'Introdução ao desenvolvimento do projeto de conclusão de curso.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Desenvolvimento do Trabalho de Conclusão de Curso I', 40);


  -- ==========================================
  -- MÓDULO IV – FORMAÇÃO TÉCNICA (Carga Horária: 280h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO IV – FORMAÇÃO TÉCNICA')
  RETURNING id INTO v_mod4_id;

  -- Legislação Aplicada a Segurança do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Legislação Aplicada a Segurança do Trabalho', 60, 'Direito do Trabalho, Previdenciário e responsabilidade civil/criminal em acidentes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 60);

  -- EPI & EPC
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'EPI & EPC', 40, 'Gestão de Equipamentos de Proteção Individual e Coletiva (seleção, treinamento e fiscalização).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Estatística aplicada a Segurança do Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Estatística aplicada a Segurança do Trabalho', 40, 'Cálculo de taxas de frequência, gravidade e estatísticas de acidentes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Administração e Organização do Trabalho (Ajustado de "Administração e Urbanização do Trabalho")
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Administração e Organização do Trabalho', 40, 'Teoria geral da administração e métodos de organização do trabalho aplicados à segurança.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Programas de segurança do trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Programas de segurança do trabalho', 60, 'Elaboração e gestão de PGR, PCMSO, LTCAT e outros programas obrigatórios.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- TCC II
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'TCC II', 40, 'Finalização e apresentação do trabalho de conclusão de curso.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Desenvolvimento do Trabalho de Conclusão de Curso II', 40);

END $$;
