import React from "react";
import { Check, X } from "lucide-react";
import { useLocale } from "../context/useLocale";

type PasswordMatchProps = {
  password: string;
  confirmPassword: string;
  className?: string;
};

export const PasswordMatch: React.FC<PasswordMatchProps> = ({
  password,
  confirmPassword,
  className = "",
}) => {
  const { t } = useLocale();
  if (!confirmPassword) return null;

  const matches = password === confirmPassword;

  return (
    <p
      className={`mt-1 flex items-center gap-1.5 text-xs ${
        matches
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      {matches ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <X size={14} aria-hidden="true" />
      )}
      {matches ? t("password.match") : t("password.mismatch")}
    </p>
  );
};
