import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetRequest } from './PasswordResetRequest';

const capability = vi.fn();
const requestReset = vi.fn();

vi.mock('../api', () => ({
  authPasswordResetCapability: () => capability(),
  authPasswordResetRequest: (email: string) => requestReset(email),
}));

vi.mock('../components/Logo', () => ({ Logo: () => <div data-testid="logo" /> }));

const renderPage = () => render(
  <MemoryRouter>
    <PasswordResetRequest />
  </MemoryRouter>,
);

describe('PasswordResetRequest', () => {
  beforeEach(() => {
    capability.mockReset();
    requestReset.mockReset();
  });

  it('offers the reset form only when delivery is available', async () => {
    capability.mockResolvedValue(true);
    renderPage();
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });

  it('shows the administrator fallback when delivery is unavailable', async () => {
    capability.mockResolvedValue(false);
    renderPage();
    expect(await screen.findByText(/does not send password reset emails/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('submits neutrally without revealing whether the account exists', async () => {
    capability.mockResolvedValue(true);
    requestReset.mockResolvedValue(undefined);
    renderPage();
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(requestReset).toHaveBeenCalledWith('user@example.com'));
    expect(await screen.findByText(/if an account with that email exists/i)).toBeInTheDocument();
  });
});
