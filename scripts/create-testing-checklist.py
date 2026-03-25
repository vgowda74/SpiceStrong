"""
Create the SpiceStrong Recipe Testing Checklist Excel file.
Run: python scripts/create-testing-checklist.py
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule

wb = Workbook()

# Colors & Styles
HEADER_FILL = PatternFill('solid', fgColor='1A0A00')
SECTION_FILL = PatternFill('solid', fgColor='E85D26')
LIGHT_BG = PatternFill('solid', fgColor='FFF8F0')
WHITE_BG = PatternFill('solid', fgColor='FFFFFF')
GREEN_FILL = PatternFill('solid', fgColor='C6EFCE')
RED_FILL = PatternFill('solid', fgColor='FFC7CE')
YELLOW_FILL = PatternFill('solid', fgColor='FFEB9C')
HEADER_FONT = Font(name='Arial', bold=True, color='FFFFFF', size=11)
SECTION_FONT = Font(name='Arial', bold=True, color='FFFFFF', size=11)
NORMAL_FONT = Font(name='Arial', size=10)
BOLD_FONT = Font(name='Arial', bold=True, size=10)
THIN_BORDER = Border(
    left=Side(style='thin', color='D0D0D0'),
    right=Side(style='thin', color='D0D0D0'),
    top=Side(style='thin', color='D0D0D0'),
    bottom=Side(style='thin', color='D0D0D0')
)

# ═══════════════════════════════════════
# SHEET 1: Recipe QA Checklist
# ═══════════════════════════════════════
ws = wb.active
ws.title = 'Recipe QA Checklist'

ws.column_dimensions['A'].width = 55
ws.column_dimensions['B'].width = 12
ws.column_dimensions['C'].width = 30

# Title
ws.merge_cells('A1:C1')
ws['A1'] = 'SpiceStrong Recipe QA Checklist'
ws['A1'].font = Font(name='Arial', bold=True, size=16, color='E85D26')
ws['A1'].alignment = Alignment(horizontal='center')

# Instructions
ws.merge_cells('A2:C2')
ws['A2'] = 'Fill in recipe details, then mark each item as Pass / Fail / NA. Add notes for failures.'
ws['A2'].font = Font(name='Arial', italic=True, size=10, color='666666')
ws['A2'].alignment = Alignment(horizontal='center')

# Recipe info rows
info = [('Recipe Name:', 4), ('Protein Type:', 5), ('Tester Name:', 6), ('Test Date:', 7)]
for label, r in info:
    ws[f'A{r}'] = label
    ws[f'A{r}'].font = BOLD_FONT
    for c in ['A', 'B', 'C']:
        ws[f'{c}{r}'].border = THIN_BORDER

# Column headers
for c, h in [('A', 'Test Item'), ('B', 'Result'), ('C', 'Notes')]:
    ws[f'{c}9'] = h
    ws[f'{c}9'].font = HEADER_FONT
    ws[f'{c}9'].fill = HEADER_FILL
    ws[f'{c}9'].alignment = Alignment(horizontal='center')
    ws[f'{c}9'].border = THIN_BORDER

# Pass/Fail validation
pf = DataValidation(type='list', formula1='"Pass,Fail,NA"', allow_blank=True)
ws.add_data_validation(pf)

# Test sections
sections = [
    ('RECIPE CARD (List View)', [
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
    ]),
    ('RECIPE DESCRIPTION', [
        'Description is 1-2 sentences and appetizing',
        'Description mentions protein content or cuisine origin',
        'Description accurately matches what the recipe is',
    ]),
    ('INGREDIENTS', [
        'Total ingredient count is 15 or fewer',
        'Every ingredient has precise quantity (no "to taste", "some", "optional")',
        '4-6 serving quantities are exactly 2x the 2-3 serving quantities',
        'No duplicate ingredients in the list',
        'All ingredients are actually used in the cooking steps',
        'Ingredient quantities are realistic (not too much/too little)',
    ]),
    ('COOKING STEPS', [
        'Step count is between 4-8',
        'Steps are in logical cooking order (prep > cook > finish)',
        'Each step has clear, actionable instructions',
        'Each step lists which ingredients are used',
        'Timer values are realistic for each step',
        'Visual doneness cues included ("until golden brown", etc.)',
        'No trivial steps ("serve on plate", "enjoy")',
    ]),
    ('STEP IMAGES', [
        'Each step image matches the step instruction',
        'Images show correct cooking stage (not too early/late)',
        'Images are clear and not blurry',
        'Ingredient quantities in images look correct',
    ]),
    ('NUTRITION', [
        'Protein per serving meets meal type floor (30g lunch, 15g breakfast, 12g snack)',
        'Protein density >= 6.4g per 100 calories',
        'Calories within ceiling (700 lunch, 500 breakfast, 350 snack)',
        'Macros are realistic for the ingredients listed',
        'Serving size is clearly stated (2-3 or 4-6)',
    ]),
    ('CHEF TIP', [
        'Chef tip is specific to this dish (not generic)',
        'Chef tip provides actionable cooking advice',
        'Chef tip is not just "season to taste" or "enjoy!"',
    ]),
    ('SPICE & AUTHENTICITY', [
        'Spice level label matches actual spices used',
        'Cuisine type is accurate for the dish',
        'Cooking method label matches actual technique',
        'Spice ratios are authentic for the claimed cuisine',
    ]),
    ('OVERALL', [
        'Would you cook this recipe? (Yes/No in Result)',
        'Overall quality score 1-10 (put number in Result)',
        'Additional notes/comments (use Notes column)',
    ]),
]

row = 10
for section_name, items in sections:
    ws.merge_cells(f'A{row}:C{row}')
    ws[f'A{row}'] = section_name
    ws[f'A{row}'].font = SECTION_FONT
    ws[f'A{row}'].fill = SECTION_FILL
    for c in ['A', 'B', 'C']:
        ws[f'{c}{row}'].border = THIN_BORDER
    row += 1
    for item in items:
        ws[f'A{row}'] = item
        ws[f'A{row}'].font = NORMAL_FONT
        bg = LIGHT_BG if row % 2 == 0 else WHITE_BG
        for c in ['A', 'B', 'C']:
            ws[f'{c}{row}'].fill = bg
            ws[f'{c}{row}'].border = THIN_BORDER
            ws[f'{c}{row}'].alignment = Alignment(vertical='center', wrap_text=True)
        ws[f'B{row}'].alignment = Alignment(horizontal='center', vertical='center')
        pf.add(ws[f'B{row}'])
        row += 1

ws.freeze_panes = 'A10'

# ═══════════════════════════════════════
# SHEET 2: Summary Dashboard
# ═══════════════════════════════════════
ws2 = wb.create_sheet('Summary Dashboard')

widths = {'A': 40, 'B': 14, 'C': 14, 'D': 12, 'E': 10, 'F': 12, 'G': 14,
          'H': 10, 'I': 10, 'J': 12, 'K': 12, 'L': 14, 'M': 10, 'N': 10,
          'O': 14, 'P': 30, 'Q': 14}
for col, w in widths.items():
    ws2.column_dimensions[col].width = w

ws2.merge_cells('A1:Q1')
ws2['A1'] = 'SpiceStrong Recipe QA - Summary Dashboard'
ws2['A1'].font = Font(name='Arial', bold=True, size=16, color='E85D26')
ws2['A1'].alignment = Alignment(horizontal='center')

headers = [
    'Recipe Name', 'Protein', 'Tester', 'Date',
    'Card\n(/10)', 'Desc\n(/3)', 'Ingred\n(/6)', 'Steps\n(/7)',
    'Images\n(/4)', 'Nutri\n(/5)', 'Tip\n(/3)', 'Auth\n(/4)',
    'Total\n(/45)', 'Pass?', 'Cook\nAgain?', 'Priority Issues', 'Status'
]
for i, h in enumerate(headers, 1):
    cell = ws2.cell(row=3, column=i, value=h)
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    cell.border = THIN_BORDER
ws2.row_dimensions[3].height = 35

# Validations
status_val = DataValidation(type='list', formula1='"Not Started,In Progress,Passed,Failed,Fixed"', allow_blank=True)
yn_val = DataValidation(type='list', formula1='"Yes,No"', allow_blank=True)
pf_val = DataValidation(type='list', formula1='"Pass,Fail"', allow_blank=True)
ws2.add_data_validation(status_val)
ws2.add_data_validation(yn_val)
ws2.add_data_validation(pf_val)

# Sample row
sample = ['SpiceStrong Pepper Chicken', 'Chicken', 'Tester 1', '2026-03-24',
          9, 3, 5, 7, 4, 4, 3, 4, None, None, 'Yes', 'Vague salt quantity', 'In Progress']
for i, val in enumerate(sample, 1):
    cell = ws2.cell(row=4, column=i, value=val)
    cell.font = NORMAL_FONT
    cell.border = THIN_BORDER
    cell.alignment = Alignment(horizontal='center' if i >= 5 else 'left', vertical='center')

ws2['M4'] = '=SUM(E4:L4)'
ws2['M4'].font = BOLD_FONT
ws2['M4'].alignment = Alignment(horizontal='center')
ws2['N4'] = '=IF(M4>=35,"Pass","Fail")'
ws2['N4'].font = BOLD_FONT
ws2['N4'].alignment = Alignment(horizontal='center')

# Add formulas + validations for 50 rows
for r in range(4, 55):
    status_val.add(ws2.cell(row=r, column=17))
    yn_val.add(ws2.cell(row=r, column=15))
    pf_val.add(ws2.cell(row=r, column=14))
    if r > 4:
        ws2.cell(row=r, column=13, value=f'=SUM(E{r}:L{r})')
        ws2.cell(row=r, column=14, value=f'=IF(M{r}>=35,"Pass","Fail")')
        for c in range(1, 18):
            ws2.cell(row=r, column=c).border = THIN_BORDER
            ws2.cell(row=r, column=c).font = NORMAL_FONT

# Conditional formatting
ws2.conditional_formatting.add('N4:N54', CellIsRule(operator='equal', formula=['"Pass"'], fill=GREEN_FILL))
ws2.conditional_formatting.add('N4:N54', CellIsRule(operator='equal', formula=['"Fail"'], fill=RED_FILL))
ws2.conditional_formatting.add('Q4:Q54', CellIsRule(operator='equal', formula=['"Passed"'], fill=GREEN_FILL))
ws2.conditional_formatting.add('Q4:Q54', CellIsRule(operator='equal', formula=['"Failed"'], fill=RED_FILL))
ws2.conditional_formatting.add('Q4:Q54', CellIsRule(operator='equal', formula=['"In Progress"'], fill=YELLOW_FILL))

ws2.freeze_panes = 'A4'

output = 'C:/Users/v_gow/SpiceStrong/Docs/Recipe_Testing_Checklist.xlsx'
wb.save(output)
print(f'Created: {output}')
