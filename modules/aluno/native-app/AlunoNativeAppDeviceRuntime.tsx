import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nativeAppService } from './native-app.service';
import { alunoAppDeviceKeys } from './native-app.queries';
import { NATIVE_PUSH_TOKEN_CHANGED_EVENT } from './native-app.bridge';

const HEARTBEAT_MS = 2 * 60 * 1000;

const AlunoNativeAppDeviceRuntime = ({ alunoId }: { alunoId: string }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!alunoId || !nativeAppService.isAvailable()) return undefined;
    let disposed = false;

    const register = async () => {
      try {
        const status = await nativeAppService.register();
        if (!disposed) queryClient.setQueryData(alunoAppDeviceKeys.status(alunoId), status);
      } catch (error) {
        console.warn('Não foi possível registrar o aplicativo deste aluno.', error);
      }
    };
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      void register();
    };

    void register();
    const intervalId = window.setInterval(heartbeat, HEARTBEAT_MS);
    const handleTokenChanged = () => void register();
    window.addEventListener('focus', heartbeat);
    window.addEventListener(NATIVE_PUSH_TOKEN_CHANGED_EVENT, handleTokenChanged);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', heartbeat);
      window.removeEventListener(NATIVE_PUSH_TOKEN_CHANGED_EVENT, handleTokenChanged);
      document.removeEventListener('visibilitychange', heartbeat);
    };
  }, [alunoId, queryClient]);

  return null;
};

export default AlunoNativeAppDeviceRuntime;
