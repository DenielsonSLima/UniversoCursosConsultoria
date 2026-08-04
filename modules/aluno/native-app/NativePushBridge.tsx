import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';
import { installUniversoNativeAppBridge } from './native-app.bridge';

const NativePushBridge = () => {
  const navigate = useNavigate();
  const { toasts, removeToast, toast } = useToast();

  useEffect(() => installUniversoNativeAppBridge(
    (destination) => navigate(destination),
    ({ title, body, destination }) => {
      // No iPhone o banner nativo já é apresentado pelas presentationOptions.
      if (Capacitor.getPlatform() === 'ios') return;
      toast.info(title, body, {
        contextLabel: 'Notificação do app',
        ...(destination ? {
          actionLabel: 'Abrir',
          onAction: () => navigate(destination),
        } : {}),
      });
    },
  ), [navigate, toast]);

  return <ToastNotification toasts={toasts} onRemove={removeToast} />;
};

export default NativePushBridge;
