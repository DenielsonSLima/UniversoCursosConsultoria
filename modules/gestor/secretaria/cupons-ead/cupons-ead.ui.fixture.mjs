import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { JSDOM } = process.env.JSDOM_MODULE_PATH
  ? await import(pathToFileURL(resolve(process.env.JSDOM_MODULE_PATH)).href) : require('jsdom');
const bundle = await build({
  stdin: { resolveDir: directory, loader: 'tsx', contents: `
    import React,{act}from'react';import{createRoot}from'react-dom/client';
    import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
    import CuponsEadPage from'./CuponsEadPage';
    window.IS_REACT_ACT_ENVIRONMENT=true;
    const client=new QueryClient({defaultOptions:{queries:{gcTime:0},mutations:{retry:false}}});
    const root=createRoot(document.getElementById('root'));
    window.interact=async(action=()=>{},ms=15)=>{await act(async()=>{action();await new Promise(resolve=>setTimeout(resolve,ms));});};
    window.mount=async(props={})=>{await window.interact(()=>root.render(<QueryClientProvider client={client}><CuponsEadPage poloId="polo-a" canManage={true} contextId="gestor-a" {...props}/></QueryClientProvider>));};
    window.cleanup=async()=>{await act(async()=>root.unmount());client.clear();};
  ` },
  bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' },
  plugins: [{ name: 'local-coupons-management', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
    plugin.onResolve({ filter: /coupons-environment$/ }, () => ({ path: 'gate', namespace: 'fixture' }));
    plugin.onLoad({ filter: /gate/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const isEadCouponsEnvironmentAllowed=()=>window.localEnabled;
      export const assertEadCouponsEnvironment=()=>{if(!window.localEnabled)throw new Error('Ambiente não autorizado.');};
    ` }));
    plugin.onLoad({ filter: /supabase/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const supabase={rpc(name,args){const response=()=>window.fakeRpc(name,args);return{abortSignal(signal){return response();},then(resolve,reject){return response().then(resolve,reject);}};},
        channel(name){window.channelNames.push(name);const channel={on(type,spec,callback){window.channelHandlers.push({spec,callback,channel});return channel;},subscribe(callback){window.subscriptions.push(callback);callback('SUBSCRIBED');return channel;}};return channel;},
        removeChannel(channel){window.removedChannels.push(channel);window.channelHandlers=window.channelHandlers.filter(item=>item.channel!==channel);}};
    ` }));
  } }],
});

export const makeCoupon = (changes = {}) => ({
  id: 'coupon-a', poloId: 'polo-a', code: 'FICTICIO50', discountPercent: 50, totalLimit: 100,
  startsAt: '2026-11-01T03:00:00.000Z', endsAt: '2026-12-01T02:59:00.000Z', perStudentLimit: 2,
  active: true, allCourses: true, courseIds: [], reservedCount: 1, confirmedCount: 0,
  createdAt: '2026-11-01T03:00:00.000Z', updatedAt: '2026-11-01T03:00:00.000Z', ...changes,
});

export const makeCouponHistoryItem = (changes = {}) => ({
  id: 'redemption-a', studentId: 'student-a', studentName: 'Aluno fictício 1', courseId: 'course-a',
  courseName: 'Curso EAD fictício', status: 'CONFIRMED', originalAmount: 99.90, discountAmount: 37.46,
  payableAmount: 62.44, receivedAmount: 62.44, receivableId: 'receivable-a', matriculaId: 'enrollment-a',
  createdAt: '2026-11-16T12:00:00.000Z', confirmedAt: '2026-11-16T12:05:00.000Z', reviewRequired: false,
  ...changes,
});

export function createCuponsFixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: value => window.setTimeout(() => this.port1.onmessage?.({ data: value }), 0) };
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.localEnabled = true;
  window.couponsAvailable = true;
  window.channelNames = [];
  window.channelHandlers = [];
  window.removedChannels = [];
  window.subscriptions = [];
  window.requests = [];
  window.saveErrors = [];
  window.saveDelay = null;
  window.coupons = { 'polo-a': [makeCoupon()], 'polo-b': [makeCoupon({ id: 'coupon-b', poloId: 'polo-b', code: 'OUTROPOLO' })] };
  window.histories = {};
  window.fakeRpc = async (name, rawArgs) => {
    const args = JSON.parse(JSON.stringify(rawArgs || {}));
    window.requests.push({ name, args });
    if (name === 'ead_coupons_available') return { data: window.couponsAvailable, error: null };
    if (name === 'ead_coupons_list') {
      const items = (window.coupons[args.p_polo_id] || []).filter(coupon => coupon.code.includes(args.p_search.toUpperCase()));
      return { data: { items: items.slice((args.p_page - 1) * 20, args.p_page * 20), total: items.length, page: args.p_page, pageSize: 20 }, error: null };
    }
    if (name === 'ead_coupons_courses') return { data: [{ id: 'course-a', name: 'Administração fictícia' }, { id: 'course-b', name: 'Enfermagem fictícia' }], error: null };
    if (name === 'ead_coupons_history') {
      const items = window.histories[args.p_coupon_id] || [];
      return { data: { items: items.slice((args.p_page - 1) * 20, args.p_page * 20), total: items.length, page: args.p_page, pageSize: 20 }, error: null };
    }
    if (name === 'ead_coupons_save') {
      if (window.saveDelay) { const delay = window.saveDelay; window.saveDelay = null; await delay; }
      const error = window.saveErrors.shift();
      if (error) return { data: null, error };
      const result = makeCoupon({ ...args.p_coupon, id: args.p_coupon.id || 'coupon-new', poloId: args.p_polo_id, updatedAt: '2026-11-16T12:00:00.000Z' });
      window.coupons[args.p_polo_id] = [...window.coupons[args.p_polo_id].filter(item => item.id !== result.id), result];
      return { data: result, error: null };
    }
    throw new Error('RPC inesperada: ' + name);
  };
  window.eval(bundle.outputFiles[0].text);
  const document = window.document;
  const setValue = async (element, value) => window.interact(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  const click = async element => window.interact(() => element.click());
  const button = text => Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes(text));
  return { dom, window, document, setValue, click, button, flush: ms => window.interact(() => {}, ms ?? 15),
    async close() { await window.cleanup(); dom.window.close(); } };
}
