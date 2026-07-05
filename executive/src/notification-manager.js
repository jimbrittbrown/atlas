export class DefaultNotificationManager {
  notify(workflowId, message) {
    console.info(`[${workflowId}] ${message}`);
  }
}
