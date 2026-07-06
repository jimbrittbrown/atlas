import { ExecutiveIntelligenceEngine } from './executive/src/intelligence/executive-intelligence-engine.js';
import { ExecutiveRequest } from './executive/src/models.js';

const engine = new ExecutiveIntelligenceEngine();

const request = new ExecutiveRequest(
    'exec-test-001',
    'EXECUTIVE_REQUEST',
    {
        objective: 'Create a YouTube business around AI children books.'
    },
    new Date().toISOString()
);

const report = await engine.analyze(request);

console.log('====================================================');
console.log('EXECUTIVE INTELLIGENCE REPORT');
console.log('====================================================');

console.log(report.intent);

console.log('====================================================');
