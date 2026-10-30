import React from "react";
import { UserPlus } from "lucide-react";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionHeader,
} from "../settings/SettingsRow";
import { useLocale } from "../../context/useLocale";
import type { TranslationKey } from "../../i18n";

type AccessControlCardProps = {
  registrationEnabled: boolean | null;
  localRegistrationAllowed: boolean;
  oidcEnabled: boolean;
  oidcProviderName: string | null;
  oidcJitProvisioningEnabled: boolean | null;
  loading: boolean;
  onToggleRegistration: () => void | Promise<void>;
  onToggleOidcJitProvisioning: () => void | Promise<void>;
};

const getRegistrationDescriptionKey = (
  registrationEnabled: boolean | null,
  localRegistrationAllowed: boolean,
): TranslationKey => {
  if (registrationEnabled === null) return "admin.access.loading";
  if (!localRegistrationAllowed) return "admin.access.oidcOnly";
  return registrationEnabled
    ? "admin.access.signupOpen"
    : "admin.access.signupBlocked";
};

export const AccessControlCard: React.FC<AccessControlCardProps> = ({
  registrationEnabled,
  localRegistrationAllowed,
  oidcEnabled,
  oidcProviderName,
  oidcJitProvisioningEnabled,
  loading,
  onToggleRegistration,
  onToggleOidcJitProvisioning,
}) => {
  const { t } = useLocale();
  return (
    <section className="mb-6">
      <SettingsSectionHeader
        icon={<UserPlus size={20} />}
        tileClassName="border-black bg-emerald-400 text-black dark:border-neutral-700 dark:bg-emerald-400 dark:text-black"
        title={t("admin.access.title")}
        subtitle={t("admin.access.subtitle")}
      />

      <SettingsCard>
        <SettingsRow
          title={t("admin.access.localSignup")}
          description={t(
            getRegistrationDescriptionKey(
              registrationEnabled,
              localRegistrationAllowed,
            ),
          )}
        >
          <PlayfulSwitch
            checked={Boolean(registrationEnabled)}
            disabled={
              loading ||
              registrationEnabled === null ||
              !localRegistrationAllowed
            }
            onChange={() => void onToggleRegistration()}
            ariaLabel={t("admin.access.toggleLocalSignup")}
          />
        </SettingsRow>

        {oidcEnabled ? (
          <SettingsRow
            title={t("admin.access.autoProvisioning", {
              provider: oidcProviderName || "OIDC",
            })}
            description={
              oidcJitProvisioningEnabled
                ? t("admin.access.autoProvisioningOn")
                : t("admin.access.autoProvisioningOff")
            }
          >
            <PlayfulSwitch
              checked={Boolean(oidcJitProvisioningEnabled)}
              disabled={loading || oidcJitProvisioningEnabled === null}
              onChange={() => void onToggleOidcJitProvisioning()}
              ariaLabel={t("admin.access.toggleAutoProvisioning", {
                provider: oidcProviderName || "OIDC",
              })}
            />
          </SettingsRow>
        ) : null}
      </SettingsCard>
    </section>
  );
};
