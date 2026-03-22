# SpiceStrong — App Store Optimization Notes

## App Identity

- **App Name:** SpiceStrong
- **Subtitle:** High-Protein Indian Recipes
- **Bundle ID:** (TBD)
- **Version:** 1.0.0
- **Platform:** iOS (primary), Android (v1.1)
- **Category:** Food & Drink
- **Secondary Category:** Health & Fitness

---

## App Store Keywords

**Primary Keywords (30 char limit for iOS keyword field):**
```
protein,indian,recipes,healthy,spice,cooking,fitness,meal,chicken,paneer
```

**Long-Tail Keywords (for description/metadata):**
- high protein indian recipes
- indian meal prep
- healthy indian cooking
- protein rich meals
- gym diet indian food
- fitness meal recipes
- paneer recipes high protein
- chicken tikka masala healthy
- indian spice recipes
- bodybuilding indian food
- low carb indian meals
- air fryer indian recipes
- step by step indian cooking
- guided cooking app
- indian recipe nutrition

---

## App Store Description

### Short Description (Google Play, 80 chars)
```
High-protein Indian recipes with guided cooking, nutrition tracking & AI chef
```

### Full Description

**SpiceStrong** is the ultimate cooking companion for fitness-conscious food lovers who crave authentic Indian flavors without compromising their protein goals.

**Cook Like a Pro, Eat Like a Champion**

Browse our curated collection of high-protein Indian recipes, each designed by nutrition experts to maximize protein while keeping authentic taste. From creamy Chicken Tikka Masala to protein-packed Paneer Bhurji — every recipe is optimized for your fitness journey.

**Features:**

🍗 **14 Protein Categories** — Chicken, Fish, Paneer, Shrimp, Lamb, Eggs, Tofu & more
📸 **Step-by-Step Photo Guides** — AI-generated images for every cooking step
⏱️ **Built-in Cooking Timers** — Never overcook again with smart notifications
🤖 **AI Recipe Builder** — Generate custom recipes tailored to your taste
📊 **USDA Nutrition Data** — Accurate calories, protein, carbs & fat per serving
🛒 **Smart Grocery Lists** — Auto-generated shopping lists from any recipe
🔊 **Voice Guidance** — Hands-free cooking instructions
📱 **Quantity Scaling** — Switch between 2-3 and 4-6 servings instantly

**Perfect For:**
- Gym enthusiasts tracking macros
- Home cooks exploring Indian cuisine
- Meal preppers looking for variety
- Anyone wanting healthier Indian food

Every recipe includes detailed nutrition breakdowns, chef tips, and the exact spice quantities that make Indian food extraordinary.

**Download SpiceStrong and transform your kitchen into a high-protein Indian restaurant.**

---

## Screenshots Strategy

1. **Splash/Hero** — SpiceStrong logo with tagline on dark copper background
2. **Protein Selection** — Grid of 14 protein types with colorful emojis
3. **Recipe List** — Beautiful recipe cards with ratings and nutrition badges
4. **Cooking Mode** — Step-by-step with timer and step image
5. **AI Recipe Builder** — "Create your own recipe" with Claude AI
6. **Nutrition Card** — Detailed macro breakdown per serving
7. **Ingredient Checklist** — Shopping list with checkboxes

---

## TestFlight Notes

### Build Checklist
- [ ] Set proper bundle identifier
- [ ] Configure app icons (all sizes)
- [ ] Set up Apple Developer account
- [ ] Create App Store Connect listing
- [ ] Configure push notification certificates (for cooking timers)
- [ ] Test on physical iPhone (minimum iOS 16)
- [ ] Verify all images load from Supabase Storage
- [ ] Test AI recipe generation rate limiting
- [ ] Verify offline behavior (cached recipes)
- [ ] Test notification permissions flow

### TestFlight Groups
- **Internal:** Dev team testing
- **Beta 1:** Close friends & family (10-20 users)
- **Beta 2:** Fitness community early adopters (50-100 users)
- **Public Beta:** Open TestFlight link

### Beta Feedback to Collect
- [ ] Recipe quality and accuracy
- [ ] Step image quality (do they match the instructions?)
- [ ] Cooking timer reliability
- [ ] Nutrition data accuracy
- [ ] AI recipe quality
- [ ] App performance on older devices
- [ ] Any crashes or freezes

---

## Privacy & Compliance

- **Data collected:** Device ID (for recipe association), cooking feedback
- **No user accounts** in v1.0 (no PII collected)
- **No tracking/analytics** SDKs yet
- **API keys:** All stored server-side or in .env (not bundled in app)
- **Privacy Policy:** Required before App Store submission
- **Terms of Service:** Required before App Store submission
