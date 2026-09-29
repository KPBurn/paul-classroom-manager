import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { onUnauthorized } from '../services/api.js';
import { authService } from '../services/auth.service.js';
import { tokenStorage } from '../utils/tokenStorage.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // With a stored token we must ask the API who it belongs to before rendering routes.
  const [isLoading, setIsLoading] = useState(() => Boolean(tokenStorage.get()));

  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    if (!tokenStorage.get()) return undefined;

    let cancelled = false;
    authService
      .me()
      .then((currentUser) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch((error) => {
        // Only a rejected token ends the session; a network blip should not.
        if (!cancelled && [401, 403].includes(error.response?.status)) clearSession();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(
    () =>
      onUnauthorized(() => {
        clearSession();
        toast.error('Your session has ended. Please sign in again.', { id: 'session-ended' });
      }),
    [clearSession],
  );

  const saveLogin = useCallback(({ user: signedInUser, token }) => {
    tokenStorage.set(token);
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const login = useCallback(async (credentials) => {
    return saveLogin(await authService.login(credentials));
  }, [saveLogin]);

  const loginWithTestRole = useCallback(async (role) => {
    return saveLogin(await authService.loginWithTestRole(role));
  }, [saveLogin]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Signing out locally is what matters; the server call only records it.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), isLoading, login, loginWithTestRole, logout }),
    [user, isLoading, login, loginWithTestRole, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
