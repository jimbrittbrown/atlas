export class ResponseTranslator {
  translate(result, workflowId) {
    return {
      workflowId,
      status: result.status,
      report: result.report,
      evidence: result.evidence,
      metadata: result.metadata
    };
  }
}
