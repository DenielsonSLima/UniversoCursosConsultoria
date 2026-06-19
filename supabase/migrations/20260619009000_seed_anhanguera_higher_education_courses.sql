-- Catálogo de cursos superiores divulgado pelo polo Anhanguera de Japoatã.
-- As capas ficam vazias para serem adicionadas posteriormente pelo portal.

DO $$
DECLARE
  v_parceiro_nome TEXT := 'ANHANGUERA EDUCACIONAL PARTICIPACOES S/A';
  v_parceiro_logo_url TEXT;
  v_curso RECORD;
BEGIN
  SELECT nome, foto_url
    INTO v_parceiro_nome, v_parceiro_logo_url
  FROM public.parceiros
  WHERE tipo = 'PJ'
    AND nome ILIKE '%ANHANGUERA%'
  ORDER BY created_at
  LIMIT 1;

  v_parceiro_nome := COALESCE(
    v_parceiro_nome,
    'ANHANGUERA EDUCACIONAL PARTICIPACOES S/A'
  );

  FOR v_curso IN
    SELECT *
    FROM (
      VALUES
        (
          'a1000000-0000-0000-0000-000000000001'::UUID,
          'Terapia Ocupacional',
          'BACHARELADOS - SEMIPRESENCIAL',
          'Formação para promover autonomia, inclusão e qualidade de vida por meio de atividades terapêuticas em contextos de saúde, educação e assistência social.'
        ),
        (
          'a1000000-0000-0000-0000-000000000002'::UUID,
          'Fonoaudiologia',
          'BACHARELADOS - SEMIPRESENCIAL',
          'Formação para prevenção, avaliação e tratamento de alterações da comunicação, voz, audição, linguagem e deglutição.'
        ),
        (
          'a1000000-0000-0000-0000-000000000003'::UUID,
          'Nutrição',
          'BACHARELADOS - SEMIPRESENCIAL',
          'Formação para atuar na promoção da saúde por meio da alimentação, nutrição clínica, saúde coletiva e gestão de serviços de alimentação.'
        ),
        (
          'a1000000-0000-0000-0000-000000000004'::UUID,
          'Farmácia',
          'BACHARELADOS - SEMIPRESENCIAL',
          'Formação para atuar com medicamentos, análises clínicas, assistência farmacêutica, indústria e promoção do uso seguro de produtos de saúde.'
        ),
        (
          'a1000000-0000-0000-0000-000000000005'::UUID,
          'Serviço Social',
          'BACHARELADOS - SEMIPRESENCIAL',
          'Formação para planejar e executar ações de proteção social, garantia de direitos e fortalecimento de indivíduos, famílias e comunidades.'
        ),
        (
          'a1000000-0000-0000-0000-000000000006'::UUID,
          'Administração de Empresas',
          'BACHARELADOS - 100% ONLINE',
          'Formação ampla em gestão de pessoas, finanças, marketing, estratégia e processos para atuação em empresas e empreendimentos.'
        ),
        (
          'a1000000-0000-0000-0000-000000000007'::UUID,
          'Administração Pública',
          'BACHARELADOS - 100% ONLINE',
          'Formação para planejar, administrar e avaliar políticas, projetos e recursos em órgãos públicos e organizações de interesse coletivo.'
        ),
        (
          'a1000000-0000-0000-0000-000000000008'::UUID,
          'Ciência da Computação',
          'BACHARELADOS - 100% ONLINE',
          'Formação em desenvolvimento de software, algoritmos, bancos de dados, inteligência computacional e fundamentos de sistemas tecnológicos.'
        ),
        (
          'a1000000-0000-0000-0000-000000000009'::UUID,
          'Pedagogia',
          'LICENCIATURAS - SEMIPRESENCIAL',
          'Formação para docência, alfabetização, gestão escolar e desenvolvimento de práticas educacionais em diferentes espaços de aprendizagem.'
        ),
        (
          'a1000000-0000-0000-0000-000000000010'::UUID,
          'Educação Física',
          'LICENCIATURAS - SEMIPRESENCIAL',
          'Formação de professores para o ensino de práticas corporais, esportes, jogos, danças e promoção da saúde no ambiente escolar.'
        ),
        (
          'a1000000-0000-0000-0000-000000000011'::UUID,
          'Letras',
          'LICENCIATURAS - SEMIPRESENCIAL',
          'Formação para o ensino de língua e literatura, com desenvolvimento de competências de leitura, escrita, comunicação e análise textual.'
        ),
        (
          'a1000000-0000-0000-0000-000000000012'::UUID,
          'Geografia',
          'LICENCIATURAS - SEMIPRESENCIAL',
          'Formação de professores para compreender e ensinar as relações entre sociedade, território, ambiente, economia e espaço geográfico.'
        ),
        (
          'a1000000-0000-0000-0000-000000000013'::UUID,
          'História',
          'LICENCIATURAS - SEMIPRESENCIAL',
          'Formação para o ensino e a pesquisa dos processos históricos, culturais, políticos e sociais em diferentes tempos e sociedades.'
        ),
        (
          'a1000000-0000-0000-0000-000000000014'::UUID,
          'Radiologia',
          'CURSOS SUPERIORES DE TECNOLOGIA',
          'Formação tecnológica para atuar na produção de imagens diagnósticas, proteção radiológica e operação de equipamentos em serviços de saúde.'
        ),
        (
          'a1000000-0000-0000-0000-000000000015'::UUID,
          'Gestão Pública',
          'CURSOS SUPERIORES DE TECNOLOGIA',
          'Formação tecnológica para administrar recursos, processos, projetos e serviços em instituições públicas e organizações sociais.'
        ),
        (
          'a1000000-0000-0000-0000-000000000016'::UUID,
          'Criminologia',
          'CURSOS SUPERIORES DE TECNOLOGIA',
          'Formação tecnológica voltada ao estudo do fenômeno criminal, prevenção da violência, políticas de segurança e sistema de justiça.'
        ),
        (
          'a1000000-0000-0000-0000-000000000017'::UUID,
          'Logística',
          'CURSOS SUPERIORES DE TECNOLOGIA',
          'Formação tecnológica para planejar e controlar estoques, armazenagem, transporte, distribuição e cadeias de suprimentos.'
        ),
        (
          'a1000000-0000-0000-0000-000000000018'::UUID,
          'Gestão Financeira',
          'CURSOS SUPERIORES DE TECNOLOGIA',
          'Formação tecnológica para análise financeira, planejamento orçamentário, investimentos, custos e tomada de decisões empresariais.'
        ),
        (
          'a1000000-0000-0000-0000-000000000019'::UUID,
          'Gestão em Saúde Pública',
          'CURSOS SUPERIORES DE TECNOLOGIA',
          'Formação tecnológica para planejar, coordenar e avaliar serviços, equipes e políticas voltadas à saúde coletiva.'
        )
    ) AS catalogo(id, nome, area, descricao)
  LOOP
    INSERT INTO public.cursos (
      id,
      nome,
      modalidade,
      carga_horaria,
      status,
      area,
      descricao,
      versao,
      parceiro_instituicao,
      parceiro_logo_url,
      imagem_url,
      publicar_site
    )
    VALUES (
      v_curso.id,
      v_curso.nome,
      'SUPERIOR',
      0,
      'ativo',
      v_curso.area,
      v_curso.descricao,
      '1.0',
      v_parceiro_nome,
      v_parceiro_logo_url,
      NULL,
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      nome = EXCLUDED.nome,
      modalidade = EXCLUDED.modalidade,
      carga_horaria = EXCLUDED.carga_horaria,
      status = EXCLUDED.status,
      area = EXCLUDED.area,
      descricao = EXCLUDED.descricao,
      versao = EXCLUDED.versao,
      parceiro_instituicao = EXCLUDED.parceiro_instituicao,
      parceiro_logo_url = EXCLUDED.parceiro_logo_url,
      publicar_site = EXCLUDED.publicar_site;
  END LOOP;
END
$$;
