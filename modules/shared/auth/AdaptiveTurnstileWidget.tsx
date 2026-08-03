import React from 'react';
import { Capacitor } from '@capacitor/core';
import NativeTurnstileWidget from './NativeTurnstileWidget';
import TurnstileWidget, { type TurnstileStatus } from './TurnstileWidget';
export type { TurnstileStatus } from './TurnstileWidget';
import type { NativeTurnstileAction } from './native-turnstile-bridge';

type Props = {
  action: NativeTurnstileAction;
  resetSignal: number;
  onTokenChange: (token: string) => void;
  onError?: (errorCode?: string) => void;
  onStatusChange?: (status: TurnstileStatus) => void;
};

const AdaptiveTurnstileWidget: React.FC<Props> = (props) => {
  if (Capacitor.isNativePlatform()) {
    return <NativeTurnstileWidget {...props} />;
  }

  return <TurnstileWidget {...props} />;
};

export default AdaptiveTurnstileWidget;
