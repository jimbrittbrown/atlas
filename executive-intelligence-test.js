import { ExecutiveIntelligenceEngine } from './executive/src/intelligence/executive-intelligence-engine.js';
import { ExecutiveBriefingRenderer } from './executive/src/presentation/executive-briefing-renderer.js';
import { ExecutiveRequest } from './executive/src/models.js';

const engine = new ExecutiveIntelligenceEngine();
const renderer = new ExecutiveBriefingRenderer();

const request = new ExecutiveRequest(
    'exec-test-001',
    'EXECUTIVE_REQUEST',
    {
        objective:
            'Create a YouTube business around AI children books.'
    },
    new Date().toISOString()
);

const report = await engine.analyze(request);

renderer.render(report);
