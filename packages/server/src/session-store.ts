import { randomUUID } from 'node:crypto';
import type { RunnerEvent, RunSpec } from '@magsag/core';

const isoNow = (): string => new Date().toISOString();

export type SessionStatus = 'running' | 'completed' | 'failed';

export interface SessionErrorPayload {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  spec: RunSpec;
  status: SessionStatus;
  events: RunnerEvent[];
  createdAt: string;
  updatedAt: string;
  lastEventType?: RunnerEvent['type'];
  error?: SessionErrorPayload;
}

export interface SessionSummary {
  id: string;
  engine: RunSpec['engine'];
  prompt: string;
  repo: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastEventType?: RunnerEvent['type'];
  error?: SessionErrorPayload;
}

export interface CreateSessionOptions {
  id?: string;
}

export interface SessionStore {
  create(spec: RunSpec, options?: CreateSessionOptions): Promise<SessionRecord>;
  append(id: string, event: RunnerEvent): Promise<string>;
  markCompleted(id: string): Promise<void>;
  markFailed(id: string, payload: SessionErrorPayload): Promise<void>;
  list(): Promise<SessionSummary[]>;
  get(id: string): Promise<SessionRecord | undefined>;
  delete(id: string): Promise<boolean>;
}

const cloneRecord = (record: SessionRecord): SessionRecord => ({
  ...record,
  events: [...record.events],
  spec: { ...record.spec },
  error: record.error ? { ...record.error, details: record.error.details ? { ...record.error.details } : undefined } : undefined
});

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(spec: RunSpec, options?: CreateSessionOptions): Promise<SessionRecord> {
    const id = options?.id?.trim() && options.id.length > 0 ? options.id.trim() : randomUUID();
    const timestamp = isoNow();
    const existing = this.sessions.get(id);
    if (existing) {
      existing.spec = { ...spec };
      existing.status = 'running';
      existing.updatedAt = timestamp;
      existing.error = undefined;
      this.sessions.set(id, existing);
      return cloneRecord(existing);
    }

    const record: SessionRecord = {
      id,
      spec: { ...spec },
      status: 'running',
      events: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.sessions.set(id, record);
    return cloneRecord(record);
  }

  async append(id: string, event: RunnerEvent): Promise<string> {
    const record = this.sessions.get(id);
    if (!record) {
      return id;
    }

    record.events.push(event);
    record.updatedAt = isoNow();
    record.lastEventType = event.type;

    if (event.type === 'error') {
      record.status = 'failed';
      record.error = {
        message: event.error.message,
        code: event.error.code,
        details: event.error.details
      };
    } else if (event.type === 'done') {
      if (record.status !== 'failed') {
        record.status = 'completed';
      }
      if (event.sessionId && event.sessionId !== id) {
        this.sessions.delete(id);
        record.id = event.sessionId;
        this.sessions.set(event.sessionId, record);
        return event.sessionId;
      }
    }

    return record.id;
  }

  async markCompleted(id: string): Promise<void> {
    const record = this.sessions.get(id);
    if (!record) {
      return;
    }
    if (record.status !== 'failed') {
      record.status = 'completed';
    }
    record.updatedAt = isoNow();
  }

  async markFailed(id: string, payload: SessionErrorPayload): Promise<void> {
    const record = this.sessions.get(id);
    if (!record) {
      return;
    }
    record.status = 'failed';
    record.updatedAt = isoNow();
    record.error = {
      message: payload.message,
      code: payload.code,
      details: payload.details ? { ...payload.details } : undefined
    };
  }

  async list(): Promise<SessionSummary[]> {
    return Array.from(this.sessions.values())
      .map((record) => ({
        id: record.id,
        engine: record.spec.engine,
        prompt: record.spec.prompt,
        repo: record.spec.repo,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastEventType: record.lastEventType,
        error: record.error ? { ...record.error, details: record.error.details ? { ...record.error.details } : undefined } : undefined
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const record = this.sessions.get(id);
    if (!record) {
      return undefined;
    }
    return cloneRecord(record);
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }
}
