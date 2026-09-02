"use client";

import {
  APP_ROLES,
  AppRoleSchema,
  type AdminUserSummaryV2,
  type AppRole,
  type AuthenticatedUserV2
} from "@niedax/domain";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { isAuthenticationError } from "@/lib/api-client";
import { roleTranslationKey } from "@/lib/access-presentation";
import {
  createAdminUser,
  listAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus
} from "@/lib/auth-api";
import { useI18n } from "@/lib/i18n";
import { addBusyUser, removeBusyUser, userMutationIsCurrent } from "@/lib/user-admin-state";
import { workflowErrorKey } from "@/lib/workflow-error";

import { useSession } from "./session-provider";
import { FormField, LoadingPanel, StatusNotice } from "./shared-ui";

interface NewUserForm {
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: AppRole;
}

const emptyForm: NewUserForm = {
  username: "",
  displayName: "",
  password: "",
  role: "designer"
};

export function UserAdminPanel({ currentUser }: Readonly<{ currentUser: AuthenticatedUserV2 }>) {
  const { language, t } = useI18n();
  const { markAnonymous } = useSession();
  const [users, setUsers] = useState<readonly AdminUserSummaryV2[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyUserIds, setBusyUserIds] = useState<ReadonlySet<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewUserForm>(emptyForm);
  const [errorKey, setErrorKey] = useState<"usersLoadFailed" | "userMutationFailed" | null>(null);
  const [serverErrorKey, setServerErrorKey] = useState<ReturnType<typeof workflowErrorKey>>(null);
  const [announcement, setAnnouncement] = useState<"userCreated" | "userUpdated" | null>(null);
  const mutationGenerations = useRef(new Map<string, number>());

  const load = useCallback(
    async (cursor: string | null = null, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setErrorKey(null);
      setServerErrorKey(null);
      try {
        const response = await listAdminUsers(cursor);
        setUsers((current) => (append ? [...current, ...response.users] : response.users));
        setNextCursor(response.nextCursor);
      } catch (error) {
        if (isAuthenticationError(error) && !markAnonymous(currentUser)) return;
        setServerErrorKey(workflowErrorKey(error));
        setErrorKey("usersLoadFailed");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [currentUser, markAnonymous]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setErrorKey(null);
    setServerErrorKey(null);
    setAnnouncement(null);
    try {
      const response = await createAdminUser(form);
      setUsers((current) => [...current, response.user]);
      setForm(emptyForm);
      setAnnouncement("userCreated");
    } catch (error) {
      if (isAuthenticationError(error) && !markAnonymous(currentUser)) return;
      setServerErrorKey(workflowErrorKey(error));
      setErrorKey("userMutationFailed");
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(user: AdminUserSummaryV2, role: AppRole) {
    if (user.role === role) return;
    const generation = beginUserMutation(user.id);
    setErrorKey(null);
    setServerErrorKey(null);
    setAnnouncement(null);
    try {
      const response = await updateAdminUserRole(user.id, role);
      if (!mutationIsCurrent(user.id, generation)) return;
      replaceUser(response.user);
      setAnnouncement("userUpdated");
    } catch (error) {
      const authenticationAccepted = isAuthenticationError(error)
        ? markAnonymous(currentUser)
        : true;
      if (!mutationIsCurrent(user.id, generation) || !authenticationAccepted) return;
      setServerErrorKey(workflowErrorKey(error));
      setErrorKey("userMutationFailed");
    } finally {
      finishUserMutation(user.id, generation);
    }
  }

  async function changeStatus(user: AdminUserSummaryV2) {
    const generation = beginUserMutation(user.id);
    setErrorKey(null);
    setServerErrorKey(null);
    setAnnouncement(null);
    try {
      const response = await updateAdminUserStatus(user.id, !user.enabled);
      if (!mutationIsCurrent(user.id, generation)) return;
      replaceUser(response.user);
      setAnnouncement("userUpdated");
    } catch (error) {
      const authenticationAccepted = isAuthenticationError(error)
        ? markAnonymous(currentUser)
        : true;
      if (!mutationIsCurrent(user.id, generation) || !authenticationAccepted) return;
      setServerErrorKey(workflowErrorKey(error));
      setErrorKey("userMutationFailed");
    } finally {
      finishUserMutation(user.id, generation);
    }
  }

  function replaceUser(user: AdminUserSummaryV2) {
    setUsers((current) =>
      current.map((candidate) => (candidate.id === user.id ? user : candidate))
    );
  }

  function beginUserMutation(userId: string): number {
    const generation = (mutationGenerations.current.get(userId) ?? 0) + 1;
    mutationGenerations.current.set(userId, generation);
    setBusyUserIds((current) => addBusyUser(current, userId));
    return generation;
  }

  function mutationIsCurrent(userId: string, generation: number): boolean {
    return userMutationIsCurrent(mutationGenerations.current.get(userId), generation);
  }

  function finishUserMutation(userId: string, generation: number) {
    if (!mutationIsCurrent(userId, generation)) return;
    mutationGenerations.current.delete(userId);
    setBusyUserIds((current) => removeBusyUser(current, userId));
  }

  return (
    <section aria-labelledby="user-admin-title" className="user-admin editor-card">
      <div className="card-heading">
        <div>
          <h2 id="user-admin-title">{t("userAdministration")}</h2>
          <p>{t("effectivePermissions")}</p>
        </div>
        <span className="status-badge">{users.length}</span>
      </div>

      {errorKey || serverErrorKey ? (
        <StatusNotice tone="error" live>
          <p>{t(serverErrorKey ?? errorKey ?? "userMutationFailed")}</p>
          {errorKey === "usersLoadFailed" ? (
            <button className="secondary-button" onClick={() => void load()} type="button">
              {t("retry")}
            </button>
          ) : null}
        </StatusNotice>
      ) : null}
      <span aria-live="polite" className="sr-only" role="status">
        {announcement ? t(announcement) : creating ? t("creatingUser") : ""}
      </span>

      <form
        className="app-form user-create-form"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <h3>{t("createUser")}</h3>
        <div className="form-grid">
          <FormField label={t("username")} required>
            {(props) => (
              <input
                {...props}
                autoComplete="off"
                maxLength={64}
                minLength={3}
                required
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({ ...current, username: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField label={t("displayName")} required>
            {(props) => (
              <input
                {...props}
                autoComplete="off"
                maxLength={100}
                minLength={2}
                required
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField hint={t("passwordRequirements")} label={t("password")} required>
            {(props) => (
              <input
                {...props}
                autoComplete="new-password"
                maxLength={1024}
                minLength={6}
                required
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField label={t("role")} required>
            {(props) => (
              <select
                {...props}
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: AppRoleSchema.parse(event.target.value)
                  }))
                }
              >
                {APP_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(roleTranslationKey(role))}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        <button
          className="primary-button"
          disabled={
            creating ||
            !form.username.trim() ||
            form.displayName.trim().length < 2 ||
            form.password.length < 6
          }
          type="submit"
        >
          {creating ? t("creatingUser") : t("createUser")}
        </button>
      </form>

      {loading ? (
        <LoadingPanel label={t("loadingUsers")} />
      ) : (
        <div aria-label={t("users")} className="data-table-scroll" role="region" tabIndex={0}>
          <table className="data-table user-table">
            <thead>
              <tr>
                <th>{t("users")}</th>
                <th>{t("role")}</th>
                <th>{t("enabled")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isCurrent = user.id === currentUser.id;
                const busy = busyUserIds.has(user.id);
                const roleLabel = `${t("role")} · ${user.displayName}`;
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <span>@{user.username}</span>
                      <small>
                        {new Intl.DateTimeFormat(language === "bg" ? "bg-BG" : "en-GB", {
                          dateStyle: "medium"
                        }).format(new Date(user.createdAt))}
                      </small>
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`role-${user.id}`}>
                        {roleLabel}
                      </label>
                      <select
                        aria-describedby={isCurrent ? `protected-${user.id}` : undefined}
                        disabled={busy || isCurrent}
                        id={`role-${user.id}`}
                        value={user.role}
                        onChange={(event) =>
                          void changeRole(user, AppRoleSchema.parse(event.target.value))
                        }
                      >
                        {APP_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t(roleTranslationKey(role))}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="status-badge">
                        {user.enabled ? t("enabled") : t("disabled")}
                      </span>
                      <button
                        aria-describedby={isCurrent ? `protected-${user.id}` : undefined}
                        aria-label={`${user.enabled ? t("disableUser") : t("enable")} · ${user.displayName}`}
                        className="secondary-button"
                        disabled={busy || isCurrent}
                        onClick={() => void changeStatus(user)}
                        type="button"
                      >
                        {user.enabled ? t("disableUser") : t("enable")}
                      </button>
                      {isCurrent ? (
                        <small id={`protected-${user.id}`}>
                          {t("currentAdministratorProtected")}
                        </small>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor ? (
        <button
          className="secondary-button"
          disabled={loadingMore}
          onClick={() => void load(nextCursor, true)}
          type="button"
        >
          {loadingMore ? t("loadingUsers") : t("loadMore")}
        </button>
      ) : null}
    </section>
  );
}
