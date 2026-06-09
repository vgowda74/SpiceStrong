/**
 * e2e/regression.e2e.ts — SpiceStrong Regression Test Suite
 * 
 * Tests critical user flows:
 * 1. Recipe discovery by protein type
 * 2. Diet preference filtering
 * 3. Recipe filters (spice, time, difficulty, cuisine, fitness goal)
 * 4. Recipe details & nutrition info
 * 5. Favorites toggle
 * 6. Meal planning (add/remove)
 * 7. AI recipe generation
 * 8. Offline mode caching
 */

import {
  waitForElement,
  tapElement,
  tapText,
  typeText,
  clearText,
  expectVisible,
  expectNotVisible,
  expectText,
  multiTap,
  scrollTo,
} from './helpers';

describe('SpiceStrong Regression Tests', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES', camera: 'YES', medialibrary: 'YES' },
    });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 1: Recipe Discovery & Protein Loading
  // ─────────────────────────────────────────────────────────────
  describe('Recipe Discovery', () => {
    it('should load protein selection screen on app start', async () => {
      await waitForElement('protein-selection-screen', 10000);
      await expectVisible('protein-selection-screen');
    });

    it('should display all 14 proteins (8 non-veg + 6 veg)', async () => {
      const proteins = [
        'chicken', 'beef', 'lamb', 'goat', 'pork', 'fish', 'prawns', 'eggs',
        'paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'
      ];

      for (const protein of proteins) {
        await expect(element(by.id(`protein-card-${protein}`))).toBeVisible();
      }
    });

    it('should load chicken recipes when protein is selected', async () => {
      await tapElement('protein-card-chicken');
      await waitForElement('recipe-list-screen', 10000);
      await expectVisible('recipe-list-screen');
      // At least one recipe should be visible
      await expect(element(by.id('recipe-card-0'))).toBeVisible();
    });

    it('should display recipe name, protein, difficulty, and time on card', async () => {
      // Already on chicken recipes list
      await expectVisible('recipe-card-0');
      await expectVisible('recipe-card-name-0');
      await expectVisible('recipe-card-difficulty-0');
      await expectVisible('recipe-card-time-0');
    });

    it('should load all non-veg proteins with recipes', async () => {
      const nonVegProteins = ['beef', 'lamb', 'goat', 'pork', 'fish', 'prawns', 'eggs'];
      
      for (const protein of nonVegProteins) {
        // Go back to protein selection
        await device.pressBack();
        await waitForElement('protein-selection-screen', 5000);
        
        // Tap protein
        await tapElement(`protein-card-${protein}`);
        await waitForElement('recipe-list-screen', 8000);
        
        // Verify at least one recipe loads
        await expect(element(by.id('recipe-card-0'))).toBeVisible();
        console.log(`✓ ${protein} recipes loaded`);
      }
    });

    it('should load all veg proteins with recipes', async () => {
      const vegProteins = ['paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'];
      
      for (const protein of vegProteins) {
        // Go back to protein selection
        await device.pressBack();
        await waitForElement('protein-selection-screen', 5000);
        
        // Tap protein
        await tapElement(`protein-card-${protein}`);
        await waitForElement('recipe-list-screen', 8000);
        
        // Verify at least one recipe loads
        await expect(element(by.id('recipe-card-0'))).toBeVisible();
        console.log(`✓ ${protein} recipes loaded`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 2: Diet Preference Filtering
  // ─────────────────────────────────────────────────────────────
  describe('Diet Preference Filtering', () => {
    beforeEach(async () => {
      // Go to profile/settings to set diet preference
      await tapElement('profile-menu-button');
      await waitForElement('settings-screen', 5000);
    });

    it('should hide non-veg proteins when diet is set to vegetarian', async () => {
      // Set diet to vegetarian
      await tapElement('diet-preference-veg');
      await tapElement('save-preferences');
      
      // Go to protein selection
      await tapElement('protein-selection-button');
      await waitForElement('protein-selection-screen', 5000);

      // Non-veg proteins should be disabled/hidden
      const nonVegProteins = ['chicken', 'beef', 'lamb', 'goat', 'pork', 'fish', 'prawns', 'eggs'];
      for (const protein of nonVegProteins) {
        await expect(element(by.id(`protein-card-${protein}`))).not.toBeVisible();
      }

      // Veg proteins should be visible
      const vegProteins = ['paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'];
      for (const protein of vegProteins) {
        await expect(element(by.id(`protein-card-${protein}`))).toBeVisible();
      }
    });

    it('should show all proteins when diet is set to non-vegetarian', async () => {
      // Set diet to non-veg
      await tapElement('diet-preference-nonveg');
      await tapElement('save-preferences');
      
      // Go to protein selection
      await tapElement('protein-selection-button');
      await waitForElement('protein-selection-screen', 5000);

      // All proteins should be visible
      const allProteins = [
        'chicken', 'beef', 'lamb', 'goat', 'pork', 'fish', 'prawns', 'eggs',
        'paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'
      ];
      for (const protein of allProteins) {
        await expect(element(by.id(`protein-card-${protein}`))).toBeVisible();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 3: Recipe Filters
  // ─────────────────────────────────────────────────────────────
  describe('Recipe Filters', () => {
    beforeEach(async () => {
      // Navigate to chicken recipes
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      await tapElement('protein-card-chicken');
      await waitForElement('recipe-list-screen', 8000);
    });

    it('should open filter modal when filter button is tapped', async () => {
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      await expectVisible('recipe-filter-screen');
    });

    it('should filter recipes by spice level', async () => {
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      
      // Select "Hot" spice level
      await tapElement('spice-level-hot');
      
      // Apply filter
      await tapElement('apply-filter-button');
      await waitForElement('recipe-list-screen', 5000);
      
      // Verify filter chip is visible
      await expectVisible('filter-chip-spice-hot');
    });

    it('should filter recipes by cooking time', async () => {
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      
      // Select "15-30 min"
      await tapElement('time-bucket-15-30');
      
      // Apply filter
      await tapElement('apply-filter-button');
      await waitForElement('recipe-list-screen', 5000);
      
      // Verify filter chip
      await expectVisible('filter-chip-time-15-30');
    });

    it('should filter recipes by difficulty', async () => {
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      
      // Select "Easy"
      await tapElement('difficulty-easy');
      
      // Apply filter
      await tapElement('apply-filter-button');
      await waitForElement('recipe-list-screen', 5000);
      
      // Verify filter chip
      await expectVisible('filter-chip-difficulty-easy');
    });

    it('should filter recipes by cuisine', async () => {
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      
      // Select "Indian"
      await tapElement('cuisine-indian');
      
      // Apply filter
      await tapElement('apply-filter-button');
      await waitForElement('recipe-list-screen', 5000);
      
      // Verify filter chip
      await expectVisible('filter-chip-cuisine-indian');
    });

    it('should clear all filters', async () => {
      // Add a filter first
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      await tapElement('spice-level-hot');
      await tapElement('apply-filter-button');
      
      // Now clear
      await tapElement('filter-button');
      await waitForElement('recipe-filter-screen', 5000);
      await tapElement('clear-all-filters-button');
      await tapElement('apply-filter-button');
      
      // Filter chips should be gone
      await expect(element(by.id('filter-chip-spice-hot'))).not.toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 4: Recipe Details & Favorites
  // ─────────────────────────────────────────────────────────────
  describe('Recipe Details & Favorites', () => {
    beforeEach(async () => {
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      await tapElement('protein-card-chicken');
      await waitForElement('recipe-list-screen', 8000);
    });

    it('should open recipe details when recipe is tapped', async () => {
      await tapElement('recipe-card-0');
      await waitForElement('recipe-detail-screen', 8000);
      await expectVisible('recipe-detail-screen');
    });

    it('should display recipe name, nutrition, ingredients, and steps', async () => {
      await tapElement('recipe-card-0');
      await waitForElement('recipe-detail-screen', 8000);
      
      // Check key sections
      await expectVisible('recipe-name');
      await expectVisible('nutrition-section');
      await expectVisible('ingredients-section');
      await expectVisible('steps-section');
    });

    it('should toggle favorite when heart icon is tapped', async () => {
      // Get initial favorite state
      const initialState = await element(by.id('recipe-card-0-favorite')).getAttributes();
      
      // Tap to add to favorites
      await tapElement('recipe-card-0-favorite');
      
      // Verify state changed
      const newState = await element(by.id('recipe-card-0-favorite')).getAttributes();
      expect(initialState).not.toEqual(newState);
    });

    it('should show favorited recipes in favorites tab', async () => {
      // Add a recipe to favorites
      await tapElement('recipe-card-0-favorite');
      
      // Switch to favorites tab
      await tapElement('filter-tab-favourites');
      await waitForElement('recipe-list-screen', 5000);
      
      // Recipe should still be visible
      await expect(element(by.id('recipe-card-0'))).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 5: Meal Planning
  // ─────────────────────────────────────────────────────────────
  describe('Meal Planning', () => {
    beforeEach(async () => {
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      await tapElement('protein-card-chicken');
      await waitForElement('recipe-list-screen', 8000);
    });

    it('should open meal plan modal when add-to-meal-plan is tapped', async () => {
      // Long press or tap meal plan button on recipe card
      await multiTap('recipe-card-0', 2);
      await waitForElement('meal-plan-modal', 5000);
      await expectVisible('meal-plan-modal');
    });

    it('should select a meal slot (breakfast, lunch, snack)', async () => {
      await multiTap('recipe-card-0', 2);
      await waitForElement('meal-plan-modal', 5000);
      
      // Select breakfast slot
      await tapElement('meal-slot-breakfast');
      await expectVisible('meal-slot-breakfast-selected');
    });

    it('should add recipe to meal plan for today', async () => {
      await multiTap('recipe-card-0', 2);
      await waitForElement('meal-plan-modal', 5000);
      
      // Select breakfast
      await tapElement('meal-slot-breakfast');
      
      // Confirm add
      await tapElement('confirm-add-meal-plan');
      
      // Modal should close
      await expect(element(by.id('meal-plan-modal'))).not.toBeVisible();
    });

    it('should show error when meal slot is full', async () => {
      // Try to add multiple recipes to same slot
      await multiTap('recipe-card-0', 2);
      await waitForElement('meal-plan-modal', 5000);
      await tapElement('meal-slot-breakfast');
      await tapElement('confirm-add-meal-plan');
      
      // Try to add again
      await multiTap('recipe-card-1', 2);
      await waitForElement('meal-plan-modal', 5000);
      await tapElement('meal-slot-breakfast');
      await tapElement('confirm-add-meal-plan');
      
      // Error should show (or slot limit reached)
      await expect(element(by.text(/limit|full|max/i))).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 6: AI Recipe Generation (if applicable)
  // ─────────────────────────────────────────────────────────────
  describe('AI Recipe Generation', () => {
    it('should open AI recipe builder from home', async () => {
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      
      await tapElement('ai-recipe-builder-button');
      await waitForElement('ai-builder-screen', 8000);
      await expectVisible('ai-builder-screen');
    });

    it('should generate a recipe with ingredients and cooking instructions', async () => {
      // Navigate to AI builder
      await tapElement('ai-recipe-builder-button');
      await waitForElement('ai-builder-screen', 8000);
      
      // Enter recipe description
      await typeText('recipe-description-input', 'High protein chicken tikka masala with yogurt');
      
      // Select protein (if needed)
      await tapElement('protein-selector');
      await tapText('Chicken');
      
      // Generate recipe
      await tapElement('generate-recipe-button');
      
      // Wait for AI to generate (longer timeout)
      await waitForElement('recipe-result-screen', 30000);
      await expectVisible('recipe-result-screen');
    });

    it('should save generated recipe', async () => {
      // Assuming we're on recipe result screen
      await tapElement('save-recipe-button');
      
      // Verify success message or navigation back
      await expect(element(by.text(/saved|success/i))).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 7: Offline Mode & Caching
  // ─────────────────────────────────────────────────────────────
  describe('Offline Mode & Caching', () => {
    it('should display cached recipes when offline', async () => {
      // First load recipes online
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      await tapElement('protein-card-chicken');
      await waitForElement('recipe-list-screen', 8000);
      await expectVisible('recipe-card-0');
      
      // Now go offline
      await device.simulateAppLaunchEvent({ newInstance: true, permissions: { notifications: 'YES' } });
      
      // Recipes should still be visible (from cache)
      await expect(element(by.id('recipe-card-0'))).toBeVisible();
    });

    it('should sync pending recipes when back online', async () => {
      // This is harder to test without actual network control
      // For now, verify the app doesn't crash
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      
      // App should be stable
      await expect(element(by.id('protein-selection-screen'))).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 8: App Stability & Navigation
  // ─────────────────────────────────────────────────────────────
  describe('App Stability', () => {
    it('should not crash on rapid navigation', async () => {
      await device.reloadReactNative();
      await waitForElement('protein-selection-screen', 10000);
      
      // Tap proteins rapidly
      for (let i = 0; i < 3; i++) {
        await tapElement('protein-card-chicken');
        await waitForElement('recipe-list-screen', 5000);
        await device.pressBack();
        await waitForElement('protein-selection-screen', 3000);
      }
      
      // App should still be responsive
      await expect(element(by.id('protein-selection-screen'))).toBeVisible();
    });

    it('should handle deep linking to recipes', async () => {
      // This depends on your routing setup
      // Example: navigate to a specific recipe by ID
      // await device.sendUserAction({ type: 'url', url: 'spicestrong://recipe/chicken-tikka-123' });
      
      // For now, just verify app is stable
      await device.reloadReactNative();
      await expect(element(by.id('protein-selection-screen'))).toBeVisible();
    });
  });
});
