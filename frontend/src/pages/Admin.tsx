import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import { Toaster } from "sonner";
import { getPasswordPolicy, validatePassword } from "../utils/passwordPolicy";
import { AccessControlCard } from "./admin/AccessControlCard";
import { AdminHeader, AdminStatusMessages } from "./admin/AdminShell";
import { CreateUserForm } from "./admin/CreateUserForm";
import { LoginRateLimitCard } from "./admin/LoginRateLimitCard";
import { UserActionModals } from "./admin/UserActionModals";
import { UsersTable } from "./admin/UsersTable";
import type { AdminUser } from "./admin/types";
import { useAccessControlSettings } from "./admin/useAccessControlSettings";
import { useAdminCollections } from "./admin/useAdminCollections";
import { useLoginRateLimitSettings } from "./admin/useLoginRateLimitSettings";
import {
  IMPERSONATION_KEY,
  type ImpersonationState,
  readImpersonationState,
  USER_KEY,
} from "../utils/impersonation";
export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, authEnabled } = useAuth();
  const isAdmin = authUser?.role === "ADMIN";
  const passwordPolicy = getPasswordPolicy();
  const {
    collections,
    loadCollections,
    handleSelectCollection,
    handleCreateCollection,
    handleEditCollection,
    handleDeleteCollection,
  } = useAdminCollections(navigate);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createOidcOnly, setCreateOidcOnly] = useState(false);
  const [createRole, setCreateRole] = useState<"ADMIN" | "USER">("USER");
  const [createMustReset, setCreateMustReset] = useState(true);
  const [createActive, setCreateActive] = useState(true);
  const [impersonateTarget, setImpersonateTarget] = useState<AdminUser | null>(
    null,
  );
  const [resetPasswordLoadingId, setResetPasswordLoadingId] = useState<
    string | null
  >(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);
  const accessControl = useAccessControlSettings(isAdmin, setError, setSuccess);
  const loginRateLimit = useLoginRateLimitSettings({
    authEnabled,
    isAdmin,
    setError,
    setSuccess,
  });
  useEffect(() => {
    if (authEnabled === false) {
      navigate("/settings", { replace: true });
      return;
    }
    if (authEnabled && !isAdmin) {
      navigate("/", { replace: true });
      return;
    }
  }, [authEnabled, isAdmin, navigate]);
  const loadUsers = async () => {
    setLoadingUsers(true);
    setError("");
    try {
      const response = await api.api.get<{ users: AdminUser[] }>("/auth/users");
      setUsers(response.data.users || []);
    } catch (err: unknown) {
      let message = "Failed to load users";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoadingUsers(false);
    }
  };
  const generateTempPassword = async (target: AdminUser) => {
    setResetPasswordLoadingId(target.id);
    setError("");
    setSuccess("");
    try {
      const response = await api.api.post<{
        tempPassword: string;
        user: { id: string; email: string };
      }>(`/auth/users/${target.id}/reset-password`);
      setResetPasswordResult({
        email: response.data.user?.email || target.email,
        tempPassword: response.data.tempPassword,
      });
      setSuccess(`Temporary password generated for ${target.email}`);
      await loadUsers();
    } catch (err: unknown) {
      let message = "Failed to reset password";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setResetPasswordLoadingId(null);
    }
  };
  useEffect(() => {
    if (!authEnabled || !isAdmin) return;
    void loadCollections();
    void loadUsers();
    void accessControl.load();
  }, [authEnabled, isAdmin]);
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const passwordError = createOidcOnly
      ? null
      : validatePassword(createPassword, passwordPolicy);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    try {
      const payload = {
        email: createEmail.trim().toLowerCase(),
        name: createName.trim(),
        username: createUsername.trim() ? createUsername.trim() : undefined,
        password: createOidcOnly ? undefined : createPassword,
        oidcOnly: createOidcOnly,
        role: createRole,
        mustResetPassword: createOidcOnly ? false : createMustReset,
        isActive: createActive,
      };
      const response = await api.api.post<{ user: AdminUser }>(
        "/auth/users",
        payload,
      );
      setUsers((prev) =>
        [...prev, response.data.user].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      );
      setSuccess("User created");
      setCreateEmail("");
      setCreateName("");
      setCreateUsername("");
      setCreatePassword("");
      setCreateOidcOnly(false);
      setCreateRole("USER");
      setCreateMustReset(true);
      setCreateActive(true);
      setCreateOpen(false);
    } catch (err: unknown) {
      let message = "Failed to create user";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    }
  };
  const patchUser = async (
    id: string,
    data: Partial<
      Pick<
        AdminUser,
        "username" | "name" | "role" | "mustResetPassword" | "isActive"
      >
    >,
  ) => {
    setError("");
    setSuccess("");
    try {
      const response = await api.api.patch<{ user: AdminUser }>(
        `/auth/users/${id}`,
        data,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? response.data.user : u)),
      );
      setSuccess("User updated");
    } catch (err: unknown) {
      let message = "Failed to update user";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    }
  };
  const startImpersonation = async (target: AdminUser) => {
    setError("");
    setSuccess("");
    if (readImpersonationState()) {
      setError("Stop the current impersonation before starting a new one.");
      return;
    }
    const originalUser = localStorage.getItem(USER_KEY);
    if (!originalUser) {
      setError("Missing current session user state.");
      return;
    }
    try {
      const response = await api.api.post<{
        user: { id: string; email: string; name: string };
      }>("/auth/impersonate", { userId: target.id });
      const state: ImpersonationState = {
        original: { user: JSON.parse(originalUser) },
        impersonator: {
          id: authUser?.id || "unknown",
          email: authUser?.email || "unknown",
          name: authUser?.name || "Unknown Admin",
        },
        target: {
          id: response.data.user.id,
          email: response.data.user.email,
          name: response.data.user.name,
        },
        startedAt: new Date().toISOString(),
      };
      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state));
      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      window.location.href = "/";
    } catch (err: unknown) {
      let message = "Failed to impersonate user";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    }
  };
  if (authEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {" "}
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>{" "}
      </div>
    );
  }
  return (
    <Layout
      collections={collections}
      selectedCollectionId="ADMIN"
      onSelectCollection={handleSelectCollection}
      onCreateCollection={handleCreateCollection}
      onEditCollection={handleEditCollection}
      onDeleteCollection={handleDeleteCollection}
    >
      {" "}
      <AdminHeader
        loadingUsers={loadingUsers}
        onRefreshUsers={loadUsers}
        onToggleCreateUser={() => setCreateOpen((value) => !value)}
      />{" "}
      <AdminStatusMessages success={success} error={error} />{" "}
      {createOpen && (
        <CreateUserForm
          email={createEmail}
          name={createName}
          username={createUsername}
          password={createPassword}
          oidcOnly={createOidcOnly}
          oidcEnabled={accessControl.oidcEnabled}
          role={createRole}
          mustReset={createMustReset}
          active={createActive}
          passwordPolicy={passwordPolicy}
          onSubmit={handleCreateUser}
          onCancel={() => setCreateOpen(false)}
          onEmailChange={setCreateEmail}
          onNameChange={setCreateName}
          onUsernameChange={setCreateUsername}
          onPasswordChange={setCreatePassword}
          onOidcOnlyChange={setCreateOidcOnly}
          onRoleChange={setCreateRole}
          onMustResetChange={setCreateMustReset}
          onActiveChange={setCreateActive}
        />
      )}{" "}
      <AccessControlCard
        registrationEnabled={accessControl.registrationEnabled}
        localRegistrationAllowed={accessControl.localRegistrationAllowed}
        oidcEnabled={accessControl.oidcEnabled}
        oidcProviderName={accessControl.oidcProviderName}
        oidcJitProvisioningEnabled={accessControl.oidcJitProvisioningEnabled}
        loading={accessControl.loading}
        onToggleRegistration={accessControl.toggleRegistration}
        onToggleOidcJitProvisioning={accessControl.toggleOidcJitProvisioning}
      />{" "}
      <LoginRateLimitCard
        loading={loginRateLimit.loading}
        saving={loginRateLimit.saving}
        autoSaveQueued={loginRateLimit.autoSaveQueued}
        dirty={loginRateLimit.dirty}
        enabled={loginRateLimit.enabled}
        windowMinutes={loginRateLimit.windowMinutes}
        maxAttempts={loginRateLimit.maxAttempts}
        resetIdentifier={loginRateLimit.resetIdentifier}
        resetLoading={loginRateLimit.resetLoading}
        userEmails={users.map((user) => user.email)}
        onToggleEnabled={() =>
          loginRateLimit.setEnabled(!loginRateLimit.enabled)
        }
        onWindowMinutesChange={loginRateLimit.setWindowMinutes}
        onMaxAttemptsChange={loginRateLimit.setMaxAttempts}
        onResetIdentifierChange={loginRateLimit.setResetIdentifier}
        onReset={loginRateLimit.reset}
      />{" "}
      <UsersTable
        users={users}
        loading={loadingUsers}
        currentUserId={authUser?.id}
        resetPasswordLoadingId={resetPasswordLoadingId}
        onRoleChange={(user, role) => patchUser(user.id, { role })}
        onToggleActive={(user) =>
          patchUser(user.id, { isActive: !user.isActive })
        }
        onToggleMustReset={(user) =>
          patchUser(user.id, { mustResetPassword: !user.mustResetPassword })
        }
        onImpersonate={setImpersonateTarget}
        onResetPassword={generateTempPassword}
      />{" "}
      <UserActionModals
        impersonateTarget={impersonateTarget}
        resetPasswordResult={resetPasswordResult}
        onConfirmImpersonation={startImpersonation}
        onCancelImpersonation={() => setImpersonateTarget(null)}
        onCopyPassword={(result) =>
          navigator.clipboard?.writeText(result.tempPassword)
        }
        onClosePassword={() => setResetPasswordResult(null)}
      />{" "}
      <Toaster position="bottom-center" />{" "}
    </Layout>
  );
};
