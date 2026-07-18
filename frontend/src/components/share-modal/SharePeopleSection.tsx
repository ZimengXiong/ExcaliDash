import React from "react";
import { Plus, Search } from "lucide-react";
import * as api from "../../api";
import { CustomSelect } from "./CustomSelect";

type Props = {
  user: { name?: string | null; email?: string | null } | null | undefined;
  sharing: { permissions: api.DrawingPermissionRow[] } | null;
  userQuery: string;
  userPermission: "view" | "edit";
  userResults: api.ShareResolvedUser[];
  setUserQuery: (value: string) => void;
  setUserPermission: (value: "view" | "edit") => void;
  handleAddUser: (userId: string) => void | Promise<void>;
  handleRevokeUser: (permissionId: string) => void | Promise<void>;
  handleUpdateUserPermission: (
    granteeUserId: string,
    permission: "view" | "edit",
  ) => void | Promise<void>;
};

export const SharePeopleSection: React.FC<Props> = ({
  user,
  sharing,
  userQuery,
  userPermission,
  userResults,
  setUserQuery,
  setUserPermission,
  handleAddUser,
  handleRevokeUser,
  handleUpdateUserPermission,
}) => (
  <>
    <section className="relative">
      <div className="relative group">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
          <Search size={16} strokeWidth={2.5} />
        </div>
        <input
          value={userQuery}
          onChange={(event) => setUserQuery(event.target.value)}
          placeholder="Add people by name or email"
          className="w-full pl-10 pr-28 py-2.5 rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium placeholder:font-normal placeholder:text-slate-400"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <CustomSelect
            value={userPermission}
            onChange={(value) => setUserPermission(value as "view" | "edit")}
            options={[
              { label: "Can view", value: "view" },
              { label: "Can edit", value: "edit" },
            ]}
            align="right"
            variant="bordered"
          />
        </div>
      </div>

      {userResults.length > 0 && (
        <div className="ui-popover absolute top-full left-0 right-0 mt-2 overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2">
          {userResults.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => handleAddUser(candidate.id)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group border-b last:border-b-0 border-slate-100 dark:border-neutral-800"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-xs">
                {candidate.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-neutral-100 truncate">
                  {candidate.name}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">
                  {candidate.email}
                </div>
              </div>
              <Plus
                size={16}
                className="text-slate-400 group-hover:text-indigo-600 transition-colors"
                strokeWidth={3}
              />
              <span className="sr-only">
                Give {candidate.name} {userPermission === "edit" ? "edit" : "view"} access
              </span>
            </button>
          ))}
        </div>
      )}
    </section>

    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
        People with access
      </h3>
      <div className="space-y-0">
        <div className="flex items-center gap-3 py-2">
          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-neutral-300 font-semibold text-sm shrink-0">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="text-sm font-medium text-slate-900 dark:text-neutral-100 leading-tight">
              {user?.name}{" "}
              <span className="text-slate-400 dark:text-neutral-500 font-normal ml-1">
                (you)
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              {user?.email}
            </div>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-neutral-400 shrink-0">
            Owner
          </div>
        </div>

        {(sharing?.permissions || []).map((permission) => (
          <div
            key={permission.id}
            className="flex items-center gap-3 py-2 group"
          >
            <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-sm shrink-0">
              {permission.granteeUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="text-sm font-medium text-slate-900 dark:text-neutral-100 leading-tight truncate">
                {permission.granteeUser.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-neutral-400 mt-1 truncate">
                {permission.granteeUser.email}
              </div>
            </div>
            <CustomSelect
              value={permission.permission}
              onChange={async (value) => {
                if (value === "remove") await handleRevokeUser(permission.id);
                else if (value === "view" || value === "edit")
                  await handleUpdateUserPermission(
                    permission.granteeUserId,
                    value,
                  );
              }}
              options={[
                { label: "Viewer", value: "view" },
                { label: "Editor", value: "edit" },
                { label: "Remove access", value: "remove", danger: true },
              ]}
              align="right"
            />
          </div>
        ))}
      </div>
    </section>
  </>
);
