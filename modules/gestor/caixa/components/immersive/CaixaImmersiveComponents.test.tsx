import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaixaEditorialSection } from './CaixaEditorialSection';
import { CaixaExecutiveHero } from './CaixaExecutiveHero';
import { CaixaImmersiveNavigation } from './CaixaImmersiveNavigation';

test('navegação usa âncoras reais, foco acessível e estado atual sem JavaScript de scroll', () => {
  const html = renderToStaticMarkup(
    <CaixaImmersiveNavigation
      activeId="movimento"
      items={[
        { id: 'visao-geral', label: 'Visão geral' },
        { id: 'movimento', label: 'Movimento', description: 'Entradas e saídas' },
      ]}
    />,
  );

  assert.match(html, /aria-label="Seções do Caixa"/);
  assert.match(html, /href="#visao-geral"/);
  assert.match(html, /href="#movimento"/);
  assert.match(html, /aria-current="location"/);
  assert.doesNotMatch(html, /role="button"/);
});

test('hero apresenta valores canônicos existentes e explicita o status sem derivar resultado', () => {
  const html = renderToStaticMarkup(
    <CaixaExecutiveHero
      competencia="Setembro de 2026"
      escopo="Aracaju/SE"
      posicao={125000.5}
      bancarioRegistrado={120000.5}
      caixaLocal={5000}
      entradas={38000}
      quantidadeRecebimentos={18}
      saidas={27000}
      quantidadePagamentos={7}
      tarifasBancariasConfirmadas={99.9}
      resultado={11000}
      resultadoStatus="POSITIVO"
    />,
  );

  assert.match(html, /Visão executiva/);
  assert.match(html, /Setembro de 2026/);
  assert.match(html, /Aracaju\/SE/);
  assert.match(html, /R\$\s*125\.000,50/);
  assert.match(html, /R\$\s*38\.000,00/);
  assert.match(html, /R\$\s*27\.000,00/);
  assert.match(html, /R\$\s*11\.000,00/);
  assert.match(html, /Banco registrado R\$\s*120\.000,50/);
  assert.match(html, /Caixa local R\$\s*5\.000,00/);
  assert.match(html, /18 receita\(s\)/);
  assert.match(html, /7 pagamento\(s\)/);
  assert.match(html, /Tarifas R\$\s*99,90/);
  assert.match(html, /Superávit operacional/);

  const source = readFileSync(join(
    process.cwd(),
    'modules/gestor/caixa/components/immersive/CaixaExecutiveHero.tsx',
  ), 'utf8');
  assert.doesNotMatch(source, /parseFloat|parseInt|\.reduce\(|Math\./);
  assert.doesNotMatch(source, /entradas\s*[-+*/]|saidas\s*[-+*/]|resultado\s*[-+*/]/);
});

test('seção editorial preserva conteúdo, ação, apoio e vínculo semântico do título', () => {
  const html = renderToStaticMarkup(
    <CaixaEditorialSection
      id="movimento"
      eyebrow="Operação"
      title="Movimento confirmado"
      description="Conteúdo canônico da competência."
      action={<button type="button">Exportar</button>}
      aside={<p>Nota de conferência</p>}
      tone="soft"
    >
      <div data-existing-content>Componente existente</div>
    </CaixaEditorialSection>,
  );

  assert.match(html, /id="movimento"/);
  assert.match(html, /aria-labelledby="movimento-title"/);
  assert.match(html, /id="movimento-title"/);
  assert.match(html, /data-existing-content="true"/);
  assert.match(html, /Exportar/);
  assert.match(html, /Nota de conferência/);
});
