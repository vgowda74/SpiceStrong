/**
 * Static image mappings for built-in recipes.
 * React Native requires static require() calls — they cannot be dynamic.
 * Add new recipe images here as you add Hero recipes.
 */
import { type ImageSourcePropType } from 'react-native';

export interface RecipeImageSet {
  card: ImageSourcePropType;
  steps: Record<number, ImageSourcePropType>; // keyed by step index (0-based)
}

const RECIPE_IMAGES: Record<string, RecipeImageSet> = {
  'spicestrong-pepper-chicken': {
    card: require('../../assets/images/recipes/spicestrong-pepper-chicken/card.jpg'),
    steps: {
      0: require('../../assets/images/recipes/spicestrong-pepper-chicken/step1.jpg'),
      1: require('../../assets/images/recipes/spicestrong-pepper-chicken/step2.jpg'),
      2: require('../../assets/images/recipes/spicestrong-pepper-chicken/step3.jpg'),
      3: require('../../assets/images/recipes/spicestrong-pepper-chicken/step4.jpg'),
      4: require('../../assets/images/recipes/spicestrong-pepper-chicken/step5.jpg'),
      5: require('../../assets/images/recipes/spicestrong-pepper-chicken/step6.jpg'),
    },
  },
  'pepper-chicken': {
    card: require('../../assets/images/recipes/pepper-chicken/card.jpg'),
    steps: {
      0: require('../../assets/images/recipes/pepper-chicken/step1.jpg'),
      1: require('../../assets/images/recipes/pepper-chicken/step2.jpg'),
      2: require('../../assets/images/recipes/pepper-chicken/step3.jpg'),
      3: require('../../assets/images/recipes/pepper-chicken/step4.jpg'),
      4: require('../../assets/images/recipes/pepper-chicken/step5.jpg'),
      5: require('../../assets/images/recipes/pepper-chicken/step6.jpg'),
      6: require('../../assets/images/recipes/pepper-chicken/step7.jpg'),
    },
  },
};

/** Get the card image for a recipe, or undefined if none. */
export function getRecipeCardImage(recipeId: string): ImageSourcePropType | undefined {
  return RECIPE_IMAGES[recipeId]?.card;
}

/** Get the step image for a recipe at a given step index (0-based), or undefined if none. */
export function getRecipeStepImage(recipeId: string, stepIndex: number): ImageSourcePropType | undefined {
  return RECIPE_IMAGES[recipeId]?.steps[stepIndex];
}

export default RECIPE_IMAGES;
