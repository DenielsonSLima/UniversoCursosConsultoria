-- Completa o catálogo técnico divulgado para 2026.1.
-- Os cursos abaixo ainda não possuem matriz curricular cadastrada.
-- Esta carga não altera nem remove módulos, disciplinas ou aulas existentes.

DO $$
DECLARE
  v_curso RECORD;
  v_curso_id UUID;
BEGIN
  FOR v_curso IN
    SELECT *
    FROM (
      VALUES
        (
          'c1000000-0000-0000-0000-000000000001'::UUID,
          'Técnico em Análises Clínicas',
          18,
          'Formação técnica para atuação em laboratórios de análises clínicas, apoiando a coleta, o preparo e o processamento de amostras biológicas. Oferta comercial: semipresencial, no turno noturno.'
        ),
        (
          'c1000000-0000-0000-0000-000000000002'::UUID,
          'Técnico em Saúde Bucal',
          24,
          'Formação técnica para promoção, prevenção e recuperação da saúde bucal, com apoio aos procedimentos odontológicos e à organização do ambiente clínico. Oferta comercial: presencial, no turno noturno.'
        )
    ) AS catalogo(id, nome, duracao_meses, descricao)
  LOOP
    SELECT id
      INTO v_curso_id
    FROM public.cursos
    WHERE modalidade = 'TECNICO'
      AND LOWER(nome) = LOWER(v_curso.nome)
    ORDER BY created_at
    LIMIT 1;

    IF v_curso_id IS NULL THEN
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
        v_curso.id,
        v_curso.nome,
        'TECNICO',
        0,
        'ativo',
        'Saúde',
        v_curso.descricao,
        '1.0',
        v_curso.duracao_meses,
        true,
        NULL,
        NULL,
        NULL
      );
    ELSE
      UPDATE public.cursos
      SET
        nome = v_curso.nome,
        status = 'ativo',
        area = 'Saúde',
        descricao = v_curso.descricao,
        versao = COALESCE(versao, '1.0'),
        duracao_meses = v_curso.duracao_meses,
        publicar_site = true
      WHERE id = v_curso_id;
    END IF;

    v_curso_id := NULL;
  END LOOP;
END
$$;
