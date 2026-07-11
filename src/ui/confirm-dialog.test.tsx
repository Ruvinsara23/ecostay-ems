import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

const baseProps = {
  title: 'Reset device password?',
  body: 'The current password stops working immediately.',
  confirmLabel: 'Reset password',
};

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog {...baseProps} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows title, body, and fires onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} open onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /reset device password/i })).toBeInTheDocument();
    expect(screen.getByText(/stops working immediately/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cancel button and backdrop click both fire onCancel — confirm never fires', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} open onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('presentation'));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('clicking inside the dialog does not cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} open onConfirm={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByText(/stops working immediately/i));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
