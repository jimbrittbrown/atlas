import { SQLiteStorageProvider } from './sqlite-storage-provider.js';
import { PostgreSQLStorageProvider } from './postgresql-storage-provider.js';

export function createStorageProvider({
  providerType = process.env.ATLAS_STORAGE_PROVIDER ?? 'sqlite',
  sqlitePath = process.env.ATLAS_SQLITE_PATH,
  postgresUrl = process.env.ATLAS_POSTGRES_URL,
  now
} = {}) {
  const normalized = String(providerType ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'postgres':
    case 'postgresql':
      return new PostgreSQLStorageProvider({ connectionString: postgresUrl, now });
    case 'sqlite':
    default:
      return new SQLiteStorageProvider({ databasePath: sqlitePath, now });
  }
}
