-- Migração: Seed do Curso Técnico em Enfermagem e Grade Curricular
-- Autor: Antigravity

-- 1. Inserir ou atualizar o Curso de Técnico em Enfermagem
INSERT INTO public.cursos (id, nome, modalidade, carga_horaria, status, area, descricao, versao, duracao_meses, publicar_site)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'Técnico em Enfermagem',
  'TECNICO',
  1800,
  'ativo',
  'Saúde',
  'Formação completa para atuação na promoção, prevenção, recuperação e reabilitação da saúde, com sólida base teórica, prática e estágio supervisionado.',
  '1.0',
  24,
  true
) ON CONFLICT (id) DO UPDATE SET
  carga_horaria = 1800,
  area = 'Saúde',
  duracao_meses = 24,
  publicar_site = true;

-- 2. Inserir Módulos, Disciplinas e Aulas associados
DO $$
DECLARE
  v_curso_id UUID := 'c0000000-0000-0000-0000-000000000001';
  v_mod1_id UUID;
  v_mod2_id UUID;
  v_mod3_id UUID;
  v_disc_id UUID;
BEGIN
  -- Limpar módulos existentes para este curso para garantir preenchimento sem duplicidade
  DELETE FROM public.modulos WHERE curso_id = v_curso_id;
    
  -- ==========================================
  -- MÓDULO I - AMBIENTAÇÃO PROFISSIONAL (Carga Horária: 270h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO I - AMBIENTAÇÃO PROFISSIONAL')
  RETURNING id INTO v_mod1_id;

  -- Relações Humanas no Trabalho
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Relações Humanas no Trabalho', 20, 'Estudo das relações interpessoais, ética no trabalho e postura profissional em equipe de saúde.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Informática Básica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Informática Básica', 30, 'Introdução ao uso de computadores, prontuário eletrônico e sistemas hospitalares.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 10);

  -- História da Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'História da Enfermagem', 30, 'Evolução histórica da profissão, marcos da enfermagem moderna e Florence Nightingale.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 30);

  -- Anatomia e Fisiologia Humana
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Anatomia e Fisiologia Humana', 80, 'Estudo dos sistemas do corpo humano, seus órgãos, funções e correlações anatômicas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 60),
    (v_disc_id, 'Aulas Práticas', 20);

  -- Princípios de Nutrição e Dietética
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Princípios de Nutrição e Dietética', 30, 'Fundamentos da nutrição humana, tipos de dietas hospitalares e cuidados alimentares.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 30);

  -- Microbiologia, Parasitologia e Patologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Microbiologia, Parasitologia e Patologia', 40, 'Morfologia de microorganismos, agentes infecciosos e noções de patologia básica.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 10);

  -- Noções de Primeiros Socorros
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod1_id, 'Noções de Primeiros Socorros', 40, 'Atendimento emergencial de primeiros socorros, suporte básico de vida e traumas.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 10);


  -- ==========================================
  -- MÓDULO II - INTRODUÇÃO ÀS ESPECIALIDADES TÉCNICAS EM ENFERMAGEM (Carga Horária: 1000h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO II - INTRODUÇÃO ÀS ESPECIALIDADES TÉCNICAS EM ENFERMAGEM')
  RETURNING id INTO v_mod2_id;

  -- Psicologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Psicologia', 20, 'Aspectos psicológicos do paciente hospitalizado, acolhimento e luto.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Ética Profissional e Legislação em Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Ética Profissional e Legislação em Enfermagem', 20, 'Código de ética dos profissionais de enfermagem, COFEN/COREN e legislação aplicada.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Fundamentos da Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Fundamentos da Enfermagem', 210, 'Teorias do cuidado, técnicas básicas de assistência, verificação de sinais vitais e estágio de fundamentos.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 80),
    (v_disc_id, 'Aulas Práticas', 40),
    (v_disc_id, 'Estágio Supervisionado', 90);

  -- Técnicas Básicas
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Técnicas Básicas', 40, 'Procedimentos fundamentais de auxílio ao paciente (higienização, transporte, leito).')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 40);

  -- Teoria do Cuidado
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Teoria do Cuidado', 20, 'Estudo das principais teorias científicas de enfermagem e sistematização do cuidado.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 20);

  -- Princípios de Farmacologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Princípios de Farmacologia', 50, 'Cálculo de medicação, diluição, vias de administração de medicamentos e farmacocinética.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES (v_disc_id, 'Aulas Teóricas', 50);

  -- Enfermagem Médica
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem Médica', 110, 'Assistência a pacientes acometidos por afecções clínicas e crônicas e estágio clínico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 10),
    (v_disc_id, 'Estágio Supervisionado', 60);

  -- Enfermagem Cirúrgica e em Centro Cirúrgico
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem Cirúrgica e em Centro Cirúrgico', 110, 'Cuidados pré, trans e pós-operatórios, instrumentação cirúrgica, CME e estágio cirúrgico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 50);

  -- Enfermagem em Saúde Mental
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Saúde Mental', 60, 'Transtornos psiquiátricos, reforma psiquiátrica, assistência humanizada e estágio em saúde mental.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Estágio Supervisionado', 30);

  -- Enfermagem em Saúde Coletiva
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Saúde Coletiva', 90, 'Ações preventivas no SUS, imunização, vigilância epidemiológica e estágio em saúde pública.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 10),
    (v_disc_id, 'Estágio Supervisionado', 40);

  -- Assistência à Saúde do Idoso
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Assistência à Saúde do Idoso', 60, 'Aspectos do envelhecimento, patologias geriátricas e estágio geriátrico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Estágio Supervisionado', 30);

  -- Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia', 130, 'Assistência pré-natal, parto, puerpério, cuidados ao recém-nascido e estágio obstétrico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 50),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 60);

  -- Enfermagem em Urgência e Emergência
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod2_id, 'Enfermagem em Urgência e Emergência', 80, 'Protocolos de urgência e emergência (SAMU, pronto-socorro) e estágio correlacionado.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 10),
    (v_disc_id, 'Estágio Supervisionado', 40);


  -- ==========================================
  -- MÓDULO III - GERENCIAMENTO DE ENFERMAGEM (Carga Horária: 530h)
  -- ==========================================
  INSERT INTO public.modulos (curso_id, nome)
  VALUES (v_curso_id, 'MÓDULO III - GERENCIAMENTO DE ENFERMAGEM')
  RETURNING id INTO v_mod3_id;

  -- Administração em Enfermagem
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Administração em Enfermagem', 120, 'Gerenciamento de equipes, dimensionamento de pessoal de enfermagem, liderança e estágio gerencial.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 30),
    (v_disc_id, 'Estágio Supervisionado', 60);

  -- Técnicas no Controle de Infecção Hospitalar
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Técnicas no Controle de Infecção Hospitalar', 30, 'Medidas de prevenção da infecção hospitalar, CCIH e higienização.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 10);

  -- Técnicas Especializadas em Enfermagem a Pacientes na UTI
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Técnicas Especializadas em Enfermagem a Pacientes na UTI', 90, 'Cuidados a pacientes críticos na unidade de terapia intensiva e estágio em UTI.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 40);

  -- Humanização da Assistência
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Humanização da Assistência', 30, 'Políticas de humanização da assistência ao paciente e familiares na saúde pública e privada.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 10);

  -- Enfermagem em Saúde da Criança e do Adolescente
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Enfermagem em Saúde da Criança e do Adolescente', 110, 'Pediatria e hebiatria, crescimento e desenvolvimento, patologias comuns e estágio pediátrico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 40),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 50);

  -- Assistência de Enfermagem em Oncologia
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Assistência de Enfermagem em Oncologia', 100, 'Cuidados paliativos, quimioterapia, radioterapia e estágio oncológico.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 30),
    (v_disc_id, 'Aulas Práticas', 20),
    (v_disc_id, 'Estágio Supervisionado', 50);

  -- Projeto Cientifico em Enfermagem - PCE
  INSERT INTO public.disciplinas (modulo_id, nome, carga_horaria, descricao)
  VALUES (v_mod3_id, 'Projeto Cientifico em Enfermagem - PCE', 50, 'Elaboração e apresentação de projeto científico e pesquisa acadêmica de conclusão.')
  RETURNING id INTO v_disc_id;
  INSERT INTO public.aulas (disciplina_id, titulo, carga_horaria)
  VALUES 
    (v_disc_id, 'Aulas Teóricas', 20),
    (v_disc_id, 'Aulas Práticas', 30);

END $$;
