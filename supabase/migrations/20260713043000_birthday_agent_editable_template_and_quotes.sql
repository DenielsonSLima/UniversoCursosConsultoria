ALTER TABLE public.whatsapp_birthday_settings
  ADD COLUMN IF NOT EXISTS message_template TEXT NOT NULL DEFAULT 'Bom dia, {{nome}}! Neste dia especial, a família {{escola}} deseja um feliz aniversário, com muita saúde, paz, realizações e muitos motivos para sorrir.',
  ADD COLUMN IF NOT EXISTS quote_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.whatsapp_birthday_quote_bank (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_text TEXT NOT NULL,
  author TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_text, author)
);

INSERT INTO public.whatsapp_birthday_quote_bank (quote_text, author)
SELECT quote_text, author
FROM (VALUES
  ('A alegria evita mil males e prolonga a vida.', 'William Shakespeare'),
  ('A esperança é o sonho do homem acordado.', 'Aristóteles'),
  ('A vida é aquilo que acontece enquanto fazemos planos.', 'John Lennon'),
  ('Onde há vontade, há caminho.', 'Provérbio'),
  ('A persistência realiza o impossível.', 'Provérbio'),
  ('O começo é a parte mais importante do trabalho.', 'Platão'),
  ('A coragem é a primeira das qualidades humanas.', 'Aristóteles'),
  ('A felicidade depende de nós mesmos.', 'Aristóteles'),
  ('Cada dia é uma nova chance para recomeçar.', 'Pensamento popular'),
  ('Tudo vale a pena quando a alma não é pequena.', 'Fernando Pessoa'),
  ('O futuro pertence a quem acredita na beleza dos seus sonhos.', 'Eleanor Roosevelt'),
  ('A educação é a arma mais poderosa para mudar o mundo.', 'Nelson Mandela'),
  ('Aprender é a única coisa de que a mente nunca se cansa.', 'Leonardo da Vinci'),
  ('A simplicidade é o último grau de sofisticação.', 'Leonardo da Vinci'),
  ('Não espere por oportunidades. Crie-as.', 'Pensamento popular'),
  ('Grandes realizações começam com pequenos passos.', 'Pensamento popular'),
  ('O sucesso nasce do querer, da determinação e da persistência.', 'Pensamento popular'),
  ('Acredite que você pode, assim já está no meio do caminho.', 'Theodore Roosevelt'),
  ('Conhece-te a ti mesmo.', 'Sócrates'),
  ('A disciplina é a ponte entre metas e realizações.', 'Jim Rohn')
) AS q(quote_text, author)
ON CONFLICT (quote_text, author) DO NOTHING;

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
      message_template,
      quote_enabled,
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
      cfg.message_template,
      cfg.quote_enabled
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
    concat(
      replace(replace(b.message_template, '{{nome}}', b.nome_tratamento), '{{escola}}', b.school_name),
      CASE
        WHEN b.quote_enabled AND chosen.quote_text IS NOT NULL
          THEN E'\n\n"' || chosen.quote_text || '" - ' || chosen.author
        ELSE ''
      END
    ) AS message_content
  FROM base b
  LEFT JOIN LATERAL (
    SELECT id, quote_text, author
    FROM (
      SELECT
        qb.id,
        qb.quote_text,
        qb.author,
        row_number() OVER (ORDER BY qb.id) AS rn,
        count(*) OVER () AS total_rows
      FROM public.whatsapp_birthday_quote_bank qb
      WHERE qb.active = true
    ) ranked
    WHERE rn = (('x' || substr(md5(b.aluno_id::TEXT || p_target_date::TEXT), 1, 8))::bit(32)::bigint % total_rows) + 1
  ) chosen ON true
  LIMIT greatest(p_limit, 1);
$$;

ALTER TABLE public.whatsapp_birthday_quote_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_whatsapp_birthday_quotes_gestor_read" ON public.whatsapp_birthday_quote_bank;
CREATE POLICY "portal_whatsapp_birthday_quotes_gestor_read"
  ON public.whatsapp_birthday_quote_bank FOR SELECT TO authenticated
  USING (public.is_gestor());

REVOKE ALL ON public.whatsapp_birthday_quote_bank FROM anon;
GRANT SELECT ON public.whatsapp_birthday_quote_bank TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_birthday_quote_bank TO service_role;
