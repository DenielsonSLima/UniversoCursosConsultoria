# Documentos e Validações

Status: CANÔNICO. Última revisão: 2026-08-12.

## O que este módulo faz

Gera e controla documentos acadêmicos e institucionais: contratos, declarações,
histórico, certificados, boletins, ficha de matrícula, carteirinhas, termos e
validações públicas.

As telas de emissão ficam principalmente em modules/gestor/secretaria/ e
modules/gestor/cadastros/. Componentes compartilhados ficam em
modules/shared/pdf/, modules/shared/document-validation/ e
modules/shared/documentos-aluno/.

## Regras importantes

- Modelo, dados acadêmicos e dados institucionais devem vir de fontes
  canônicas.
- Emissões precisam registrar histórico, contexto e validação quando aplicável.
- PDFs são documentos de produto, não imagens de tela. Não rasterize páginas
  para corrigir visual.
- Arquivos com dados pessoais não entram em logs, fixtures versionadas,
  documentação ou diretórios públicos.

## Configuração

Antes de emitir, confirme:

- modelo documental ativo;
- dados institucionais e assinatura configurados para o polo;
- dados cadastrais e acadêmicos completos;
- permissões de Secretaria e de validação;
- bucket e políticas de Storage quando houver anexo ou arquivo emitido.

## Fontes principais

- modules/gestor/secretaria/contratos-aluno/
- modules/gestor/secretaria/historico-escolar/
- modules/gestor/secretaria/certificados/
- modules/gestor/secretaria/documentos/
- modules/shared/pdf/
- modules/shared/document-validation/
- supabase/functions/documentos-aluno-admin/
- ai/operacao/politicas/PDFS_OFICIAIS.md

## Validação recomendada

- Usar dados de teste não identificáveis.
- Conferir texto extraído, paginação, recursos e página renderizada afetada.
- Confirmar que a validação pública não expõe dados além do necessário.
- Executar os contratos de emissão e validação ligados ao documento alterado.

