import React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import {
  getPasswordRequirements,
  type PasswordPolicy,
} from "../utils/passwordPolicy";

type Props = {
  password: string;
  policy: PasswordPolicy;
  className?: string;
};

export const PasswordRequirements: React.FC<Props> = ({
  password,
  policy,
  className,
}) => {
  const requirements = getPasswordRequirements(password, policy);

  return (
    <ul className={`mt-2 space-y-1 text-xs ${className || ""}`.trim()}>
      {requirements.map((req) => (
        <li key={req.id} className="flex items-start gap-2">
          {req.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 text-slate-400 dark:text-neutral-500" />
          )}
          <span
            className={
              req.ok
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-slate-600 dark:text-neutral-400"
            }
          >
            {req.label}
          </span>
        </li>
      ))}
    </ul>
  );
};
