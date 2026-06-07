# 🎯 Phase 1: Improved Image Capture (Claude Vision Backend)

**Goal:** Better guided image capture for body scans while keeping Claude Vision API for analysis

**Estimated Time:** 15-20 hours of development  
**Backend:** Claude Vision API (no changes needed)  
**Frontend:** Improved capture UX  
**Privacy:** 100% local processing for guidance (images sent to Claude Vision for analysis)

---

## Overview

**Keep:** Claude Vision API for body composition analysis (90% accurate)  
**Improve:** Image capture process (guided, better quality, auto-capture)

**Result:** Same great accuracy + better UX

---

## Current Problem

- Manual photo upload feels clunky
- Users don't know if they're positioned correctly
- Image quality varies
- Takes multiple attempts

## Solution (Phase 1)

- Real-time pose feedback
- Auto-capture when positioned well
- Lighting detection
- Better framing guidance
- Smooth UX (like MeThreeSixty)

---

## Tasks (In Order)

### Task 1: Real-Time Pose Guidance UI (2-3 hours)

**What:** Show live feedback on how user is positioned

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — enhance camera view

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, add real-time pose guidance overlay:

1. Create feedback state:
   - const [poseStatus, setPoseStatus] = useState<'not-ready' | 'almost' | 'perfect'>()
   - const [guidanceText, setGuidanceText] = useState('')
   - const [poseScore, setPoseScore] = useState(0)

2. Add visual guidance overlay showing:
   - Large circle in center (where user should stand)
   - Text hints: "Stand straight" / "Full body in frame" / "Good lighting"
   - Score indicator: 0-100% (red → yellow → green)
   - Reference lines showing proper distance/framing

3. Use existing camera view, just add overlay elements

4. Style similar to MeThreeSixty:
   - Semi-transparent background
   - Clear, bold text
   - Simple geometric guides
   - Color: red (bad) → yellow (okay) → green (perfect)

Reference the existing scanCameraOpen and camera rendering.
```

**Acceptance Criteria:**
- ✅ Guidance overlay visible in camera view
- ✅ Text updates based on pose/framing
- ✅ Score shows 0-100%
- ✅ Color coding works (red/yellow/green)

---

### Task 2: Basic Pose Detection (3-4 hours)

**What:** Simple pose quality scoring (no ML needed yet)

**Create new file:** `services/basicPoseService.ts`

**Claude Code Prompt:**
```
Create basicPoseService.ts for basic pose validation:

1. Function: scoreBodyPosition(cameraFrame, scanPose) → number (0-100)
   - Check if image has good contrast (not too dark/bright)
   - Estimate if full body visible (analyze image dimensions)
   - Check if person is centered (analyze dark areas)
   - Return simple score: 0-100

2. Function: getGuidanceMessage(score) → string
   - 0-30: "Not ready yet - adjust position"
   - 30-60: "Getting closer - move back/adjust"
   - 60-80: "Almost perfect - small adjustment"
   - 80-100: "Perfect! Ready to capture"

3. Function: checkLighting(cameraFrame) → boolean
   - Simple brightness check
   - Return true if bright enough (>50 brightness)
   - Return false if too dark

Use simple image analysis (brightness, contrast, center detection).
Don't use ML yet - just basic image properties.
```

**Acceptance Criteria:**
- ✅ Score calculation works
- ✅ Messages are helpful
- ✅ Lighting detection works
- ✅ Updates in real-time

---

### Task 3: Auto-Capture Logic (3-4 hours)

**What:** Automatically capture photo when score is high enough

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — add auto-capture trigger

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, add auto-capture logic:

1. When scanCameraOpen = true:
   - Continuously score the pose (Task 2)
   - Track score over time (last 1 second)

2. If score stays >= 80 for 1 full second:
   - Show countdown: "3... 2... 1..."
   - Auto-trigger photo capture
   - Show "Photo captured!" message
   - Move to next step (front → side)

3. If score drops below 75 during countdown:
   - Cancel countdown
   - Reset timer

4. User can still manually capture anytime:
   - Button tap always works (override auto-capture)

5. When front photo is captured:
   - Lock camera
   - Show result
   - Prompt for side photo
   - Side photo unlocks once front is good

Wire to existing captureGuidedBodyPhoto() function.
```

**Acceptance Criteria:**
- ✅ Auto-captures when score ≥ 80 for 1 second
- ✅ Countdown shows visually
- ✅ Front → side transition works
- ✅ Manual capture still works
- ✅ No crashes

---

### Task 4: Lighting Detection (2-3 hours)

**What:** Warn if lighting is too dark

**Files to modify:**
- `services/basicPoseService.ts` — already has checkLighting()
- `app/screens/FitnessProfileScreen.tsx` — display lighting status

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, add lighting indicator:

1. Call checkLighting(cameraFrame) every frame

2. Show lighting status:
   - Green indicator 🟢 if bright enough
   - Yellow indicator 🟡 if okay
   - Red indicator 🔴 if too dark
   - Text: "Good lighting" / "Adjust lighting" / "Too dark"

3. If lighting is red:
   - Show helpful message: "Move to a brighter area"
   - Allow capture but show warning

4. Styling:
   - Small indicator in top-right corner
   - Updated in real-time
   - Clear and obvious

Reference the existing camera overlay setup.
```

**Acceptance Criteria:**
- ✅ Lighting indicator shows correctly
- ✅ Updates in real-time
- ✅ Helpful messages
- ✅ Warning when too dark

---

### Task 5: Image Quality Check (2-3 hours)

**What:** Verify image is good quality before sending to Claude Vision

**Create new file:** `services/imageQualityService.ts`

**Claude Code Prompt:**
```
Create imageQualityService.ts:

1. Function: validateCapturedImage(imageUri) → object
   {
     isGood: boolean,
     issues: string[],
     confidence: 'low' | 'medium' | 'high'
   }

2. Checks:
   - Image resolution (must be > 480p)
   - Image size (not corrupted)
   - Not blurry (check edge detection)
   - Has detected body (not empty background)
   - Good contrast (not washed out)

3. If image is bad:
   - Return issues: ["Image too blurry", "Not enough contrast"]
   - Don't send to Claude Vision (save API cost)
   - Ask user to retake

4. If image is good:
   - Return confidence level
   - Ready to send to Claude Vision

Return early if critical issues found (don't waste API call).
```

**Acceptance Criteria:**
- ✅ Validates images before sending to API
- ✅ Catches blurry/bad photos
- ✅ Saves API costs (no bad images sent)
- ✅ Clear feedback to user

---

### Task 6: Improved Camera UX (2-3 hours)

**What:** Better overall camera experience

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — enhance camera view

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, improve camera UX:

1. When camera opens:
   - Show brief tutorial: "Stand in circle, full body visible"
   - Highlight the center area (where to stand)
   - Show distance reference

2. During capture:
   - Real-time score display
   - Smooth animations
   - Clear instructions
   - Encouraging messages

3. After capture:
   - Show captured photo preview
   - Show "Looks good!" or ask to retake
   - Smooth transition to next step

4. Add animations:
   - Pulse effect when pose is good
   - Smooth color transitions (red → green)
   - Countdown animation

Keep it clean and simple (like MeThreeSixty).
```

**Acceptance Criteria:**
- ✅ Smooth camera experience
- ✅ Clear instructions at each step
- ✅ Good animations
- ✅ Professional feel

---

### Task 7: Integration with Claude Vision (2-3 hours)

**What:** Wire everything together with existing Claude Vision flow

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — connect to Claude Vision

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, integrate with Claude Vision:

1. After image quality check passes:
   - Convert image to base64
   - Send to existing Claude Vision analysis function
   - Show "Analyzing body composition..." loading

2. Display results:
   - Show body fat %
   - Show measurements (waist, chest, arms, etc.)
   - Show body type assessment
   - Show suggestions

3. Save to fitness profile:
   - Store results in AsyncStorage
   - Record timestamp
   - Keep history for progress tracking

4. Error handling:
   - If Claude Vision fails: show error, allow retake
   - If network fails: show offline message
   - If image quality fails: ask to retake

Wire to existing claudeVisionService or body analysis function.
```

**Acceptance Criteria:**
- ✅ Images sent to Claude Vision after quality check
- ✅ Results display correctly
- ✅ Data saved to profile
- ✅ Error handling works

---

### Task 8: Testing & Polish (2-3 hours)

**What:** Test everything and make it feel professional

**Testing Checklist:**
```
[ ] Real-time pose guidance is smooth
[ ] Auto-capture triggers at right moment
[ ] Lighting detection is accurate
[ ] Image quality check catches bad photos
[ ] Claude Vision receives good images
[ ] Results display correctly
[ ] Front → side transition is smooth
[ ] Works on actual device (not just simulator)
[ ] Performance is good (no lag/jank)
[ ] UX feels professional (like MeThreeSixty)
[ ] Error messages are helpful
[ ] Loading states look good
```

**Claude Code Prompt:**
```
Test and polish the body scan feature:

1. Run through complete flow:
   - Open camera
   - Get pose guidance
   - Auto-capture front photo
   - Transition to side photo
   - Get results from Claude Vision
   - Save to profile

2. Look for:
   - Smooth transitions
   - No console errors
   - Good performance (>10 FPS)
   - Professional feel

3. Refine:
   - Adjust timing if auto-capture too fast/slow
   - Tweak guidance messages
   - Improve animations
   - Polish colors and styling

4. Test edge cases:
   - Bad lighting
   - User too close/far
   - Quick movements
   - Network lag

Document any tweaks made.
```

**Acceptance Criteria:**
- ✅ All tests pass
- ✅ No crashes
- ✅ Smooth performance
- ✅ Professional UX

---

## Files to Create/Modify

### Create (New Files)
- `services/basicPoseService.ts` — pose scoring
- `services/imageQualityService.ts` — image validation

### Modify (Existing Files)
- `app/screens/FitnessProfileScreen.tsx` — main integration
- `app/styles/FitnessProfileScreen.styles.ts` — new styling (if separate)

---

## Integration Flow

```
User opens body scan camera
    ↓
Real-time pose guidance shows (Task 1)
    ↓
Score calculated every frame (Task 2)
    ↓
If score ≥ 80 for 1 sec → Auto-capture (Task 3)
    ↓
Check lighting (Task 4)
    ↓
Validate image quality (Task 5)
    ↓
Send to Claude Vision API (existing code)
    ↓
Get body composition results
    ↓
Display & save to profile (Task 7)
```

---

## Success Criteria

✅ Real-time pose guidance visible  
✅ Auto-capture when score ≥ 80  
✅ Lighting detection working  
✅ Image quality check working  
✅ Claude Vision receives good images  
✅ Results display correctly  
✅ Professional UX (like MeThreeSixty)  
✅ No crashes or errors  
✅ Smooth performance  

---

## Timeline

- **Task 1:** 2-3 hours (guidance UI)
- **Task 2:** 3-4 hours (pose scoring)
- **Task 3:** 3-4 hours (auto-capture)
- **Task 4:** 2-3 hours (lighting)
- **Task 5:** 2-3 hours (quality check)
- **Task 6:** 2-3 hours (UX polish)
- **Task 7:** 2-3 hours (Claude Vision integration)
- **Task 8:** 2-3 hours (testing)

**Total: 20-30 hours**

---

## Key Differences from Previous Spec

**Before (MediaPipe):**
- ❌ Replace Claude Vision
- ❌ Local ML processing
- ❌ ~82% accuracy

**Now (Improved Capture):**
- ✅ Keep Claude Vision (90% accuracy)
- ✅ Better guided capture
- ✅ Auto-capture on good pose
- ✅ Image quality checks
- ✅ Same backend, better UX

---

## Next Steps

1. ✅ Share this spec with Claude Code
2. ✅ Start with Task 1 (guidance UI)
3. ✅ Follow tasks in order
4. ✅ Test as you go
5. ✅ Send code when ready for review

---

## Questions for Claude Code

```
"In Task 1, how do I show a circle overlay in the camera?"

"How do I calculate image brightness in Task 2?"

"How do I detect if a photo is blurry in Task 5?"

"How do I smooth the color transitions from red to green?"
```

---

**Ready to build?** 🚀

This spec improves the UX while keeping your existing Claude Vision integration. Best of both worlds!

---

Last updated: 2026-06-06
