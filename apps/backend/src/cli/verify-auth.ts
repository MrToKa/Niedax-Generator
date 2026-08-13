import { randomBytes } from "node:crypto";

import { Pool } from "pg";

import { AuthService } from "../auth-service.js";
import { loadRuntimeConfig } from "../config.js";
import { PgUserStore } from "../pg-store.js";

const config = loadRuntimeConfig();
const pool = new Pool({ ...config.database, ssl: false });
const suffix = randomBytes(6).toString("hex");
const adminUsername = `foundation.smoke.admin.${suffix}`;
const reviewerUsername = `foundation.smoke.reviewer.${suffix}`;
const rejectedUsername = `foundation.smoke.rejected.${suffix}`;
const adminPassword = `Container-Admin-${randomBytes(12).toString("base64url")}!9aA`;
const reviewerPassword = `Container-Reviewer-${randomBytes(12).toString("base64url")}!9aA`;
const createdIds: string[] = [];

async function api(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<Response> {
  const request: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      host: "127.0.0.1:3001",
      origin: "http://127.0.0.1:3001",
      "x-niedax-csrf": "1",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {})
    }
  };
  if (options.body !== undefined) request.body = JSON.stringify(options.body);
  return fetch(`http://127.0.0.1:3001${path}`, request);
}

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!value) throw new Error("Login response did not set a session cookie");
  return value;
}

try {
  const auth = new AuthService(new PgUserStore(pool), config.sessionPepper);
  const administrator = await auth.createUser(null, {
    username: adminUsername,
    displayName: "Foundation Smoke Administrator",
    password: adminPassword,
    role: "administrator"
  });
  createdIds.push(administrator.id);

  const login = await api("/api/v1/auth/login", {
    method: "POST",
    body: { username: adminUsername, password: adminPassword }
  });
  if (!login.ok) throw new Error(`Administrator login failed with ${login.status}`);
  const adminCookie = sessionCookie(login);

  const me = await api("/api/v1/auth/me", { cookie: adminCookie });
  if (
    !me.ok ||
    ((await me.json()) as { user?: { role?: string } }).user?.role !== "administrator"
  ) {
    throw new Error("Current-session endpoint did not return the administrator");
  }

  const createReviewer = await api("/api/v1/admin/users", {
    method: "POST",
    cookie: adminCookie,
    body: {
      username: reviewerUsername,
      displayName: "Foundation Smoke Reviewer",
      password: reviewerPassword,
      role: "reviewer"
    }
  });
  if (createReviewer.status !== 201)
    throw new Error(`Reviewer creation failed with ${createReviewer.status}`);
  const reviewer = (await createReviewer.json()) as { user: { id: string } };
  createdIds.push(reviewer.user.id);

  const reviewerLogin = await api("/api/v1/auth/login", {
    method: "POST",
    body: { username: reviewerUsername, password: reviewerPassword }
  });
  if (!reviewerLogin.ok) throw new Error(`Reviewer login failed with ${reviewerLogin.status}`);
  const reviewerCookie = sessionCookie(reviewerLogin);
  const forbidden = await api("/api/v1/admin/users", {
    method: "POST",
    cookie: reviewerCookie,
    body: {
      username: rejectedUsername,
      displayName: "Must Not Be Created",
      password: `Rejected-${randomBytes(12).toString("base64url")}!9aA`,
      role: "reviewer"
    }
  });
  if (forbidden.status !== 403)
    throw new Error(`Reviewer admin action returned ${forbidden.status}`);

  const disable = await api(`/api/v1/admin/users/${reviewer.user.id}/status`, {
    method: "PATCH",
    cookie: adminCookie,
    body: { enabled: false }
  });
  if (!disable.ok) throw new Error(`Reviewer disable failed with ${disable.status}`);

  const revoked = await api("/api/v1/auth/me", { cookie: reviewerCookie });
  if (revoked.status !== 401) throw new Error("Disabled reviewer session was not revoked");
  const logout = await api("/api/v1/auth/logout", { method: "POST", cookie: adminCookie });
  if (logout.status !== 204) throw new Error(`Logout failed with ${logout.status}`);
  process.stdout.write(
    "Container authentication, role enforcement, disable/revocation, and logout passed.\n"
  );
} finally {
  if (createdIds.length > 0) {
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdIds]);
  }
  await pool.end();
}
