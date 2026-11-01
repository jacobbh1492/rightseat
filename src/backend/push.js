import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Push notifications: register this phone for the signed-in user and route taps.
// The server (database triggers) decides what to send; see migrations/*_notifications.sql.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let lastToken = null;
export async function registerForPush(uid) {
  if (Platform.OS === 'web' || !Device.isDevice || !uid) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'RightSeat', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from('push_tokens').upsert({ token, user_id: uid, platform: Platform.OS, updated_at: new Date().toISOString() });
  lastToken = token;
  return token;
}

// On sign-out, stop sending this phone the previous account's notifications.
export async function unregisterPush() {
  if (lastToken) await supabase.from('push_tokens').delete().eq('token', lastToken);
  lastToken = null;
}

// Tapping a notification opens the screen it's about. Returns an unsubscribe function.
export function onNotificationTap(go) {
  if (Platform.OS === 'web') return () => {};
  const handle = (response) => {
    const data = response?.notification?.request?.content?.data || {};
    if (data.screen) go(data.screen, data.params || {});
  };
  Notifications.getLastNotificationResponseAsync().then((r) => r && handle(r)).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
