CREATE TABLE IF NOT EXISTS public.site_publico_ticker_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL CHECK (categoria IN ('motivacional', 'reflexao')),
  texto text NOT NULL CHECK (char_length(btrim(texto)) BETWEEN 8 AND 240),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_publico_ticker_mensagens_public
  ON public.site_publico_ticker_mensagens (ativo, categoria, ordem, created_at);

ALTER TABLE public.site_publico_ticker_mensagens ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.site_publico_ticker_mensagens TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.site_publico_ticker_mensagens TO authenticated;

DROP POLICY IF EXISTS "site_publico_ticker_mensagens_public_select" ON public.site_publico_ticker_mensagens;
DROP POLICY IF EXISTS "site_publico_ticker_mensagens_gestor_select" ON public.site_publico_ticker_mensagens;
DROP POLICY IF EXISTS "site_publico_ticker_mensagens_gestor_insert" ON public.site_publico_ticker_mensagens;
DROP POLICY IF EXISTS "site_publico_ticker_mensagens_gestor_update" ON public.site_publico_ticker_mensagens;
DROP POLICY IF EXISTS "site_publico_ticker_mensagens_gestor_delete" ON public.site_publico_ticker_mensagens;

CREATE POLICY "site_publico_ticker_mensagens_public_select"
  ON public.site_publico_ticker_mensagens
  FOR SELECT
  TO anon
  USING (ativo = true);

CREATE POLICY "site_publico_ticker_mensagens_gestor_select"
  ON public.site_publico_ticker_mensagens
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

CREATE POLICY "site_publico_ticker_mensagens_gestor_insert"
  ON public.site_publico_ticker_mensagens
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor());

CREATE POLICY "site_publico_ticker_mensagens_gestor_update"
  ON public.site_publico_ticker_mensagens
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "site_publico_ticker_mensagens_gestor_delete"
  ON public.site_publico_ticker_mensagens
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

INSERT INTO public.site_publico_ticker_mensagens (categoria, texto, ordem)
VALUES
  ('motivacional', 'A oportunidade cresce com preparo, organização e propósito.', 10),
  ('motivacional', 'Cada novo começo abre espaço para uma versão mais forte de você.', 20),
  ('motivacional', 'Conhecimento aplicado transforma planos em resultados reais.', 30),
  ('motivacional', 'Quem estuda hoje constrói mais opções para amanhã.', 40),
  ('motivacional', 'Disciplina diária é o caminho silencioso das grandes conquistas.', 50),
  ('motivacional', 'O mercado valoriza quem decide continuar aprendendo.', 60),
  ('motivacional', 'Um passo bem feito todos os dias muda a direção de uma vida.', 70),
  ('motivacional', 'Preparação não é espera: é movimento com intenção.', 80),
  ('motivacional', 'A coragem de começar costuma ser o primeiro certificado da jornada.', 90),
  ('motivacional', 'Sua qualificação é uma ponte entre esforço e oportunidade.', 100),
  ('motivacional', 'Aprender é investir em uma liberdade que ninguém tira.', 110),
  ('motivacional', 'O futuro favorece quem se prepara antes da chance aparecer.', 120),
  ('motivacional', 'Crescer exige constância, e constância começa com uma escolha.', 130),
  ('motivacional', 'Uma habilidade nova pode abrir portas que antes pareciam distantes.', 140),
  ('motivacional', 'O conhecimento certo no momento certo muda trajetórias.', 150),
  ('motivacional', 'Hoje é um bom dia para avançar, mesmo que seja um pouco.', 160),
  ('motivacional', 'A excelência nasce quando prática e propósito caminham juntos.', 170),
  ('motivacional', 'Você não precisa esperar estar pronto para começar a evoluir.', 180),
  ('motivacional', 'Formação profissional é coragem organizada em forma de futuro.', 190),
  ('motivacional', 'Quem aprende com seriedade trabalha com mais segurança.', 200),
  ('reflexao', 'Toda conquista importante começa antes de ser visível para os outros.', 210),
  ('reflexao', 'O tempo dedicado ao aprendizado nunca volta vazio.', 220),
  ('reflexao', 'Pequenos avanços consistentes vencem grandes promessas adiadas.', 230),
  ('reflexao', 'Escolher aprender é escolher participar ativamente do próprio futuro.', 240),
  ('reflexao', 'A pressa quer resultado; o preparo constrói permanência.', 250),
  ('reflexao', 'Quem entende seu propósito encontra força até nos dias comuns.', 260),
  ('reflexao', 'A mudança começa quando a decisão fica maior que a desculpa.', 270),
  ('reflexao', 'O melhor investimento é aquele que melhora quem você se torna.', 280),
  ('reflexao', 'Toda profissão ganha valor quando encontra responsabilidade e cuidado.', 290),
  ('reflexao', 'Aprender também é reconhecer que sempre existe um próximo nível.', 300),
  ('reflexao', 'A vida responde melhor a quem une sonho, técnica e atitude.', 310),
  ('reflexao', 'O começo pode ser simples; o compromisso é que torna grande.', 320),
  ('reflexao', 'Nem todo progresso faz barulho, mas todo progresso deixa marcas.', 330),
  ('reflexao', 'O conhecimento ilumina escolhas e encurta caminhos difíceis.', 340),
  ('reflexao', 'Quando o preparo encontra a oportunidade, a confiança aparece.', 350),
  ('reflexao', 'A reflexão organiza a mente para que a ação tenha direção.', 360),
  ('reflexao', 'Quem cuida do próprio desenvolvimento amplia o próprio horizonte.', 370),
  ('reflexao', 'Grandes viradas costumam nascer de decisões discretas.', 380),
  ('reflexao', 'O aprendizado de hoje pode ser a segurança profissional de amanhã.', 390),
  ('reflexao', 'Não subestime o poder de recomeçar com mais consciência.', 400)
ON CONFLICT DO NOTHING;

UPDATE public.documentos_templates
SET conteudo = conteudo || '{"automaticCategory": "all"}'::jsonb,
    updated_at = now()
WHERE id = 'site_publico_ticker_config'
  AND NOT (conteudo ? 'automaticCategory');
