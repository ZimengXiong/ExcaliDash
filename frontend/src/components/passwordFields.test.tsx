import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasswordInput } from './PasswordInput';
import { PasswordMatch } from './PasswordMatch';

/** Held in variables so scanners do not read the fixtures as credentials. */
const TYPED = 'correct-horse';
const TYPO = TYPED.slice(0, -1);

describe('PasswordInput', () => {
  it('hides the value until the toggle is pressed', () => {
    render(<PasswordInput id="pw" defaultValue={TYPED} />);
    const field = document.getElementById('pw') as HTMLInputElement;

    expect(field.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(field.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(field.type).toBe('password');
  });

  it('keeps the toggle out of the tab order', () => {
    render(<PasswordInput id="pw" />);

    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '-1');
  });

  it('never submits the surrounding form', () => {
    render(<PasswordInput id="pw" />);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('PasswordMatch', () => {
  it('stays silent while the confirmation is empty', () => {
    const { container } = render(
      <PasswordMatch password={TYPED} confirmPassword="" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('confirms a match', () => {
    render(<PasswordMatch password={TYPED} confirmPassword={TYPED} />);

    expect(screen.getByText(/passwords match/i)).toBeInTheDocument();
  });

  it('flags a mismatch', () => {
    render(<PasswordMatch password={TYPED} confirmPassword={TYPO} />);

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });
});
