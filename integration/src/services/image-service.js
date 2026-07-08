export class ImageService {
  generateImages() {
    throw new Error('ImageService.generateImages must be implemented by a provider.');
  }
}

export class PlaceholderImageService extends ImageService {
  generateImages(metadata = {}) {
    const normalizedMetadata = {
      script: metadata.script ?? 'Script unavailable',
      sceneDescription: metadata.sceneDescription ?? 'Generic Scene',
      artStyle: metadata.artStyle ?? 'Cinematic Illustration',
      imageCount: metadata.imageCount ?? 3
    };
    const imageCount = this.normalizeImageCount(normalizedMetadata.imageCount);

    return {
      imageFiles: this.buildImageFiles(normalizedMetadata, imageCount),
      generatedScenes: this.buildGeneratedScenes(normalizedMetadata, imageCount)
    };
  }

  normalizeImageCount(imageCount) {
    const count = Number.parseInt(String(imageCount), 10);

    if (Number.isNaN(count)) {
      return 3;
    }

    return Math.max(1, count);
  }

  buildImageFiles(metadata, imageCount) {
    const style = this.slugify(metadata.artStyle);
    const scene = this.fingerprint(metadata.sceneDescription);

    return Array.from({ length: imageCount }, (_, index) => (
      `image-${style}-${scene}-${String(index + 1).padStart(2, '0')}.png`
    ));
  }

  buildGeneratedScenes(metadata, imageCount) {
    return Array.from({ length: imageCount }, (_, index) => (
      `${metadata.sceneDescription} - shot ${index + 1} in ${metadata.artStyle}`
    ));
  }

  slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  fingerprint(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'scene';
  }
}
