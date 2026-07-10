import { describe, expect, it } from 'vitest';
import { fcmTokenKey } from './use-fcm';

describe('fcmTokenKey', () => {
  it('passes through typical FCM tokens unchanged', () => {
    const token = 'fXk3:APA91bE_x-y0Z';
    expect(fcmTokenKey(token)).toBe(token);
  });

  it('replaces every character RTDB forbids in keys', () => {
    expect(fcmTokenKey('a.b#c$d/e[f]g')).toBe('a_b_c_d_e_f_g');
  });
});
