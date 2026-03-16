/**
 * Static image mappings for recipe ingredients.
 * Maps ingredient name patterns to real photographs.
 * React Native requires static require() calls.
 */
import { type ImageSourcePropType } from 'react-native';

/** Each entry: [regex pattern to match ingredient name, image source] */
const INGREDIENT_IMAGE_MAP: [RegExp, ImageSourcePropType][] = [
  [/chicken/i, require('../../assets/images/Ingradients/chicken_breast.png')],
  [/chopped.*onion|onion.*chop/i, require('../../assets/images/Ingradients/chopped_red_onion.png')],
  [/red\s*onion|onion/i, require('../../assets/images/Ingradients/red_onion.png')],
  [/pepper|peppercorn/i, require('../../assets/images/Ingradients/black_peppercorn.png')],
  [/fennel/i, require('../../assets/images/Ingradients/fennel_seeds.png')],
  [/cumin/i, require('../../assets/images/Ingradients/cumin_seeds.png')],
  [/ginger.*garlic|garlic.*ginger/i, require('../../assets/images/Ingradients/ginger_garlic_paste.png')],
  [/oil|gingelly/i, require('../../assets/images/Ingradients/cooking_oil.png')],
  [/curry\s*lea/i, require('../../assets/images/Ingradients/curry_leaves.png')],
  [/turmeric/i, require('../../assets/images/Ingradients/turmeric_powder.png')],
  [/garam\s*masala/i, require('../../assets/images/Ingradients/garam_masala.png')],
];

/**
 * Get a real ingredient image for the given ingredient name.
 * Returns undefined if no matching image is found.
 */
export function getIngredientImage(name: string): ImageSourcePropType | undefined {
  for (const [pattern, image] of INGREDIENT_IMAGE_MAP) {
    if (pattern.test(name)) return image;
  }
  return undefined;
}
