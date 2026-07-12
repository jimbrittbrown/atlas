import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkforceRepository } from '../src/workforce-repository.js';
import { WorkforceManager } from '../src/workforce-manager.js';
import { WorkforceRegistryService } from '../src/workforce-registry-service.js';
import { EmploymentStatus, WorkforceCapability } from '../src/workforce-models.js';

function createService() {
  const base = mkdtempSync(join(tmpdir(), 'atlas-workforce-'));
  const repository = new WorkforceRepository({
    registryPath: join(base, 'workforce-registry.json')
  });

  return new WorkforceRegistryService({ repository });
}

test('workforce registry manages specialist lifecycle and standings', async () => {
  const service = createService();

  const a = service.registerSpecialist({
    specialistId: 'SPEC-OPENAI-WRITER',
    category: 'Long-form Writing',
    company: 'OpenAI',
    model: 'gpt-5.1',
    apiAvailability: WorkforceCapability.API_AVAILABLE,
    strengths: ['Fast revisions'],
    weaknesses: ['Cost variability'],
    bestUseCases: ['Long-form documentary first pass']
  });

  const b = service.registerSpecialist({
    specialistId: 'SPEC-ANTHROPIC-WRITER',
    category: 'Long-form Writing',
    company: 'Anthropic',
    model: 'claude-sonnet-4-20250514',
    apiAvailability: WorkforceCapability.API_AVAILABLE,
    strengths: ['Voice consistency'],
    weaknesses: ['Long latency'],
    bestUseCases: ['Editorially constrained narratives']
  });

  assert.equal(a.currentEmploymentStatus, EmploymentStatus.CANDIDATE);
  assert.equal(b.currentEmploymentStatus, EmploymentStatus.CANDIDATE);

  service.connectSpecialist('SPEC-OPENAI-WRITER');
  service.connectSpecialist('SPEC-ANTHROPIC-WRITER');

  service.startBenchmarking('SPEC-OPENAI-WRITER');
  service.startBenchmarking('SPEC-ANTHROPIC-WRITER');

  const standing = service.completeBenchmark({
    category: 'Long-form Writing',
    runAt: '2026-07-10T12:00:00.000Z',
    outcomes: [
      {
        specialistId: 'SPEC-OPENAI-WRITER',
        score: 8.6,
        rank: 1,
        cost: 0.29,
        speed: 42000,
        reliability: 0.99,
        strengths: ['Clear structure'],
        weaknesses: ['Occasional abstraction'],
        bestUseCases: ['High-stakes explainers']
      },
      {
        specialistId: 'SPEC-ANTHROPIC-WRITER',
        score: 8.3,
        rank: 2,
        cost: 0.25,
        speed: 52000,
        reliability: 0.98,
        strengths: ['Narrative voice'],
        weaknesses: ['Slower response'],
        bestUseCases: ['Investigative drafts']
      }
    ]
  });

  assert.equal(standing.currentChampion, 'SPEC-OPENAI-WRITER');
  assert.equal(standing.runnerUp, 'SPEC-ANTHROPIC-WRITER');

  const hire = await service.hireForCategory('Long-form Writing');
  assert.equal(hire.selectedSpecialistId, 'SPEC-OPENAI-WRITER');
  assert.equal(hire.decision, 'CHAMPION_SELECTED');

  const snapshot = service.getSnapshot();
  const champion = snapshot.specialists.find(item => item.specialistId === 'SPEC-OPENAI-WRITER');
  const runnerUp = snapshot.specialists.find(item => item.specialistId === 'SPEC-ANTHROPIC-WRITER');

  assert.equal(champion.currentEmploymentStatus, EmploymentStatus.CHAMPION);
  assert.equal(runnerUp.currentEmploymentStatus, EmploymentStatus.RUNNER_UP);
});

test('retirement and scheduling signals are reflected in dashboard and due queue', () => {
  const service = createService();

  service.registerSpecialist({
    specialistId: 'SPEC-LEGACY-SEO',
    category: 'SEO',
    company: 'LegacyVendor',
    model: 'legacy-seo-v1',
    apiAvailability: WorkforceCapability.API_UNAVAILABLE,
    strengths: ['Historical keyword mappings'],
    weaknesses: ['Obsolete indexing heuristics'],
    bestUseCases: ['Legacy archive backfills']
  });

  service.retireSpecialist({
    specialistId: 'SPEC-LEGACY-SEO',
    reason: 'security and discontinued'
  });

  const snapshot = service.getSnapshot();
  const specialist = snapshot.specialists.find(item => item.specialistId === 'SPEC-LEGACY-SEO');
  assert.equal(specialist.currentEmploymentStatus, EmploymentStatus.DEPRECATED);

  const due = service.listDueBenchmarkCategories('2026-07-10T12:00:00.000Z');
  assert.equal(due.includes('SEO'), true);

  const dashboard = service.getDashboardModel();
  assert.equal(typeof dashboard.totals.specialists, 'number');
  assert.equal(Array.isArray(dashboard.recentEvents), true);
});

test('when no active champion exists, service performs market discovery and returns top benchmark candidates', async () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-workforce-'));
  const repository = new WorkforceRepository({
    registryPath: join(base, 'workforce-registry.json')
  });

  const service = new WorkforceRegistryService({
    repository,
    manager: new WorkforceManager({
      repository,
      marketDiscovery: {
        async discoverCategory() {
          return {
            generatedAt: '2026-07-10T12:00:00.000Z',
            overallRecommendation: 'Benchmark top three website generation providers before hiring.',
            providers: [
              {
                provider: 'Framer',
                company: 'Framer B.V.',
                capability: 'Website generation',
                strengths: ['Fast design iteration'],
                weaknesses: ['Less enterprise workflow depth'],
                typicalUseCases: ['Marketing landing pages'],
                pricing: '$',
                apiAvailability: 'LIMITED',
                enterpriseReadiness: 'MEDIUM',
                evidenceSources: ['https://example.com/framer'],
                overallRecommendation: 'Strong benchmark candidate.',
                recommendationScore: 9.2
              },
              {
                provider: 'Webflow',
                company: 'Webflow, Inc.',
                capability: 'Website generation',
                strengths: ['CMS and publishing controls'],
                weaknesses: ['Learning curve'],
                typicalUseCases: ['Production marketing sites'],
                pricing: '$$',
                apiAvailability: 'AVAILABLE',
                enterpriseReadiness: 'HIGH',
                evidenceSources: ['https://example.com/webflow'],
                overallRecommendation: 'Strong benchmark candidate.',
                recommendationScore: 8.9
              },
              {
                provider: 'Wix Studio',
                company: 'Wix',
                capability: 'Website generation',
                strengths: ['Template velocity'],
                weaknesses: ['Less custom pipeline flexibility'],
                typicalUseCases: ['SMB agency delivery'],
                pricing: '$',
                apiAvailability: 'AVAILABLE',
                enterpriseReadiness: 'MEDIUM',
                evidenceSources: ['https://example.com/wix-studio'],
                overallRecommendation: 'Viable benchmark candidate.',
                recommendationScore: 8.1
              }
            ],
            evidenceSources: ['https://example.com/market-report']
          };
        }
      }
    })
  });

  const hire = await service.hireForCategory('Website Generation');

  assert.equal(hire.decision, 'MARKET_DISCOVERY_REQUIRED');
  assert.equal(hire.selectedSpecialistId, null);
  assert.equal(hire.ceoApprovalRequiredBeforeBenchmark, true);
  assert.equal(hire.benchmarkExecutionStatus, 'PENDING_CEO_APPROVAL');
  assert.equal(hire.topBenchmarkCandidates.length, 3);
  assert.equal(hire.topBenchmarkCandidates[0].provider, 'Framer');
  assert.equal(hire.marketDiscoveryReport.providers.length, 3);
});
