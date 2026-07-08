import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeAdminOperations } from './admin-operations';
import { AdminOperationsProvider } from './admin-operations-context';
import { AdminOwners } from './admin-owners';

function renderView(operations: FakeAdminOperations) {
  return render(
    <AdminOperationsProvider operations={operations}>
      <AdminOwners />
    </AdminOperationsProvider>,
  );
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AdminOwners', () => {
  it('lists existing owners with their property + status', async () => {
    const ops = new FakeAdminOperations();
    ops.owners = [
      { uid: 'uid_1', email: 'aya@villa.lk', disabled: false, propertyIds: ['property_002'] },
      { uid: 'uid_2', email: 'ravi@inn.lk', disabled: true, propertyIds: ['property_003'] },
    ];
    renderView(ops);

    expect(await screen.findByText('aya@villa.lk')).toBeInTheDocument();
    const disabledRow = (await screen.findByText('ravi@inn.lk')).closest('li')!;
    expect(within(disabledRow).getByText(/disabled/i)).toBeInTheDocument();
  });

  it('creates an owner and shows it in the list', async () => {
    const ops = new FakeAdminOperations();
    renderView(ops);
    await screen.findByRole('button', { name: /create owner/i });

    fill(/email/i, 'new@villa.lk');
    fill(/password/i, 'brand-new-pass');
    fill(/property id/i, 'property_002');
    fireEvent.click(screen.getByRole('button', { name: /create owner/i }));

    await waitFor(() =>
      expect(ops.owners).toEqual([
        { uid: 'uid_1', email: 'new@villa.lk', disabled: false, propertyIds: ['property_002'] },
      ]),
    );
    expect(await screen.findByText('new@villa.lk')).toBeInTheDocument();
  });

  it('disables an owner via the row action', async () => {
    const ops = new FakeAdminOperations();
    ops.owners = [{ uid: 'uid_1', email: 'aya@villa.lk', disabled: false, propertyIds: ['property_002'] }];
    renderView(ops);

    const row = (await screen.findByText('aya@villa.lk')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /disable/i }));

    await waitFor(() => expect(ops.owners[0].disabled).toBe(true));
    expect(within((await screen.findByText('aya@villa.lk')).closest('li')!).getByText(/disabled/i)).toBeInTheDocument();
  });

  it('shows the reset link after requesting a reset', async () => {
    const ops = new FakeAdminOperations();
    ops.owners = [{ uid: 'uid_1', email: 'aya@villa.lk', disabled: false, propertyIds: ['property_002'] }];
    renderView(ops);

    const row = (await screen.findByText('aya@villa.lk')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /reset password/i }));

    const link = await screen.findByRole('link', { name: /reset link/i });
    expect(link).toHaveAttribute('href', ops.resetLink);
  });

  it('surfaces a create error and keeps the form', async () => {
    const ops = new FakeAdminOperations();
    ops.failWith = 'an account with that email already exists';
    renderView(ops);
    await screen.findByRole('button', { name: /create owner/i });

    fill(/email/i, 'dup@villa.lk');
    fill(/password/i, 'brand-new-pass');
    fill(/property id/i, 'property_002');
    fireEvent.click(screen.getByRole('button', { name: /create owner/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    expect(screen.getByLabelText(/email/i)).toHaveValue('dup@villa.lk');
  });
});
