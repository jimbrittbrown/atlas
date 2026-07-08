import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessEvaluationApplication } from '../src/executive/business-evaluation-application.js';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';
import { BusinessLaunchPlanGenerator } from '../src/executive/business-launch-plan-generator.js';
import { BusinessExecutionPlanGenerator } from '../src/executive/business-execution-plan-generator.js';
import { ProgramManager } from '../src/executive/program-manager.js';
import { ResearchWorker } from '../src/research/research-worker.js';

test('runs complete operational simulation for AI Horror Shorts', async () => {
  const stageLog = [];
  const logger = { entries: [], log(entry) { this.entries.push(entry); } };

  const executiveWorkflowCoordinator = new ExecutiveWorkflowCoordinator({
    executiveService: { handleRequest: async () => ({ workflowId: 'unused' }) },
    bridge: { execute: async () => ({ status: 'unused' }) },
    logger,
    investigationManager: {
      executeInvestigations: async investigations => investigations.map(investigation => ({
        investigationId: investigation.id,
        investigationName: investigation.name,
        research: {
          report: {
            findings: [{ id: `finding-${investigation.id}`, statement: `Finding for ${investigation.name}` }],
            beliefs: [{
              id: `belief-${investigation.id}`,
              statement: `Belief for ${investigation.name}`,
              confidence: 0.8,
              supportingFindings: [`finding-${investigation.id}`]
            }],
            importance: [{ id: `belief-${investigation.id}`, importance: 'high' }],
            decisionReadiness: {
              status: 'READY_WITH_CONDITIONS',
              rationale: 'Evidence is sufficient with executive conditions.',
              missingEvidence: [],
              criticalUnknowns: ['Executive review required for launch sequencing.']
            },
            executiveTensions: [{ id: `tension-${investigation.id}`, title: 'Executive Review Required' }],
            synthesis: {
              executiveSummary: `Synthesis for ${investigation.name}`,
              findings: [],
              conflicts: [],
              recommendations: []
            }
          }
        }
      }))
    }
  });

  const businessEvaluationApplication = new BusinessEvaluationApplication({
    executiveWorkflowCoordinator
  });
  const businessLaunchPlanGenerator = new BusinessLaunchPlanGenerator();
  const businessExecutionPlanGenerator = new BusinessExecutionPlanGenerator();
  const programManager = new ProgramManager();
  const researchWorker = new ResearchWorker({
    research: async request => ({
      report: {
        findings: [{ id: `worker-finding-${request.id}`, statement: `Research completed for ${request.objective}` }],
        confidence: 0.8,
        executiveSummary: 'Worker execution complete.'
      }
    })
  });

  stageLog.push({ stage: 'Business Evaluation', status: 'STARTED' });
  const decisionPackage = await businessEvaluationApplication.evaluateBusinessOpportunity({
    id: 'OPS-001',
    businessOpportunity: 'AI Horror Shorts',
    objective: 'Should Atlas launch AI Horror Shorts?',
    ceoQuestions: ['What is the recommendation?']
  });
  stageLog.push({ stage: 'Executive Decision', status: 'COMPLETED' });

  const launchPlan = businessLaunchPlanGenerator.generate({
    ...decisionPackage,
    businessName: 'AI Horror Shorts',
    objective: 'Launch AI Horror Shorts with disciplined execution.'
  });
  stageLog.push({ stage: 'Business Launch Plan', status: 'COMPLETED' });

  const executionPlan = businessExecutionPlanGenerator.generate(launchPlan);
  stageLog.push({ stage: 'Business Execution Plan', status: 'COMPLETED' });

  const baselineReport = programManager.supervise(executionPlan);
  stageLog.push({ stage: 'Program Manager', status: 'COMPLETED' });

  const assignments = programManager.assignTasks(executionPlan, 'RESEARCH-WORKER-001');
  stageLog.push({ stage: 'Worker Assignments', status: 'COMPLETED' });

  for (const assignment of assignments) {
    await researchWorker.execute(assignment);
    programManager.receiveCompletion(assignment);
  }
  stageLog.push({ stage: 'Research Worker execution', status: 'COMPLETED' });

  const executiveProgressReport = programManager.generateExecutiveProgressReport({
    tasks: programManager.assignments
  });
  stageLog.push({ stage: 'Executive Progress Report', status: 'COMPLETED' });

  assert.equal(typeof decisionPackage.recommendation, 'string');
  assert.equal(launchPlan.businessName, 'AI Horror Shorts');
  assert.equal(Array.isArray(executionPlan.tasks), true);
  assert.equal(assignments.length > 0, true);
  assert.equal(baselineReport.completionPercentage, 0);
  assert.equal(executiveProgressReport.completedTasks, assignments.length);
  assert.equal(executiveProgressReport.completionPercentage, 100);
  assert.equal(executiveProgressReport.executiveStatus, 'COMPLETE');

  assert.deepEqual(stageLog.map(entry => entry.stage), [
    'Business Evaluation',
    'Executive Decision',
    'Business Launch Plan',
    'Business Execution Plan',
    'Program Manager',
    'Worker Assignments',
    'Research Worker execution',
    'Executive Progress Report'
  ]);
});
