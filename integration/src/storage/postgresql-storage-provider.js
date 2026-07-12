import { StorageProvider } from './storage-provider.js';
import { StorageMigrations } from './storage-migrations.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function normalizeConnectionString(connectionString) {
  return String(connectionString ?? process.env.ATLAS_POSTGRES_URL ?? '').trim();
}

export class PostgreSQLStorageProvider extends StorageProvider {
  constructor({ connectionString = process.env.ATLAS_POSTGRES_URL, now } = {}) {
    super();
    this.connectionString = normalizeConnectionString(connectionString);
    this.now = now;
    this.client = null;
  }

  async createClient() {
    if (this.client) return this.client;
    if (!this.connectionString) {
      throw new Error('ATLAS_POSTGRES_URL is required for PostgreSQLStorageProvider.');
    }

    let pgModule;
    try {
      pgModule = await import('pg');
    } catch (error) {
      throw new Error(`PostgreSQLStorageProvider requires the pg package: ${error instanceof Error ? error.message : String(error)}`);
    }

    const { Client } = pgModule;
    this.client = new Client({ connectionString: this.connectionString });
    await this.client.connect();
    return this.client;
  }

  async initialize() {
    await this.createClient();
    await this.runMigrations();
  }

  async runMigrations() {
    const client = await this.createClient();
    for (const migration of StorageMigrations) {
      await client.query(migration.statements[0]);
    }

    const appliedRows = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const applied = new Set(appliedRows.rows.map((row) => Number(row.version)));

    for (const migration of StorageMigrations) {
      if (applied.has(migration.version)) continue;
      await client.query('BEGIN');
      try {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query(
          'INSERT INTO schema_migrations (version, description, applied_at) VALUES ($1, $2, $3)',
          [migration.version, migration.description, isoNow(this.now)]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  }

  async listRecords(namespace) {
    const client = await this.createClient();
    const result = await client.query(
      'SELECT record_id, payload FROM storage_records WHERE namespace = $1 ORDER BY updated_at ASC',
      [namespace]
    );
    return result.rows.map((row) => ({ key: row.record_id, value: JSON.parse(row.payload) }));
  }

  async upsertRecord(namespace, recordId, value) {
    const client = await this.createClient();
    await client.query(
      `INSERT INTO storage_records (namespace, record_id, payload, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(namespace, record_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [namespace, recordId, JSON.stringify(value), isoNow(this.now)]
    );
  }

  async deleteRecord(namespace, recordId) {
    const client = await this.createClient();
    await client.query('DELETE FROM storage_records WHERE namespace = $1 AND record_id = $2', [namespace, recordId]);
  }

  async listEvents(namespace) {
    const client = await this.createClient();
    const result = await client.query(
      'SELECT event_id, payload FROM storage_events WHERE namespace = $1 ORDER BY created_at ASC',
      [namespace]
    );
    return result.rows.map((row) => ({ key: row.event_id, value: JSON.parse(row.payload) }));
  }

  async appendEvent(namespace, eventId, value) {
    const client = await this.createClient();
    await client.query(
      `INSERT INTO storage_events (namespace, event_id, payload, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(namespace, event_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         created_at = EXCLUDED.created_at`,
      [namespace, eventId, JSON.stringify(value), isoNow(this.now)]
    );
  }

  async getMeta(namespace, metaKey) {
    const client = await this.createClient();
    const result = await client.query(
      'SELECT payload FROM storage_meta WHERE namespace = $1 AND meta_key = $2',
      [namespace, metaKey]
    );
    return result.rows[0] ? JSON.parse(result.rows[0].payload) : null;
  }

  async setMeta(namespace, metaKey, value) {
    const client = await this.createClient();
    await client.query(
      `INSERT INTO storage_meta (namespace, meta_key, payload, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(namespace, meta_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [namespace, metaKey, JSON.stringify(value), isoNow(this.now)]
    );
  }

  async listMeta(namespace) {
    const client = await this.createClient();
    const result = await client.query(
      'SELECT meta_key, payload FROM storage_meta WHERE namespace = $1 ORDER BY updated_at ASC',
      [namespace]
    );
    return result.rows.map((row) => ({ key: row.meta_key, value: JSON.parse(row.payload) }));
  }

  async close() {
    if (!this.client) return;
    await this.client.end();
    this.client = null;
  }
}
