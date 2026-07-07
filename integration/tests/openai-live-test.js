#!/usr/bin/env node

import { OpenAIProvider } from '../src/capability/openai-provider.js';

const provider = new OpenAIProvider();
const request = {
    capability: 'analysis',
    objective: 'What is the capital of France?'
};

console.log('START TEST');

const response = await provider.execute(request);

console.log(JSON.stringify(response, null, 2));
console.log('END TEST');
