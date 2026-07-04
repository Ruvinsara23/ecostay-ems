import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RoomLatest } from './room-data-source';
import { RoomScene } from './room-scene';

const LIVE: RoomLatest = {
  occupancyState: 'OCCUPIED_ACTIVE',
  temperature: 27.5,
  humidity: 62,
  gas: 150,
  waterLevel: 76,
  flowRate: 0,
  doorOpen: false,
  motionDetected: true,
  humanPresent: true,
  updatedAt: 1_751_600_000_000,
};

describe('RoomScene', () => {
  it('renders the five letter-chip sensor markers as buttons', () => {
    render(<RoomScene latest={LIVE} online />);
    expect(screen.getByRole('button', { name: /door sensor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /motion sensor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /climate sensor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gas sensor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /water sensor/i })).toBeInTheDocument();
  });

  it('opens a tooltip with live readings when a marker is clicked, and closes on outside click', async () => {
    render(<RoomScene latest={LIVE} online />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /climate sensor/i }));
    expect(screen.getByText(/27\.5 °C/)).toBeInTheDocument();
    expect(screen.getByText(/62 %/)).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByText(/27\.5 °C/)).not.toBeInTheDocument();
  });

  it('swings the door with doorOpen', () => {
    const { rerender } = render(<RoomScene latest={LIVE} online />);
    expect(document.querySelector('[data-door="closed"]')).not.toBeNull();

    rerender(<RoomScene latest={{ ...LIVE, doorOpen: true }} online />);
    expect(document.querySelector('[data-door="open"]')).not.toBeNull();
  });

  it('glows the floor with human presence and dims it when away', () => {
    const { rerender } = render(<RoomScene latest={LIVE} online />);
    expect(document.querySelector('[data-glow="on"]')).not.toBeNull();

    rerender(
      <RoomScene latest={{ ...LIVE, humanPresent: false, occupancyState: 'VACANT' }} online />,
    );
    expect(document.querySelector('[data-glow="off"]')).not.toBeNull();
  });

  it('marks the scene stale when offline', () => {
    render(<RoomScene latest={LIVE} online={false} />);
    expect(document.querySelector('[data-scene-stale]')).not.toBeNull();
  });

  it('rings the gas marker during an alarm', () => {
    render(<RoomScene latest={{ ...LIVE, gas: 452 }} online />);
    expect(document.querySelector('[data-gas-alarm]')).not.toBeNull();
  });
});
