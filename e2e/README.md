# SpiceStrong E2E Test Suite

Automated regression tests for SpiceStrong using Detox.

## Quick Start

### Prerequisites

- Node.js 18+
- macOS (for iOS) or Linux/macOS (for Android)
- Xcode command line tools (for iOS)
- Android SDK (for Android)

### Installation

```bash
# Install dependencies
npm install

# Install Detox CLI globally (optional but recommended)
npm install -g detox-cli
```

### Running Tests

#### iOS
```bash
# Build framework cache (first time only)
detox build-framework-cache

# Run tests
npm run test:e2e:ios

# Debug mode (with logs & videos)
npm run test:e2e:ios:debug
```

#### Android
```bash
npm run test:e2e:android
npm run test:e2e:android:debug
```

## Test Structure

```
e2e/
├── regression.e2e.ts      # Main regression test suite (90+ tests)
├── helpers.ts             # Common test utilities
└── README.md              # This file
```

## Test Suites

### 1. Recipe Discovery (14 tests)
- ✓ Load protein selection screen
- ✓ Display all 14 proteins
- ✓ Load recipes for each protein
- ✓ Display recipe card info
- ✓ Test all non-veg proteins (8)
- ✓ Test all veg proteins (6)

### 2. Diet Preference Filtering (2 tests)
- ✓ Hide non-veg for vegetarian users
- ✓ Show all for non-vegetarian users

### 3. Recipe Filters (6 tests)
- ✓ Spice level filter
- ✓ Cooking time filter
- ✓ Difficulty filter
- ✓ Cuisine filter
- ✓ Multiple filter combinations
- ✓ Clear filters

### 4. Recipe Details & Favorites (3 tests)
- ✓ Open recipe details
- ✓ Display nutrition & ingredients
- ✓ Toggle favorites

### 5. Meal Planning (3 tests)
- ✓ Open meal plan modal
- ✓ Select meal slot
- ✓ Handle full slots

### 6. AI Recipe Generation (3 tests)
- ✓ Open AI builder
- ✓ Generate recipe
- ✓ Save generated recipe

### 7. Offline Mode (2 tests)
- ✓ Display cached recipes offline
- ✓ Sync pending recipes online

### 8. App Stability (2 tests)
- ✓ Handle rapid navigation
- ✓ Handle deep linking

**Total: ~35 test cases**

## Test IDs Required

For tests to work, your app components must have testID props. Here's what's needed:

### Screen IDs
```tsx
<View testID="protein-selection-screen">
<View testID="recipe-list-screen">
<View testID="recipe-detail-screen">
<View testID="filter-button">
<View testID="ai-recipe-builder-button">
```

### Recipe Card IDs
```tsx
<View testID="recipe-card-0">
  <Text testID="recipe-card-name-0">Recipe Name</Text>
  <Text testID="recipe-card-difficulty-0">Easy</Text>
  <Text testID="recipe-card-time-0">30 min</Text>
  <TouchableOpacity testID="recipe-card-0-favorite">
```

### Meal Plan Modal IDs
```tsx
<Modal testID="meal-plan-modal">
  <TouchableOpacity testID="meal-slot-breakfast">
  <TouchableOpacity testID="confirm-add-meal-plan">
```

### Filter Modal IDs
```tsx
<View testID="recipe-filter-screen">
  <TouchableOpacity testID="spice-level-hot">
  <TouchableOpacity testID="time-bucket-15-30">
  <TouchableOpacity testID="apply-filter-button">
```

## Debugging Tests

### View logs
```bash
npm run test:e2e:ios:debug
```

### Record video/screenshots
Videos and screenshots are automatically saved to `artifacts/` when using debug mode.

### Run single test
```bash
detox test e2e/regression.e2e.ts --configuration ios --testName "should load chicken recipes"
```

### Watch mode
```bash
detox test e2e/regression.e2e.ts --configuration ios --watch
```

## Common Issues

### Issue: "Cannot find element with ID"
**Solution:** Ensure the component in your app has the matching `testID` prop.

### Issue: "Timeout waiting for element"
**Solution:** Increase timeout or check if element is actually visible:
```typescript
await waitFor(element(by.id('my-element')))
  .toBeVisible()
  .withTimeout(10000); // 10 second timeout
```

### Issue: "ReferenceError: device is not defined"
**Solution:** Make sure tests are in `.e2e.ts` files, not `.test.ts` files.

## CI/CD Integration

GitHub Actions workflow is included: `.github/workflows/e2e-regression-tests.yml`

Tests run automatically on:
- Every push to `main` or `develop`
- Every PR to `main` or `develop`

Results are posted as PR comments.

## Writing New Tests

### Template
```typescript
describe('Feature Name', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    // Navigate to the screen
  });

  it('should do something', async () => {
    // Arrange
    await waitForElement('my-element', 5000);
    
    // Act
    await tapElement('my-button');
    
    // Assert
    await expectVisible('result-element');
  });
});
```

### Available Helpers

```typescript
// From e2e/helpers.ts
waitForElement(testID, timeout)
tapElement(testID)
tapText(text)
typeText(testID, text)
clearText(testID)
scrollTo(testID, direction)
expectVisible(testID)
expectNotVisible(testID)
expectText(testID, text)
multiTap(testID, times)
longPress(testID)
swipeLeft(testID)
swipeRight(testID)
```

## Performance Tips

- Minimize network calls in tests (mock if possible)
- Reuse device state when possible
- Don't wait longer than necessary (use reasonable timeouts)
- Clean up after tests (reset state)

## Resources

- [Detox Documentation](https://detoxrn.com/)
- [SpiceStrong Regression Checklist](../REGRESSION_TEST_CHECKLIST.md)
- [Package.json Scripts](#running-tests)

## Questions?

Check the main README or contact the team.

---

**Last Updated:** 2026-06-06
