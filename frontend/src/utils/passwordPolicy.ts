const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,100}$/;

export const getPasswordMinLength = (): number => (import.meta.env.PROD ? 12 : 8);

export const getPasswordRequirementsLabel = (): string =>
  import.meta.env.PROD
    ? "12+ chars with upper/lowercase, number, and symbol"
    : "at least 8 characters";

export const validatePasswordForCurrentEnv = (
  password: string,
  fieldLabel = "Password"
): string | null => {
  if (import.meta.env.PROD) {
    if (!strongPasswordPattern.test(password)) {
      return `${fieldLabel} must be 12+ chars and include upper, lower, number, and symbol`;
    }
    return null;
  }

  if (password.length < 8) {
    return `${fieldLabel} must be at least 8 characters long`;
  }

  return null;
};

