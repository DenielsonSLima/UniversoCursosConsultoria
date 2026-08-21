import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveResponsavelModuleFromPath,
  resolveResponsavelPathFromModule,
  responsavelQueryKeys,
} from './responsavel.contract.ts';
import {
  coordenadorQueryKeys,
  resolveCoordenadorModuleFromPath,
  resolveCoordenadorPathFromModule,
} from '../coordenador/coordenador.contract.ts';

const [coordenadorServiceSource, coordenadorPageSource] = await Promise.all([
  readFile(new URL('../coordenador/coordenador.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../coordenador/coordenador.page.tsx', import.meta.url), 'utf8'),
]);

test('responsável mantém deep link e módulo sincronizados', () => {
  assert.equal(resolveResponsavelModuleFromPath('/responsavel'), 'dependentes');
  assert.equal(resolveResponsavelModuleFromPath('/responsavel/assinaturas'), 'assinaturas');
  assert.equal(resolveResponsavelModuleFromPath('/responsavel/perfil/'), 'perfil');
  assert.equal(resolveResponsavelModuleFromPath('/responsavel/inexistente'), null);
  assert.equal(resolveResponsavelPathFromModule('assinaturas'), '/responsavel/assinaturas');
  assert.equal(resolveResponsavelPathFromModule('inexistente'), '/responsavel');
});

test('coordenador aceita o deep link público de turmas e o alias descritivo', () => {
  assert.equal(resolveCoordenadorModuleFromPath('/coordenador'), 'inicio');
  assert.equal(resolveCoordenadorModuleFromPath('/coordenador/turmas'), 'turmas-diarios');
  assert.equal(resolveCoordenadorModuleFromPath('/coordenador/turmas-diarios/'), 'turmas-diarios');
  assert.equal(resolveCoordenadorModuleFromPath('/coordenador/assinaturas'), 'assinaturas');
  assert.equal(resolveCoordenadorModuleFromPath('/coordenador/inexistente'), null);
  assert.equal(resolveCoordenadorPathFromModule('turmas-diarios'), '/coordenador/turmas');
  assert.equal(resolveCoordenadorPathFromModule('inexistente'), '/coordenador');
});

test('cache dos portais isola contexto e polo ativo', () => {
  assert.notDeepEqual(
    responsavelQueryKeys.dependentes('responsavel-a'),
    responsavelQueryKeys.dependentes('responsavel-b'),
  );
  assert.notDeepEqual(
    coordenadorQueryKeys.atribuicoes('professor-a', 'polo-a'),
    coordenadorQueryKeys.atribuicoes('professor-a', 'polo-b'),
  );
  assert.notDeepEqual(
    coordenadorQueryKeys.atribuicoes('professor-a', 'polo-a'),
    coordenadorQueryKeys.atribuicoes('professor-b', 'polo-a'),
  );
});

test('coordenador envia o polo ativo à RPC autoritativa e não filtra resposta ampla no navegador', () => {
  assert.match(coordenadorServiceSource, /p_polo_id: requiredString\(activePoloId, 'activePoloId'\)/);
  assert.doesNotMatch(coordenadorServiceSource, /assignments\.filter/);
  assert.match(coordenadorPageSource, /enabled: Boolean\(profile\?\.contextId && activePoloId\)/);
  assert.match(coordenadorPageSource, /listarAtribuicoesCoordenador\(profile\.contextId, activePoloId\)/);
});
