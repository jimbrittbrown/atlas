import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionRunner } from '../src/executive/mission-runner.js';

test('mission runner loads playbook from enterprise knowledge library', async () => {
  const calls = [];
  const runner = new MissionRunner({
    enterpriseKnowledgeLibrary: {
      getPlaybook(playbookId) {
        calls.push(playbookId);
        return {
          playbookId,
          title: 'YouTube Business Playbook v1.0',
          objective: 'Launch YouTube business',
          requiredWorkers: []
        };
      }
    },
    businessEvaluationApplication: {
      async evaluateBusinessOpportunity() {
        return { recommendation: 'PROCEED', businessName: 'Atlas Shorts' };
      }
    },
    businessLaunchPlanGenerator: { generate() { return { phases: [] }; } },
    businessExecutionPlanGenerator: { generate() { return { tasks: [] }; } },
    programManager: {
      assignments: [],
      assignTasks() { return []; },
      receiveCompletion() { return { completionPercentage: 0 }; },
      generateExecutiveProgressReport() { return { completionPercentage: 100, executiveStatus: 'COMPLETE' }; }
    },
    workers: {
      scriptWorker: { async execute() { return { scriptTitle: 'S', script: 'Script body' }; } },
      voiceWorker: { async execute() { return { audioFile: 'voice.wav' }; } },
      imageWorker: { async execute() { return { imageFiles: ['image-01.png'] }; } },
      videoWorker: { async execute() { return { videoFile: 'video.mp4' }; } }
    },
    qualityReviewEngine: { review() { return { passed: true, issues: [], remediationTasks: [], executiveRecommendation: 'APPROVE_FOR_RELEASE' }; } },
    publishingWorker: { async execute() { return { publishStatus: 'SCHEDULED', publishId: 'PUBLISH-1', platform: 'youtube', publishUrl: 'https://publish.placeholder/youtube/publish-1', completionReport: { status: 'COMPLETED' } }; } }
  });

  await runner.runMission({
    playbookId: 'youtube-business',
    businessRequest: {
      id: 'BR-001',
      objective: 'Launch horror shorts channel'
    }
  });

  assert.deepEqual(calls, ['youtube-business']);
});

test('mission runner reuses existing applications and managers', async () => {
  const calls = [];
  const runner = new MissionRunner({
    enterpriseKnowledgeLibrary: {
      getPlaybook() {
        calls.push('getPlaybook');
        return {
          playbookId: 'youtube-business',
          title: 'YouTube Business Playbook v1.0',
          objective: 'Launch YouTube business'
        };
      }
    },
    businessEvaluationApplication: {
      async evaluateBusinessOpportunity(request) {
        calls.push(`evaluateBusinessOpportunity:${request.id}`);
        return { recommendation: 'PROCEED', businessName: 'Atlas Shorts' };
      }
    },
    businessLaunchPlanGenerator: {
      generate(input) {
        calls.push(`generateLaunchPlan:${input.businessName}`);
        return { phases: [{ name: 'Foundation', milestones: ['M1'] }] };
      }
    },
    businessExecutionPlanGenerator: {
      generate() {
        calls.push('generateExecutionPlan');
        return { tasks: [{ id: 'TASK-001', status: 'PENDING' }] };
      }
    },
    programManager: {
      assignments: [{ status: 'COMPLETED' }],
      assignTasks() {
        calls.push('assignTasks');
        return [];
      },
      receiveCompletion() {
        calls.push('receiveCompletion');
        return { completionPercentage: 100 };
      },
      generateExecutiveProgressReport() {
        calls.push('generateExecutiveProgressReport');
        return { completionPercentage: 100, executiveStatus: 'COMPLETE' };
      }
    },
    workers: {
      scriptWorker: { async execute() { calls.push('scriptWorker.execute'); return { scriptTitle: 'S', script: 'Script body' }; } },
      voiceWorker: { async execute() { calls.push('voiceWorker.execute'); return { audioFile: 'voice.wav' }; } },
      imageWorker: { async execute() { calls.push('imageWorker.execute'); return { imageFiles: ['image-01.png'] }; } },
      videoWorker: { async execute() { calls.push('videoWorker.execute'); return { videoFile: 'video.mp4' }; } }
    },
    qualityReviewEngine: {
      review() {
        calls.push('qualityReviewEngine.review');
        return { passed: true, issues: [], remediationTasks: [], executiveRecommendation: 'APPROVE_FOR_RELEASE' };
      }
    },
    publishingWorker: {
      async execute() {
        calls.push('publishingWorker.execute');
        return {
          publishId: 'PUBLISH-ASG',
          platform: 'youtube',
          publishStatus: 'SCHEDULED',
          publishUrl: 'https://publish.placeholder/youtube/publish-asg',
          completionReport: { status: 'COMPLETED' }
        };
      }
    }
  });

  await runner.runMission({
    playbookId: 'youtube-business',
    businessRequest: {
      id: 'BR-002',
      objective: 'Launch horror shorts channel'
    }
  });

  assert.equal(calls.includes('getPlaybook'), true);
  assert.equal(calls.includes('assignTasks'), true);
  assert.equal(calls.includes('qualityReviewEngine.review'), true);
  assert.equal(calls.includes('publishingWorker.execute'), true);
});

test('mission runner generates one operational mission report', async () => {
  const runner = new MissionRunner({
    enterpriseKnowledgeLibrary: {
      getPlaybook() {
        return {
          playbookId: 'youtube-business',
          title: 'YouTube Business Playbook v1.0',
          objective: 'Launch YouTube business'
        };
      }
    },
    businessEvaluationApplication: {
      async evaluateBusinessOpportunity() {
        return {
          recommendation: 'PROCEED',
          businessName: 'Atlas Shorts',
          decisionReadiness: { status: 'READY' }
        };
      }
    },
    businessLaunchPlanGenerator: {
      generate() {
        return {
          businessName: 'Atlas Shorts',
          objective: 'Launch objective',
          phases: [{ name: 'Foundation', milestones: ['M1'] }]
        };
      }
    },
    businessExecutionPlanGenerator: {
      generate() {
        return {
          phases: [{ id: 'PHASE-001', name: 'Foundation', milestones: ['M1'] }],
          tasks: [{ id: 'TASK-001', status: 'PENDING' }],
          dependencies: [],
          executionOrder: ['TASK-001'],
          completionCriteria: ['Complete task']
        };
      }
    },
    programManager: {
      assignments: [{ status: 'COMPLETED' }],
      assignTasks() { return []; },
      receiveCompletion() { return { completionPercentage: 100 }; },
      generateExecutiveProgressReport() {
        return {
          completionPercentage: 100,
          completedTasks: 1,
          activeTasks: 0,
          blockedTasks: 0,
          executiveStatus: 'COMPLETE'
        };
      }
    },
    workers: {
      scriptWorker: { async execute() { return { scriptTitle: 'Title', script: 'Script body' }; } },
      voiceWorker: { async execute() { return { audioFile: 'voice.wav' }; } },
      imageWorker: { async execute() { return { imageFiles: ['image-01.png'] }; } },
      videoWorker: { async execute() { return { videoFile: 'video.mp4' }; } }
    },
    qualityReviewEngine: {
      review() {
        return {
          passed: true,
          issues: [],
          remediationTasks: [],
          executiveRecommendation: 'APPROVE_FOR_RELEASE'
        };
      }
    },
    publishingWorker: {
      async execute() {
        return {
          publishId: 'PUBLISH-ASG-PUBLISH-001',
          platform: 'youtube',
          publishStatus: 'SCHEDULED',
          publishUrl: 'https://publish.placeholder/youtube/publish-asg-publish-001',
          completionReport: {
            assignmentId: 'ASG-PUBLISH-001',
            workerId: 'PUBLISHING-WORKER-001',
            taskId: 'TASK-PUBLISH-001',
            completedAt: 'COMPLETED_AT_PLACEHOLDER',
            status: 'COMPLETED'
          }
        };
      }
    }
  });

  const report = await runner.runMission({
    playbookId: 'youtube-business',
    businessRequest: {
      id: 'BR-003',
      objective: 'Launch horror shorts channel'
    }
  });

  assert.equal(report.missionId, 'MISSION-YOUTUBE-BUSINESS-BR-003');
  assert.equal(report.status, 'MISSION_COMPLETED');
  assert.equal(typeof report.decisionPackage, 'object');
  assert.equal(typeof report.launchPlan, 'object');
  assert.equal(typeof report.executionPlan, 'object');
  assert.equal(typeof report.progressReport, 'object');
  assert.equal(typeof report.qualityReview, 'object');
  assert.equal(typeof report.publishingResult, 'object');
  assert.equal(typeof report.executiveSummary, 'string');
});

test('mission runner orchestrates each major workflow step exactly once', async () => {
  const counters = {
    evaluateBusinessOpportunity: 0,
    generateLaunchPlan: 0,
    generateExecutionPlan: 0,
    assignTasks: 0,
    qualityReview: 0,
    publishing: 0
  };

  const runner = new MissionRunner({
    enterpriseKnowledgeLibrary: {
      getPlaybook() {
        return {
          playbookId: 'youtube-business',
          title: 'YouTube Business Playbook v1.0',
          objective: 'Launch YouTube business'
        };
      }
    },
    businessEvaluationApplication: {
      async evaluateBusinessOpportunity() {
        counters.evaluateBusinessOpportunity += 1;
        return { recommendation: 'PROCEED', businessName: 'Atlas Shorts' };
      }
    },
    businessLaunchPlanGenerator: {
      generate() {
        counters.generateLaunchPlan += 1;
        return { phases: [{ name: 'Foundation', milestones: ['M1'] }] };
      }
    },
    businessExecutionPlanGenerator: {
      generate() {
        counters.generateExecutionPlan += 1;
        return { tasks: [{ id: 'TASK-001', status: 'PENDING' }] };
      }
    },
    programManager: {
      assignments: [{ status: 'COMPLETED' }],
      assignTasks() {
        counters.assignTasks += 1;
        return [];
      },
      receiveCompletion() { return { completionPercentage: 100 }; },
      generateExecutiveProgressReport() { return { completionPercentage: 100, executiveStatus: 'COMPLETE' }; }
    },
    workers: {
      scriptWorker: { async execute() { return { scriptTitle: 'Title', script: 'Script body' }; } },
      voiceWorker: { async execute() { return { audioFile: 'voice.wav' }; } },
      imageWorker: { async execute() { return { imageFiles: ['image-01.png'] }; } },
      videoWorker: { async execute() { return { videoFile: 'video.mp4' }; } }
    },
    qualityReviewEngine: {
      review() {
        counters.qualityReview += 1;
        return { passed: true, issues: [], remediationTasks: [], executiveRecommendation: 'APPROVE_FOR_RELEASE' };
      }
    },
    publishingWorker: {
      async execute() {
        counters.publishing += 1;
        return {
          publishId: 'PUBLISH-ASG',
          platform: 'youtube',
          publishStatus: 'SCHEDULED',
          publishUrl: 'https://publish.placeholder/youtube/publish-asg',
          completionReport: { status: 'COMPLETED' }
        };
      }
    }
  });

  await runner.runMission({
    playbookId: 'youtube-business',
    businessRequest: {
      id: 'BR-004',
      objective: 'Launch horror shorts channel'
    }
  });

  assert.deepEqual(counters, {
    evaluateBusinessOpportunity: 1,
    generateLaunchPlan: 1,
    generateExecutionPlan: 1,
    assignTasks: 1,
    qualityReview: 1,
    publishing: 1
  });
});
