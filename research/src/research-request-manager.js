import { ResearchRequest } from './models.js';

export class ResearchRequestManager {
  createRequest(requestId, objective, context = {}) {
    return new ResearchRequest(requestId, objective, context);
  }
}
