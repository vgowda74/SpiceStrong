/**
 * ratingsService.ts — SpiceStrong
 * Community ratings service. Currently uses mock data for beta.
 * Swap to Supabase when backend is ready.
 */

export interface ReviewItem {
  id: string;
  username: string;
  rating: number;
  comment: string;
  createdAt: string; // ISO date string
}

export interface RecipeRatings {
  averageRating: number;
  totalCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>; // star -> count
  reviews: ReviewItem[];
}

const EMPTY_RATINGS: RecipeRatings = {
  averageRating: 0,
  totalCount: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  reviews: [],
};

// ─── Mock community data for beta (replace with Supabase later) ───
const MOCK_REVIEWS: Record<string, RecipeRatings> = {
  'pepper-chicken': {
    averageRating: 4.6,
    totalCount: 127,
    distribution: { 5: 78, 4: 32, 3: 12, 2: 3, 1: 2 },
    reviews: [
      {
        id: 'r1',
        username: 'SpiceChef_4821',
        rating: 5,
        comment: 'Perfect post-workout meal, made it 3 times already!',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'r2',
        username: 'FitFoodie_91',
        rating: 5,
        comment: 'Love the pepper flavor. So much protein and tastes amazing!',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'r3',
        username: 'HealthyBites_23',
        rating: 4,
        comment: 'Great recipe! I added extra black pepper and it was fire.',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'r4',
        username: 'CookingMama_55',
        rating: 5,
        comment: 'My family loved this. Will definitely make again!',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'r5',
        username: 'GymBro_777',
        rating: 4,
        comment: 'Easy to cook and high protein. Exactly what I needed.',
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'r6',
        username: 'DesiKitchen_42',
        rating: 5,
        comment: 'Authentic taste! Reminds me of my grandmother\'s cooking.',
        createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
};

/**
 * Fetch community ratings for a recipe.
 * Returns mock data for beta; swap to Supabase fetch later.
 */
export async function getRecipeRatings(recipeId: string): Promise<RecipeRatings> {
  // Simulate network delay (remove when using real backend)
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
  return MOCK_REVIEWS[recipeId] ?? EMPTY_RATINGS;
}

/**
 * Format relative time (e.g., "2 days ago", "1 week ago")
 */
export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}
