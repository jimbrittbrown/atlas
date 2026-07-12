import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AssetRegistry } = require('../../assets/asset-registry.js');

export { AssetRegistry };
