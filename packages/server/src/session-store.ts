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
  droppedEvents?: number;
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
  droppedEvents?: number;
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

export interface BoundedSessionStoreOptions {
  maxSessions?: number;
  maxEventsPerSession?: number;
  maxEventBytes?: number;
  retentionMs?: number;
}

const DEFAULT_BOUNDED_OPTIONS: Required<BoundedSessionStoreOptions> = {
  maxSessions: 200,
  maxEventsPerSession: 400,
  maxEventBytes: 512 * 1024,
  retentionMs: 24 * 60 * 60 * 1000
};

const normaliseOption = (value: number | undefined, fallback: number, minimum: number): number => {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return fallback;
  }
  return Math.max(minimum, Math.trunc(value));
};

interface SessionEnvelope {
  record: SessionRecord;
  eventBytes: number;
}

const estimateEventSize = (event: RunnerEvent): number => {
  try {
    return Buffer.byteLength(JSON.stringify(event), 'utf8');
  } catch {
    return 256;
  }
};

const statusPriority = (status: SessionStatus): number => {
  switch (status) {
    case 'completed':
    case 'failed':
      return 0;
    case 'running':
    default:
      return 1;
  }
};

export class BoundedSessionStore implements SessionStore {
  private readonly options: Required<BoundedSessionStoreOptions>;
  private readonly sessions = new Map<string, SessionEnvelope>();

  constructor(options: BoundedSessionStoreOptions = {}) {
    const merged = { ...DEFAULT_BOUNDED_OPTIONS, ...options };
    this.options = {
      maxSessions: normaliseOption(merged.maxSessions, DEFAULT_BOUNDED_OPTIONS.maxSessions, 1),
      maxEventsPerSession: normaliseOption(
        merged.maxEventsPerSession,
        DEFAULT_BOUNDED_OPTIONS.maxEventsPerSession,
        1
      ),
      maxEventBytes: normaliseOption(
        merged.maxEventBytes,
        DEFAULT_BOUNDED_OPTIONS.maxEventBytes,
        4 * 1024
      ),
      retentionMs: normaliseOption(
        merged.retentionMs,
        DEFAULT_BOUNDED_OPTIONS.retentionMs,
        60 * 1000
      )
    };
  }

  async create(spec: RunSpec, options?: CreateSessionOptions): Promise<SessionRecord> {
    const id = options?.id?.trim() && options.id.length > 0 ? options.id.trim() : randomUUID();
    const timestamp = isoNow();
    const nowMs = Date.parse(timestamp);

    this.pruneExpired(nowMs);

    let envelope = this.sessions.get(id);
    if (envelope) {
      envelope.record.spec = { ...spec };
      envelope.record.status = 'running';
      envelope.record.updatedAt = timestamp;
      envelope.record.error = undefined;
      envelope.record.lastEventType = undefined;
      return cloneRecord(envelope.record);
    }

    this.ensureCapacity();

    envelope = {
      record: {
        id,
        spec: { ...spec },
        status: 'running',
        events: [],
        createdAt: timestamp,
        updatedAt: timestamp
      },
      eventBytes: 0
    };

    this.sessions.set(id, envelope);
    return cloneRecord(envelope.record);
  }

  async append(id: string, event: RunnerEvent): Promise<string> {
    const envelope = this.sessions.get(id);
    if (!envelope) {
      return id;
    }

    const timestamp = isoNow();
    envelope.record.events.push(event);
    envelope.record.updatedAt = timestamp;
    envelope.record.lastEventType = event.type;
    envelope.eventBytes += estimateEventSize(event);

    if (event.type === 'error') {
      envelope.record.status = 'failed';
      envelope.record.error = {
        message: event.error.message,
        code: event.error.code,
        details: event.error.details
      };
    } else if (event.type === 'done') {
      if (envelope.record.status !== 'failed') {
        envelope.record.status = 'completed';
      }
      if (event.sessionId && event.sessionId !== id) {
        this.sessions.delete(id);
        this.sessions.set(event.sessionId, envelope);
        envelope.record.id = event.sessionId;
        return event.sessionId;
      }
    }

    this.enforceEventLimits(envelope);
    return envelope.record.id;
  }

  async markCompleted(id: string): Promise<void> {
    const envelope = this.sessions.get(id);
    if (!envelope) {
      return;
    }
    if (envelope.record.status !== 'failed') {
      envelope.record.status = 'completed';
    }
    envelope.record.updatedAt = isoNow();
  }

  async markFailed(id: string, payload: SessionErrorPayload): Promise<void> {
    const envelope = this.sessions.get(id);
    if (!envelope) {
      return;
    }
    envelope.record.status = 'failed';
    envelope.record.updatedAt = isoNow();
    envelope.record.error = {
      message: payload.message,
      code: payload.code,
      details: payload.details ? { ...payload.details } : undefined
    };
  }

  async list(): Promise<SessionSummary[]> {
    this.pruneExpired(Date.now());

    return Array.from(this.sessions.values())
      .map((envelope) => ({
        id: envelope.record.id,
        engine: envelope.record.spec.engine,
        prompt: envelope.record.spec.prompt,
        repo: envelope.record.spec.repo,
        status: envelope.record.status,
        createdAt: envelope.record.createdAt,
        updatedAt: envelope.record.updatedAt,
        lastEventType: envelope.record.lastEventType,
        error: envelope.record.error
          ? {
              message: envelope.record.error.message,
              code: envelope.record.error.code,
              details: envelope.record.error.details
                ? { ...envelope.record.error.details }
                : undefined
            }
          : undefined,
        droppedEvents: envelope.record.droppedEvents
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const envelope = this.sessions.get(id);
    if (!envelope) {
      return undefined;
    }
    return cloneRecord(envelope.record);
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  private enforceEventLimits(envelope: SessionEnvelope): void {
    const { maxEventsPerSession, maxEventBytes } = this.options;
    let dropped = envelope.record.droppedEvents ?? 0;

    while (envelope.record.events.length > maxEventsPerSession || envelope.eventBytes > maxEventBytes) {
      const removed = envelope.record.events.shift();
      if (!removed) {
        break;
      }
      envelope.eventBytes = Math.max(0, envelope.eventBytes - estimateEventSize(removed));
      dropped += 1;
    }

    envelope.record.droppedEvents = dropped > 0 ? dropped : undefined;
  }

  private pruneExpired(nowMs: number): void {
    const { retentionMs } = this.options;
    for (const [id, envelope] of this.sessions.entries()) {
      const updatedMs = Date.parse(envelope.record.updatedAt);
      if (Number.isFinite(updatedMs) && nowMs - updatedMs > retentionMs) {
        this.sessions.delete(id);
      }
    }
  }

  private ensureCapacity(): void {
    const { maxSessions } = this.options;
    if (this.sessions.size < maxSessions) {
      return;
    }

    const entries = Array.from(this.sessions.entries());
    entries.sort(([, a], [, b]) => {
      const priorityDiff = statusPriority(a.record.status) - statusPriority(b.record.status);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const aUpdated = Date.parse(a.record.updatedAt);
      const bUpdated = Date.parse(b.record.updatedAt);
      const aCreated = Date.parse(a.record.createdAt);
      const bCreated = Date.parse(b.record.createdAt);

      const aTime = Number.isFinite(aUpdated) ? aUpdated : aCreated;
      const bTime = Number.isFinite(bUpdated) ? bUpdated : bCreated;

      if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
        return aTime - bTime;
      }
      return 0;
    });

    const evictCount = this.sessions.size - maxSessions + 1;
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      const [evictId] = entries[i];
      this.sessions.delete(evictId);
    }
  }
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
