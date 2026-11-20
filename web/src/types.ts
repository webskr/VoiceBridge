export type ConnectionState = 'disconnected' | 'connecting' | 'paired' | 'reconnecting' | 'error';

export interface ServerStatus {
  service: string;
  version: string;
  host: string;
  port: number;
  pin: string;
  active_mobile: boolean;
  connected_companions: number;
  paused: boolean;
  canonical_length: number;
  startup_enabled: boolean;
  history_count: number;
}

export interface TransferProgress {
  transferId: string;
  name?: string;
  transferType?: 'text' | 'image' | 'file';
  status: 'receiving' | 'paused' | 'completed' | 'cancelled';
  receivedChunks: number;
  totalChunks: number;
  receivedBytes: number;
  totalBytes: number;
  totalLines: number;
  percent: number;
  autoPaste?: boolean;
}

export interface HistoryItem {
  id: string;
  name?: string;
  type?: 'text' | 'image' | 'file';
  path?: string;
  size?: number;
  lines?: number;
  time?: string;
  timestamp?: number;
  timeFormatted?: string;
  totalBytes?: number;
  totalLines?: number;
  totalCharacters?: number;
  preview: string;
}

export interface StreamAttachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  size?: number;
  url?: string;
  path?: string;
  status: 'receiving' | 'saved' | 'failed';
  progress?: number;
}

export interface WsMessage {
  type: string;
  [key: string]: any;
}
