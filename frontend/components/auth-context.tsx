"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AUTH_TOKEN_KEY, ApiError, authApi, type AuthUser } from "@/lib/api";
import { canAccessPath } from "@/lib/authz";

type AuthContextValue = {
  user: AuthUser | null;
  booting: boolean;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setUser(null);
      return;
    }
    try {
      setUser(await authApi.me());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setBooting(false));
  }, [refreshUser]);

  const login = useCallback(async (phone: string, code: string) => {
    const result = await authApi.loginWithSms(phone, code);
    window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* 本地退出优先，不因服务端异常阻断 */
    }
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, logout, refreshUser }),
    [booting, login, logout, refreshUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, booting } = useAuth();
  const isLoginPage = pathname === "/login";
  const allowed = isLoginPage || canAccessPath(user, pathname);

  useEffect(() => {
    if (booting) return;
    if (!user && !isLoginPage) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    if (user && isLoginPage) {
      router.replace("/");
      return;
    }
    if (user && !allowed) {
      router.replace("/");
    }
  }, [allowed, booting, isLoginPage, pathname, router, user]);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-[14px] font-semibold text-slate-500">
        正在校验登录状态...
      </div>
    );
  }

  if (!user && !isLoginPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-[14px] font-semibold text-slate-500">
        正在进入登录页...
      </div>
    );
  }

  if (user && !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-[14px] font-semibold text-slate-500">
        正在返回工作台...
      </div>
    );
  }

  return <>{children}</>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
