"use client";

import type { AuthenticatedUserV2 } from "@niedax/domain";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { isAuthenticationError } from "@/lib/api-client";
import {
  getAuthenticatedIdentity,
  login as requestLogin,
  logout as requestLogout
} from "@/lib/auth-api";
import { sessionIdentityMatches, sessionRequestIsCurrent } from "@/lib/session-state";

type SessionStatus = "loading" | "authenticated" | "anonymous" | "failed";

interface SessionContextValue {
  readonly status: SessionStatus;
  readonly user: AuthenticatedUserV2 | null;
  readonly markAnonymous: (expectedUser?: AuthenticatedUserV2 | null) => boolean;
  readonly refresh: () => Promise<void>;
  readonly signIn: (username: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<AuthenticatedUserV2 | null>(null);
  const userRef = useRef<AuthenticatedUserV2 | null>(null);
  const requestGeneration = useRef(0);

  const commitAnonymous = useCallback(() => {
    userRef.current = null;
    setUser(null);
    setStatus("anonymous");
  }, []);

  const commitAuthenticated = useCallback((authenticatedUser: AuthenticatedUserV2) => {
    userRef.current = authenticatedUser;
    setUser(authenticatedUser);
    setStatus("authenticated");
  }, []);

  const markAnonymous = useCallback(
    (expectedUser?: AuthenticatedUserV2 | null) => {
      if (!sessionIdentityMatches(userRef.current, expectedUser)) return false;
      requestGeneration.current += 1;
      commitAnonymous();
      return true;
    },
    [commitAnonymous]
  );

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setStatus("loading");
    try {
      const response = await getAuthenticatedIdentity();
      if (!sessionRequestIsCurrent(generation, requestGeneration.current)) return;
      commitAuthenticated(response.user);
    } catch (error) {
      if (!sessionRequestIsCurrent(generation, requestGeneration.current)) return;
      if (isAuthenticationError(error)) commitAnonymous();
      else {
        userRef.current = null;
        setUser(null);
        setStatus("failed");
      }
    }
  }, [commitAnonymous, commitAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const generation = ++requestGeneration.current;
      let response: Awaited<ReturnType<typeof requestLogin>>;
      try {
        response = await requestLogin(username, password);
      } catch (error) {
        if (!sessionRequestIsCurrent(generation, requestGeneration.current)) return;
        throw error;
      }
      if (!sessionRequestIsCurrent(generation, requestGeneration.current)) return;
      commitAuthenticated(response.user);
    },
    [commitAuthenticated]
  );

  const signOut = useCallback(async () => {
    const generation = ++requestGeneration.current;
    try {
      await requestLogout();
    } catch (error) {
      if (!sessionRequestIsCurrent(generation, requestGeneration.current)) return;
      if (!isAuthenticationError(error)) throw error;
    }
    if (!sessionRequestIsCurrent(generation, requestGeneration.current)) return;
    commitAnonymous();
  }, [commitAnonymous]);

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, markAnonymous, refresh, signIn, signOut }),
    [markAnonymous, refresh, signIn, signOut, status, user]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
