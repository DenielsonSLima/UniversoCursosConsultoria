-- Staging privado e transitório: o conteúdo confidencial não integra migrations.
-- A publicação consome e remove o pacote dentro da mesma transação de UPDATE.
CREATE TABLE internal_academic.ead_revision_publication_packages (
  course_id uuid NOT NULL REFERENCES public.cursos(id),
  revision text NOT NULL
    CHECK (revision = btrim(revision) AND length(revision) BETWEEN 1 AND 100),
  expected_config_hash text NOT NULL CHECK (expected_config_hash ~ '^[0-9a-f]{32}$'),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  config_hash text GENERATED ALWAYS AS (md5(config::text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, revision),
  CONSTRAINT ead_publication_package_revision_matches
    CHECK (config ->> 'assessmentRevision' IS NOT NULL
      AND config ->> 'assessmentRevision' = revision)
);

ALTER TABLE internal_academic.ead_revision_publication_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal_academic.ead_revision_publication_packages
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE internal_academic.ead_revision_publication_packages IS
  'Pacote acadêmico confidencial recebido pelo owner via MCP; consumo transacional sem RPC ou ACL de API.';
