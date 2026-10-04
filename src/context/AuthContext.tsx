import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';

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

  // Synchronize user profile with Firestore and backend
  const syncWithBackend = async (uid: string, email: string, name?: string) => {
    const isSystemAdmin = email.toLowerCase() === 'altamedia51@gmail.com';
    const profileId = uid || (isSystemAdmin ? 'admin_altamedia' : `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    // Check if user already exists in Firestore so we don't overwrite existing credits
    let existingProfile: User | null = null;
    try {
      const snap = await getDoc(doc(db, 'users', profileId));
      if (snap.exists()) {
        existingProfile = snap.data() as User;
      }
    } catch (e) {}

    // Determine initial credits
    let assignedCredits: number;
    if (isSystemAdmin) {
      let totalKie = 0;
      try {
        const kieSnap = await getDocs(collection(db, 'kie_accounts'));
        totalKie = kieSnap.docs
          .filter(d => d.data().status === 'ACTIVE')
          .reduce((sum, d) => sum + (d.data().credits || 0), 0);
      } catch (e) {}
      assignedCredits = totalKie;
    } else if (existingProfile && typeof existingProfile.credits === 'number') {
      assignedCredits = existingProfile.credits;
    } else {
      // New user registering: get configured welcome credits from Firestore app_settings
      let welcomeCredits = 100;
      try {
        const setSnap = await getDoc(doc(db, 'app_settings', 'global'));
        if (setSnap.exists() && typeof setSnap.data()?.defaultUserCredit === 'number') {
          welcomeCredits = setSnap.data().defaultUserCredit;
        }
      } catch (e) {}
      assignedCredits = welcomeCredits;
    }

    const localProfile: User = {
      id: profileId,
      name: name || existingProfile?.name || (isSystemAdmin ? 'System Admin (altamedia51)' : email.split('@')[0]),
      email: email.toLowerCase(),
      role: isSystemAdmin ? 'admin' : (existingProfile?.role || 'user'),
      status: existingProfile?.status || 'active',
      credits: assignedCredits,
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Write directly to Google Cloud Firestore database
    try {
      await setDoc(doc(db, 'users', localProfile.id), localProfile, { merge: true });
    } catch (fsErr: any) {
      console.warn('[Auth] Firestore user write note:', fsErr.message);
    }

    // 2. Also notify backend
    try {
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: localProfile.id, email: localProfile.email, name: localProfile.name })
      });

      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data.success && data.user) {
            setUser(data.user);
            localStorage.setItem('sonichub_user', JSON.stringify(data.user));
            return data.user;
          }
        } catch (jsonErr) {}
      }
    } catch (e) {}

    // Apply profile
    setUser(localProfile);
    localStorage.setItem('sonichub_user', JSON.stringify(localProfile));
    return localProfile;
  };

  const refreshUser = async () => {
    if (!user) return;
    const isSystemAdmin = user.role === 'admin' || user.email.toLowerCase() === 'altamedia51@gmail.com';

    // If admin, compute live KIE total from Firestore
    if (isSystemAdmin) {
      try {
        const kieSnap = await getDocs(collection(db, 'kie_accounts'));
        const total = kieSnap.docs
          .filter(d => d.data().status === 'ACTIVE')
          .reduce((sum, d) => sum + (d.data().credits || 0), 0);
        
        setUser(prev => {
          if (!prev) return null;
          const updated = { ...prev, credits: total };
          localStorage.setItem('sonichub_user', JSON.stringify(updated));
          return updated;
        });
        return;
      } catch (e) {}
    }

    // Direct Firestore user document check
    try {
      const snap = await getDoc(doc(db, 'users', user.id));
      if (snap.exists()) {
        const updated = snap.data() as User;
        setUser(updated);
        localStorage.setItem('sonichub_user', JSON.stringify(updated));
        return;
      }
    } catch (e) {}

    // Backend endpoint fallback
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'x-user-id': user.id,
          'x-user-email': user.email
        }
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('sonichub_user', JSON.stringify(data.user));
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    // Check local storage first for instant restore
    const isExplicitLogout = localStorage.getItem('sonichub_logged_out') === 'true';
    const cached = localStorage.getItem('sonichub_user');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setUser(parsed);
      } catch (e) {}
    } else {
      setUser(null);
    }

    // Listen to Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser && fbUser.email) {
        localStorage.removeItem('sonichub_logged_out');
        await syncWithBackend(fbUser.uid, fbUser.email, fbUser.displayName || undefined);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);
      localStorage.removeItem('sonichub_logged_out');
      try {
        const userCred = await signInWithEmailAndPassword(auth, email, pass);
        await syncWithBackend(userCred.user.uid, userCred.user.email!, userCred.user.displayName || undefined);
        return { success: true };
      } catch (fbErr: any) {
        // Fallback for custom accounts in local/preview/Vercel
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
      localStorage.removeItem('sonichub_logged_out');
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
    localStorage.removeItem('sonichub_logged_out');
    await syncWithBackend('admin_altamedia', 'altamedia51@gmail.com', 'System Admin (altamedia51)');
    setLoading(false);
  };

  const loginAsDemoUser = async () => {
    setLoading(true);
    localStorage.removeItem('sonichub_logged_out');
    await syncWithBackend('user_musician', 'musician@sonichub.ai', 'Sonic Artist');
    setLoading(false);
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setUser(null);
    localStorage.removeItem('sonichub_user');
    localStorage.setItem('sonichub_logged_out', 'true');
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
