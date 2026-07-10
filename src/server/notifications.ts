import type { Database } from 'firebase-admin/database';
import type { Messaging } from 'firebase-admin/messaging';
import { getMessaging } from 'firebase-admin/messaging';
import { getAdminApp } from './admin-app';
import type { AlertRecord } from './alerts';

const TYPE_LABELS: Record<string, string> = {
  'device-offline': 'Device offline',
  gas: 'Gas Leak',
  temperature: 'Temperature Alert',
  'water-level': 'Low Water Level',
  'ac-left-on': 'AC Left On',
};

// FCM sendEachForMulticast rejects calls with more than 500 tokens.
const FCM_MULTICAST_LIMIT = 500;

function formatMessageTitle(alert: AlertRecord): string {
  return `EcoStay Alert: ${TYPE_LABELS[alert.type] || alert.type}`;
}

function formatMessageBody(alert: AlertRecord): string {
  const room = alert.roomId;
  switch (alert.type) {
    case 'gas':
      return `Gas levels reached ${alert.value} ppm in ${room}!`;
    case 'temperature':
      return `High temperature of ${alert.value}°C detected in ${room}.`;
    case 'water-level':
      return `Water level dropped to ${alert.value}% in ${room}.`;
    case 'ac-left-on':
      return `Room ${room} is vacant but drawing ${alert.value}W of power.`;
    case 'device-offline':
      return `Device in ${room} has been offline for ${alert.value}s.`;
    default:
      return `Alert triggered in ${room} (value: ${alert.value})`;
  }
}

/**
 * Push-notification seam, same shape as every server workload: a pure
 * `(deps, input) → effect` handler plus an Admin-SDK adapter. Members of a
 * property ARE its owners (`properties/{pid}/members/{uid}: 'owner'` —
 * CONTEXT.md Auth & tenancy), so "notify the members" means "notify the
 * property's owners".
 */
export type NotificationsDeps = {
  /** `properties/{pid}/members` — uid → role. */
  readMembers(propertyId: string): Promise<Record<string, string> | null>;
  /** `users/{uid}/fcmTokens` — sanitized key → raw token (legacy entries: `true`). */
  readFcmTokens(uid: string): Promise<Record<string, string | true> | null>;
  removeFcmToken(uid: string, key: string): Promise<void>;
  sendMulticast(
    tokens: string[],
    notification: { title: string; body: string },
  ): Promise<{ successCount: number; failureCount: number; failedTokens: string[] }>;
};

export function createNotificationsDeps(
  db: Database,
  messaging: Messaging = getMessaging(getAdminApp()),
): NotificationsDeps {
  return {
    async readMembers(propertyId) {
      return (await db.ref(`properties/${propertyId}/members`).once('value')).val() as Record<
        string,
        string
      > | null;
    },
    async readFcmTokens(uid) {
      return (await db.ref(`users/${uid}/fcmTokens`).once('value')).val() as Record<
        string,
        string | true
      > | null;
    },
    async removeFcmToken(uid, key) {
      await db.ref(`users/${uid}/fcmTokens/${key}`).remove();
    },
    async sendMulticast(tokens, notification) {
      const response = await messaging.sendEachForMulticast({ tokens, notification });
      const failedTokens: string[] = [];
      response.responses.forEach((entry, index) => {
        if (!entry.success) failedTokens.push(tokens[index]);
      });
      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens,
      };
    },
  };
}

/**
 * Send a push for every newly opened alert to the owning property's members.
 * Failed tokens are pruned from `users/{uid}/fcmTokens` and skipped for the
 * rest of the run. One property failing never blocks another.
 */
export async function dispatchNotifications(
  deps: NotificationsDeps,
  alerts: AlertRecord[],
): Promise<{ sent: number; pruned: number }> {
  let sent = 0;
  let pruned = 0;
  if (alerts.length === 0) return { sent, pruned };

  const byProperty = new Map<string, AlertRecord[]>();
  for (const alert of alerts) {
    const list = byProperty.get(alert.propertyId) ?? [];
    list.push(alert);
    byProperty.set(alert.propertyId, list);
  }

  for (const [propertyId, propertyAlerts] of byProperty.entries()) {
    try {
      const members = await deps.readMembers(propertyId);
      const uids = Object.keys(members ?? {});
      if (uids.length === 0) continue;

      // token → owning entry, so a delivery failure can be pruned at its exact key.
      const pool = new Map<string, { uid: string; key: string }>();
      for (const uid of uids) {
        const entries = await deps.readFcmTokens(uid);
        for (const [key, value] of Object.entries(entries ?? {})) {
          const token = value === true ? key : value; // legacy entries stored `true` under the raw token
          pool.set(token, { uid, key });
        }
      }
      if (pool.size === 0) continue;

      for (const alert of propertyAlerts) {
        const tokens = [...pool.keys()];
        const notification = {
          title: formatMessageTitle(alert),
          body: formatMessageBody(alert),
        };
        for (let start = 0; start < tokens.length; start += FCM_MULTICAST_LIMIT) {
          const chunk = tokens.slice(start, start + FCM_MULTICAST_LIMIT);
          const result = await deps.sendMulticast(chunk, notification);
          sent += result.successCount;
          for (const failed of result.failedTokens) {
            const entry = pool.get(failed);
            if (!entry) continue;
            pool.delete(failed);
            await deps.removeFcmToken(entry.uid, entry.key);
            pruned += 1;
          }
        }
      }
    } catch (error) {
      console.error(`[notifications] dispatch failed for property ${propertyId}`, error);
    }
  }

  return { sent, pruned };
}
