import React from 'react';

type PasswordMatchProps = {
  password: string;
  confirmPassword: string;
  className?: string;
};

/**
 * Live match feedback for a password confirmation field.
 *
 * Stays silent until the confirmation has content, so an untouched form does
 * not greet the user with a red error.
 */
export const PasswordMatch: React.FC<PasswordMatchProps> = ({
  password,
  confirmPassword,
  className = '',
}) => {
  if (!confirmPassword) return null;

  const matches = password === confirmPassword;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-1 flex items-center gap-1.5 text-xs ${
        matches
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
      } ${className}`}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        {matches ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        )}
      </svg>
      {matches ? 'Passwords match' : 'Passwords do not match'}
    </div>
  );
};
