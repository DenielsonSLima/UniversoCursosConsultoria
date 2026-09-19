# Remodelação da ficha do aluno

Estado: REVISADO E AUTORIZADO PARA PUBLICAÇÃO — versão 4.8.71, revisão 80.

Usuário autorizou explicitamente: “revise novamente e em seguida pode publicar”.

## Objetivo e aceite

- Implementar a proposta visual aprovada em Parceiros > Aluno, com três agentes e integração central.
- Preservar todos os campos, ações, dados e condições existentes; não fundir Cursos e Matrículas.
- Padronizar densidade, navegação, títulos, formulários e ações de documentos.
- Tornar o salvamento assíncrono explícito, proteger rascunho e corrigir apresentação ambígua dos campos.
- Manter consultas, cálculos, permissões e emissão de documentos existentes.

## Manifesto explícito

- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.css`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoPersonalSection.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetailsSections.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoAddressSection.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDisplayField.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-dados.utils.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-edicao.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-edicao.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoNavigation.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/AlunoDiscardChangesDialog.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoCursos.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDocumentos.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoFinanceiro.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoVacinas.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoSecretaria.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroSolicitacoesPanel.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/AlunoDocumentosSummary.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentoChecklistCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentoStatusBadge.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentosChecklist.tsx`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-19-ficha-aluno-remodelacao.md`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/DocumentosPendingLots.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/documentos/MatriculaTecnicaAccessSection.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`

Total: 31 arquivos.

## Etapas

1. Shell e navegação: oito áreas, cabeçalho compacto, versão móvel e proteção de saída.
2. Cadastro: campos padronizados, ações persistentes, salvar aguardando confirmação, rascunho preservado e sem busca CEP automática apenas ao editar.
3. Demais abas: Matrículas, Cursos, Documentos, Vacinas, Financeiro e Secretaria com linguagem visual consistente; sem alteração de regras.

## Validação

- Inventário: 48 campos anteriores mantidos; UF/data de expedição agora explícitos, total 50 controles condicionais. Foto, copiar nome, responsável financeiro e todas as ações documentais preservados.
- Sete testes de edição: equivalências de sexo, órgão/UF sem perda, rascunho condicional, sincronização de telefone/nome com aliases de persistência, payload compatível e preservação de legados em edição não relacionada.
- Três contratos documentais existentes e comparação de seis estados do checklist aprovados. Oito arquivos de abas alteram somente apresentação; query, totais e agrupamento financeiro preservados.
- Smoke dos componentes React reais com serviços simulados: desktop1440 e celular390, sem overflow global; entradas/selects40px no desktop e16px de fonte no celular; erro de salvar mantém edição/rascunho; sucesso encerra; Cancelar repõe; troca de aba/Voltar abre dialog com foco seguro/Escape; Mais e abas Matrículas/Financeiro conferidos. Nenhuma exceção de runtime.
- Safari real: reproduzida altura nativa inadequada dos selects; corrigida com CSS escopado (appearance:none/altura explícita). Verificados visualmente alinhamento, nome social, ação Copiar nome e modal de proteção de rascunho.
- Build, TypeScript e lint focado aprovados; conferência final de linhas registrada no fechamento.
- Sem mudança de banco, funções financeiras ou permissões. Revisão independente aprovada; publicação autorizada pelo usuário em 4.8.71. O smoke autenticado com backend real depende de sessão disponível; os testes locais não escrevem em produção.

## Limites e preservação

- Acesso mantém o componente compartilhado e todas as operações existentes, dentro da nova navegação.
- Limpeza de dados condicionais ocorre apenas no payload quando a condição realmente muda em relação ao original; edição não relacionada preserva legados. Rascunho permanece intacto em erro.
- Upload de foto permanece imediato e atualiza somente a foto no cache; demais alterações aguardam Salvar.
- Arquivos deste diretório que já possuíam alterações anteriores foram preservados. Manifesto reconciliado com main 6c0ae8b4c66d6c34fe34e97f8aa634e4dea53e1c. Os componentes DocumentosPendingLots e MatriculaTecnicaAccessSection entram como extrações do componente de documentos para cumprir 500 linhas, preservando os fluxos. Registro remoto de manifestos recebe somente este lote; entradas locais de outros lotes são preservadas fora da publicação.
