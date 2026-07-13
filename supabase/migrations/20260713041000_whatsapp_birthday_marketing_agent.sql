CREATE TABLE IF NOT EXISTS public.whatsapp_birthday_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_time TIME NOT NULL DEFAULT '09:00',
  modalities TEXT[] NOT NULL DEFAULT ARRAY['TECNICO', 'EAD', 'LIVRES', 'ESPECIALIZACAO'],
  enrollment_statuses TEXT[] NOT NULL DEFAULT ARRAY['ATIVO'],
  school_name TEXT NOT NULL DEFAULT 'Universo Cursos',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_birthday_settings_singleton CHECK (id = true)
);

INSERT INTO public.whatsapp_birthday_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_birthday_message_bank (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tone TEXT NOT NULL DEFAULT 'calorosa',
  gender_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (gender_scope IN ('all', 'feminino', 'masculino', 'neutro')),
  content TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_birthday_message_content
  ON public.whatsapp_birthday_message_bank (content);

WITH openers AS (
  SELECT text, ord FROM unnest(ARRAY[
    '{{nome}}, feliz aniversario!',
    'Feliz aniversario, {{nome}}!',
    '{{nome}}, hoje e seu dia!',
    'Parabens pelo seu dia, {{nome}}!',
    '{{nome}}, que alegria celebrar sua vida!',
    'Hoje a Universo Cursos lembra de voce, {{nome}}!',
    '{{nome}}, receba nosso carinho neste aniversario!',
    'Feliz novo ciclo, {{nome}}!',
    '{{nome}}, que seu dia seja muito especial!',
    'Parabens, {{nome}}!'
  ]) WITH ORDINALITY AS item(text, ord)
),
wishes AS (
  SELECT text, ord FROM unnest(ARRAY[
    'Desejamos saude, paz e muitas conquistas em sua caminhada.',
    'Que este novo ciclo traga aprendizado, oportunidades e bons encontros.',
    'Que voce tenha um dia leve, feliz e cheio de boas noticias.',
    'Que seus projetos avancem com tranquilidade e confianca.',
    'Que nao faltem motivos para sorrir e seguir em frente.',
    'Que sua jornada seja marcada por crescimento e realizacoes.',
    'Que este ano venha com energia boa e novos objetivos alcancados.',
    'Que voce se sinta valorizado por tudo que ja construiu.',
    'Que a vida retribua sua dedicacao com muitas vitorias.',
    'Que este aniversario renove seus sonhos e sua coragem.'
  ]) WITH ORDINALITY AS item(text, ord)
),
closings AS (
  SELECT text, ord FROM unnest(ARRAY[
    'Com carinho, {{escola}}.',
    'Um abraco da equipe {{escola}}.',
    'Conte sempre com a {{escola}}.',
    'A equipe {{escola}} deseja um excelente dia.',
    'Receba os parabens de toda a equipe {{escola}}.',
    'Que seja um dia bonito para voce. {{escola}}.',
    'Seguimos torcendo pelo seu sucesso. {{escola}}.',
    'Parabens pelo seu dia. {{escola}}.',
    'Nossa equipe celebra com voce. {{escola}}.',
    'Com nossos melhores votos, {{escola}}.'
  ]) WITH ORDINALITY AS item(text, ord)
),
messages AS (
  SELECT
    'calorosa' AS tone,
    'all' AS gender_scope,
    concat(o.text, ' ', w.text, ' ', c.text) AS content,
    row_number() OVER (ORDER BY o.ord, w.ord, c.ord) AS rn
  FROM openers o
  CROSS JOIN wishes w
  CROSS JOIN closings c
)
INSERT INTO public.whatsapp_birthday_message_bank (tone, gender_scope, content)
SELECT tone, gender_scope, content
FROM messages
WHERE rn <= 300
ON CONFLICT (content) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_birthday_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  message_bank_id INTEGER REFERENCES public.whatsapp_birthday_message_bank(id) ON DELETE SET NULL,
  birthday_date DATE NOT NULL,
  target_phone TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'error', 'skipped')),
  meta_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, birthday_date)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_birthday_deliveries_date
  ON public.whatsapp_birthday_deliveries (birthday_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_birthday_deliveries_aluno
  ON public.whatsapp_birthday_deliveries (aluno_id, birthday_date DESC);

CREATE OR REPLACE FUNCTION public.whatsapp_digits(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_text, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_birthday_monthly_projection(
  p_year INTEGER DEFAULT extract(year FROM current_date)::INTEGER
)
RETURNS TABLE (
  month_num INTEGER,
  month_label TEXT,
  recipients_count BIGINT,
  estimated_cost NUMERIC,
  currency TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH cfg AS (
    SELECT
      ARRAY(SELECT upper(item) FROM unnest(coalesce(modalities, ARRAY[]::text[])) AS item) AS modalities,
      ARRAY(SELECT upper(item) FROM unnest(coalesce(enrollment_statuses, ARRAY[]::text[])) AS item) AS statuses
    FROM public.whatsapp_birthday_settings
    WHERE id = true
  ),
  rate AS (
    SELECT coalesce(marketing_rate, 0.34) AS unit_price, coalesce(currency, 'BRL') AS currency
    FROM public.whatsapp_billing_settings
    WHERE id = true
  ),
  months AS (
    SELECT generate_series(1, 12)::INTEGER AS month_num
  ),
  eligible AS (
    SELECT DISTINCT p.id, extract(month FROM p.data_nascimento)::INTEGER AS birth_month
    FROM public.parceiros p
    CROSS JOIN cfg
    WHERE p.tipo = 'Aluno'
      AND coalesce(upper(p.status), 'ATIVO') = 'ATIVO'
      AND p.data_nascimento IS NOT NULL
      AND length(public.whatsapp_digits(p.telefone)) BETWEEN 10 AND 15
      AND EXISTS (
        SELECT 1
        FROM public.matriculas m
        JOIN public.turmas t ON t.id = m.turma_id
        JOIN public.cursos c ON c.id = t.curso_id
        WHERE m.aluno_id = p.id
          AND upper(m.status) = ANY(cfg.statuses)
          AND upper(c.modalidade) = ANY(cfg.modalities)
      )
  )
  SELECT
    m.month_num,
    (ARRAY['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[m.month_num],
    count(e.id)::BIGINT,
    round(count(e.id)::NUMERIC * (SELECT unit_price FROM rate), 2),
    (SELECT currency FROM rate)
  FROM months m
  LEFT JOIN eligible e ON e.birth_month = m.month_num
  GROUP BY m.month_num
  ORDER BY m.month_num;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_birthday_due_messages(
  p_target_date DATE DEFAULT current_date,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  aluno_id UUID,
  nome TEXT,
  nome_tratamento TEXT,
  telefone TEXT,
  sexo TEXT,
  curso_nome TEXT,
  modalidade TEXT,
  message_bank_id INTEGER,
  message_content TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH cfg AS (
    SELECT
      enabled,
      school_name,
      ARRAY(SELECT upper(item) FROM unnest(coalesce(modalities, ARRAY[]::text[])) AS item) AS modalities,
      ARRAY(SELECT upper(item) FROM unnest(coalesce(enrollment_statuses, ARRAY[]::text[])) AS item) AS statuses
    FROM public.whatsapp_birthday_settings
    WHERE id = true
  ),
  base AS (
    SELECT DISTINCT ON (p.id)
      p.id AS aluno_id,
      p.nome,
      coalesce(nullif(trim(p.nome_social), ''), p.nome) AS nome_tratamento,
      CASE
        WHEN public.whatsapp_digits(p.telefone) LIKE '55%' THEN public.whatsapp_digits(p.telefone)
        ELSE '55' || public.whatsapp_digits(p.telefone)
      END AS telefone,
      coalesce(p.sexo, '') AS sexo,
      c.nome AS curso_nome,
      c.modalidade,
      cfg.school_name,
      CASE
        WHEN upper(coalesce(p.sexo, '')) LIKE 'F%' THEN 'feminino'
        WHEN upper(coalesce(p.sexo, '')) LIKE 'M%' THEN 'masculino'
        ELSE 'neutro'
      END AS gender_scope
    FROM public.parceiros p
    CROSS JOIN cfg
    JOIN public.matriculas m ON m.aluno_id = p.id
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE cfg.enabled = true
      AND p.tipo = 'Aluno'
      AND coalesce(upper(p.status), 'ATIVO') = 'ATIVO'
      AND p.data_nascimento IS NOT NULL
      AND extract(month FROM p.data_nascimento) = extract(month FROM p_target_date)
      AND extract(day FROM p.data_nascimento) = extract(day FROM p_target_date)
      AND length(public.whatsapp_digits(p.telefone)) BETWEEN 10 AND 15
      AND upper(m.status) = ANY(cfg.statuses)
      AND upper(c.modalidade) = ANY(cfg.modalities)
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_birthday_deliveries d
        WHERE d.aluno_id = p.id
          AND d.birthday_date = p_target_date
          AND d.status IN ('processing', 'sent')
      )
    ORDER BY p.id, CASE WHEN upper(m.status) = 'ATIVO' THEN 0 ELSE 1 END, m.data_matricula DESC NULLS LAST
  )
  SELECT
    b.aluno_id,
    b.nome,
    b.nome_tratamento,
    b.telefone,
    b.sexo,
    b.curso_nome,
    b.modalidade,
    chosen.id,
    replace(
      replace(chosen.content, '{{nome}}', b.nome_tratamento),
      '{{escola}}', b.school_name
    ) AS message_content
  FROM base b
  JOIN LATERAL (
    SELECT id, content
    FROM (
      SELECT
        mb.id,
        mb.content,
        row_number() OVER (ORDER BY mb.id) AS rn,
        count(*) OVER () AS total_rows
      FROM public.whatsapp_birthday_message_bank mb
      WHERE mb.active = true
        AND mb.gender_scope IN ('all', b.gender_scope)
    ) ranked
    WHERE rn = (('x' || substr(md5(b.aluno_id::TEXT || p_target_date::TEXT), 1, 8))::bit(32)::bigint % total_rows) + 1
  ) chosen ON true
  LIMIT greatest(p_limit, 1);
$$;

ALTER TABLE public.whatsapp_birthday_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_birthday_message_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_birthday_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_whatsapp_birthday_settings_gestor" ON public.whatsapp_birthday_settings;
CREATE POLICY "portal_whatsapp_birthday_settings_gestor"
  ON public.whatsapp_birthday_settings FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_birthday_bank_gestor_read" ON public.whatsapp_birthday_message_bank;
CREATE POLICY "portal_whatsapp_birthday_bank_gestor_read"
  ON public.whatsapp_birthday_message_bank FOR SELECT TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_birthday_deliveries_gestor_read" ON public.whatsapp_birthday_deliveries;
CREATE POLICY "portal_whatsapp_birthday_deliveries_gestor_read"
  ON public.whatsapp_birthday_deliveries FOR SELECT TO authenticated
  USING (public.is_gestor());

REVOKE ALL ON public.whatsapp_birthday_settings FROM anon;
REVOKE ALL ON public.whatsapp_birthday_message_bank FROM anon;
REVOKE ALL ON public.whatsapp_birthday_deliveries FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_birthday_settings TO authenticated, service_role;
GRANT SELECT ON public.whatsapp_birthday_message_bank TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_birthday_message_bank TO service_role;
GRANT SELECT ON public.whatsapp_birthday_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_birthday_deliveries TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_birthday_monthly_projection(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_birthday_due_messages(DATE, INTEGER) TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_birthday_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
