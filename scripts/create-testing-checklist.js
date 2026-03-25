#!/usr/bin/env node
/**
 * Create the SpiceStrong Recipe Testing Checklist Excel file.
 * Run: node scripts/create-testing-checklist.js
 */

const ExcelJS = require('exceljs');
const path = require('path');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SpiceStrong';

  // Colors
  const DARK_BG = 'FF1A0A00';
  const ORANGE = 'FFE85D26';
  const LIGHT_BG = 'FFFFF8F0';
  const GREEN_BG = 'FFC6EFCE';
  const RED_BG = 'FFFFC7CE';
  const YELLOW_BG = 'FFFFEB9C';

  const headerFont = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const sectionFont = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const normalFont = { name: 'Arial', size: 10 };
  const boldFont = { name: 'Arial', bold: true, size: 10 };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  };

  // ═══════════════════════════════════════
  // SHEET 1: Recipe QA Checklist
  // ═══════════════════════════════════════
  const ws = wb.addWorksheet('Recipe QA Checklist');
  ws.columns = [
    { width: 55 },
    { width: 12 },
    { width: 30 },
  ];

  // Title
  ws.mergeCells('A1:C1');
  const title = ws.getCell('A1');
  title.value = 'SpiceStrong Recipe QA Checklist';
  title.font = { name: 'Arial', bold: true, size: 16, color: { argb: 'FFE85D26' } };
  title.alignment = { horizontal: 'center' };

  // Instructions
  ws.mergeCells('A2:C2');
  const instr = ws.getCell('A2');
  instr.value = 'Fill in recipe details, then mark each item as Pass / Fail / NA. Add notes for failures.';
  instr.font = { name: 'Arial', italic: true, size: 10, color: { argb: 'FF666666' } };
  instr.alignment = { horizontal: 'center' };

  // Recipe info
  const infoLabels = ['Recipe Name:', 'Protein Type:', 'Tester Name:', 'Test Date:'];
  infoLabels.forEach((label, i) => {
    const r = 4 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = boldFont;
    ['A', 'B', 'C'].forEach(c => { ws.getCell(`${c}${r}`).border = thinBorder; });
  });

  // Column headers
  [['A', 'Test Item'], ['B', 'Result'], ['C', 'Notes']].forEach(([c, h]) => {
    const cell = ws.getCell(`${c}9`);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BG } };
    cell.alignment = { horizontal: 'center' };
    cell.border = thinBorder;
  });

  // Test sections
  const sections = [
    ['RECIPE CARD (List View)', [
      'Recipe name is clear and includes protein name',
      'Hero image matches the finished dish',
      'Protein badge shows correct grams (e.g. 38g)',
      'Fat badge shows correct grams (e.g. 5g)',
      'Carbs badge shows correct grams (e.g. 10g)',
      'Calorie count is realistic for the ingredients',
      'Cook time badge is accurate',
      'Difficulty badge matches actual complexity',
      'Cooked count displays correctly',
      'Rating/review stars display correctly',
    ]],
    ['RECIPE DESCRIPTION', [
      'Description is 1-2 sentences and appetizing',
      'Description mentions protein content or cuisine origin',
      'Description accurately matches what the recipe is',
    ]],
    ['INGREDIENTS', [
      'Total ingredient count is 15 or fewer',
      'Every ingredient has precise quantity (no "to taste", "some", "optional")',
      '4-6 serving quantities are exactly 2x the 2-3 serving quantities',
      'No duplicate ingredients in the list',
      'All ingredients are actually used in the cooking steps',
      'Ingredient quantities are realistic (not too much/too little)',
    ]],
    ['COOKING STEPS', [
      'Step count is between 4-8',
      'Steps are in logical cooking order (prep > cook > finish)',
      'Each step has clear, actionable instructions',
      'Each step lists which ingredients are used',
      'Timer values are realistic for each step',
      'Visual doneness cues included ("until golden brown", etc.)',
      'No trivial steps ("serve on plate", "enjoy")',
    ]],
    ['STEP IMAGES', [
      'Each step image matches the step instruction',
      'Images show correct cooking stage (not too early/late)',
      'Images are clear and not blurry',
      'Ingredient quantities in images look correct',
    ]],
    ['NUTRITION', [
      'Protein per serving meets meal type floor (30g lunch, 15g breakfast, 12g snack)',
      'Protein density >= 6.4g per 100 calories',
      'Calories within ceiling (700 lunch, 500 breakfast, 350 snack)',
      'Macros are realistic for the ingredients listed',
      'Serving size is clearly stated (2-3 or 4-6)',
    ]],
    ['CHEF TIP', [
      'Chef tip is specific to this dish (not generic)',
      'Chef tip provides actionable cooking advice',
      'Chef tip is not just "season to taste" or "enjoy!"',
    ]],
    ['SPICE & AUTHENTICITY', [
      'Spice level label matches actual spices used',
      'Cuisine type is accurate for the dish',
      'Cooking method label matches actual technique',
      'Spice ratios are authentic for the claimed cuisine',
    ]],
    ['OVERALL', [
      'Would you cook this recipe? (Yes/No in Result)',
      'Overall quality score 1-10 (put number in Result)',
      'Additional notes/comments (use Notes column)',
    ]],
  ];

  let row = 10;
  for (const [sectionName, items] of sections) {
    // Section header
    ws.mergeCells(`A${row}:C${row}`);
    const sCell = ws.getCell(`A${row}`);
    sCell.value = sectionName;
    sCell.font = sectionFont;
    sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    ['A', 'B', 'C'].forEach(c => { ws.getCell(`${c}${row}`).border = thinBorder; });
    row++;

    for (const item of items) {
      ws.getCell(`A${row}`).value = item;
      ws.getCell(`A${row}`).font = normalFont;
      const bg = row % 2 === 0 ? LIGHT_BG : 'FFFFFFFF';
      ['A', 'B', 'C'].forEach(c => {
        const cell = ws.getCell(`${c}${row}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      ws.getCell(`B${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`B${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Pass,Fail,NA"'],
      };
      row++;
    }
  }

  // Freeze panes
  ws.views = [{ state: 'frozen', ySplit: 9 }];

  // ═══════════════════════════════════════
  // SHEET 2: Summary Dashboard
  // ═══════════════════════════════════════
  const ws2 = wb.addWorksheet('Summary Dashboard');
  const dashWidths = [40, 14, 14, 12, 10, 12, 14, 10, 10, 12, 12, 14, 10, 10, 14, 30, 14];
  dashWidths.forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

  // Title
  ws2.mergeCells('A1:Q1');
  const dTitle = ws2.getCell('A1');
  dTitle.value = 'SpiceStrong Recipe QA - Summary Dashboard';
  dTitle.font = { name: 'Arial', bold: true, size: 16, color: { argb: 'FFE85D26' } };
  dTitle.alignment = { horizontal: 'center' };

  // Headers
  const headers = [
    'Recipe Name', 'Protein', 'Tester', 'Date',
    'Card\n(/10)', 'Desc\n(/3)', 'Ingred\n(/6)', 'Steps\n(/7)',
    'Images\n(/4)', 'Nutri\n(/5)', 'Tip\n(/3)', 'Auth\n(/4)',
    'Total\n(/45)', 'Pass?', 'Cook\nAgain?', 'Priority Issues', 'Status'
  ];
  headers.forEach((h, i) => {
    const cell = ws2.getCell(3, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });
  ws2.getRow(3).height = 35;

  // Sample row
  const sample = ['SpiceStrong Pepper Chicken', 'Chicken', 'Tester 1', '2026-03-24',
    9, 3, 5, 7, 4, 4, 3, 4, null, null, 'Yes', 'Vague salt quantity', 'In Progress'];
  sample.forEach((val, i) => {
    const cell = ws2.getCell(4, i + 1);
    cell.value = val;
    cell.font = normalFont;
    cell.border = thinBorder;
    cell.alignment = { horizontal: i >= 4 ? 'center' : 'left', vertical: 'middle' };
  });

  // Formulas for sample row
  ws2.getCell('M4').value = { formula: 'SUM(E4:L4)' };
  ws2.getCell('M4').font = boldFont;
  ws2.getCell('M4').alignment = { horizontal: 'center' };
  ws2.getCell('N4').value = { formula: 'IF(M4>=35,"Pass","Fail")' };
  ws2.getCell('N4').font = boldFont;
  ws2.getCell('N4').alignment = { horizontal: 'center' };

  // Add formulas + validations for 50 rows
  for (let r = 5; r <= 54; r++) {
    ws2.getCell(`M${r}`).value = { formula: `SUM(E${r}:L${r})` };
    ws2.getCell(`N${r}`).value = { formula: `IF(M${r}>=35,"Pass","Fail")` };
    for (let c = 1; c <= 17; c++) {
      ws2.getCell(r, c).border = thinBorder;
      ws2.getCell(r, c).font = normalFont;
    }
  }

  // Data validations
  for (let r = 4; r <= 54; r++) {
    ws2.getCell(`O${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
    ws2.getCell(`Q${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Not Started,In Progress,Passed,Failed,Fixed"'] };
  }

  // Conditional formatting
  ws2.addConditionalFormatting({
    ref: 'N4:N54',
    rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Pass"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_BG } } }, priority: 1 },
      { type: 'cellIs', operator: 'equal', formulae: ['"Fail"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_BG } } }, priority: 2 },
    ],
  });
  ws2.addConditionalFormatting({
    ref: 'Q4:Q54',
    rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Passed"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN_BG } } }, priority: 3 },
      { type: 'cellIs', operator: 'equal', formulae: ['"Failed"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED_BG } } }, priority: 4 },
      { type: 'cellIs', operator: 'equal', formulae: ['"In Progress"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: YELLOW_BG } } }, priority: 5 },
    ],
  });

  ws2.views = [{ state: 'frozen', ySplit: 3 }];

  // Save
  const output = path.join(__dirname, '..', 'Docs', 'Recipe_Testing_Checklist.xlsx');
  await wb.xlsx.writeFile(output);
  console.log(`Created: ${output}`);
}

main().catch(err => { console.error(err); process.exit(1); });
