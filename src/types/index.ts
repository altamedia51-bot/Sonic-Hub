export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  credits: number;
  personalKieApiKey?: string;
  usePersonalKey?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KieAccount {
  id: string;
  name: string;
  maskedApiKey: string;
  status: 'ACTIVE' | 'RATE_LIMITED' | 'ERROR' | 'DISABLED' | 'COOLDOWN' | 'EXHAUSTED';
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

export interface GenerationJob {
  id: string;
  userId: string;
  userEmail?: string;
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

export interface GenerationTrack {
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

export interface CreditTransaction {
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

export interface SystemLog {
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

export interface AppSettings {
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

export interface ModelCapability {
  id: string;
  name: string;
  description: string;
  supportsDuration: boolean;
  minDuration: number;
  maxDuration: number;
  supportsVocalGender: boolean;
  supportsNegativeTags: boolean;
  maxPromptLength: number;
  maxStyleLength: number;
  defaultCreditCost: number;
  enabled: boolean;
}
