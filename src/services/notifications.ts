import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { requireSupabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export async function registerPushNotifications() {
  if (!Device.isDevice) return null;
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('matches', { name: 'Matches', importance: Notifications.AndroidImportance.HIGH });
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const client = requireSupabase();
  const user = (await client.auth.getUser()).data.user;
  if (!user) return null;
  const result = await client.rpc('register_push_token', { token_input: token, platform_input: Platform.OS });
  if (result.error) throw result.error;
  return token;
}

export async function unregisterPushNotifications() {
  if (!Device.isDevice) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const result = await requireSupabase().rpc('unregister_push_token', { token_input: token });
  if (result.error) throw result.error;
}

export type NotificationDestination = { type: 'match' | 'city_response'; matchId?: string; postId?: string };

export function onNotificationOpened(listener: (destination: NotificationDestination) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string; matchId?: string; postId?: string };
    if (data.type === 'match') listener({ type: 'match', matchId: data.matchId });
    if (data.type === 'city_response') listener({ type: 'city_response', postId: data.postId });
  });
}

export async function getInitialNotificationDestination(): Promise<NotificationDestination | undefined> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) await Notifications.clearLastNotificationResponseAsync();
  const data = response?.notification.request.content.data as { type?: string; matchId?: string; postId?: string } | undefined;
  if (data?.type === 'match') return { type: 'match', matchId: data.matchId };
  if (data?.type === 'city_response') return { type: 'city_response', postId: data.postId };
  return undefined;
}
