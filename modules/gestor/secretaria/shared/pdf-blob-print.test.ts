import assert from 'node:assert/strict';
import {
  assertPdfBlobReady,
  printPdfBlob,
  shouldPrintAggregatedPdf,
} from './pdf-blob-print.ts';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const restoreGlobal = (
  property: 'document' | 'URL' | 'window',
  descriptor: PropertyDescriptor | undefined,
) => {
  if (descriptor) {
    Object.defineProperty(globalThis, property, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, property);
  }
};

const createEventHub = () => {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, listener: () => void) => {
      const listenersForType = listeners.get(type) || new Set<() => void>();
      listenersForType.add(listener);
      listeners.set(type, listenersForType);
    },
    dispatch: (type: string) => {
      [...(listeners.get(type) || [])].forEach((listener) => listener());
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
};

Deno.test('somente lote com mais de um documento usa impressão agregada', () => {
  assert.equal(shouldPrintAggregatedPdf(0), false);
  assert.equal(shouldPrintAggregatedPdf(1), false);
  assert.equal(shouldPrintAggregatedPdf(2), true);
  assert.equal(shouldPrintAggregatedPdf(20), true);
});

Deno.test('Blob PDF vazio falha fechado antes de abrir o navegador', async () => {
  assert.throws(
    () => assertPdfBlobReady(new Blob(), 'O PDF da emissão'),
    /PDF da emissão está vazio/,
  );
  await assert.rejects(
    printPdfBlob(new Blob()),
    /PDF agregado está vazio/,
  );
  assert.throws(
    () => assertPdfBlobReady(new Blob(['imagem'], { type: 'image/png' })),
    /não possui o formato PDF esperado/,
  );
});

Deno.test('impressão aguarda load, chama print uma vez e limpa iframe e URL', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const frameEvents = createEventHub();
  const printEvents = createEventHub();
  let appended = 0;
  let focused = 0;
  let printed = 0;
  let removed = 0;
  let revokedUrl: string | null = null;

  const printWindow = Object.assign(printEvents, {
    focus: () => {
      focused += 1;
    },
    print: () => {
      printed += 1;
      void Promise.resolve().then(() => printEvents.dispatch('afterprint'));
    },
  });
  const iframe = Object.assign(frameEvents, {
    contentWindow: printWindow,
    remove: () => {
      removed += 1;
    },
    setAttribute: () => undefined,
    src: '',
    style: {},
    title: '',
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      clearTimeout: nativeClearTimeout,
      setTimeout: nativeSetTimeout,
    },
  });
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: {
      createObjectURL: () => 'blob:document-batch',
      revokeObjectURL: (url: string) => {
        revokedUrl = url;
      },
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        appendChild: () => {
          appended += 1;
          void Promise.resolve().then(() => frameEvents.dispatch('load'));
          return iframe;
        },
      },
      createElement: () => iframe,
    },
  });

  try {
    await printPdfBlob(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
      requireAfterPrint: true,
      afterPrintFallbackMs: 50,
      loadTimeoutMs: 50,
      settleMs: 0,
    });

    assert.equal(appended, 1);
    assert.equal(focused, 1);
    assert.equal(printed, 1);
    assert.equal(removed, 1);
    assert.equal(revokedUrl, 'blob:document-batch');
    assert.equal(iframe.src, 'blob:document-batch');
  } finally {
    restoreGlobal('document', previousDocument);
    restoreGlobal('URL', previousUrl);
    restoreGlobal('window', previousWindow);
  }
});

Deno.test('falha de prontidão também remove iframe e revoga a URL', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const frameEvents = createEventHub();
  let removed = 0;
  let revoked = 0;

  const iframe = Object.assign(frameEvents, {
    contentWindow: null,
    remove: () => {
      removed += 1;
    },
    setAttribute: () => undefined,
    src: '',
    style: {},
    title: '',
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      clearTimeout: nativeClearTimeout,
      setTimeout: nativeSetTimeout,
    },
  });
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: {
      createObjectURL: () => 'blob:document-batch-error',
      revokeObjectURL: () => {
        revoked += 1;
      },
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        appendChild: () => {
          void Promise.resolve().then(() => frameEvents.dispatch('error'));
          return iframe;
        },
      },
      createElement: () => iframe,
    },
  });

  try {
    await assert.rejects(
      printPdfBlob(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
        loadTimeoutMs: 50,
        settleMs: 0,
      }),
      /carregar o PDF agregado/,
    );
    assert.equal(removed, 1);
    assert.equal(revoked, 1);
  } finally {
    restoreGlobal('document', previousDocument);
    restoreGlobal('URL', previousUrl);
    restoreGlobal('window', previousWindow);
  }
});

Deno.test('erro síncrono do navegador ao imprimir também limpa iframe e URL', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const frameEvents = createEventHub();
  const printEvents = createEventHub();
  let removed = 0;
  let revoked = 0;

  const printWindow = Object.assign(printEvents, {
    focus: () => undefined,
    print: () => {
      throw new Error('print indisponível');
    },
  });
  const iframe = Object.assign(frameEvents, {
    contentWindow: printWindow,
    remove: () => {
      removed += 1;
    },
    setAttribute: () => undefined,
    src: '',
    style: {},
    title: '',
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      clearTimeout: nativeClearTimeout,
      setTimeout: nativeSetTimeout,
    },
  });
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: {
      createObjectURL: () => 'blob:document-batch-print-error',
      revokeObjectURL: () => {
        revoked += 1;
      },
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        appendChild: () => {
          void Promise.resolve().then(() => frameEvents.dispatch('load'));
          return iframe;
        },
      },
      createElement: () => iframe,
    },
  });

  try {
    await assert.rejects(
      printPdfBlob(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
        afterPrintFallbackMs: 20,
        loadTimeoutMs: 50,
        settleMs: 0,
      }),
      /print indisponível/,
    );
    assert.equal(removed, 1);
    assert.equal(revoked, 1);
  } finally {
    restoreGlobal('document', previousDocument);
    restoreGlobal('URL', previousUrl);
    restoreGlobal('window', previousWindow);
  }
});

Deno.test('modal imprime o mesmo PDF agregado preparado, sem reemissão', async () => {
  const [source, previewUtilsSource] = await Promise.all([
    Deno.readTextFile(
      new URL('./SecretariaIssuedDocumentModal.tsx', import.meta.url),
    ),
    Deno.readTextFile(
      new URL('../historico-emissoes/preview-utils.ts', import.meta.url),
    ),
  ]);

  assert.match(source, /const pdf = await prepareAggregatedPdf\(\)/);
  assert.match(source, /await printPdfBlob\(pdf\.blob/);
  assert.match(source, /assertPdfBlobReady\(pdf\.blob, 'O PDF agregado'\)/);
  assert.match(source, /assertPdfBlobReady\(blob, 'O PDF agregado'\)/);
  assert.equal(
    source.match(/createEmissionBatchPdf\(/g)?.length,
    1,
  );
  assert.doesNotMatch(source, /reissue|reemitir|createEmission\(/i);
  assert.match(
    previewUtilsSource,
    /assertPdfBlobReady\(blob, 'O PDF da emissão'\);\s+downloadPdfBlob\(blob, filename\);/,
  );
});

for (const requireAfterPrint of [false, true]) {
  Deno.test(`ausência de afterprint ${requireAfterPrint ? 'rejeita no PDV' : 'mantém fallback legado'}`, async () => {
    const previous = Object.fromEntries(['document', 'URL', 'window'].map(key =>
      [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const frameEvents = createEventHub();
    const printEvents = createEventHub();
    let prints = 0, removed = 0, revoked = 0;
    const iframe = Object.assign(frameEvents, {
      contentWindow: Object.assign(printEvents, {
        focus: () => undefined, print: () => { prints++; },
      }),
      remove: () => { removed++; }, setAttribute: () => undefined,
      src: '', style: {}, title: '',
    });
    Object.defineProperty(globalThis, 'window', { configurable: true,
      value: { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) } });
    Object.defineProperty(globalThis, 'URL', { configurable: true,
      value: { createObjectURL: () => 'blob:pdv-no-afterprint', revokeObjectURL: () => { revoked++; } } });
    Object.defineProperty(globalThis, 'document', { configurable: true,
      value: { createElement: () => iframe, body: { appendChild: () => {
        void Promise.resolve().then(() => frameEvents.dispatch('load')); return iframe;
      } } } });
    try {
      const result = printPdfBlob(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
        requireAfterPrint, afterPrintFallbackMs: 10, loadTimeoutMs: 50, settleMs: 0,
      });
      if (requireAfterPrint) await assert.rejects(result, /confirmar o encerramento do diálogo/);
      else await result;
      assert.equal(prints, 1); assert.equal(removed, 1); assert.equal(revoked, 1);
      // A late browser event must not cause a second completion or dispatch.
      printEvents.dispatch('afterprint');
      assert.equal(prints, 1); assert.equal(removed, 1);
    } finally {
      for (const key of ['document', 'URL', 'window'] as const) restoreGlobal(key, previous[key]);
    }
  });
}

for (const phase of ['before', 'load', 'settle', 'started'] as const) {
  Deno.test(`cancelamento da impressão em ${phase} respeita a vida do PDF`, async () => {
    const previous = Object.fromEntries(['document', 'URL', 'window'].map(key =>
      [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const frameEvents = createEventHub();
    const printEvents = createEventHub();
    const controller = new AbortController();
    let created = 0;
    let prints = 0;
    let removed = 0;
    let revoked = 0;
    let resolveSettle!: () => void;
    let resolveStarted!: () => void;
    const settling = new Promise<void>(resolve => { resolveSettle = resolve; });
    const started = new Promise<void>(resolve => { resolveStarted = resolve; });
    const iframe = Object.assign(frameEvents, {
      contentWindow: Object.assign(printEvents, {
        focus: () => undefined,
        print: () => { prints++; resolveStarted(); },
      }),
      remove: () => { removed++; },
      setAttribute: () => undefined,
      src: '', style: {}, title: '',
    });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: (callback: () => void, milliseconds: number) => {
        const timer = globalThis.setTimeout(callback, milliseconds);
        if (milliseconds === 101) resolveSettle();
        return timer;
      },
    } });
    Object.defineProperty(globalThis, 'URL', { configurable: true, value: {
      createObjectURL: () => 'blob:cancelable-print',
      revokeObjectURL: () => { revoked++; },
    } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      createElement: () => { created++; return iframe; },
      body: { appendChild: () => iframe },
    } });
    try {
      if (phase === 'before') controller.abort();
      const request = printPdfBlob(new Blob(['%PDF-SYNTHETIC'], { type: 'application/pdf' }), {
        signal: controller.signal, loadTimeoutMs: 1_000,
        settleMs: phase === 'settle' ? 101 : 0,
        requireAfterPrint: true, afterPrintFallbackMs: 1_000,
      });
      if (phase === 'load') controller.abort();
      if (phase === 'settle' || phase === 'started') frameEvents.dispatch('load');
      if (phase === 'settle') { await settling; controller.abort(); }
      if (phase === 'started') {
        await started;
        controller.abort();
        assert.equal(prints, 1);
        assert.equal(removed, 0, 'abortar não desmonta o PDF com impressão já aberta');
        assert.equal(revoked, 0);
        printEvents.dispatch('afterprint');
        await request;
      } else {
        await assert.rejects(request, error => error instanceof globalThis.DOMException && error.name === 'AbortError');
        frameEvents.dispatch('load');
        assert.equal(prints, 0, 'load tardio não abre uma impressão cancelada');
      }
      assert.equal(created, phase === 'before' ? 0 : 1);
      assert.equal(removed, phase === 'before' ? 0 : 1);
      assert.equal(revoked, phase === 'before' ? 0 : 1);
    } finally {
      for (const key of ['document', 'URL', 'window'] as const) restoreGlobal(key, previous[key]);
    }
  });
}
