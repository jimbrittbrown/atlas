export const StorageMigrations = Object.freeze([
  {
    version: 1,
    description: 'Create core record, event, and meta tables for persistent operational storage.',
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS storage_records (
        namespace TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, record_id)
      )`,
      `CREATE TABLE IF NOT EXISTS storage_events (
        namespace TEXT NOT NULL,
        event_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (namespace, event_id)
      )`,
      `CREATE TABLE IF NOT EXISTS storage_meta (
        namespace TEXT NOT NULL,
        meta_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, meta_key)
      )`
    ]
  }
]);
