"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, IS_DEMO, tokenStore } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Atualiza o usuário em memória (ex.: depois de salvar Meu perfil). */
  updateUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY = "ss.demo.session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  useEffect(() => {
    let alive = true;
    tokenStore.onUnauthorized(() => {
      tokenStore.set(null);
      setUser(null);
      setStatus("anonymous");
    });
    (async () => {
      try {
        if (IS_DEMO) {
          const raw = sessionStorage.getItem(DEMO_KEY);
          if (raw) {
            setUser(JSON.parse(raw) as User);
            setStatus("authenticated");
          } else setStatus("anonymous");
          return;
        }
        const r = await api.auth.refresh();
        if (!alive) return;
        tokenStore.set(r.accessToken);
        // A API real devolve só o token no refresh; o usuário vem de /auth/me.
        const u = r.user ?? (await api.auth.me());
        if (!alive) return;
        setUser(u);
        setStatus("authenticated");
      } catch {
        if (alive) setStatus("anonymous");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, senha: string) => {
    const r = await api.auth.login(email, senha);
    tokenStore.set(r.accessToken);
    setUser(r.user);
    setStatus("authenticated");
    if (IS_DEMO) {
      try {
        sessionStorage.setItem(DEMO_KEY, JSON.stringify(r.user));
      } catch {
        /* sem storage */
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignora */
    }
    tokenStore.set(null);
    try {
      sessionStorage.removeItem(DEMO_KEY);
    } catch {
      /* ignora */
    }
    setUser(null);
    setStatus("anonymous");
  }, []);

  const updateUser = useCallback((u: User) => {
    setUser(u);
    if (IS_DEMO) {
      try {
        sessionStorage.setItem(DEMO_KEY, JSON.stringify(u));
      } catch {
        /* sem storage */
      }
    }
  }, []);

  const value = useMemo(() => ({ user, status, login, logout, updateUser }), [user, status, login, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
