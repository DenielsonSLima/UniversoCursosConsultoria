-- Migração: Seed do Curso Técnico em Radiologia e Grade Curricular
-- Autor: Antigravity

-- 1. Inserir ou atualizar o Curso de Técnico em Radiologia
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria, status, area, descricao, versao, duracao_meses, publicar_site)
VALUES (
  'c0000000-0000-0000-0000-000000000002',
  'Técnico em Radiologia',
  'TECNICO',
  1620,
  'ativo',
  'Saúde',
  'Formação capacitada para realização de exames radiográficos convencionais e especiais, processamento de imagens químicas e digitais, tomografia computadorizada e ressonância magnética.',
  '1.0',
  24,
  true
) ON CONFLICT (id) DO UPDATE SET
  carga_horaria = 1620,
  area = 'Saúde',
  duracao_meses = 24,
  publicar_site = true;

-- 2. Inserir Módulos, Disciplinas e Aulas associados
DO $$
DECLARE
  v_curso_id UUID := 'c0000000-0000-0000-0000-000000000002';
  v_mod1_id UUID;
  v_mod2_id UUID;
  v_mod3_id UUID;
  v_mod4_id UUID;
  v_disc_id UUID;
BEGIN
  -- Limpar módulos existentes para este curso para garantir preenchimento sem duplicidade
  DELETE FROM public.modulos WHERE curso_id = v_curso_id;
    
  -- ==========================================
  -- MÓDULO I - FUNDAMENTOS DA SAÚDE (Carga Horária: 300h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO I - FUNDAMENTOS DA SAÚDE')
  RETURNING id INTO v_mod1_id;

  -- Psicologia das Relações Humanas
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Psicologia das Relações Humanas', 20, 'Estudo das dinâmicas interpessoais, ética e postura ética e profissional no acolhimento ao paciente.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Higiene, Profilaxia e Orientação para Autocuidado
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Higiene, Profilaxia e Orientação para Autocuidado', 60, 'Prevenção de doenças ocupacionais, higienização hospitalar e qualidade de vida.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Anatomia e Fisiologia Humana Aplicada à Radiologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Anatomia e Fisiologia Humana Aplicada à Radiologia', 80, 'Estudo completo da anatomia esquelética, órgãos e sistemas com foco na exatidão do posicionamento radiográfico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Promoções de Saúde e Segurança no Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Promoções de Saúde e Segurança no Trabalho', 40, 'Legislação trabalhista e medidas de proteção e bem-estar no ambiente laboral da radiologia.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Biossegurança nas Ações de Saúde
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Biossegurança nas Ações de Saúde', 60, 'Prevenção de infecções hospitalares, desinfecção de equipamentos e controle de contaminantes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Primeiros Socorros
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Primeiros Socorros', 40, 'Procedimentos imediatos e suporte básico de vida em situações emergenciais no ambiente de exames.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 20);


  -- ==========================================
  -- MÓDULO II - FUNDAMENTOS DA RADIOLOGIA (Carga Horária: 420h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO II - FUNDAMENTOS DA RADIOLOGIA')
  RETURNING id INTO v_mod2_id;

  -- História da Radiologia e Física das Radiações
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'História da Radiologia e Física das Radiações', 40, 'Evolução histórica do Raio-X e os princípios físicos da produção de radiação ionizante.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Legislação e Ética Profissional
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Legislação e Ética Profissional', 40, 'Códigos de conduta em radiologia, responsabilidade civil e regulação legal da profissão.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Fundamentos de Enfermagem Aplicados à Radiologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Fundamentos de Enfermagem Aplicados à Radiologia', 80, 'Cuidados de enfermagem básicos em ambientes radiológicos e auxílio a pacientes em exames.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Proteção Radiológica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Proteção Radiológica', 60, 'Estudo das normas CNEN e diretrizes protetivas contra radiação para profissionais e pacientes.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Estudo Radiológico das Doenças
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Estudo Radiológico das Doenças', 80, 'Identificação básica de manifestações patológicas nas imagens radiográficas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Estágio I
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Estágio I', 120, 'Prática profissional supervisionada em radiologia convencional de baixa complexidade.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Estágio Supervisionado', 120);


  -- ==========================================
  -- MÓDULO III - TÉCNICAS RADIOLÓGICAS (Carga Horária: 580h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO III - TÉCNICAS RADIOLÓGICAS')
  RETURNING id INTO v_mod3_id;

  -- Incidências Radiográficas Básicas
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Incidências Radiográficas Básicas', 120, 'Posicionamento radiográfico de rotina de membros, tronco e crânio.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 80),
    (v_disc_id, 'Aulas Práticas', 40);

  -- Processamento Químico de Filmes
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Processamento Químico de Filmes', 40, 'Funcionamento da câmara escura e revelação manual/automática em química analógica.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Processamento de Imagens Digitais
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Processamento de Imagens Digitais', 40, 'Tecnologias de radiologia digital CR e DR e manipulação eletrônica de contraste e brilho.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Exames Radiológicos com Contraste
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Exames Radiológicos com Contraste', 40, 'Aplicação clínica de contrastes iodados, baritados e reações adversas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Incidências Radiográficas Especiais
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Incidências Radiográficas Especiais', 80, 'Posicionamentos e angulações de alta complexidade e estudos complementares.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Mamografia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Mamografia', 40, 'Técnicas de compressão, incidências mamográficas e diagnóstico de mama.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Tomografia Computadorizada
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Tomografia Computadorizada', 40, 'Princípios físicos do tomógrafo, aquisição helicoidal e reconstruções 3D.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Estágio II
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Estágio II', 180, 'Prática profissional em exames contrastados e incidências especiais.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Estágio Supervisionado', 180);


  -- ==========================================
  -- MÓDULO IV - RADIOLOGIA AVANÇADA (Carga Horária: 320h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO IV - RADIOLOGIA AVANÇADA')
  RETURNING id INTO v_mod4_id;

  -- Informática Instrumental
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Informática Instrumental', 40, 'Uso de sistemas PACS, DICOM e ferramentas digitais básicas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 28),
    (v_disc_id, 'Aulas Práticas', 12);

  -- Gestão de Serviços Radiológicos
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Gestão de Serviços Radiológicos', 40, 'Administração, controle de insumos e fluxo de atendimento em clínicas e hospitais.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Ressonância Magnética
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Ressonância Magnética', 40, 'Princípios físicos do magnetismo nuclear, bobinas e aquisição de imagens por RM.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Radiologia Odontológica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Radiologia Odontológica', 40, 'Técnicas intrabucais (periapical) e extrabucais (panorâmica).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Noções de Medicina Nuclear
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Noções de Medicina Nuclear', 20, 'Uso de radiofármacos para fins de diagnósticos cintilográficos.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Noções de Radioterapia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Noções de Radioterapia', 20, 'Planejamento e administração de radiação terapêutica em oncologia.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Estágio III
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod4_id, 'Estágio III', 120, 'Prática profissional avançada em tomografia, ressonância ou odontológica.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Estágio Supervisionado', 120);

END $$;
