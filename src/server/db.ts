import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  credits: number;
  createdAt: string;
  updatedAt: string;
}

export interface KieAccountDoc {
  id: string;
  name: string;
  encryptedApiKey: string;
  maskedApiKey: string;
  status: 'ACTIVE' | 'RATE_LIMITED' | 'ERROR' | 'DISABLED' | 'COOLDOWN';
  priority: number;
  dailyLimit: number;
  usageToday: number;
  maxConcurrentJobs: number;
  activeJobs: number;
  credits?: number;
  lastCheckedCreditsAt?: string | null;
  cooldownUntil?: string | null;
  failureCount: number;
  lastUsedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationJobDoc {
  id: string;
  userId: string;
  provider: string;
  providerAccountId?: string;
  providerAccountName?: string;
  taskId?: string;
  title: string;
  lyrics?: string;
  style: string;
  model: string;
  instrumental: boolean;
  negativeTags?: string;
  vocalGender?: string;
  duration?: number;
  status: 'QUEUED' | 'SUBMITTING' | 'PROCESSING' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  callbackStage?: string;
  creditReservation: number;
  creditFinalized: boolean;
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface GenerationTrackDoc {
  id: string;
  jobId: string;
  userId: string;
  providerTrackId: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  prompt?: string;
  modelName: string;
  title: string;
  tags?: string;
  duration?: number;
  createdAt: string;
}

export interface CreditTransactionDoc {
  id: string;
  userId: string;
  jobId?: string;
  type: 'ADMIN_GRANT' | 'RESERVATION' | 'GENERATION' | 'REFUND' | 'ADJUSTMENT';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export interface SystemLogDoc {
  id: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  userId?: string;
  jobId?: string;
  provider?: string;
  providerAccountId?: string;
  createdAt: string;
}

export interface AppSettingsDoc {
  id: string;
  generationEnabled: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  defaultModel: string;
  enabledModels: string[];
  defaultUserCredit: number;
  maxConcurrentJobsPerUser: number;
  maxDailyJobs: number;
  maxRetryCount: number;
  callbackUrl?: string;
  assetPersistence: boolean;
  createdAt: string;
  updatedAt: string;
}

// Helper to prevent serverless functions from hanging indefinitely on Firestore calls
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Firestore operation timed out')), timeoutMs);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// In-memory cache for low-latency atomic operations and rapid sync
class DatabaseStore {
  private users = new Map<string, UserDoc>();
  private kieAccounts = new Map<string, KieAccountDoc>();
  private jobs = new Map<string, GenerationJobDoc>();
  private tracks = new Map<string, GenerationTrackDoc>();
  private transactions: CreditTransactionDoc[] = [];
  private logs: SystemLogDoc[] = [];
  private settings: AppSettingsDoc = {
    id: 'global',
    generationEnabled: true,
    registrationEnabled: true,
    maintenanceMode: false,
    defaultModel: 'V6',
    enabledModels: ['V6', 'V6_MINI', 'V6_WILD', 'V5_5', 'V5', 'V4_5'],
    defaultUserCredit: 100,
    maxConcurrentJobsPerUser: 3,
    maxDailyJobs: 50,
    maxRetryCount: 2,
    assetPersistence: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  private firestoreDb: any = null;
  private initialized = false;

  constructor() {
    this.initFirebase();
  }

  private initFirebase() {
    try {
      let firebaseConfig: any = {
        projectId: "fine-discovery-207pf",
        appId: "1:319489128703:web:05c29729a5f565a06eb4ca",
        apiKey: "AIzaSyDzc26l4X8Q5KSQCuhJBGsUM-ZaCtPTsis",
        authDomain: "fine-discovery-207pf.firebaseapp.com",
        firestoreDatabaseId: "ai-studio-sonichubai-54df4e0b-6e6d-4ab8-97ea-0988451a296e",
        storageBucket: "fine-discovery-207pf.firebasestorage.app",
        messagingSenderId: "319489128703"
      };

      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        try {
          const configRaw = fs.readFileSync(configPath, 'utf-8');
          firebaseConfig = { ...firebaseConfig, ...JSON.parse(configRaw) };
        } catch (e) {}
      }

      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const dbId = firebaseConfig.firestoreDatabaseId || 'ai-studio-sonichubai-54df4e0b-6e6d-4ab8-97ea-0988451a296e';
      this.firestoreDb = getFirestore(app, dbId);
      console.log('[SonicHub DB] Firestore initialized successfully with dbId:', dbId);
    } catch (err: any) {
      console.warn('[SonicHub DB] Firestore init note:', err.message);
    }

    // Seed default admin user for altamedia51@gmail.com
    const initialAdmin: UserDoc = {
      id: 'admin_altamedia',
      name: 'System Admin',
      email: 'altamedia51@gmail.com',
      role: 'admin',
      status: 'active',
      credits: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.users.set(initialAdmin.id, initialAdmin);
    this.users.set(initialAdmin.email.toLowerCase(), initialAdmin);

    // Initial system log
    this.addLog({
      id: `log_${Date.now()}`,
      level: 'info',
      category: 'SYSTEM',
      message: 'Sonic Hub AI server database subsystem booted successfully',
      createdAt: new Date().toISOString()
    });
  }

  // --- Users ---
  async getUser(idOrEmail: string): Promise<UserDoc | null> {
    const key = idOrEmail.toLowerCase();

    // 1. Always prioritize live Google Cloud Firestore document to fetch updated credits
    if (this.firestoreDb) {
      try {
        // Try direct document ID lookup
        const docRef = doc(this.firestoreDb, 'users', idOrEmail);
        const snap = await withTimeout(getDoc(docRef), 2000);
        if (snap.exists()) {
          const user = snap.data() as UserDoc;
          this.users.set(user.id, user);
          if (user.email) this.users.set(user.email.toLowerCase(), user);
          return user;
        }

        // Try lookup by email field
        const q = query(
          collection(this.firestoreDb, 'users'),
          where('email', '==', key),
          limit(1)
        );
        const emailSnap = await withTimeout(getDocs(q), 2000);
        if (!emailSnap.empty) {
          const user = emailSnap.docs[0].data() as UserDoc;
          this.users.set(user.id, user);
          if (user.email) this.users.set(user.email.toLowerCase(), user);
          return user;
        }
      } catch (e) {
        console.warn('[DB] Firestore getUser lookup note:', (e as Error).message);
      }
    }

    // 2. Fallback to in-memory cache
    for (const u of this.users.values()) {
      if (u.id === idOrEmail || u.email.toLowerCase() === key) {
        return u;
      }
    }
    return null;
  }

  async upsertUser(user: UserDoc): Promise<UserDoc> {
    const updated = { ...user, updatedAt: new Date().toISOString() };
    this.users.set(updated.id, updated);
    if (updated.email) {
      this.users.set(updated.email.toLowerCase(), updated);
    }

    if (this.firestoreDb) {
      try {
        await withTimeout(setDoc(doc(this.firestoreDb, 'users', updated.id), updated, { merge: true }), 2000);
      } catch (e) {
        console.warn('[DB] Firestore upsertUser fallback:', (e as Error).message);
      }
    }
    return updated;
  }

  async getAllUsers(): Promise<UserDoc[]> {
    if (this.firestoreDb) {
      try {
        const snap = await withTimeout(getDocs(collection(this.firestoreDb, 'users')), 2000);
        for (const d of snap.docs) {
          const u = d.data() as UserDoc;
          this.users.set(u.id, u);
          if (u.email) this.users.set(u.email.toLowerCase(), u);
        }
      } catch (e) {
        console.warn('[DB] Firestore getAllUsers fetch warning:', (e as Error).message);
      }
    }

    const unique = new Map<string, UserDoc>();
    for (const u of this.users.values()) {
      unique.set(u.id, u);
    }
    return Array.from(unique.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- KIE Accounts ---
  async getKieAccounts(): Promise<KieAccountDoc[]> {
    if (this.firestoreDb) {
      try {
        const snap = await withTimeout(getDocs(collection(this.firestoreDb, 'kie_accounts')), 2000);
        for (const d of snap.docs) {
          const acc = d.data() as KieAccountDoc;
          this.kieAccounts.set(acc.id, acc);
        }
      } catch (e) {
        console.warn('[DB] Firestore getKieAccounts warning:', (e as Error).message);
      }
    }
    return Array.from(this.kieAccounts.values()).sort((a, b) => b.priority - a.priority);
  }

  async getKieAccount(id: string): Promise<KieAccountDoc | null> {
    const mem = this.kieAccounts.get(id);
    if (mem) return mem;
    if (this.firestoreDb) {
      try {
        const snap = await withTimeout(getDoc(doc(this.firestoreDb, 'kie_accounts', id)), 2000);
        if (snap.exists()) {
          const acc = snap.data() as KieAccountDoc;
          this.kieAccounts.set(acc.id, acc);
          return acc;
        }
      } catch (e) {}
    }
    return null;
  }

  async upsertKieAccount(acc: KieAccountDoc): Promise<KieAccountDoc> {
    const updated = { ...acc, updatedAt: new Date().toISOString() };
    this.kieAccounts.set(updated.id, updated);

    if (this.firestoreDb) {
      try {
        await withTimeout(setDoc(doc(this.firestoreDb, 'kie_accounts', updated.id), updated, { merge: true }), 2000);
      } catch (e) {
        console.warn('[DB] Firestore upsertKieAccount fallback:', (e as Error).message);
      }
    }
    return updated;
  }

  async deleteKieAccount(id: string): Promise<boolean> {
    this.kieAccounts.delete(id);
    if (this.firestoreDb) {
      try {
        await withTimeout(deleteDoc(doc(this.firestoreDb, 'kie_accounts', id)), 2000);
      } catch (e) {}
    }
    return true;
  }

  // --- Generation Jobs ---
  async createJob(job: GenerationJobDoc): Promise<GenerationJobDoc> {
    this.jobs.set(job.id, job);
    if (this.firestoreDb) {
      try {
        await withTimeout(setDoc(doc(this.firestoreDb, 'generation_jobs', job.id), job), 1500);
      } catch (e) {
        console.warn('[DB] Firestore createJob fallback:', (e as Error).message);
      }
    }
    return job;
  }

  async getJob(id: string): Promise<GenerationJobDoc | null> {
    const mem = this.jobs.get(id);
    if (mem) return mem;
    if (this.firestoreDb) {
      try {
        const snap = await withTimeout(getDoc(doc(this.firestoreDb, 'generation_jobs', id)), 1500);
        if (snap.exists()) {
          const j = snap.data() as GenerationJobDoc;
          this.jobs.set(j.id, j);
          return j;
        }
      } catch (e) {}
    }
    return null;
  }

  async getJobByTaskId(taskId: string): Promise<GenerationJobDoc | null> {
    for (const j of this.jobs.values()) {
      if (j.taskId === taskId) return j;
    }
    if (this.firestoreDb) {
      try {
        const q = query(collection(this.firestoreDb, 'generation_jobs'), where('taskId', '==', taskId), limit(1));
        const snap = await withTimeout(getDocs(q), 1500);
        if (!snap.empty) {
          const j = snap.docs[0].data() as GenerationJobDoc;
          this.jobs.set(j.id, j);
          return j;
        }
      } catch (e) {}
    }
    return null;
  }

  async updateJob(id: string, updates: Partial<GenerationJobDoc>): Promise<GenerationJobDoc | null> {
    const existing = await this.getJob(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    if (this.firestoreDb) {
      try {
        await withTimeout(setDoc(doc(this.firestoreDb, 'generation_jobs', id), updated, { merge: true }), 1500);
      } catch (e) {}
    }
    return updated;
  }

  async getUserJobs(userId: string): Promise<GenerationJobDoc[]> {
    if (this.firestoreDb) {
      try {
        const q = query(
          collection(this.firestoreDb, 'generation_jobs'),
          where('userId', '==', userId)
        );
        const snap = await withTimeout(getDocs(q), 1500);
        for (const d of snap.docs) {
          const j = d.data() as GenerationJobDoc;
          this.jobs.set(j.id, j);
        }
      } catch (e) {}
    }

    const list: GenerationJobDoc[] = [];
    for (const j of this.jobs.values()) {
      if (j.userId === userId) list.push(j);
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAllJobs(): Promise<GenerationJobDoc[]> {
    if (this.firestoreDb) {
      try {
        const snap = await getDocs(collection(this.firestoreDb, 'generation_jobs'));
        for (const d of snap.docs) {
          const j = d.data() as GenerationJobDoc;
          this.jobs.set(j.id, j);
        }
      } catch (e) {}
    }
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- Generation Tracks ---
  async addTrack(track: GenerationTrackDoc): Promise<GenerationTrackDoc> {
    this.tracks.set(track.id, track);
    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'generation_tracks', track.id), track);
      } catch (e) {}
    }
    return track;
  }

  async getTracksForJob(jobId: string): Promise<GenerationTrackDoc[]> {
    if (this.firestoreDb) {
      try {
        const q = query(
          collection(this.firestoreDb, 'generation_tracks'),
          where('jobId', '==', jobId)
        );
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          const t = d.data() as GenerationTrackDoc;
          this.tracks.set(t.id, t);
        }
      } catch (e) {}
    }

    const list: GenerationTrackDoc[] = [];
    for (const t of this.tracks.values()) {
      if (t.jobId === jobId) list.push(t);
    }
    return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getUserLibrary(userId: string): Promise<Array<{ job: GenerationJobDoc; tracks: GenerationTrackDoc[] }>> {
    const userJobs = await this.getUserJobs(userId);
    const library: Array<{ job: GenerationJobDoc; tracks: GenerationTrackDoc[] }> = [];

    for (const job of userJobs) {
      if (job.status === 'COMPLETED' || job.status === 'PARTIAL') {
        const jobTracks = await this.getTracksForJob(job.id);
        if (jobTracks.length > 0) {
          library.push({ job, tracks: jobTracks });
        }
      }
    }
    return library;
  }

  // --- Transactions ---
  async addTransaction(tx: CreditTransactionDoc): Promise<CreditTransactionDoc> {
    this.transactions.push(tx);
    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'credit_transactions', tx.id), tx);
      } catch (e) {}
    }
    return tx;
  }

  async getUserTransactions(userId: string): Promise<CreditTransactionDoc[]> {
    return this.transactions
      .filter(t => t.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- System Logs ---
  async addLog(log: SystemLogDoc): Promise<SystemLogDoc> {
    this.logs.unshift(log);
    if (this.logs.length > 500) {
      this.logs.pop();
    }
    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'system_logs', log.id), log);
      } catch (e) {}
    }
    return log;
  }

  async getLogs(limitCount = 100): Promise<SystemLogDoc[]> {
    return this.logs.slice(0, limitCount);
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettingsDoc> {
    if (this.firestoreDb) {
      try {
        const snap = await withTimeout(getDoc(doc(this.firestoreDb, 'app_settings', 'global')), 1500);
        if (snap.exists()) {
          this.settings = { ...this.settings, ...(snap.data() as AppSettingsDoc) };
        }
      } catch (e) {}
    }
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<AppSettingsDoc>): Promise<AppSettingsDoc> {
    this.settings = { ...this.settings, ...updates, updatedAt: new Date().toISOString() };
    if (this.firestoreDb) {
      try {
        await withTimeout(setDoc(doc(this.firestoreDb, 'app_settings', 'global'), this.settings, { merge: true }), 1500);
      } catch (e) {}
    }
    return { ...this.settings };
  }
}

export const dbStore = new DatabaseStore();
