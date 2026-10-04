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
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const configRaw = fs.readFileSync(configPath, 'utf-8');
        const firebaseConfig = JSON.parse(configRaw);
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        const dbId = firebaseConfig.firestoreDatabaseId || 'ai-studio-sonichubai-54df4e0b-6e6d-4ab8-97ea-0988451a296e';
        this.firestoreDb = getFirestore(app, dbId);
        console.log('[SonicHub DB] Firestore initialized successfully with dbId:', dbId);
      }
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
      credits: 1000,
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
    for (const u of this.users.values()) {
      if (u.id === idOrEmail || u.email.toLowerCase() === key) {
        return u;
      }
    }
    if (this.firestoreDb) {
      try {
        const docRef = doc(this.firestoreDb, 'users', idOrEmail);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const user = snap.data() as UserDoc;
          this.users.set(user.id, user);
          return user;
        }
      } catch (e) {
        // Fall back to memory
      }
    }
    return null;
  }

  async upsertUser(user: UserDoc): Promise<UserDoc> {
    const updated = { ...user, updatedAt: new Date().toISOString() };
    this.users.set(updated.id, updated);
    this.users.set(updated.email.toLowerCase(), updated);

    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'users', updated.id), updated, { merge: true });
      } catch (e) {
        console.warn('[DB] Firestore upsertUser fallback:', (e as Error).message);
      }
    }
    return updated;
  }

  async getAllUsers(): Promise<UserDoc[]> {
    const unique = new Map<string, UserDoc>();
    for (const u of this.users.values()) {
      unique.set(u.id, u);
    }
    return Array.from(unique.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- KIE Accounts ---
  async getKieAccounts(): Promise<KieAccountDoc[]> {
    return Array.from(this.kieAccounts.values()).sort((a, b) => b.priority - a.priority);
  }

  async getKieAccount(id: string): Promise<KieAccountDoc | null> {
    return this.kieAccounts.get(id) || null;
  }

  async upsertKieAccount(acc: KieAccountDoc): Promise<KieAccountDoc> {
    const updated = { ...acc, updatedAt: new Date().toISOString() };
    this.kieAccounts.set(updated.id, updated);

    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'kie_accounts', updated.id), updated, { merge: true });
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
        await deleteDoc(doc(this.firestoreDb, 'kie_accounts', id));
      } catch (e) {
        // Ignored
      }
    }
    return true;
  }

  // --- Generation Jobs ---
  async createJob(job: GenerationJobDoc): Promise<GenerationJobDoc> {
    this.jobs.set(job.id, job);
    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'generation_jobs', job.id), job);
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
        const snap = await getDoc(doc(this.firestoreDb, 'generation_jobs', id));
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
        const snap = await getDocs(q);
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
        await setDoc(doc(this.firestoreDb, 'generation_jobs', id), updated, { merge: true });
      } catch (e) {}
    }
    return updated;
  }

  async getUserJobs(userId: string): Promise<GenerationJobDoc[]> {
    const list: GenerationJobDoc[] = [];
    for (const j of this.jobs.values()) {
      if (j.userId === userId) list.push(j);
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAllJobs(): Promise<GenerationJobDoc[]> {
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
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<AppSettingsDoc>): Promise<AppSettingsDoc> {
    this.settings = { ...this.settings, ...updates, updatedAt: new Date().toISOString() };
    if (this.firestoreDb) {
      try {
        await setDoc(doc(this.firestoreDb, 'app_settings', 'global'), this.settings, { merge: true });
      } catch (e) {}
    }
    return { ...this.settings };
  }
}

export const dbStore = new DatabaseStore();
