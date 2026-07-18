CREATE TABLE IF NOT EXISTS public.perfis_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  permissoes jsonb NOT NULL DEFAULT '{"modules":[],"tabs":{},"allPolos":false}'::jsonb,
  restricao_horario jsonb NOT NULL DEFAULT '{"dias":[1,2,3,4,5],"horario_inicio":"08:00","horario_fim":"18:00","ativo":false}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS perfil_acesso_id uuid REFERENCES public.perfis_acesso(id) ON DELETE SET NULL;

INSERT INTO public.perfis_acesso (nome, descricao, permissoes, restricao_horario)
VALUES
  (
    'Perfil Gestor',
    'Acesso completo aos módulos operacionais do gestor.',
    '{"modules":["inicio","parceiros","cadastros","gestao","secretaria","caixa","financeiro","biblioteca","calendario","comunicacao","relatorios","configuracoes"],"financeiroTabs":["resumo","receber","despesas","transferencias","outros-debitos","outros-creditos"],"tabs":{"cadastros":["cadastros-checklist","cadastros-ead","cadastros-especializacao","cadastros-livres","cadastros-tecnicos","cadastros-superior","cadastros-ficha","cadastros-modelos"],"secretaria":["solicitacoes","carteirinhas","declaracoes","historico","recebimentos"],"comunicacao":["comunicacao-mensagem","comunicacao-whatsapp"]},"allPolos":true}',
    '{"dias":[1,2,3,4,5],"horario_inicio":"08:00","horario_fim":"18:00","ativo":false}'
  ),
  (
    'Perfil Financeiro',
    'Acesso focado em financeiro.',
    '{"modules":["inicio","financeiro","caixa"],"financeiroTabs":["resumo","receber","despesas","transferencias","outros-debitos","outros-creditos"],"allPolos":true}',
    '{"dias":[1,2,3,4,5],"horario_inicio":"08:00","horario_fim":"18:00","ativo":false}'
  ),
  (
    'Perfil Secretaria',
    'Acesso focado em secretaria e emissão de documentos.',
    '{"modules":["inicio","secretaria"],"tabs":{"secretaria":["solicitacoes","carteirinhas","declaracoes","historico","recebimentos"]},"allPolos":true}',
    '{"dias":[1,2,3,4,5],"horario_inicio":"08:00","horario_fim":"18:00","ativo":false}'
  ),
  (
    'Perfil Gestao de Turma',
    'Acesso direcionado à gestão de turmas e cadastros.',
    '{"modules":["inicio","gestao","cadastros","parceiros"],"tabs":{"cadastros":["cadastros-checklist","cadastros-ead","cadastros-especializacao","cadastros-livres","cadastros-tecnicos","cadastros-superior","cadastros-ficha","cadastros-modelos"]},"allPolos":true}',
    '{"dias":[1,2,3,4,5],"horario_inicio":"08:00","horario_fim":"18:00","ativo":false}'
  )
ON CONFLICT (nome)
DO UPDATE
  SET descricao = EXCLUDED.descricao,
      permissoes = EXCLUDED.permissoes,
      restricao_horario = EXCLUDED.restricao_horario;

WITH perfil_gestor AS (
  SELECT id
  FROM public.perfis_acesso
  WHERE nome = 'Perfil Gestor'
)
UPDATE public.usuarios_sistema u
SET perfil_acesso_id = p.id
FROM perfil_gestor p
WHERE p.id IS NOT NULL
  AND (
    lower(u.nome) LIKE '%aldenise%'
    OR regexp_replace(coalesce(u.cpf, ''), '\\D', '', 'g') = '07001707589'
  );

UPDATE public.usuarios_sistema u
SET perfil_acesso_id = gp.id
FROM public.perfis_acesso gp
WHERE gp.nome = 'Perfil Gestor'
  AND u.perfil_acesso_id IN (
    SELECT p.id
    FROM public.perfis_acesso p
    WHERE lower(p.nome) LIKE 'perfil de %'
  );

DELETE FROM public.perfis_acesso
WHERE lower(nome) LIKE 'perfil de %';
