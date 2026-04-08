/**
 * Static image mappings for recipe ingredients.
 * 382 ingredient images from Spoonacular CDN + original curated images.
 */
import { type ImageSourcePropType } from 'react-native';
import { getIngredientImage as getFromMap } from './ingredientImageMap';

/**
 * Get a real ingredient image for the given ingredient name.
 * Returns undefined if no matching image is found.
 */
export function getIngredientImage(name: string): ImageSourcePropType | undefined {
  return getFromMap(name) ?? undefined;
}
