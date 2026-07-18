import React, { useState } from "react";
import { UserCog } from "lucide-react";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { validatePassword, type PasswordPolicy } from "../../utils/passwordPolicy";

export type CreateUserInput = {
  email: string;
  name: string;
  username?: string;
  password?: string;
  oidcOnly: boolean;
  role: "ADMIN" | "USER";
  mustResetPassword: boolean;
  isActive: boolean;
};

type CreateUserFormProps = {
  oidcEnabled: boolean;
  passwordPolicy: PasswordPolicy;
  onSubmit: (input: CreateUserInput) => boolean | Promise<boolean>;
  onCancel: () => void;
};

export const CreateUserForm: React.FC<CreateUserFormProps> = ({
  oidcEnabled,
  passwordPolicy,
  onSubmit,
  onCancel,
}) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [oidcOnly, setOidcOnly] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [mustReset, setMustReset] = useState(true);
  const [active, setActive] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const reset = () => {
    setEmail("");
    setName("");
    setUsername("");
    setPassword("");
    setOidcOnly(false);
    setRole("USER");
    setMustReset(true);
    setActive(true);
    setValidationError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = oidcOnly ? null : validatePassword(password, passwordPolicy);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    const created = await onSubmit({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      username: username.trim() || undefined,
      password: oidcOnly ? undefined : password,
      oidcOnly,
      role,
      mustResetPassword: oidcOnly ? false : mustReset,
      isActive: active,
    });
    if (created) reset();
  };
  return (
  <div className="mb-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
        <UserCog size={24} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
        Create User
      </h2>
    </div>
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {validationError && <p className="md:col-span-2 text-sm font-medium text-red-600">{validationError}</p>}
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Username (optional)
        </label>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Account Type
        </label>
        <button
          type="button"
          onClick={() => {
            const next = !oidcOnly;
            setOidcOnly(next);
            if (next) setMustReset(false);
          }}
          disabled={!oidcEnabled}
          className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
            oidcOnly
              ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
              : "border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300"
          } ${!oidcEnabled ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          {oidcOnly ? "OIDC-only invite" : "Local password account"}
        </button>
        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
          {oidcOnly
            ? "This user can sign in through OIDC when the IdP email matches. No local password is stored."
            : "This user can sign in with a local password."}
        </p>
      </div>
      {!oidcOnly && (
        <div>
          <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
            Temporary Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={passwordPolicy.minLength}
            maxLength={passwordPolicy.maxLength}
            pattern={passwordPolicy.patternHtml}
            required
            className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
          />
          <PasswordRequirements
            password={password}
            policy={passwordPolicy}
            className="text-slate-600 dark:text-neutral-400"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Role
        </label>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as "ADMIN" | "USER")}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        >
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
        <div className="flex-1 w-full">
          <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
            Password Reset
          </label>
          <button
            type="button"
            onClick={() => !oidcOnly && setMustReset(!mustReset)}
            disabled={oidcOnly}
            className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
              mustReset
                ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200"
                : "border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300"
            } ${oidcOnly ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {oidcOnly
              ? "Not used for OIDC-only"
              : mustReset
                ? "Must reset password"
                : "No reset required"}
          </button>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
            Account Status
          </label>
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
              active
                ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                : "border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300"
            }`}
          >
            {active ? "Active" : "Inactive"}
          </button>
        </div>
      </div>
      <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => { reset(); onCancel(); }}
          className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
        >
          Create
        </button>
      </div>
    </form>
  </div>
  );
};
