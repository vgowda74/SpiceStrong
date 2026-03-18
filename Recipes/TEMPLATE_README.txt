SpiceStrong Recipe Onboarding - Excel Template
================================================

Place your .xlsx files in: recipes/input/
Place matching images in:  recipes/input/images/

Run: node scripts/onboard-recipes.js

Excel Column Reference (Row 1 = Header)
========================================

REQUIRED:
  id                  - Unique recipe ID (e.g. "curated-chicken-butter-chicken")
  name                - Recipe display name (e.g. "Butter Chicken")
  protein_id          - Must match: chicken, fish, lamb, goat, pork, beef, prawns, eggs, paneer, tofu, soy, beans, milk, whey
  meal_type           - One of: breakfast, lunch_dinner, snack_dessert
  ingredients_small   - JSON string for 2-3 servings: [{"name":"Chicken","quantity":"500g"}, ...]
  ingredients_large   - JSON string for 4-6 servings: [{"name":"Chicken","quantity":"1 kg"}, ...]
  steps               - JSON string: [{"title":"Step Name","description":"Do this...","emoji":"🍳","timerMinutes":5,"tip":"Pro tip"}, ...]

OPTIONAL:
  protein_name        - Display name (auto-filled from protein_id if empty)
  protein_emoji       - Emoji (auto-filled from protein_id if empty)
  description         - Recipe description
  chef_tip            - Chef tip text
  time_minutes        - Total cook time in minutes (number)
  difficulty          - One of: Easy, Medium, Hard
  protein_per_100g    - Protein per 100g (number)
  spice_level         - e.g. mild, medium, hot, extra-hot
  cuisine             - e.g. indian, thai, chinese, mexican, american
  gradient_start      - Hex color for gradient start (e.g. "#5D1E0F")
  gradient_end        - Hex color for gradient end (e.g. "#C0392B")

NUTRITION (all optional, numbers):
  calories, proteinG, fatG, carbsG, fiberG, sugarG, sodiumMg,
  cholesterolMg, saturatedFatG, ironMg, calciumMg

IMAGE:
  image_filename      - Filename in recipes/input/images/ (e.g. "butter-chicken.jpg")

After processing:
  - Excel files are renamed to filename_onboarded.xlsx
  - Images are renamed to imagename_onboarded.jpg
  - Already-onboarded files are skipped on next run
