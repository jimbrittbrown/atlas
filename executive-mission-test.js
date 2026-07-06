import { MissionLoader } from './executive/src/missions/mission-loader.js';
import { ExecutiveRuntime } from './executive/src/executive-runtime.js';
import { ExecutiveRequest } from './executive/src/models.js';
import { ExecutiveBriefingRenderer } from './executive/src/presentation/executive-briefing-renderer.js';

const loader = new MissionLoader();
const runtime = new ExecutiveRuntime();
const renderer = new ExecutiveBriefingRenderer();

const mission = loader.load(
    './missions/mission-0001-ai-childrens-youtube.md'
);

const request = new ExecutiveRequest(
    'mission-0001',
    'MISSION',
    {
        objective: mission.content
    },
    new Date().toISOString()
);

const result = await runtime.execute(request);

renderer.render(result.briefing);

console.log();
console.log('Executive Action');
console.log(result.action);

console.log();
console.log('Dispatch Result');
console.log(result.dispatch);
