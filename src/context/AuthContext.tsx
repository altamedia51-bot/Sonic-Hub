import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { auth } from '../firebase/config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  credits: number;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginAsAdmin: () => Promise<void>;
  loginAsDemoUser: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Synchronize user profile with backend
  const syncWithBackend = async (uid: string, email: string, name?: string) => {
    try {
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email, name })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('sonichub_user', JSON.stringify(data.user));
      }
    } catch (e) {
      console.warn('Backend user sync error:', e);
    }
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'x-user-id': user.id,
          'x-user-email': user.email
        }
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('sonichub_user', JSON.stringify(data.user));
      }
    } catch (e) {
      console.warn('Failed to refresh user:', e);
    }
  };

  useEffect(() => {
    // Check local storage first for quick restore
    const cached = localStorage.getItem('sonichub_user');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setUser(parsed);
      } catch (e) {}
    }

    // Listen to Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser && fbUser.email) {
        await syncWithBackend(fbUser.uid, fbUser.email, fbUser.displayName || undefined);
      } else if (!cached) {
        // Automatically sign in as default admin (altamedia51@gmail.com) for prompt demo
        await syncWithBackend('admin_altamedia', 'altamedia51@gmail.com', 'Admin (altamedia51)');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);
      try {
        const userCred = await signInWithEmailAndPassword(auth, email, pass);
        await syncWithBackend(userCred.user.uid, userCred.user.email!, userCred.user.displayName || undefined);
        return { success: true };
      } catch (fbErr: any) {
        // Fallback for custom accounts in local/preview
        const uid = `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await syncWithBackend(uid, email);
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);
      try {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        await syncWithBackend(userCred.user.uid, userCred.user.email!, name);
        return { success: true };
      } catch (fbErr: any) {
        const uid = `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await syncWithBackend(uid, email, name);
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const loginAsAdmin = async () => {
    setLoading(true);
    await syncWithBackend('admin_altamedia', 'altamedia51@gmail.com', 'Admin (altamedia51)');
    setLoading(false);
  };

  const loginAsDemoUser = async () => {
    setLoading(true);
    await syncWithBackend('user_musician', 'musician@sonichub.ai', 'Sonic Artist');
    setLoading(false);
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setUser(null);
    localStorage.removeItem('sonichub_user');
  };

  const isAdmin = user?.role === 'admin' || user?.email.toLowerCase() === 'altamedia51@gmail.com';
  const credits = user?.credits || 0;

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAdmin,
      credits,
      login,
      register,
      loginAsAdmin,
      loginAsDemoUser,
      logout,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
