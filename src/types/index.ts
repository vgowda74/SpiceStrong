export interface Protein {
  id: string;
  name: string;
  emoji: string;
  category: 'NON-VEG' | 'VEG';
}

export interface Ingredient {
  name: string;
  quantity: string;
}

export interface CookingStep {
  id: string;
  title: string;
  description: string;
  timerSeconds?: number;
}

export interface Recipe {
  id: string;
  name: string;
  proteinId: string;
  proteinGrams: number;
  calories: number;
  ingredients: { [servingSize: string]: Ingredient[] };
  steps: CookingStep[];
  chefTip?: string;
  isCustom: boolean;
}

export type RootStackParamList = {
  Splash: undefined;
  ProteinSelection: undefined;
  RecipeList: { proteinId: string };
  RecipeDetail: { recipeId: string };
  CookingMode: { recipeId: string };
  CustomRecipe: { proteinId: string };
};
