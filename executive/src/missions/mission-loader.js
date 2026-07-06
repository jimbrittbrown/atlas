import fs from 'node:fs';

export class MissionLoader {

    load(path) {

        const text = fs.readFileSync(path, 'utf8');

        return {
            path,
            content: text
        };

    }

}
