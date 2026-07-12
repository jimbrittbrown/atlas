import { WebsiteProductionQaChecks } from './website-production-manager-contracts.js';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/^\//, '')
    .replace(/\/$/, '');
}

function normalizePageLabel(value) {
  const slug = normalizeSlug(value);
  if (!slug) return '';
  return slug.replace(/-/g, ' ');
}

function extractPageInventory(projectDetails = {}) {
  const pages = projectDetails?.details?.pageMetadata?.pages;
  const list = toArray(pages);

  return list.map((entry) => {
    if (typeof entry === 'string') {
      const slug = normalizeSlug(entry);
      return {
        label: normalizePageLabel(entry),
        slug,
        raw: entry
      };
    }

    const slug = normalizeSlug(entry?.slug ?? entry?.path ?? entry?.id ?? entry?.title ?? entry?.name);
    const label = normalizePageLabel(entry?.title ?? entry?.name ?? slug);

    return {
      label,
      slug,
      raw: entry
    };
  }).filter((entry) => Boolean(entry.slug));
}

function extractAssetInventory(projectDetails = {}) {
  const assets = projectDetails?.details?.assets?.assetInventory;
  const images = projectDetails?.details?.images?.imageInventory;
  return [...toArray(assets), ...toArray(images)];
}

function extractComponentInventory(projectDetails = {}) {
  return toArray(projectDetails?.details?.components?.componentNodes);
}

function checkRequiredPages({ requiredPages, pageInventory }) {
  const inventorySet = new Set(pageInventory.flatMap((entry) => [entry.slug, normalizeSlug(entry.label)]));
  const matched = requiredPages.filter((page) => inventorySet.has(page)).length;
  const missing = requiredPages.filter((page) => !inventorySet.has(page));
  const passed = missing.length === 0;

  return {
    checkId: WebsiteProductionQaChecks[0],
    passed,
    score: passed ? 100 : Math.round((matched / Math.max(requiredPages.length, 1)) * 100),
    details: {
      requiredPages,
      discoveredPages: pageInventory.map((entry) => entry.slug),
      missingPages: missing
    },
    recommendations: missing.map((page) => `Add required page: ${page}`)
  };
}

function checkNavigation({ pageInventory, projectDetails }) {
  const redirects = toArray(projectDetails?.details?.navigation?.redirects);
  const hasNavigationSignal = redirects.length > 0 || pageInventory.length > 1;

  return {
    checkId: WebsiteProductionQaChecks[1],
    passed: hasNavigationSignal,
    score: hasNavigationSignal ? 100 : 35,
    details: {
      pageCount: pageInventory.length,
      redirectCount: redirects.length
    },
    recommendations: hasNavigationSignal ? [] : ['Provide navigation structure or redirect metadata before delivery.']
  };
}

function checkBrandingConsistency({ pipelineMission, projectDetails }) {
  const existing = pipelineMission?.existingBranding ?? {};
  const generated = pipelineMission?.artifacts?.brandPackage?.preservedBranding ?? {};
  const colorStyles = toArray(projectDetails?.details?.styles?.colorStyles);

  const checks = [];

  if (existing.logo) {
    checks.push(Boolean(generated.logo) || Boolean(extractAssetInventory(projectDetails).length));
  }

  if (existing.colors) {
    checks.push(Boolean(generated.colors) || colorStyles.length > 0);
  }

  if (toArray(existing.photography).length > 0) {
    checks.push(extractAssetInventory(projectDetails).length > 0);
  }

  const passed = checks.length === 0 ? true : checks.every((item) => item === true);

  return {
    checkId: WebsiteProductionQaChecks[2],
    passed,
    score: passed ? 100 : 55,
    details: {
      existingBrandingKeys: Object.keys(existing),
      generatedBrandingKeys: Object.keys(generated),
      colorStyleCount: colorStyles.length
    },
    recommendations: passed ? [] : ['Align project branding tokens with approved existing branding package.']
  };
}

function checkResponsiveLayout({ projectDetails }) {
  const content = JSON.stringify({
    styles: projectDetails?.details?.styles ?? {},
    variables: projectDetails?.details?.variables ?? {},
    pages: projectDetails?.details?.pageMetadata ?? {}
  }).toLowerCase();

  const hasResponsiveSignals = /(responsive|breakpoint|mobile|tablet|desktop)/i.test(content);

  return {
    checkId: WebsiteProductionQaChecks[3],
    passed: hasResponsiveSignals,
    score: hasResponsiveSignals ? 100 : 50,
    details: {
      responsiveSignalsDetected: hasResponsiveSignals
    },
    recommendations: hasResponsiveSignals ? [] : ['Add explicit responsive breakpoint coverage in project styles/variables.']
  };
}

function checkMissingAssets({ pipelineMission, projectDetails }) {
  const existing = pipelineMission?.existingBranding ?? {};
  const requiredAssetCount = [
    existing.logo ? 1 : 0,
    existing.colors ? 1 : 0,
    toArray(existing.photography).length > 0 ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);

  const available = extractAssetInventory(projectDetails).length;
  const passed = available >= requiredAssetCount;

  return {
    checkId: WebsiteProductionQaChecks[4],
    passed,
    score: passed ? 100 : Math.max(25, Math.round((available / Math.max(requiredAssetCount, 1)) * 100)),
    details: {
      requiredAssetCount,
      availableAssetCount: available
    },
    recommendations: passed ? [] : ['Upload missing logo, color, and photography assets into sandbox project inventory.']
  };
}

function checkBrokenComponents({ projectDetails }) {
  const components = extractComponentInventory(projectDetails);
  const broken = components.filter((component) => {
    const marker = JSON.stringify(component ?? {}).toLowerCase();
    return marker.includes('broken') || marker.includes('error') || marker.includes('missing');
  });

  const passed = components.length > 0 && broken.length === 0;

  return {
    checkId: WebsiteProductionQaChecks[5],
    passed,
    score: passed ? 100 : components.length === 0 ? 45 : 35,
    details: {
      componentCount: components.length,
      brokenComponentCount: broken.length
    },
    recommendations: passed ? [] : ['Repair or replace broken component references before executive approval.']
  };
}

function buildScreenshotTasks({ reviewId, requiredPages }) {
  return requiredPages.map((page, index) => ({
    taskId: `${reviewId}_shot_${String(index + 1).padStart(2, '0')}`,
    page,
    instruction: `Capture desktop and mobile screenshots for ${page}.`,
    status: 'PENDING'
  }));
}

function checkScreenshotTaskGeneration({ reviewId, requiredPages }) {
  const tasks = buildScreenshotTasks({ reviewId, requiredPages });

  return {
    checkId: WebsiteProductionQaChecks[6],
    passed: tasks.length === requiredPages.length,
    score: tasks.length === requiredPages.length ? 100 : 0,
    details: {
      generatedTaskCount: tasks.length
    },
    recommendations: tasks.length === requiredPages.length ? [] : ['Regenerate screenshot capture tasks for all required pages.'],
    tasks
  };
}

function scoreQaChecks(checks = []) {
  const weights = {
    REQUIRED_PAGE_VERIFICATION: 0.2,
    NAVIGATION_VERIFICATION: 0.1,
    BRANDING_CONSISTENCY: 0.15,
    RESPONSIVE_LAYOUT_VERIFICATION: 0.15,
    MISSING_ASSET_DETECTION: 0.1,
    BROKEN_COMPONENT_DETECTION: 0.1,
    SCREENSHOT_CAPTURE_TASK_GENERATION: 0.1,
    QA_SCORING: 0.1
  };

  const weighted = checks.reduce((sum, check) => {
    const weight = Number(weights[check.checkId] ?? 0);
    return sum + (Number(check.score ?? 0) * weight);
  }, 0);

  return Math.round(weighted);
}

export class WebsiteProductionQaEngine {
  evaluate({ reviewId, requiredPages = [], pipelineMission, projectDetails = {} } = {}) {
    const pageInventory = extractPageInventory(projectDetails);

    const checks = [];
    checks.push(checkRequiredPages({ requiredPages, pageInventory }));
    checks.push(checkNavigation({ pageInventory, projectDetails }));
    checks.push(checkBrandingConsistency({ pipelineMission, projectDetails }));
    checks.push(checkResponsiveLayout({ projectDetails }));
    checks.push(checkMissingAssets({ pipelineMission, projectDetails }));
    checks.push(checkBrokenComponents({ projectDetails }));

    const screenshotCheck = checkScreenshotTaskGeneration({ reviewId, requiredPages });
    checks.push(screenshotCheck);

    const preliminaryScore = scoreQaChecks(checks);
    checks.push({
      checkId: WebsiteProductionQaChecks[7],
      passed: preliminaryScore >= 70,
      score: preliminaryScore,
      details: { qaScore: preliminaryScore },
      recommendations: preliminaryScore >= 70 ? [] : ['Raise QA score above 70 before CEO approval.']
    });

    const qualityScore = scoreQaChecks(checks);
    const issuesRemaining = checks.filter((check) => check.passed !== true).length;

    return {
      reviewId,
      qualityScore,
      qaStatus: qualityScore >= 70 ? 'PASS' : 'REVISION_REQUIRED',
      issuesRemaining,
      checks,
      screenshotTasks: screenshotCheck.tasks,
      recommendations: checks
        .filter((check) => check.passed !== true)
        .flatMap((check) => check.recommendations ?? [])
    };
  }
}
