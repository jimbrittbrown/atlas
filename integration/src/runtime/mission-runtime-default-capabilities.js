import { BusinessLaunchPlanGenerator } from '../executive/business-launch-plan-generator.js';
import { BusinessExecutionPlanGenerator } from '../executive/business-execution-plan-generator.js';
import { YouTubeScriptWorker } from '../production/youtube-script-worker.js';
import { ScreenplayComposerWorker } from '../production/screenplay-composer-worker.js';
import { ExecutiveScriptEditor } from '../production/executive-script-editor.js';
import { LanguageRealizationValidator } from '../production/language-realization-validator.js';
import { StorytellingEvaluator } from '../production/storytelling-evaluator.js';
import { ImprovementPlanner } from '../production/improvement-planner.js';
import { VoiceWorker } from '../production/voice-worker.js';
import { ImageWorker } from '../production/image-worker.js';
import { VideoWorker } from '../production/video-worker.js';
import { NarrationEvaluator } from '../production/narration-evaluator.js';
import { ImageGenerationEvaluator } from '../production/image-generation-evaluator.js';
import { VisualEvaluator } from '../production/visual-evaluator.js';
import { ResearchEvaluator } from '../research/research-evaluator.js';
import { QualityReviewEngine } from '../production/quality-review-engine.js';
import { QualityIntelligenceEngine } from '../quality-intelligence/core/quality-intelligence-engine.js';
import { ExecutiveBriefingEngine } from '../executive/executive-briefing-engine.js';
import { ExecutiveCouncilRuntime } from '../executive-council-runtime.js';
import { TimelineBuilder } from '../media-engine/core/timeline-builder.js';
import { SceneTimingEngine } from '../media-engine/core/scene-timing-engine.js';
import { MissionPlanningEngine } from './mission-planning-engine.js';
import { HandoffReviewEngine } from './handoff-review-engine.js';
import { BusinessRuntimeAdmission } from '../../business-runtime-admission.js';
import { ElevenLabsVoiceService, PlaceholderVoiceService } from '../services/voice-service.js';
import { ExecutiveMissionOrchestratorPipelineRegistry } from '../executive/executive-mission-orchestrator-pipeline-registry.js';

function hasMethods(instance, requiredMethods = []) {
  return requiredMethods.every((methodName) => typeof instance?.[methodName] === 'function');
}

function buildDefaultWorkers({ configurationService } = {}) {
  const usePlaceholderVoiceService = process.env.NODE_ENV === 'test'
    || process.env.ATLAS_VOICE_PROVIDER_MODE === 'placeholder';

  return {
    scriptWorker: new YouTubeScriptWorker(),
    screenplayComposer: new ScreenplayComposerWorker(),
    executiveScriptEditor: new ExecutiveScriptEditor(),
    voiceWorker: new VoiceWorker({
      voiceService: usePlaceholderVoiceService
        ? new PlaceholderVoiceService()
        : new ElevenLabsVoiceService({ configurationService })
    }),
    imageWorker: new ImageWorker(),
    videoWorker: new VideoWorker()
  };
}

export function createMissionRuntimeDefaultCapabilityRegistry({
  configurationService,
  now,
  launchPlanGenerator = null,
  executionPlanGenerator = null,
  workers = null,
  qualityReviewEngine = null,
  qualityIntelligenceEngine = null,
  executiveCouncilRuntime = null,
  executiveBriefingEngine = null,
  businessRuntimeAdmission = null,
  missionPlanningEngine = null,
  storytellingEvaluator = null,
  researchEvaluator = null,
  narrationEvaluator = null,
  imageGenerationEvaluator = null,
  visualEvaluator = null,
  languageRealizationValidator = null,
  improvementPlanner = null,
  handoffReviewEngine = null,
  timelineBuilder = null,
  sceneTimingEngine = null
} = {}) {
  const registry = new ExecutiveMissionOrchestratorPipelineRegistry();

  const resolvedLaunchPlanGenerator = launchPlanGenerator ?? new BusinessLaunchPlanGenerator();
  const resolvedExecutionPlanGenerator = executionPlanGenerator ?? new BusinessExecutionPlanGenerator();

  registry.registerCapability({
    key: 'launchPlanGenerator',
    instance: resolvedLaunchPlanGenerator
  });

  registry.registerCapability({
    key: 'executionPlanGenerator',
    instance: resolvedExecutionPlanGenerator
  });

  registry.registerCapability({
    key: 'workers',
    instance: workers ?? buildDefaultWorkers({ configurationService }),
    validate: (instance) => {
      const valid = hasMethods(instance, ['scriptWorker', 'voiceWorker', 'imageWorker', 'videoWorker'])
        ? true
        : hasMethods(instance?.scriptWorker, ['execute'])
        && hasMethods(instance?.voiceWorker, ['execute'])
        && hasMethods(instance?.imageWorker, ['execute'])
        && hasMethods(instance?.videoWorker, ['execute']);

      return valid
        ? { isValid: true }
        : { isValid: false, reason: 'workers capability must expose script/voice/image/video workers with execute().' };
    }
  });

  registry.registerCapability({
    key: 'qualityReviewEngine',
    instance: qualityReviewEngine ?? new QualityReviewEngine(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['review']), reason: 'qualityReviewEngine.review() is required.' })
  });

  registry.registerCapability({
    key: 'qualityIntelligenceEngine',
    instance: qualityIntelligenceEngine ?? new QualityIntelligenceEngine(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['review']), reason: 'qualityIntelligenceEngine.review() is required.' })
  });

  registry.registerCapability({
    key: 'executiveCouncilRuntime',
    instance: executiveCouncilRuntime ?? new ExecutiveCouncilRuntime(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['evaluate']), reason: 'executiveCouncilRuntime.evaluate() is required.' })
  });

  registry.registerCapability({
    key: 'executiveBriefingEngine',
    instance: executiveBriefingEngine ?? new ExecutiveBriefingEngine(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['build']), reason: 'executiveBriefingEngine.build() is required.' })
  });

  registry.registerCapability({
    key: 'businessRuntimeAdmission',
    instance: businessRuntimeAdmission ?? new BusinessRuntimeAdmission({ now }),
    validate: (instance) => ({ isValid: hasMethods(instance, ['admit']), reason: 'businessRuntimeAdmission.admit() is required.' })
  });

  registry.registerCapability({
    key: 'storytellingEvaluator',
    instance: storytellingEvaluator ?? new StorytellingEvaluator(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['evaluate']), reason: 'storytellingEvaluator.evaluate() is required.' })
  });

  registry.registerCapability({
    key: 'researchEvaluator',
    instance: researchEvaluator ?? new ResearchEvaluator(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['evaluate']), reason: 'researchEvaluator.evaluate() is required.' })
  });

  registry.registerCapability({
    key: 'narrationEvaluator',
    instance: narrationEvaluator ?? new NarrationEvaluator(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['evaluate']), reason: 'narrationEvaluator.evaluate() is required.' })
  });

  registry.registerCapability({
    key: 'imageGenerationEvaluator',
    instance: imageGenerationEvaluator ?? new ImageGenerationEvaluator(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['evaluate']), reason: 'imageGenerationEvaluator.evaluate() is required.' })
  });

  registry.registerCapability({
    key: 'visualEvaluator',
    instance: visualEvaluator ?? new VisualEvaluator(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['evaluate']), reason: 'visualEvaluator.evaluate() is required.' })
  });

  registry.registerCapability({
    key: 'languageRealizationValidator',
    instance: languageRealizationValidator ?? new LanguageRealizationValidator(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['validate']), reason: 'languageRealizationValidator.validate() is required.' })
  });

  registry.registerCapability({
    key: 'improvementPlanner',
    instance: improvementPlanner ?? new ImprovementPlanner(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['planImprovements']), reason: 'improvementPlanner.planImprovements() is required.' })
  });

  registry.registerCapability({
    key: 'handoffReviewEngine',
    instance: handoffReviewEngine ?? new HandoffReviewEngine(),
    validate: (instance) => {
      const isValid = hasMethods(instance, ['reviewResearchToStorytelling', 'reviewStorytellingToVisualDirector', 'reviewVisualDirectorToImageGeneration']);
      return { isValid, reason: 'handoffReviewEngine must implement handoff review methods.' };
    }
  });

  registry.registerCapability({
    key: 'timelineBuilder',
    instance: timelineBuilder ?? new TimelineBuilder(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['build']), reason: 'timelineBuilder.build() is required.' })
  });

  registry.registerCapability({
    key: 'sceneTimingEngine',
    instance: sceneTimingEngine ?? new SceneTimingEngine(),
    validate: (instance) => ({ isValid: hasMethods(instance, ['normalizeTimeline']), reason: 'sceneTimingEngine.normalizeTimeline() is required.' })
  });

  registry.registerCapability({
    key: 'missionPlanningEngine',
    instance: missionPlanningEngine ?? new MissionPlanningEngine({
      launchPlanGenerator: resolvedLaunchPlanGenerator,
      executionPlanGenerator: resolvedExecutionPlanGenerator
    }),
    validate: (instance) => {
      const isValid = hasMethods(instance, ['generateMissionPlan', 'translateMissionPlanToRuntimePlan']);
      return { isValid, reason: 'missionPlanningEngine must implement mission plan generation/translation methods.' };
    }
  });

  return registry;
}
