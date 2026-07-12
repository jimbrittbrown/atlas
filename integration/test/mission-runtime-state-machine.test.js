import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeContext, MissionLifecycleStates } from '../src/runtime/mission-runtime-contracts.js';
import { createMissionStateMachine } from '../src/runtime/mission-runtime-state-machine.js';

function buildContext() {
  return createRuntimeContext({
    request: {
      requestId: 'REQ-STATE-MACHINE-001',
      objective: 'Validate runtime state machine governance',
      businessId: 'BUS-STATE-MACHINE-001'
    }
  });
}

test('valid state progression is allowed', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();

  assert.equal(
    stateMachine.validateTransition({ runtimeContext: context, nextState: MissionLifecycleStates.PLANNING }).isValid,
    true
  );

  context.state = MissionLifecycleStates.PLANNING;

  assert.equal(
    stateMachine.validateTransition({ runtimeContext: context, nextState: MissionLifecycleStates.RESEARCH }).isValid,
    true
  );

  context.state = MissionLifecycleStates.RESEARCH;

  assert.equal(
    stateMachine.validateTransition({ runtimeContext: context, nextState: MissionLifecycleStates.SCRIPTING }).isValid,
    true
  );
});

test('invalid transition is blocked', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.QUALITY_REVIEW
  });

  assert.equal(result.isValid, false);
  assert.match(result.reason, /Invalid state transition/);
});

test('terminal states are immutable', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.COMPLETED;

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.RECOVERING
  });

  assert.equal(result.isValid, false);
  assert.match(result.reason, /terminal state/);
});

test('publishing is disabled by default when policy is not explicit', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.CEO_APPROVED;
  context.artifacts.qualityReview = { passed: true };

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.PUBLISHING
  });

  assert.equal(result.isValid, false);
  assert.equal(
    result.reason,
    'Publishing is disabled by default unless policy explicitly enables it.'
  );
});

test('cannot publish before quality pass', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.CEO_APPROVED;
  context.executionPolicy.publishingMode = 'PRIVATE';
  context.artifacts.qualityReview = { passed: false };

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.PUBLISHING
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'Cannot publish before quality pass.');
});

test('cannot generate release candidate without required artifacts', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.QUALITY_REVIEW;
  context.artifacts.script = { script: 'Script body' };
  context.artifacts.voice = { audioFile: '/tmp/voice.wav' };
  context.artifacts.images = { imageFiles: ['/tmp/image-1.png'] };

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.RC_PACKAGING
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'Cannot generate release candidate without required artifacts.');
});

test('cannot execute executive report before release candidate exists', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.RC_PACKAGING;

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.EXECUTIVE_REPORTING
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'Cannot generate executive report before release candidate package exists.');
});

test('cannot execute executive council review before executive report exists', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.EXECUTIVE_REPORTING;

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.EXECUTIVE_REVIEW
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'Cannot execute executive council review before executive report exists.');
});

test('cannot capture knowledge candidates before terminal mission outcome exists', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.LESSON_CAPTURE;
  context.artifacts.lessonsLearned = [{ id: 'LL-001' }];

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'Cannot capture knowledge candidates before terminal mission outcome exists.');
});

test('cannot close before lessons learned', () => {
  const stateMachine = createMissionStateMachine();
  const context = buildContext();
  context.state = MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE;

  const result = stateMachine.validateTransition({
    runtimeContext: context,
    nextState: MissionLifecycleStates.COMPLETED
  });

  assert.equal(result.isValid, false);
  assert.equal(result.reason, 'Cannot close before lessons learned.');
});
