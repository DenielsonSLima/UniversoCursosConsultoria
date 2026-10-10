import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import React from 'react';

const directory = fileURLToPath(new URL('./', import.meta.url));
const { outputFiles } = await build({
  stdin: { resolveDir: directory, contents: `
    export * from './external-transfer-draft';
    export * from './external-transfer.contract';
    export * from './external-transfer-grade';
    export * from './external-transfer.client';
    export * from './external-transfer-attempt';
    export * from './external-transfer-financial-configuration';
    export * from './external-transfer-preview-runner';
    export * from '../../academic-lifecycle.keys';
    export { default as AcademicFields } from './ExternalTransferAcademicFields';
    export { default as NotesFields } from './ExternalTransferNotesFields';
    export { default as Review } from './ExternalTransferReview';
  ` },
  bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external',
});
const domainModule = { exports: {} };
const nodeRequire = createRequire(import.meta.url);
new Function('require', 'module', 'exports', outputFiles[0].text)(nodeRequire, domainModule, domainModule.exports);
export const domain = domainModule.exports;

const compile = async (file, require) => {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const compiled = await transform(source, { loader: file.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.code)(require, module, module.exports);
  return module.exports;
};

// Adaptador determinístico das primitivas de estado: executa o hook do produto,
// mantendo refs, efeitos e setters entre renders, com consultas/RPC isoladas.
export class TransferHookRuntime {
  slots = [];
  index = 0;
  effects = [];
  dirty = false;
  queries = new Map();
  constructor(options, grade, context, rpc) {
    this.options = options;
    this.grade = grade;
    this.context = context;
    this.rpc = rpc;
  }
  useRef = (initial) => {
    const index = this.index++;
    return this.slots[index] ||= { current: initial };
  };
  useState = (initial) => {
    const ref = this.useRef(typeof initial === 'function' ? initial() : initial);
    return [ref.current, (next) => {
      ref.current = typeof next === 'function' ? next(ref.current) : next;
      this.dirty = true;
    }];
  };
  useEffect = (effect, dependencies) => {
    const ref = this.useRef(null);
    if (!ref.current || dependencies.some((value, index) => !Object.is(value, ref.current[index]))) {
      ref.current = dependencies;
      this.effects.push(effect);
    }
  };
  useQuery = (options) => {
    const key = JSON.stringify(options.queryKey);
    if (!this.queries.has(key)) {
      const grade = key.includes('grade-recebimento-transferencia-v1');
      const context = key.includes('recebimento-financeiro-v3');
      this.queries.set(key, { data: grade ? this.grade : context ? this.context : [], isFetching: false, isError: false, error: null });
    }
    const state = this.queries.get(key);
    return { ...state, refetch: async () => {
      try {
        state.data = await options.queryFn();
        state.isError = false;
        state.error = null;
      } catch (error) { state.isError = true; state.error = error; }
      return state;
    } };
  };
  useMutation = (options) => {
    const ref = this.useRef(null);
    if (!ref.current) ref.current = { isPending: false, isError: false,
      reset() { this.isError = false; },
      async mutateAsync(input) {
        this.isPending = true;
        this.isError = false;
        try {
          const value = await this.options.mutationFn(input);
          await this.options.onSuccess?.(value);
          return value;
        } catch (error) {
          this.isError = true;
          this.options.onError?.(error);
          throw error;
        } finally { this.isPending = false; }
      },
    };
    ref.current.options = options;
    return ref.current;
  };
  async initialize() {
    const service = domain.createExternalTransferClient(this.rpc);
    const compiled = await compile('./useReceiveExternalTransfer.ts', (name) => {
      if (name === 'react') return { useRef: this.useRef, useState: this.useState, useEffect: this.useEffect };
      if (name === '@tanstack/react-query') return { useQuery: this.useQuery, useMutation: this.useMutation };
      if (name.endsWith('/lib/supabase')) return { supabase: { from: () => { throw new Error('consulta de alunos proibida neste teste'); } } };
      if (name.endsWith('academic-lifecycle.service')) return { academicLifecycleService: {
        getGradeRecebimentoTransferencia: (id) => domain.loadExternalTransferGrade(this.rpc, id),
      } };
      if (name.endsWith('external-transfer.service')) return { externalTransferService: service };
      return domain;
    });
    this.hook = compiled.useReceiveExternalTransfer;
    return this.render();
  }
  render() {
    for (let count = 0; count < 10; count += 1) {
      this.index = 0;
      this.effects = [];
      this.dirty = false;
      this.state = this.hook(this.options);
      for (const effect of this.effects) effect();
      if (!this.dirty) return this.state;
    }
    throw new Error('O hook não estabilizou o rascunho.');
  }
}

export const createModalRuntime = async () => {
  const runtime = { step: 0 };
  const compiled = await compile('./ReceiveExternalTransferModal.tsx', (name) => {
    if (name === 'react') return { __esModule: true, default: React,
      useRef: () => ({ current: null }), useEffect: () => {},
      useState: () => [runtime.step, (next) => { runtime.step = next; }],
    };
    if (name.endsWith('ExternalTransferAcademicFields')) return { __esModule: true, default: domain.AcademicFields };
    if (name.endsWith('ExternalTransferNotesFields')) return { __esModule: true, default: domain.NotesFields };
    if (name.endsWith('ExternalTransferReview')) return { __esModule: true, default: domain.Review };
    if (name.endsWith('external-transfer-draft')) return domain;
    return nodeRequire(name);
  });
  runtime.render = (props) => compiled.default(props);
  return runtime;
};
const elements = (node) => !React.isValidElement(node) ? []
  : [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
const text = (node) => React.isValidElement(node)
  ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '');
export const findButton = (tree, label) => elements(tree).find((node) => node.type === 'button' && text(node).includes(label));
export const settleAction = () => new Promise((resolve) => setTimeout(resolve, 0));
