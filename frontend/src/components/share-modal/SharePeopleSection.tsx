import React from "react";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import * as api from "../../api";
import { PlayfulSelect } from "../PlayfulSelect";

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

const permissionOptions = [
  { label: "Can view", value: "view", icon: <Eye size={14} /> },
  { label: "Can edit", value: "edit", icon: <Pencil size={14} /> },
];

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
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="Add people by name or email"
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 transition-colors focus:border-indigo-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>
        <PlayfulSelect
          ariaLabel="Permission for new people"
          value={userPermission}
          onChange={(value) => setUserPermission(value as "view" | "edit")}
          options={permissionOptions}
          align="right"
          variant="plain"
          buttonClassName="px-2.5 py-2"
        />
      </div>

      {userResults.length > 0 && (
        <div className="ui-menu absolute left-0 right-0 top-full z-[200] mt-2 animate-in fade-in slide-in-from-top-2">
          {userResults.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => handleAddUser(candidate.id)}
              className="ui-menu-item gap-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                {candidate.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-slate-900 dark:text-neutral-100">
                  {candidate.name}
                </div>
                <div className="truncate text-[10px] font-medium text-slate-500 dark:text-neutral-400">
                  {candidate.email}
                </div>
              </div>
              <Plus size={15} className="shrink-0 text-slate-400" strokeWidth={3} />
              <span className="sr-only">
                Give {candidate.name} {userPermission === "edit" ? "edit" : "view"} access
              </span>
            </button>
          ))}
        </div>
      )}
    </section>

    <section>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500">
        People
      </h3>
      <div className="divide-y divide-slate-100 dark:divide-neutral-800">
        <div className="flex items-center gap-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 bg-slate-100 text-sm font-bold text-slate-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-900 dark:text-neutral-100">
              {user?.name}{" "}
              <span className="font-medium text-slate-400 dark:text-neutral-500">
                (you)
              </span>
            </div>
            <div className="truncate text-xs font-medium text-slate-500 dark:text-neutral-400">
              {user?.email}
            </div>
          </div>
          <span className="shrink-0 rounded-full border-2 border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
            Owner
          </span>
        </div>

        {(sharing?.permissions || []).map((permission) => (
          <div key={permission.id} className="flex items-center gap-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
              {permission.granteeUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900 dark:text-neutral-100">
                {permission.granteeUser.name}
              </div>
              <div className="truncate text-xs font-medium text-slate-500 dark:text-neutral-400">
                {permission.granteeUser.email}
              </div>
            </div>
            <PlayfulSelect
              ariaLabel={`Access for ${permission.granteeUser.name}`}
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
                { label: "Viewer", value: "view", icon: <Eye size={13} /> },
                { label: "Editor", value: "edit", icon: <Pencil size={13} /> },
                {
                  label: "Remove",
                  value: "remove",
                  icon: <Trash2 size={13} />,
                  danger: true,
                },
              ]}
              align="right"
              size="sm"
              variant="plain"
              showCheck={false}
            />
          </div>
        ))}
      </div>
    </section>
  </>
);
