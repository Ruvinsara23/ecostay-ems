import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import type { AlertView } from './room-data-source';
import { FakeRoomDataSource } from './fake-room-data-source';
import { RoomDataSourceProvider } from './room-data-source-context';
import { AlertCenter } from './alert-center';

const OWNER = {
  uid: 'uid-owner',
  email: 'owner@ecostay.test',
  role: 'owner',
} as const;

function renderCenter(alerts: AlertView[] = []) {
  const source = new FakeRoomDataSource();
  source.emitAlerts('property_001', alerts);
  render(
    <AuthProvider gateway={new FakeAuthGateway({ initialSession: OWNER })}>
      <RoomDataSourceProvider source={source}>
        <AlertCenter propertyId="property_001" />
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
  return source;
}

const gasAlert: AlertView = {
  id: 'a1',
  roomId: 'room_001',
  type: 'gas',
  severity: 'critical',
  value: 452,
  startedAt: Date.now() - 120_000,
};

describe('AlertCenter', () => {
  it('says all quiet when there are no alerts', () => {
    renderCenter();
    expect(screen.getByText(/no alerts/i)).toBeInTheDocument();
  });

  it('lists an open alert with type, severity label, value and room', () => {
    renderCenter([gasAlert]);
    const open = screen.getByRole('list', { name: /open alerts/i });
    expect(within(open).getByText('Gas')).toBeInTheDocument();
    expect(within(open).getByText('Critical')).toBeInTheDocument(); // severity as text, not color alone
    expect(within(open).getByText(/452 ppm/)).toBeInTheDocument();
    expect(within(open).getByText(/room_001/)).toBeInTheDocument();
  });

  it('acknowledges an alert as the signed-in user', async () => {
    renderCenter([gasAlert]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /acknowledge/i }));

    expect(await screen.findByText(/acknowledged/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
  });

  it('separates resolved history from open alerts', () => {
    renderCenter([
      gasAlert,
      {
        id: 'a0',
        roomId: 'room_001',
        type: 'device-offline',
        severity: 'warning',
        value: 240,
        startedAt: Date.now() - 3_600_000,
        resolvedAt: Date.now() - 3_000_000,
      },
    ]);

    const open = screen.getByRole('list', { name: /open alerts/i });
    expect(within(open).queryByText('Device offline')).not.toBeInTheDocument();

    const resolved = screen.getByRole('list', { name: /resolved/i });
    expect(within(resolved).getByText('Device offline')).toBeInTheDocument();
  });

  it('formats each alert type with its unit', () => {
    renderCenter([
      { ...gasAlert, id: 't1', type: 'temperature', severity: 'warning', value: 33.5 },
      { ...gasAlert, id: 'w1', type: 'water-level', severity: 'warning', value: 15 },
      { ...gasAlert, id: 'o1', type: 'device-offline', severity: 'warning', value: 128 },
    ]);
    expect(screen.getByText(/33\.5 °C/)).toBeInTheDocument();
    expect(screen.getByText(/15 %/)).toBeInTheDocument();
    expect(screen.getByText(/silent 128 s/i)).toBeInTheDocument();
  });
});
