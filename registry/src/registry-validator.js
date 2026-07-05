import { RegistryValidationResult } from './models.js';

export class RegistryValidator {
  validate(records) {
    const issues = [];

    for (const record of records) {
      const metadata = record.metadata;
      const required = [
        ['name', metadata.name],
        ['version', metadata.version],
        ['purpose', metadata.purpose],
        ['owner', metadata.owner],
        ['releaseTag', metadata.releaseTag],
        ['commitHash', metadata.commitHash],
        ['changelogReference', metadata.changelogReference],
        ['traceabilityReference', metadata.traceabilityReference],
        ['testStatus', metadata.testStatus],
      ];

      for (const [field, value] of required) {
        if (value === null || value === undefined || value === '') {
          issues.push(`${metadata.name}: missing required field ${field}`);
        }
      }

      if (!Array.isArray(metadata.publicInterfaces) || metadata.publicInterfaces.length === 0) {
        issues.push(`${metadata.name}: at least one public interface is required`);
      }
    }

    return new RegistryValidationResult({ valid: issues.length === 0, issues });
  }
}
