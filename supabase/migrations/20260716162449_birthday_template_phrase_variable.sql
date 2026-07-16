ALTER TABLE public.whatsapp_birthday_settings
  ALTER COLUMN message_template SET DEFAULT '🎉 Bom dia, {{nome_aluno}}!

Hoje é um dia muito especial! A equipe da Universo Cursos e Consultoria deseja a você um feliz aniversário.

Que este novo ciclo seja repleto de saúde, paz, felicidade, conquistas e muito sucesso em sua caminhada.

Aproveite bastante o seu dia. Parabéns! 🎂🎈

{{frase_aniversario}}';

UPDATE public.whatsapp_birthday_settings
SET message_template = '🎉 Bom dia, {{nome_aluno}}!

Hoje é um dia muito especial! A equipe da Universo Cursos e Consultoria deseja a você um feliz aniversário.

Que este novo ciclo seja repleto de saúde, paz, felicidade, conquistas e muito sucesso em sua caminhada.

Aproveite bastante o seu dia. Parabéns! 🎂🎈

{{frase_aniversario}}',
    updated_at = now()
WHERE id = true;

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
SET search_path = pg_catalog, public
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
  ),
  rendered AS (
    SELECT
      b.*,
      chosen.id AS quote_id,
      replace(
        replace(
          replace(b.message_template, '{{nome_aluno}}', b.nome_tratamento),
          '{{nome}}',
          b.nome_tratamento
        ),
        '{{escola}}',
        b.school_name
      ) AS core_message,
      CASE
        WHEN b.quote_enabled AND chosen.quote_text IS NOT NULL
          THEN '“' || chosen.quote_text || '” — ' || chosen.author
        ELSE ''
      END AS quote_content
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
  )
  SELECT
    r.aluno_id,
    r.nome,
    r.nome_tratamento,
    r.telefone,
    r.sexo,
    r.curso_nome,
    r.modalidade,
    r.quote_id,
    CASE
      WHEN strpos(r.core_message, '{{frase_aniversario}}') > 0
        THEN replace(r.core_message, '{{frase_aniversario}}', r.quote_content)
      WHEN r.quote_content <> ''
        THEN r.core_message || E'\n\n' || r.quote_content
      ELSE r.core_message
    END AS message_content
  FROM rendered r
  LIMIT greatest(p_limit, 1);
$$;
