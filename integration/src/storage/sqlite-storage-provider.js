import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StorageProvider } from './storage-provider.js';
import { StorageMigrations } from './storage-migrations.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function parseRows(rows = []) {
  return rows.map((row) => ({
    key: row.record_id ?? row.event_id ?? row.meta_key,
    value: JSON.parse(row.payload)
  }));
}

export class SQLiteStorageProvider extends StorageProvider {
  constructor({ databasePath = process.env.ATLAS_SQLITE_PATH ?? '/root/atlas/integration/.atlas-operations.sqlite', now } = {}) {
    super();
    this.databasePath = databasePath;
    this.now = now;
    this.database = null;
  }

  initializeSync() {
    if (this.database) return this.database;
    mkdirSync(dirname(this.databasePath), { recursive: true });
    this.database = new DatabaseSync(this.databasePath);
    this.database.exec('PRAGMA journal_mode = WAL');
    this.database.exec('PRAGMA synchronous = NORMAL');
    this.runMigrationsSync();
    return this.database;
  }

  async initialize() {
    return this.initializeSync();
  }

  runMigrationsSync() {
    this.initializeSync();
    this.database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`);
    const appliedVersions = new Set(
      this.database.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all().map((row) => Number(row.version))
    );

    for (const migration of StorageMigrations) {
      if (appliedVersions.has(migration.version)) continue;
      this.database.exec('BEGIN');
      try {
        migration.statements.forEach((statement) => this.database.exec(statement));
        this.database.prepare(
          'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
        ).run(migration.version, migration.description, isoNow(this.now));
        this.database.exec('COMMIT');
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    }
  }

  async runMigrations() {
    this.runMigrationsSync();
  }

  listRecordsSync(namespace) {
    this.initializeSync();
    const rows = this.database.prepare(
      'SELECT record_id, payload FROM storage_records WHERE namespace = ? ORDER BY updated_at ASC'
    ).all(namespace);
    return parseRows(rows);
  }

  async listRecords(namespace) {
    return this.listRecordsSync(namespace);
  }

  upsertRecordSync(namespace, recordId, value) {
    this.initializeSync();
    this.database.prepare(
      `INSERT INTO storage_records (namespace, record_id, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, record_id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`
    ).run(namespace, recordId, JSON.stringify(value), isoNow(this.now));
  }

  async upsertRecord(namespace, recordId, value) {
    this.upsertRecordSync(namespace, recordId, value);
  }

  deleteRecordSync(namespace, recordId) {
    this.initializeSync();
    this.database.prepare('DELETE FROM storage_records WHERE namespace = ? AND record_id = ?').run(namespace, recordId);
  }

  async deleteRecord(namespace, recordId) {
    this.deleteRecordSync(namespace, recordId);
  }

  listEventsSync(namespace) {
    this.initializeSync();
    const rows = this.database.prepare(
      'SELECT event_id, payload FROM storage_events WHERE namespace = ? ORDER BY created_at ASC'
    ).all(namespace);
    return parseRows(rows);
  }

  async listEvents(namespace) {
    return this.listEventsSync(namespace);
  }

  appendEventSync(namespace, eventId, value) {
    this.initializeSync();
    this.database.prepare(
      `INSERT INTO storage_events (namespace, event_id, payload, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, event_id) DO UPDATE SET
         payload = excluded.payload,
         created_at = excluded.created_at`
    ).run(namespace, eventId, JSON.stringify(value), isoNow(this.now));
  }

  async appendEvent(namespace, eventId, value) {
    this.appendEventSync(namespace, eventId, value);
  }

  getMetaSync(namespace, metaKey) {
    this.initializeSync();
    const row = this.database.prepare(
      'SELECT payload FROM storage_meta WHERE namespace = ? AND meta_key = ?'
    ).get(namespace, metaKey);
    return row ? JSON.parse(row.payload) : null;
  }

  async getMeta(namespace, metaKey) {
    return this.getMetaSync(namespace, metaKey);
  }

  setMetaSync(namespace, metaKey, value) {
    this.initializeSync();
    this.database.prepare(
      `INSERT INTO storage_meta (namespace, meta_key, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, meta_key) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`
    ).run(namespace, metaKey, JSON.stringify(value), isoNow(this.now));
  }

  async setMeta(namespace, metaKey, value) {
    this.setMetaSync(namespace, metaKey, value);
  }

  listMetaSync(namespace) {
    this.initializeSync();
    const rows = this.database.prepare(
      'SELECT meta_key, payload FROM storage_meta WHERE namespace = ? ORDER BY updated_at ASC'
    ).all(namespace);
    return parseRows(rows);
  }

  async listMeta(namespace) {
    return this.listMetaSync(namespace);
  }

  getStateRecord({ namespace, key } = {}) {
    this.initializeSync();
    const row = this.database.prepare(
      'SELECT payload FROM storage_records WHERE namespace = ? AND record_id = ?'
    ).get(namespace, key);

    if (!row) {
      return { ok: false, code: 'NOT_FOUND', reason: 'State record not found.', value: null };
    }

    return { ok: true, code: 'OK', reason: null, value: JSON.parse(row.payload) };
  }

  conditionalSetStateRecord({ namespace, key, expectedVersion, value } = {}) {
    this.initializeSync();
    const version = Number(expectedVersion);
    if (!Number.isFinite(version) || version < 0) {
      return { ok: false, code: 'INVALID_REQUEST', reason: 'expectedVersion must be a non-negative number.' };
    }

    const result = this.database.prepare(
      `UPDATE storage_records
         SET payload = ?, updated_at = ?
       WHERE namespace = ?
         AND record_id = ?
         AND CAST(json_extract(payload, '$.version') AS INTEGER) = ?`
    ).run(JSON.stringify(value), isoNow(this.now), namespace, key, version);

    if (Number(result?.changes ?? 0) === 1) {
      return { ok: true, code: 'OK', reason: null };
    }

    const exists = this.database.prepare(
      'SELECT 1 AS present FROM storage_records WHERE namespace = ? AND record_id = ?'
    ).get(namespace, key);

    if (!exists) {
      return { ok: false, code: 'NOT_FOUND', reason: 'State record not found.' };
    }

    return { ok: false, code: 'VERSION_MISMATCH', reason: 'State record version mismatch.' };
  }

  closeSync() {
    if (!this.database) return;
    this.database.close();
    this.database = null;
  }

  async close() {
    this.closeSync();
  }
}
