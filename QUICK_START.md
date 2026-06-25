# Quick Start — Premium Tracker in 5 Minutes

**Don't read everything. Just do this.**

---

## 🚀 5-Minute Setup

### 1. Copy 3 Files
Copy these files from wherever to your `SpiceStrong/` folder:

```
components/MacroProgressBar.tsx
components/DailySummaryCard.tsx
styles/premiumTheme.ts
```

---

### 2. Update MealPlanScreen.tsx

Add these imports at the top:
```typescript
import MacroProgressBar from '../../components/MacroProgressBar';
import DailySummaryCard from '../../components/DailySummaryCard';
import { COLORS } from '../../styles/premiumTheme';
```

---

### 3. Find & Replace

**Find this** (around line 1520):
```typescript
{/* Macro progress rings */}
<View style={styles.ringsPanel}>
  <View style={styles.ringsRow}>
    <MacroRing label="Calories" color="#F5A524" ... />
    <MacroRing label="Protein" color="#E8671A" ... />
    // ... more rings
  </View>
</View>
```

**Replace with this:**
```typescript
{/* Premium Daily Summary */}
<DailySummaryCard
  consumed={{
    calories: totals.calories,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: totals.fatG,
  }}
  targets={{
    calories: macroTargets?.calories ?? 2000,
    proteinG: macroTargets?.proteinG ?? 120,
    carbsG: macroTargets?.carbsG ?? 150,
    fatG: macroTargets?.fatG ?? 80,
  }}
/>
```

---

### 4. Test
```bash
expo start -c
# Then run on iOS or Android
```

---

## ✨ Done!

Your tracker now looks 10x more premium. 🎉

---

## 📖 Need More Info?

Read these files in order:

1. **PREMIUM_TRACKER_README.md** — Overview (5 min)
2. **PREMIUM_TRACKER_IMPLEMENTATION.md** — Detailed guide (10 min)
3. **PREMIUM_DESIGN_MOCKUP.md** — Visual reference (10 min)

---

## 🎨 Want to Customize Colors?

Edit `styles/premiumTheme.ts`:

```typescript
export const COLORS = {
  background: '#0F0E0C',     // Dark background
  accent: '#E8A87C',         // Gold accent (change this for your brand)
  calories: '#F5A524',       // Orange
  protein: '#EC4899',        // Pink
  carbs: '#3B82F6',          // Blue
  fat: '#10B981',            // Teal
};
```

---

## 🚨 Troubleshooting

**Nothing changed?**
- Clear cache: `expo start -c`
- Check imports are correct
- Verify file paths

**Colors look wrong?**
- Edit `premiumTheme.ts` (color palette)
- Or use colors directly in components

**Components not found?**
- Copy files to correct folder
- Check import paths match your structure

---

## 🚀 Next Steps

### Optional Enhancements:

**Phase 2 (2-3 hours):** Add animations & gestures
- See: `PREMIUM_TRACKER_ADVANCED.md` → Tier 2

**Phase 3 (4-5 hours):** Add AI insights & trends
- See: `PREMIUM_TRACKER_ADVANCED.md` → Tier 3

**Phase 4 (6+ hours):** Add achievements & social
- See: `PREMIUM_TRACKER_ADVANCED.md` → Tier 4

---

That's it! Ship it! 🚀
