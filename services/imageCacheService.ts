/**
 * imageCacheService.ts — SpiceStrong
 * Downloads and caches remote recipe images (Supabase Storage URLs) to local filesystem.
 * Reuses the expo-file-system pattern from imageGenerationService.ts.
 */

import * as FileSystem from 'expo-file-system';

const CACHED_IMAGES_DIR = 'cached_recipe_images';

function getCacheDirUri(): string {
  return `${FileSystem.documentDirectory}${CACHED_IMAGES_DIR}/`;
}

async function ensureCacheDir(): Promise<string> {
  const dirUri = getCacheDirUri();
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
  return dirUri;
}

function safeFileName(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 120);
}

/**
 * Get a local URI for a remote image URL.
 * If already cached locally, returns the local file URI immediately.
 * Otherwise downloads and caches, then returns the local URI.
 * Returns null on failure (caller should fall back to emoji).
 *
 * @param remoteUrl - The Supabase Storage public URL
 * @param cacheKey  - Unique key for local filename, e.g. "recipeId_hero"
 */
export async function getCachedImageUri(
  remoteUrl: string,
  cacheKey: string,
): Promise<string | null> {
  if (!remoteUrl) return null;

  try {
    const dirUri = await ensureCacheDir();
    const fileName = safeFileName(cacheKey);
    const fileUri = dirUri + fileName;

    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      return fileUri;
    }

    const downloaded = await FileSystem.downloadAsync(remoteUrl, fileUri);
    console.log(`[SpiceStrong] Image cached: ${cacheKey} -> ${downloaded.uri}`);
    return downloaded.uri;
  } catch (e) {
    console.warn(`[SpiceStrong] Image cache failed for ${cacheKey}:`, e);
    return null;
  }
}

/**
 * Pre-cache hero images for a batch of recipes in the background.
 * Downloads up to 3 images concurrently to avoid saturating the connection.
 */
export async function preCacheRecipeImages(
  recipes: Array<{ id: string; heroUrl?: string | null }>,
): Promise<void> {
  const toCache = recipes.filter((r) => r.heroUrl);
  if (toCache.length === 0) return;

  const CONCURRENCY = 3;
  const queue = [...toCache];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item?.heroUrl) continue;
      await getCachedImageUri(item.heroUrl, `${item.id}_hero`).catch(() => {});
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker());
  await Promise.all(workers);
}

/**
 * Clear cached images if the cache directory has too many files.
 * Uses the legacy FileSystem API to avoid TurboModule crashes.
 */
export async function pruneImageCache(): Promise<void> {
  try {
    const dirUri = getCacheDirUri();
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists) return;

    const contents = await FileSystem.readDirectoryAsync(dirUri);
    if (contents.length > 200) {
      console.log(`[SpiceStrong] Image cache has ${contents.length} files, pruning...`);
      const toDelete = contents.slice(0, Math.floor(contents.length / 2));
      await Promise.all(
        toDelete.map((name) =>
          FileSystem.deleteAsync(dirUri + name, { idempotent: true }).catch(() => {}),
        ),
      );
      console.log(`[SpiceStrong] Pruned ${toDelete.length} cached images`);
    }
  } catch (e) {
    console.warn('[SpiceStrong] Image cache prune failed:', e);
  }
}
