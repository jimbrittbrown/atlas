import { MissionLifecycleStates, TerminalMissionStates } from './mission-runtime-contracts.js';

export function createMissionStateMachine() {
  const transitions = transitionMap();

  return {
    states: MissionLifecycleStates,
    terminalStates: new Set(TerminalMissionStates),
    allowedTransitions: transitions,
    canTransition(fromState, toState) {
      return (transitions[fromState] ?? []).includes(toState);
    },
    validateTransition({ runtimeContext, nextState }) {
      const currentState = runtimeContext.state;

      if (this.terminalStates.has(currentState)) {
        return {
          isValid: false,
          reason: `Cannot transition from terminal state ${currentState}.`
        };
      }

      if (!this.canTransition(currentState, nextState)) {
        return {
          isValid: false,
          reason: `Invalid state transition ${currentState} -> ${nextState}.`
        };
      }

      const invariant = this.validateInvariants({ runtimeContext, nextState });

      if (!invariant.isValid) {
        return invariant;
      }

      return {
        isValid: true,
        reason: null
      };
    },
    validateInvariants({ runtimeContext, nextState }) {
      if (nextState === MissionLifecycleStates.RC_PACKAGING) {
        const requiredArtifacts = [
          runtimeContext.artifacts.script,
          runtimeContext.artifacts.voice,
          runtimeContext.artifacts.images,
          runtimeContext.artifacts.video
        ];

        if (requiredArtifacts.some(artifact => artifact === null || artifact === undefined)) {
          return {
            isValid: false,
            reason: 'Cannot generate release candidate without required artifacts.'
          };
        }
      }

      if (nextState === MissionLifecycleStates.EXECUTIVE_REPORTING) {
        if (!runtimeContext.artifacts.releaseCandidatePackage) {
          return {
            isValid: false,
            reason: 'Cannot generate executive report before release candidate package exists.'
          };
        }
      }

      if (nextState === MissionLifecycleStates.EXECUTIVE_REVIEW) {
        if (!runtimeContext.artifacts.executiveReport) {
          return {
            isValid: false,
            reason: 'Cannot execute executive council review before executive report exists.'
          };
        }
      }

      if (nextState === MissionLifecycleStates.PUBLISHING) {
        const publishingMode = String(runtimeContext.executionPolicy?.publishingMode ?? 'NONE').toUpperCase();

        if (publishingMode === 'NONE') {
          return {
            isValid: false,
            reason: 'Publishing is disabled by default unless policy explicitly enables it.'
          };
        }

        if (runtimeContext.artifacts.qualityReview?.passed !== true) {
          return {
            isValid: false,
            reason: 'Cannot publish before quality pass.'
          };
        }
      }

      if (nextState === MissionLifecycleStates.COMPLETED) {
        const lessons = runtimeContext.artifacts.lessonsLearned;

        if (!Array.isArray(lessons) || lessons.length === 0) {
          return {
            isValid: false,
            reason: 'Cannot close before lessons learned.'
          };
        }
      }

      if (nextState === MissionLifecycleStates.LESSON_CAPTURE) {
        if (!runtimeContext.artifacts.ceoDecision) {
          return {
            isValid: false,
            reason: 'Cannot capture lessons before CEO decision exists.'
          };
        }
      }

      if (nextState === MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE) {
        const lessons = runtimeContext.artifacts.lessonsLearned;

        if (!Array.isArray(lessons) || lessons.length === 0) {
          return {
            isValid: false,
            reason: 'Cannot capture knowledge candidates before lessons learned exist.'
          };
        }

        if (typeof runtimeContext.terminalMissionOutcome !== 'string' || runtimeContext.terminalMissionOutcome.trim().length === 0) {
          return {
            isValid: false,
            reason: 'Cannot capture knowledge candidates before terminal mission outcome exists.'
          };
        }
      }

      return {
        isValid: true,
        reason: null
      };
    }
  };
}

function transitionMap() {
  return {
    [MissionLifecycleStates.RECEIVED]: [
      MissionLifecycleStates.PLANNING,
      MissionLifecycleStates.FAILED,
      MissionLifecycleStates.CANCELLED
    ],
    [MissionLifecycleStates.PLANNING]: [
      MissionLifecycleStates.RESEARCH,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED,
      MissionLifecycleStates.CANCELLED
    ],
    [MissionLifecycleStates.RESEARCH]: [
      MissionLifecycleStates.SCRIPTING,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED,
      MissionLifecycleStates.CANCELLED
    ],
    [MissionLifecycleStates.SCRIPTING]: [
      MissionLifecycleStates.VOICE_GENERATION,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.VOICE_GENERATION]: [
      MissionLifecycleStates.IMAGE_GENERATION,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.IMAGE_GENERATION]: [
      MissionLifecycleStates.TIMELINE_BUILD,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.TIMELINE_BUILD]: [
      MissionLifecycleStates.MEDIA_RENDER,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.MEDIA_RENDER]: [
      MissionLifecycleStates.QUALITY_REVIEW,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.QUALITY_REVIEW]: [
      MissionLifecycleStates.RC_PACKAGING,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.RC_PACKAGING]: [
      MissionLifecycleStates.EXECUTIVE_REPORTING,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.EXECUTIVE_REPORTING]: [
      MissionLifecycleStates.EXECUTIVE_REVIEW,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.EXECUTIVE_REVIEW]: [
      MissionLifecycleStates.CEO_DECISION_PENDING,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.CEO_DECISION_PENDING]: [
      MissionLifecycleStates.CEO_APPROVED,
      MissionLifecycleStates.CEO_APPROVED_WITH_WAIVERS,
      MissionLifecycleStates.CEO_REVISION,
      MissionLifecycleStates.CEO_REJECTED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.CEO_APPROVED]: [
      MissionLifecycleStates.LESSON_CAPTURE,
      MissionLifecycleStates.PUBLISHING,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.CEO_APPROVED_WITH_WAIVERS]: [
      MissionLifecycleStates.LESSON_CAPTURE,
      MissionLifecycleStates.PUBLISHING,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.PUBLISHING]: [
      MissionLifecycleStates.LESSON_CAPTURE,
      MissionLifecycleStates.BLOCKED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.LESSON_CAPTURE]: [
      MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.KNOWLEDGE_CANDIDATE_CAPTURE]: [
      MissionLifecycleStates.COMPLETED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.BLOCKED]: [
      MissionLifecycleStates.RECOVERING,
      MissionLifecycleStates.CANCELLED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.RECOVERING]: [
      MissionLifecycleStates.PLANNING,
      MissionLifecycleStates.RESEARCH,
      MissionLifecycleStates.SCRIPTING,
      MissionLifecycleStates.QUALITY_REVIEW,
      MissionLifecycleStates.CANCELLED,
      MissionLifecycleStates.FAILED
    ],
    [MissionLifecycleStates.FAILED]: [],
    [MissionLifecycleStates.CANCELLED]: [],
    [MissionLifecycleStates.COMPLETED]: []
  };
}
