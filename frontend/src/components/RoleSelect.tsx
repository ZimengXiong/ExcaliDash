import React from "react";
import { PlayfulSelect } from "./PlayfulSelect";
import type { CollectionShareRole } from "../types";
import { useLocale } from "../context/useLocale";

export const RoleSelect: React.FC<{
  value: CollectionShareRole;
  onChange: (val: string) => void;
  extraOptions?: { label: string; value: string; danger?: boolean }[];
}> = ({ value, onChange, extraOptions = [] }) => {
  const { t } = useLocale();
  const roleOptions: {
    label: string;
    value: CollectionShareRole;
    danger?: boolean;
  }[] = [
    { label: t("sidebar.viewer"), value: "view" },
    { label: t("sidebar.editor"), value: "edit" },
  ];
  const options = [...roleOptions, ...extraOptions];
  return (
    <PlayfulSelect
      ariaLabel={t("collection.access")}
      value={value}
      onChange={onChange}
      options={options}
      align="right"
      portal
    />
  );
};
