#!/usr/bin/env node

import { PerplexityProvider } from '../src/capability/perplexity-provider.js';

const provider = new PerplexityProvider();
const request = {
    capability: 'research',
    objective: 'What is the capital of France?'
};

console.log('START TEST');

const response = await provider.execute(request);

console.log(JSON.stringify(response, null, 2));
console.log('END TEST');
