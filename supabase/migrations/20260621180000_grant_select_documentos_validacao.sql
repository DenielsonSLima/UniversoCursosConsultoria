-- Migração para conceder privilégios de leitura na tabela documentos_validacao
-- para o role 'anon' (usado quando a aplicação está em modo demonstração/sessão sem Supabase Auth formal)

GRANT SELECT ON public.documentos_validacao TO anon;

DROP POLICY IF EXISTS "Equipe autenticada consulta documentos validacao" ON public.documentos_validacao;

CREATE POLICY "Acesso consulta documentos validacao"
  ON public.documentos_validacao
  FOR SELECT
  TO anon, authenticated
  USING (true);
