import type { UnifiedSupportChannel } from './unified-support-inbox.model';

export interface UnifiedSupportSelection {
  channel: UnifiedSupportChannel;
  conversationId: string;
  connectionId?: string | null;
}

type SelectionListener = (selection: UnifiedSupportSelection | null) => void;

let currentSelection: UnifiedSupportSelection | null = null;
let unifiedSupportActive = false;
const listeners = new Set<SelectionListener>();
const openedListeners = new Set<(selection: UnifiedSupportSelection) => void>();
const startClosedListeners = new Set<(channel: UnifiedSupportChannel) => void>();
let startInternal: (() => void) | null = null;

export const getUnifiedSupportSelection = () => currentSelection;
export const isUnifiedSupportActive = () => unifiedSupportActive;

export const setUnifiedSupportActive = (active: boolean) => {
  unifiedSupportActive = active;
};

export const registerUnifiedInternalStart = (handler: () => void) => {
  startInternal = handler;
  return () => { if (startInternal === handler) startInternal = null; };
};

export const requestUnifiedInternalStart = () => {
  if (!startInternal) return false;
  startInternal();
  return true;
};

export const setUnifiedSupportSelection = (selection: UnifiedSupportSelection | null) => {
  if (currentSelection?.channel === selection?.channel
    && currentSelection?.conversationId === selection?.conversationId
    && currentSelection?.connectionId === selection?.connectionId) return;
  currentSelection = selection;
  listeners.forEach((listener) => listener(selection));
};

export const notifyUnifiedSupportOpened = (selection: UnifiedSupportSelection) => {
  if (unifiedSupportActive) openedListeners.forEach((listener) => listener(selection));
};

export const notifyUnifiedSupportStartClosed = (channel: UnifiedSupportChannel) => {
  if (unifiedSupportActive) startClosedListeners.forEach((listener) => listener(channel));
};

export const subscribeUnifiedSupportStartClosed = (listener: (channel: UnifiedSupportChannel) => void) => {
  startClosedListeners.add(listener);
  return () => { startClosedListeners.delete(listener); };
};

export const subscribeUnifiedSupportOpened = (listener: (selection: UnifiedSupportSelection) => void) => {
  openedListeners.add(listener);
  return () => { openedListeners.delete(listener); };
};

export const subscribeUnifiedSupportSelection = (listener: SelectionListener) => {
  listeners.add(listener);
  listener(currentSelection);
  return () => {
    listeners.delete(listener);
  };
};
