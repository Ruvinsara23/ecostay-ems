import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import Page from '@/app/page';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/',
}));

function renderPage(
  gateway: FakeAuthGateway,
  source: FakeRoomDataSource = new FakeRoomDataSource(),
) {
  return render(
    <AuthProvider gateway={gateway}>
      <RoomDataSourceProvider source={source}>
        <Page />
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
}

describe('dashboard landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows who is signed in', () => {
    renderPage(
      new FakeAuthGateway({
        initialSession: {
          uid: 'fake-uid-owner@ecostay.test',
          email: 'owner@ecostay.test',
          role: 'owner',
        },
      }),
    );
    expect(screen.getByText(/signed in as owner@ecostay\.test/i)).toBeInTheDocument();
  });

  it('signs out and lands back on login', async () => {
    const user = userEvent.setup();
    renderPage(
      new FakeAuthGateway({
        initialSession: {
          uid: 'fake-uid-owner@ecostay.test',
          email: 'owner@ecostay.test',
          role: 'owner',
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/login?next=%2F'),
    );
    expect(
      screen.queryByText(/signed in as owner@ecostay\.test/i),
    ).not.toBeInTheDocument();
  });

  it('never renders dashboard content for a signed-out visitor', async () => {
    renderPage(new FakeAuthGateway());
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  it("shows the seeded room's live telemetry instead of a placeholder", () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'OCCUPIED_ACTIVE',
      temperature: 27.5,
      humidity: 62,
      updatedAt: 1_751_600_000_000,
    });
    renderPage(
      new FakeAuthGateway({
        initialSession: {
          uid: 'fake-uid-owner@ecostay.test',
          email: 'owner@ecostay.test',
          role: 'owner',
        },
      }),
      source,
    );

    expect(screen.getByText('room_001')).toBeInTheDocument();
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.queryByText(/next slice/i)).not.toBeInTheDocument();
  });
});
