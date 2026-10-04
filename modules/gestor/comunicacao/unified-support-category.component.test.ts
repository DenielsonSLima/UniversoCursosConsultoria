import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

interface Element {
  type: string | ((props: Record<string, unknown>) => Element);
  props: Record<string, any>;
}

const sourceRoot = process.env.UNIFIED_REVIEW_SOURCE_ROOT
  || fileURLToPath(new URL('.', import.meta.url));
const compiled = await build({
  stdin: {
    contents: 'export { default as CategoryFilter } from "./UnifiedCategoryFilter.tsx"; export { default as Inbox } from "./UnifiedSupportInbox.tsx";',
    resolveDir: sourceRoot,
    loader: 'tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'transform',
  tsconfigRaw: { compilerOptions: { jsx: 'react' } },
  write: false,
  plugins: [{
    name: 'headless-component-hooks',
    setup(builder) {
      builder.onResolve({ filter: /^(react|lucide-react)$/ }, (args) => ({ path: args.path, namespace: 'headless' }));
      builder.onLoad({ filter: /^react$/, namespace: 'headless' }, () => ({ contents: `
        const hooks = globalThis.componentHooks;
        export const useState = hooks.useState;
        export const useEffect = () => {};
        export const useId = () => 'category-test';
        export const useRef = () => ({ current: null });
        export default { createElement: (type, props, ...children) => ({ type, props: {
          ...props, children: children.length === 1 ? children[0] : children
        } }) };
      ` }));
      builder.onLoad({ filter: /^lucide-react$/, namespace: 'headless' }, () => ({ contents: `
        export const ChevronDown = 'ChevronDown', Filter = 'Filter', AlertTriangle = 'AlertTriangle',
          CheckCircle2 = 'CheckCircle2', Clock3 = 'Clock3', Globe2 = 'Globe2', ListChecks = 'ListChecks',
          MessageCircle = 'MessageCircle', Plus = 'Plus', Search = 'Search', Smartphone = 'Smartphone';
      ` }));
    },
  }],
});

// Executes the actual component and event handlers without a DOM or browser.
const createHarness = () => {
  const states: any[] = [];
  let cursor = 0;
  const componentHooks = {
    useState(initial: any) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
      return [states[slot], (next: any) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
    },
  };
  const module = { exports: {} as Record<string, (props: any) => Element> };
  runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, componentHooks });
  return {
    components: module.exports,
    render(component: (props: any) => Element, props: any) {
      cursor = 0;
      return component(props);
    },
  };
};

const elements = (node: any): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  return [node, ...elements(node.props.children)];
};
const inputOf = (tree: Element) => elements(tree).find((node) => node.props.role === 'combobox')!;

test('categoria selecionada mantém o controle recuperável quando opções desaparecem', () => {
  const harness = createHarness();
  const props = {
    categories: [], categoryId: 'removed-category', filteredItems: [], bulkIds: new Set(),
    bulkConnectionId: null, loading: false, hasLoadError: false, status: 'open',
  };
  const selected = harness.render(harness.components.Inbox, props);
  assert.equal(elements(selected).filter((node) => node.type === harness.components.CategoryFilter).length, 1);
  const all = harness.render(harness.components.Inbox, { ...props, categoryId: null });
  assert.equal(elements(all).filter((node) => node.type === harness.components.CategoryFilter).length, 0);

  let value: string | null = 'removed-category';
  const renderFilter = () => harness.render(harness.components.CategoryFilter, {
    categories: [], value, onChange: (id: string | null) => { value = id; },
  });
  assert.equal(inputOf(renderFilter()).props.value, 'Categoria indisponível');
  inputOf(renderFilter()).props.onClick();
  const option = elements(renderFilter()).find((node) => node.props.role === 'option')!;
  assert.equal(option.props.children, 'Todas as categorias');
  option.props.onClick();
  assert.equal(value, null);
  assert.equal(inputOf(renderFilter()).props.value, 'Todas as categorias');
});

test('clique reabre as opções após escolha e Escape sem precisar perder foco', () => {
  const harness = createHarness();
  let value: string | null = null;
  const render = () => harness.render(harness.components.CategoryFilter, {
    categories: [{ id: 'category-1', nome: 'Financeiro' }], value,
    onChange: (id: string | null) => { value = id; },
  });
  inputOf(render()).props.onFocus();
  const option = elements(render()).find((node) => node.props.role === 'option' && node.props.children === 'Financeiro')!;
  let prevented = false;
  option.props.onMouseDown({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  option.props.onClick();
  assert.equal(inputOf(render()).props['aria-expanded'], false);
  inputOf(render()).props.onClick();
  assert.equal(inputOf(render()).props['aria-expanded'], true);
  assert.equal(inputOf(render()).props.value, '');
  inputOf(render()).props.onKeyDown({ key: 'Escape' });
  assert.equal(inputOf(render()).props['aria-expanded'], false);
  inputOf(render()).props.onClick();
  assert.equal(inputOf(render()).props['aria-expanded'], true);
  assert.equal(value, 'category-1');
});
