const path = require('path');
const XLSX = require('xlsx');

const headers = [
  'id', 'name', 'protein_id', 'protein_name', 'protein_emoji',
  'description', 'chef_tip', 'meal_type', 'time_minutes', 'difficulty',
  'protein_per_100g', 'spice_level', 'cuisine', 'gradient_start', 'gradient_end',
  'ingredients_small', 'ingredients_large', 'steps',
  'calories', 'proteinG', 'fatG', 'carbsG', 'fiberG', 'sugarG', 'sodiumMg',
  'cholesterolMg', 'saturatedFatG', 'ironMg', 'calciumMg',
  'image_filename', 'step_0_image', 'step_1_image', 'step_2_image',
  'step_3_image', 'step_4_image', 'step_5_image',
];

const sampleRow = {
  id: 'curated-chicken-butter-chicken',
  name: 'Butter Chicken',
  protein_id: 'chicken',
  protein_name: 'Chicken',
  protein_emoji: '🍗',
  description: 'A classic creamy butter chicken made with yogurt-marinated chicken in a rich tomato-based sauce. High in protein, lower in fat than traditional recipes.',
  chef_tip: '38g protein | 320 kcal | 35 min cook. Marinating chicken in yogurt tenderizes it and adds protein without extra fat.',
  meal_type: 'lunch_dinner',
  time_minutes: 35,
  difficulty: 'Medium',
  protein_per_100g: 31,
  spice_level: 'medium',
  cuisine: 'indian',
  gradient_start: '#5D1E0F',
  gradient_end: '#C0392B',
  ingredients_small: JSON.stringify([
    { name: 'Chicken Breast (cubed)', quantity: '500 g' },
    { name: 'Greek Yogurt', quantity: '1/2 cup' },
    { name: 'Onion (finely chopped)', quantity: '1 Medium' },
    { name: 'Tomato Puree', quantity: '1 cup' },
    { name: 'Ginger-Garlic Paste', quantity: '1 tbsp' },
    { name: 'Butter', quantity: '1 tbsp' },
    { name: 'Kashmiri Chili Powder', quantity: '1 tsp' },
    { name: 'Garam Masala', quantity: '1 tsp' },
    { name: 'Turmeric Powder', quantity: '1/4 tsp' },
    { name: 'Salt', quantity: 'To taste' },
    { name: 'Fresh Cream (low-fat)', quantity: '2 tbsp' },
  ]),
  ingredients_large: JSON.stringify([
    { name: 'Chicken Breast (cubed)', quantity: '1 kg' },
    { name: 'Greek Yogurt', quantity: '1 cup' },
    { name: 'Onion (finely chopped)', quantity: '2 Medium' },
    { name: 'Tomato Puree', quantity: '2 cups' },
    { name: 'Ginger-Garlic Paste', quantity: '2 tbsp' },
    { name: 'Butter', quantity: '2 tbsp' },
    { name: 'Kashmiri Chili Powder', quantity: '2 tsp' },
    { name: 'Garam Masala', quantity: '2 tsp' },
    { name: 'Turmeric Powder', quantity: '1/2 tsp' },
    { name: 'Salt', quantity: 'To taste' },
    { name: 'Fresh Cream (low-fat)', quantity: '4 tbsp' },
  ]),
  steps: JSON.stringify([
    { title: 'Marinate Chicken', description: 'Mix chicken with yogurt, turmeric, chili powder, and salt. Refrigerate for 30 minutes.', emoji: '🍗', timerMinutes: 30, tip: 'Overnight marination gives the best flavor and tenderness.' },
    { title: 'Cook Onion Base', description: 'Heat butter in a pan. Saute onions until golden brown. Add ginger-garlic paste and cook for 1 minute.', emoji: '🧅', timerMinutes: 5, tip: 'Golden brown onions give the sauce its rich color.' },
    { title: 'Add Tomato Sauce', description: 'Add tomato puree, chili powder, and garam masala. Cook until oil separates from the sauce.', emoji: '🍅', timerMinutes: 8, tip: 'Cook until the sauce thickens and oil appears on the sides.' },
    { title: 'Cook Chicken', description: 'Add marinated chicken pieces. Cook on medium heat until chicken is fully cooked through.', emoji: '🍳', timerMinutes: 12, tip: 'Do not overcook - chicken breast dries out quickly.' },
    { title: 'Finish with Cream', description: 'Lower heat, stir in fresh cream. Simmer for 2 minutes. Garnish with fresh cilantro.', emoji: '🥣', timerMinutes: 2, tip: 'Add cream off the heat to prevent curdling.' },
  ]),
  calories: 320,
  proteinG: 38,
  fatG: 12,
  carbsG: 10,
  fiberG: 2,
  sugarG: 4,
  sodiumMg: 580,
  cholesterolMg: 95,
  saturatedFatG: 5,
  ironMg: 3,
  calciumMg: 60,
  image_filename: 'butter-chicken.jpg',
  step_0_image: 'butter-chicken-step0.jpg',
  step_1_image: 'butter-chicken-step1.jpg',
  step_2_image: 'butter-chicken-step2.jpg',
  step_3_image: 'butter-chicken-step3.jpg',
  step_4_image: 'butter-chicken-step4.jpg',
  step_5_image: '',
};

const data = [
  headers,
  headers.map(h => (sampleRow[h] !== undefined ? sampleRow[h] : '')),
];

const ws = XLSX.utils.aoa_to_sheet(data);

ws['!cols'] = [
  { wch: 38 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 6 },
  { wch: 50 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  { wch: 60 }, { wch: 60 }, { wch: 80 },
  { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
  { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
  { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 24 },
  { wch: 24 }, { wch: 24 }, { wch: 24 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Recipes');

const output = path.resolve(__dirname, '..', 'recipes', 'input', 'recipe_template.xlsx');
XLSX.writeFile(wb, output);
console.log('Template saved to', output);
