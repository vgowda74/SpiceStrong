# SpiceStrong - Advanced Recipe Filter System
## Product Spec v1.0 | March 2026

---

## Vision
Make SpiceStrong the ultimate high-protein recipe discovery engine covering every cuisine, cooking method, and protein cut from anywhere in the world. Users should be able to find exactly the recipe they want with precise filtering.

---

## Filter Location
- Recipe List Screen (per protein category)
- Filter icon button positioned before the meal type tabs (All, Breakfast, Lunch/Dinner)
- Tapping the icon opens a full filter panel/bottom sheet

---

## Filter Categories

### 1. Cuisine (Universal)
Covers every major world cuisine:
| Region | Cuisines |
|--------|----------|
| South Asia | Indian, South Indian, North Indian, Sri Lankan, Pakistani, Bangladeshi |
| East Asia | Chinese, Japanese, Korean, Taiwanese |
| Southeast Asia | Thai, Vietnamese, Indonesian, Malaysian, Filipino, Singaporean |
| Middle East | Lebanese, Turkish, Persian, Arabic, Israeli |
| Europe | Italian, French, Spanish, Greek, German, British, Portuguese |
| Americas | American, Mexican, Brazilian, Peruvian, Caribbean, Cajun |
| Africa | Ethiopian, Moroccan, Nigerian, South African, Kenyan |
| Other | Mediterranean, Fusion, Global, Street Food |

### 2. Cooking Method (Universal)
| Method | Description |
|--------|-------------|
| Air Fryer | Hot air circulation cooking |
| Pan Fry / Saute | Stovetop with oil |
| Grill | Open flame or grill pan |
| Oven / Bake | Conventional oven cooking |
| Slow Cook | Low and slow (crockpot) |
| Stir Fry | High heat wok cooking |
| Steam | Steam-based cooking |
| Pressure Cook | Instant Pot / pressure cooker |
| Tandoor | Clay oven cooking |
| Deep Fry | Full oil immersion |
| Sous Vide | Precision water bath |
| Smoker | Wood smoke cooking |
| Boil / Poach | Water-based cooking |
| No Cook | Raw / salad / cold prep |

### 3. Difficulty (Universal)
- Easy
- Medium
- Hard

### 4. Spice Level (Universal)
- Mild
- Medium
- Hot
- Extra Hot

### 5. Cooking Time (Universal)
- Under 15 min
- 15-30 min
- 30-60 min
- 60+ min

### 6. Diet / Health Tags (Universal)
- High Protein
- Low Carb
- Low Fat
- Low Cholesterol
- Gluten Free
- Dairy Free
- Keto Friendly
- Fitness Friendly
- Meal Prep Friendly

### 7. Protein-Specific Filters (Dynamic per protein)

#### Chicken
Breast, Thigh, Wings, Drumstick, Whole, Mince/Ground, Tenderloin, Leg Quarter

#### Fish
Salmon, Tuna, Cod, Tilapia, Mackerel, Sardine, Sea Bass, Trout, Swordfish, Mahi Mahi, Snapper, Halibut, Catfish

#### Beef
Steak, Mince/Ground, Brisket, Sirloin, Tenderloin, Ribs, Chuck, Flank, Round, Strip

#### Pork
Tenderloin, Belly, Shoulder, Chops, Ribs, Loin, Mince/Ground, Ham

#### Lamb
Chops, Leg, Shoulder, Mince/Ground, Rack, Shank, Loin

#### Goat
Curry Cut, Mince/Ground, Leg, Shoulder, Ribs

#### Prawns
King Prawns, Tiger Prawns, Shrimp, Jumbo, Cocktail

#### Eggs
Whole Eggs, Egg Whites Only, Boiled, Scrambled, Omelette

#### Paneer
Fresh, Firm, Crumbled, Cubed, Sliced

#### Tofu
Firm, Extra Firm, Silken, Smoked, Pressed

#### Soy
Chunks, Granules, Tempeh, Edamame

#### Beans
Chickpeas, Black Beans, Kidney Beans, Lentils, Navy Beans, Pinto Beans

#### Milk
Whole Milk, Skim Milk, Buttermilk, Condensed

#### Whey
Whey Protein Isolate, Whey Concentrate, Casein

---

## Database Design

### Option: Tags JSONB Column
Add a `tags` JSONB column to the `recipes` table:
```json
{
  "cuisine": "Indian / South Indian",
  "cookingMethod": "air fryer",
  "proteinCut": "breast",
  "diet": ["high protein", "low carb", "gluten free"],
  "fitnessLevel": "yes"
}
```

### Alternative: Dedicated Columns
- `cuisine TEXT` - already planned
- `cooking_method TEXT` - new column
- `protein_cut TEXT` - new column
- `tags JSONB` - for diet/health tags array

### Recommendation
Use **dedicated columns** for frequently filtered fields (cuisine, cooking_method, protein_cut) and **tags JSONB** for flexible boolean tags (diet, health). This gives:
- Fast SQL filtering on dedicated columns
- Flexible tagging without schema changes for new tags

---

## Recipe Template Impact
The Excel template already captures most of this:
- Recipe Info sheet: Cuisine, Difficulty, Spice Level, Cooking Time, High Protein, Low Carb, etc.
- Cooking Steps sheet: Cooking Method column

**New fields to add to template:**
- Protein Cut (e.g., "Breast", "Thigh") - add to Recipe Info sheet
- Primary Cooking Method (recipe-level, not step-level)

---

## Onboarding Script Impact
`scripts/onboard-recipes-v2.js` needs to:
1. Read cuisine, cooking method, protein cut from Excel
2. Build tags array from High Protein, Low Carb, etc. boolean fields
3. Insert into appropriate columns/JSONB

---

## UI/UX Design

### Filter Icon
- Dark rounded square icon with sliders (as shown in reference image)
- Positioned to the left of meal type tabs
- Badge count showing number of active filters

### Filter Panel
- Bottom sheet that slides up
- Sections for each filter category
- Chip/pill selection (multi-select within each category)
- Protein-specific section dynamically changes based on current protein page
- "Clear All" and "Apply" buttons at bottom
- Show recipe count that matches current filters

### Filter Behavior
- Filters are AND logic (cuisine=Indian AND method=Air Fryer)
- Within a category, filters are OR logic (cuisine=Indian OR Chinese)
- Active filters shown as removable chips below the tabs
- Filters reset when switching protein categories

---

## Implementation Priority
1. **Phase 1 (v1.1):** Difficulty, Spice Level, Cooking Time (already in DB)
2. **Phase 2 (v1.2):** Cuisine, Cooking Method, Diet Tags (need DB columns + template update)
3. **Phase 3 (v1.3):** Protein-Specific Cuts (need enough recipes to make it useful)

---

## Success Metric
A user should be able to find exactly the recipe they want in 3 taps or fewer:
1. Select protein (e.g., Chicken)
2. Tap filter icon
3. Select filters (e.g., Breast + Korean + Air Fryer + Easy)

---

## Dependencies
- Minimum 50+ recipes per protein category to make filtering useful
- Chef onboarding pipeline must capture all filter fields
- Database columns: cuisine, cooking_method, protein_cut, tags
- Recipe template updated with new fields
