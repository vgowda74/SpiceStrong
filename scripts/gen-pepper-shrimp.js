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
  'step_3_image', 'step_4_image',
];

const recipe = {
  id: 'curated-prawns-pepper-shrimp',
  name: 'High-Protein Pepper Shrimp',
  protein_id: 'prawns',
  protein_name: 'Prawns',
  protein_emoji: '🦐',
  description: 'A quick and flavorful shrimp dish made with freshly ground black pepper, garlic, onions, and simple spices. This recipe delivers bold pepper flavor while keeping the dish lean, high in protein, and perfect for a healthy meal.',
  chef_tip: '30g protein | 220 kcal | 15 min cook. Shrimp cooks quickly — avoid overcooking for the best texture.',
  meal_type: 'lunch_dinner',
  time_minutes: 15,
  difficulty: 'Easy',
  protein_per_100g: 24,
  spice_level: 'medium',
  cuisine: 'indian',
  gradient_start: '#5D1E0F',
  gradient_end: '#C0392B',
  ingredients_small: JSON.stringify([
    { name: 'Raw Shrimp (peeled & deveined)', quantity: '400 g' },
    { name: 'Onion (sliced)', quantity: '1 Medium' },
    { name: 'Green Chili (optional)', quantity: '1' },
    { name: 'Garlic (finely chopped)', quantity: '4 cloves' },
    { name: 'Fresh Ginger (finely chopped)', quantity: '1 tsp' },
    { name: 'Freshly Ground Black Pepper', quantity: '1.5 tsp' },
    { name: 'Turmeric Powder', quantity: '1/4 tsp' },
    { name: 'Cumin Powder', quantity: '1/2 tsp' },
    { name: 'Lemon Juice', quantity: '1 tbsp' },
    { name: 'Cooking Oil (Olive/Avocado)', quantity: '1 tbsp' },
    { name: 'Salt', quantity: '3/4 tsp' },
    { name: 'Fresh Cilantro (garnish)', quantity: '2 tbsp' },
  ]),
  ingredients_large: JSON.stringify([
    { name: 'Raw Shrimp (peeled & deveined)', quantity: '800 g' },
    { name: 'Onion (sliced)', quantity: '2 Medium' },
    { name: 'Green Chili (optional)', quantity: '2' },
    { name: 'Garlic (finely chopped)', quantity: '8 cloves' },
    { name: 'Fresh Ginger (finely chopped)', quantity: '2 tsp' },
    { name: 'Freshly Ground Black Pepper', quantity: '3 tsp' },
    { name: 'Turmeric Powder', quantity: '1/2 tsp' },
    { name: 'Cumin Powder', quantity: '1 tsp' },
    { name: 'Lemon Juice', quantity: '2 tbsp' },
    { name: 'Cooking Oil (Olive/Avocado)', quantity: '2 tbsp' },
    { name: 'Salt', quantity: '1.5 tsp' },
    { name: 'Fresh Cilantro (garnish)', quantity: '4 tbsp' },
  ]),
  steps: JSON.stringify([
    { title: 'Prepare the Shrimp', description: 'Rinse shrimp and pat them dry. Season lightly with salt, turmeric, and half of the black pepper.', emoji: '🍤', tip: 'Pat shrimp completely dry for better searing and flavor.' },
    { title: 'Cook Aromatics', description: 'Heat oil in a pan. Add garlic, ginger, green chili, and sliced onions. Saute until onions soften and turn slightly golden.', emoji: '🧄', timerMinutes: 5, tip: 'Low-medium heat prevents garlic from burning.' },
    { title: 'Cook the Shrimp', description: 'Add shrimp to the pan and cook until they turn pink and slightly firm.', emoji: '🍤', timerMinutes: 4, tip: 'Shrimp cooks quickly — avoid overcooking or they become rubbery.' },
    { title: 'Add Pepper Flavor', description: 'Add remaining black pepper and cumin powder. Toss everything well so shrimp are coated with the spices.', emoji: '🌶️', timerMinutes: 1, tip: 'Adding pepper at the end preserves its bold aroma.' },
    { title: 'Finish the Dish', description: 'Add lemon juice and garnish with fresh cilantro. Serve immediately.', emoji: '🌿', tip: 'Fresh lemon juice at the end brightens the entire dish.' },
  ]),
  calories: 220,
  proteinG: 30,
  fatG: 8,
  carbsG: 6,
  fiberG: 1,
  sugarG: 2,
  sodiumMg: 480,
  cholesterolMg: 170,
  saturatedFatG: 1,
  ironMg: 2,
  calciumMg: 80,
  image_filename: '',
  step_0_image: '',
  step_1_image: '',
  step_2_image: '',
  step_3_image: '',
  step_4_image: '',
};

const data = [
  headers,
  headers.map(h => (recipe[h] !== undefined ? recipe[h] : '')),
];

const ws = XLSX.utils.aoa_to_sheet(data);

ws['!cols'] = [
  { wch: 38 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 6 },
  { wch: 50 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  { wch: 60 }, { wch: 60 }, { wch: 80 },
  { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
  { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
  { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 24 },
  { wch: 24 }, { wch: 24 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Recipes');

const output = path.resolve(__dirname, '..', 'recipes', 'input', 'pepper_shrimp.xlsx');
XLSX.writeFile(wb, output);
console.log('Generated:', output);
