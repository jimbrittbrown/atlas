import { startAtlas } from './src/bootstrap/startup.js';

const app = startAtlas();

const response = await app.execute({
    type: 'ATLAS_EXECUTIVE_REQUEST',
    objective: 'Verify Atlas can execute a production request through AtlasApplication.'
});

console.log('================================');
console.log('Atlas Production Request Complete');
console.log('================================');
console.log(response);
