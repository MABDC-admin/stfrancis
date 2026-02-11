import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

type AppRole = 'admin' | 'registrar' | 'teacher' | 'student' | 'parent' | 'finance';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
}

interface AuthContextType {
  user: User | null;
  session: { access_token: string } | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  impersonate: (target: { id: string, role: AppRole, full_name?: string | null }) => void;
  stopImpersonating: () => void;
  isImpersonating: boolean;
  actualRole: AppRole | null;
  actualUser: User | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Impersonation state
  const [impersonatedUser, setImpersonatedUser] = useState<{ id: string, role: AppRole, full_name?: string | null } | null>(null);

  useEffect(() => {
    // Load impersonation from sessionStorage
    const stored = sessionStorage.getItem('impersonating_target');
    if (stored) {
      try {
        setImpersonatedUser(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse impersonation target:', e);
      }
    }

    // Check if user is already logged in
    const token = apiClient.getToken();
    if (token) {
      fetchUser(token);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async (token: string) => {
    try {
      const { data, error } = await apiClient.getUser();
      
      if (error || !data) {
        // Token invalid, clear it
        apiClient.setToken(null);
        setUser(null);
        setSession(null);
        setRole(null);
      } else {
        setUser(data.user);
        setSession({ access_token: token });
        setRole(data.user.role as AppRole);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
      apiClient.setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await apiClient.signIn(email, password);

      if (error || !data) {
        return { error: new Error(error || 'Login failed') };
      }

      setUser(data.user);
      setSession({ access_token: data.token });
      setRole(data.user.role as AppRole);

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await apiClient.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setImpersonatedUser(null);
    sessionStorage.removeItem('impersonating_target');
  };

  const hasRole = (requiredRole: AppRole) => {
    return role === requiredRole;
  };

  const impersonate = (target: { id: string, role: AppRole, full_name?: string | null }) => {
    setImpersonatedUser(target);
    setRole(target.role);
    sessionStorage.setItem('impersonating_target', JSON.stringify(target));
  };

  const stopImpersonating = () => {
    setImpersonatedUser(null);
    setRole(user?.role || null);
    sessionStorage.removeItem('impersonating_target');
  };

  const value: AuthContextType = {
    user,
    session,
    role: impersonatedUser ? impersonatedUser.role : role,
    loading,
    signIn,
    signOut,
    hasRole,
    impersonate,
    stopImpersonating,
    isImpersonating: !!impersonatedUser,
    actualRole: role,
    actualUser: user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
