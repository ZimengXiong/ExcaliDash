import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PasswordResetRequest } from './PasswordResetRequest';

const mockAuth = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth(),
}));

vi.mock('../components/Logo', () => ({
  Logo: () => <div data-testid="logo" />,
}));

const renderPage = (passwordResetEnabled: boolean) => {
  mockAuth.mockReturnValue({ passwordResetEnabled });
  return render(
    <MemoryRouter>
      <PasswordResetRequest />
    </MemoryRouter>,
  );
};

describe('password reset availability', () => {
  it('offers the form when the server can deliver mail', () => {
    renderPage(true);

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('falls back to the admin instructions when it cannot', () => {
    renderPage(false);

    expect(screen.getByRole('heading', { name: /password help/i })).toBeInTheDocument();
    expect(
      screen.getByText(/does not send password reset emails/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/admin-recover\.cjs/i)).toBeInTheDocument();
  });

  it('never shows an email field when delivery is unavailable', () => {
    renderPage(false);

    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /send reset link/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the way back to the login page in both states', () => {
    const { unmount } = renderPage(true);
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument();
    unmount();

    renderPage(false);
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument();
  });
});
