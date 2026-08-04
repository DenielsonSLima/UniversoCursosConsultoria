import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import {
  pushNotificationPolicyKeys,
  pushNotificationsService,
} from './push-notifications.service';

export const usePushNotificationPolicy = () => {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({
    queryKey: pushNotificationPolicyKeys.policy,
    queryFn: pushNotificationsService.getPolicy,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const savePolicy = useMutation({
    mutationFn: pushNotificationsService.updatePolicy,
    onSuccess: (policy) => {
      queryClient.setQueryData(pushNotificationPolicyKeys.policy, policy);
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('configuracoes-push-notification-policies')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'push_notification_policies',
      }, () => {
        void queryClient.invalidateQueries({ queryKey: pushNotificationPolicyKeys.all });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  return { policyQuery, savePolicy };
};
