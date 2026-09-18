import { useMemo } from "react";
import { getUserIdentity, type UserIdentity } from "../../utils/identity";
import { getColorFromString, getInitialsFromName } from "./shared";

type AuthUser =
  | {
      id: string;
      name: string;
    }
  | null
  | undefined;

export const useEditorIdentity = (user: AuthUser): UserIdentity => {
  return useMemo(() => {
    if (user) {
      return {
        id: user.id,
        name: user.name,
        initials: getInitialsFromName(user.name),
        color: getColorFromString(user.id),
      };
    }
    return getUserIdentity();
  }, [user]);
};
