# Cabeçalho institucional único

## Objetivo

Centralizar a identidade institucional usada por PDFs e relatórios elegíveis, mantendo dados dinâmicos da matriz ou polo ativo e o mesmo espaçamento entre os diferentes exportadores.

## Resultado

- Esquerda: CNPJ, Contato e o e-mail protegido `universo.cursoseconsultoria@gmail.com`.
- Direita: Cidade/UF, Endereço e Bairro/CEP, sempre em três linhas.
- React e PDF vetorial compartilham o mesmo resolvedor puro e os mesmos metadados estruturados.
- O Caixa deixou de manter desenhador privado e usa a posição segura devolvida pelo compositor canônico.
- Relatórios HTML compartilham tamanho A4 e margem de impressão; textos longos são contidos sem invadir outras colunas.
- A prévia de Modelos de Documentos permite escolher matriz/polo e orientação sem editar ou persistir configurações.
- A marca-d'água configurada acompanha a unidade e orientação; o fallback paisagem reaproveita integralmente a configuração retrato.

## Escopo preservado

Diários, certificados, boleto, carnê, carteirinha estudantil, preceptor, SES, crachás e o boletim informativo de Parceiros não foram migrados. Nenhum schema, RPC, RLS, cadastro, snapshot ou histórico foi alterado.

## Validações

- `npm run test:institutional-header`: 7/7.
- `npm run test:caixa-report`: 21/21.
- `npm run test:contratos-aluno`: 44/44.
- `npm run test:pdf-exports`, TypeScript, lint global e build: aprovados.
- PDFs retrato/paisagem renderizados com Poppler, texto extraível e somente recursos gráficos isolados.
- Safari autenticado: matriz, selo, seis linhas, e-mail oficial, metadados e marca da prévia conferidos; nenhuma gravação realizada.

## Publicação

Complemento final da PR #62, com produção autorizada pelo usuário em 2026-08-09 e merge condicionado à nova Preview Vercel `Ready`.
