export interface CreateMusicInput {
  title: string;
  prompt?: string;
  lyrics?: string;
  style: string;
  model: string;
  customMode: boolean;
  instrumental: boolean;
  negativeTags?: string;
  vocalGender?: 'm' | 'f';
  duration?: number;
  callBackUrl: string;
}

export interface CreateMusicResult {
  success: boolean;
  taskId?: string;
  rawResponse?: any;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
    retryable: boolean;
  };
}

export interface TrackData {
  id: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  prompt?: string;
  modelName?: string;
  title?: string;
  tags?: string;
  duration?: number;
}

export interface MusicStatusResult {
  success: boolean;
  taskId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  tracks?: TrackData[];
  raw?: any;
  error?: string;
}

export interface MusicProvider {
  createMusic(input: CreateMusicInput, apiKey: string): Promise<CreateMusicResult>;
  getMusicStatus(taskId: string, apiKey: string): Promise<MusicStatusResult>;
  testConnection(apiKey: string): Promise<{ success: boolean; message: string }>;
}
