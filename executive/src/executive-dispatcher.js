import { ResearchRuntime } from '../../research/src/research-runtime.js';

export class ExecutiveDispatcher {

    constructor() {

        this.research =
            new ResearchRuntime();

    }

    async dispatch(action) {

        console.log();
        console.log("================================");
        console.log("EXECUTIVE DISPATCH");
        console.log("================================");

        console.log(`Department : ${action.department}`);
        console.log(`Action     : ${action.action}`);
        console.log(`Priority   : ${action.priority}`);

        if (action.department === "Research") {

            return this.research.execute(action);

        }

        return {

            status: "NO_DEPARTMENT",

            message:
                "No department available."

        };

    }

}
