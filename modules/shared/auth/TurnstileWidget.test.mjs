import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./TurnstileWidget.tsx', import.meta.url), 'utf8');
const compiled = transformSync(source, {
  loader: 'tsx',
  format: 'cjs',
  define: { 'import.meta.env.VITE_TURNSTILE_SITE_KEY': '"synthetic-site-key"' },
}).code;

// Executa o componente real com hooks, API e relógio controlados, sem navegador.
// Não substitui o smoke visual nem exercita os servidores da Cloudflare.
async function mountWidget() {
  const slots = [], timers = new Map(), widgets = [], removed = [];
  const statuses = [], tokens = [], errors = [];
  let cursor = 0, dirty = false, pendingEffects = [], tree;
  let now = 0, timerId = 0;
  const props = {
    action: 'login', resetSignal: 0,
    onStatusChange: value => statuses.push(value),
    onTokenChange: value => tokens.push(value),
    onError: value => errors.push(value),
  };
  const react = {
    createElement(type, props, ...children) {
      if (props?.ref && !props.ref.current) props.ref.current = {};
      return { type, props, children };
    },
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useState(value) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, next => {
        const result = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(result, slots[index].value)) dirty = true;
        slots[index].value = result;
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const window = {
    turnstile: {
      render(container, options) { widgets.push(options); return String(widgets.length); },
      remove(id) { removed.push(id); },
    },
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const context = {
    module: { exports: {} }, window,
    require(name) { assert.equal(name, 'react'); return react; },
  };
  vm.runInNewContext(compiled, context);
  const Component = context.module.exports.default;
  function render() {
    cursor = 0; dirty = false; pendingEffects = [];
    tree = Component(props);
    pendingEffects.forEach(effect => effect());
  }
  async function flush() {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      if (dirty) render();
    }
    assert.equal(dirty, false, 'renderizações devem estabilizar');
  }
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  }
  function findButton(node = tree) {
    if (node?.type === 'button') return node;
    return node?.children?.flat(Infinity).map(child => findButton(child)).find(Boolean);
  }
  render();
  await flush();
  return {
    statuses, tokens, errors, widgets, removed, timers, advance, flush, findButton,
    get status() { return statuses.at(-1); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    async reset() { props.resetSignal++; render(); await flush(); },
  };
}

test('desafio silencioso oferece recuperação após 20s sem criar token', async () => {
  const widget = await mountWidget();
  widget.advance(19_999);
  assert.equal(widget.status, 'verifying');
  widget.advance(1);
  await widget.flush();
  assert.equal(widget.status, 'error');
  assert.ok(widget.findButton(), 'Tentar novamente deve aparecer');
  assert.ok(widget.tokens.every(token => token === ''));
  assert.deepEqual(widget.removed, [], 'prazo não deve interromper o desafio');
  widget.unmount();
});

test('erros a cada 3s não adiam recuperação além de 8s nem escondem o botão', async () => {
  const widget = await mountWidget();
  for (let elapsed = 0; elapsed < 120_000; elapsed += 3_000) {
    widget.widgets[0]['error-callback']('200500');
    widget.advance(3_000);
    if (elapsed >= 6_000) assert.equal(widget.status, 'error');
  }
  await widget.flush();
  assert.ok(widget.findButton());
  assert.ok(widget.tokens.every(token => token === ''));
  widget.unmount();
});

test('sucesso antes ou depois do prazo cancela timers e conclui verificação', async () => {
  for (const delay of [1_000, 25_000]) {
    const widget = await mountWidget();
    widget.advance(delay);
    widget.widgets[0].callback('synthetic-valid-token');
    widget.advance(120_000);
    await widget.flush();
    assert.equal(widget.status, 'verified');
    assert.equal(widget.tokens.at(-1), 'synthetic-valid-token');
    assert.equal(widget.timers.size, 0);
    assert.equal(widget.findButton(), undefined);
    assert.equal(widget.widgets[0].language, 'pt-br');
    widget.unmount();
  }
});

test('retry manual remove widget antigo e ignora seus callbacks atrasados', async () => {
  const widget = await mountWidget();
  const old = widget.widgets[0];
  widget.advance(20_000);
  await widget.flush();
  widget.findButton()?.props.onClick();
  await widget.flush();
  assert.deepEqual(widget.removed, ['1']);
  assert.equal(widget.widgets.length, 2);
  assert.equal(widget.status, 'verifying');
  const counts = [widget.tokens.length, widget.statuses.length, widget.errors.length];
  old.callback('stale-token');
  old['error-callback']('200500');
  old['before-interactive-callback']();
  old['expired-callback']();
  old['timeout-callback']();
  old['unsupported-callback']();
  assert.deepEqual([widget.tokens.length, widget.statuses.length, widget.errors.length], counts);
  widget.widgets[1].callback('new-synthetic-token');
  assert.equal(widget.status, 'verified');
  widget.unmount();
});

test('interação não interrompe desafio nem esconde recuperação após o prazo', async () => {
  const widget = await mountWidget();
  widget.widgets[0]['before-interactive-callback']();
  assert.equal(widget.status, 'interaction-required');
  widget.advance(20_000);
  widget.widgets[0]['before-interactive-callback']();
  await widget.flush();
  assert.equal(widget.status, 'error');
  assert.ok(widget.findButton());
  assert.deepEqual(widget.removed, []);
  widget.widgets[0].callback('synthetic-token');
  assert.equal(widget.status, 'verified');
  widget.unmount();
});

test('expiração invalida token e permite novo ciclo de recuperação', async () => {
  const widget = await mountWidget();
  widget.widgets[0].callback('synthetic-token');
  widget.widgets[0]['expired-callback']();
  assert.equal(widget.tokens.at(-1), '');
  assert.equal(widget.status, 'retrying');
  widget.advance(8_000);
  assert.equal(widget.status, 'error');
  widget.widgets[0].callback('refreshed-synthetic-token');
  assert.equal(widget.status, 'verified');
  widget.unmount();
});

test('reset, desmontagem e navegador incompatível limpam timers', async () => {
  const widget = await mountWidget();
  widget.advance(10_000);
  await widget.reset();
  assert.deepEqual(widget.removed, ['1']);
  widget.advance(10_000);
  assert.equal(widget.status, 'verifying', 'timer antigo não afeta tentativa nova');
  widget.widgets[1]['unsupported-callback']();
  widget.advance(120_000);
  assert.equal(widget.status, 'unsupported');
  assert.equal(widget.timers.size, 0);
  await widget.reset();
  widget.unmount();
  const count = widget.tokens.length;
  widget.widgets[2].callback('stale-token');
  widget.advance(120_000);
  assert.equal(widget.tokens.length, count);
  assert.equal(widget.timers.size, 0);
});
