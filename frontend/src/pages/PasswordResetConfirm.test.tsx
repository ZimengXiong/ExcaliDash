import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetConfirm } from './PasswordResetConfirm';

const confirmReset = vi.fn();

vi.mock('../api', () => ({
  authPasswordResetConfirm: (token: string, password: string) => confirmReset(token, password),
  isAxiosError: () => false,
}));

vi.mock('../components/Logo', () => ({ Logo: () => <div data-testid="logo" /> }));

const renderPage = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}>
    <PasswordResetConfirm />
  </MemoryRouter>,
);

const submitPassword = (password = 'StrongPassword1!') => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
};

describe('PasswordResetConfirm reset-token handling', () => {
  beforeEach(() => {
    confirmReset.mockReset();
    confirmReset.mockResolvedValue(undefined);
    vi.spyOn(window.history, 'replaceState');
  });

  it('reads a token from the URL fragment and strips it before submission', async () => {
    renderPage('/reset-password-confirm#token=fragment-secret');

    expect(window.history.replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/reset-password-confirm',
    );
    submitPassword();
    await waitFor(() => expect(confirmReset).toHaveBeenCalledWith(
      'fragment-secret',
      'StrongPassword1!',
    ));
  });

  it('temporarily accepts and strips legacy query-string tokens', async () => {
    renderPage('/reset-password-confirm?source=email&token=legacy-secret');

    expect(window.history.replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/reset-password-confirm?source=email',
    );
    submitPassword();
    await waitFor(() => expect(confirmReset).toHaveBeenCalledWith(
      'legacy-secret',
      'StrongPassword1!',
    ));
  });
});
