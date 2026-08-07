import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nativeAppService } from './native-app.service';

export const alunoAppDeviceKeys = {
  all: ['aluno', 'native-app-device'] as const,
  status: (alunoId: string) => [...alunoAppDeviceKeys.all, alunoId] as const,
};

export const useAlunoAppDeviceStatus = (alunoId: string) => {
  const queryClient = useQueryClient();
  const queryKey = alunoAppDeviceKeys.status(alunoId);
  const statusQuery = useQuery({
    queryKey,
    queryFn: nativeAppService.getStatus,
    enabled: Boolean(alunoId) && nativeAppService.isAvailable(),
    staleTime: 30_000,
    retry: 1,
  });
  const enableMutation = useMutation({
    mutationFn: nativeAppService.requestNotificationPermission,
    onSuccess: (status) => queryClient.setQueryData(queryKey, status),
  });
  const disableMutation = useMutation({
    mutationFn: nativeAppService.disableNotifications,
    onSuccess: (status) => queryClient.setQueryData(queryKey, status),
  });
  return { statusQuery, enableMutation, disableMutation };
};

