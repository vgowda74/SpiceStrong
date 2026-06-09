# 🎯 Phase 1: Outline-Guided Body Scan Capture

**Goal:** Guide users to stand in a clear outline, hold pose, auto-capture when stable, retake if movement detected

**Estimated Time:** 15-20 hours  
**Approach:** Visual outline guidance + movement detection + auto-capture  
**Backend:** Keep Claude Vision API

---

## Overview

Instead of generic pose guidance, show:
1. **Clear body outline** (silhouette) on camera
2. **User positions themselves** into the outline
3. App confirms **"Hold still"**
4. Auto-captures when user is **stable for 2 seconds**
5. If movement detected during capture → **retake**
6. Smooth transition to side pose
7. Repeat for side photo

**Result:** Professional, guided experience like Zing Coach

---

## How It Works (User Flow)

```
1. Open Camera
   ↓
2. See FRONT outline on screen
   ↓
3. Position body in outline
   ↓
4. App detects alignment → "Perfect! Hold still..."
   ↓
5. Wait 2 seconds (checking for movement)
   ↓
6. If no movement → Auto-capture ✅
   ↓
7. Show captured photo
   ↓
8. Transition to SIDE outline
   ↓
9. Repeat steps 3-7 for side photo
   ↓
10. Send both to Claude Vision
   ↓
11. Show results
```

---

## Tasks (In Order)

### Task 1: Outline Rendering (2-3 hours)

**What:** Draw clean body outlines matching the reference image (man/woman front & side)

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — add outline overlay

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, add body outline overlay to camera view:

REFERENCE DESIGN:
- Clean white silhouette (like the reference image you provided)
- Simple, professional, minimal details
- Full body from head to feet
- Shows proper pose (arms away from body, feet shoulder-width)

1. Create outline SVGs based on reference:
   - Front pose: Man standing straight, arms slightly away, legs apart
   - Front pose: Woman standing straight, arms slightly away, legs apart
   - Side pose: Man profile view, standing straight
   - Side pose: Woman profile view, standing straight

2. Show outline as WHITE silhouette on camera:
   - Color: White (#FFFFFF)
   - Opacity: 40% normally, 100% when highlighting
   - Line weight: 3-4px for outline
   - Head, shoulders, arms, torso, legs, feet all visible
   - Centered on camera
   - Size: ~55-65% of camera view (leave padding)

3. Outline styling:
   - Base: White 40% opacity
   - When aligned (80%+): Green highlight or glow
   - When not aligned: Stay white
   - When error: Red border flash
   - Smooth transitions (0.3s)

4. Position on camera:
   - Front outline: Centered horizontally, positioned for full body in frame
   - Side outline: Centered horizontally, profile view visible
   - Leave ~20% padding on all sides

5. Gender selection:
   - Detect from fitness profile (male/female)
   - Show appropriate outline
   - Can have toggle if user prefers

Reference: The image Venky provided (clean white silhouettes, front & side views)

Make outlines SVG components for reusability.
Keep design clean and professional (no annotations/labels on camera view).
```

**Acceptance Criteria:**
- ✅ Clean white body silhouettes visible
- ✅ Front and side outlines accurate
- ✅ Matches reference design (simple, professional)
- ✅ Outlines scale with screen
- ✅ Proper gender representation
- ✅ Smooth appearance, no lag

---

### Task 2: Body Position Detection (3-4 hours)

**What:** Detect if user is aligned with outline

**Create new file:** `services/bodyAlignmentService.ts`

**Claude Code Prompt:**
```
Create bodyAlignmentService.ts:

1. Function: detectBodyAlignment(cameraFrame, scanPose) → object
   {
     isAligned: boolean,    // User positioned correctly?
     alignmentScore: 0-100, // How well aligned (%)
     feedback: string,      // "Move left", "Good alignment!", etc.
     issues: string[]       // What's wrong
   }

2. For FRONT pose:
   - Detect if full body visible
   - Check if centered horizontally
   - Check if arms are in position (slightly away from body)
   - Check if legs are visible fully
   - Check if head is centered
   - Return alignment score

3. For SIDE pose:
   - Detect if person is at 90° to camera
   - Check if full body visible (head to feet)
   - Check if body is straight (not leaning)
   - Return alignment score

4. Return feedback messages:
   - Score 0-30: "Move into frame - full body needed"
   - Score 30-60: "Move closer/farther - adjust position"
   - Score 60-80: "Almost there - small adjustment"
   - Score 80-100: "Perfect alignment!"

5. Use simple image analysis (don't need ML):
   - Detect dark areas (body outline)
   - Check center of mass
   - Measure width vs height
   - Look for extremities (head, feet, hands)

Keep it simple and fast (real-time processing).
```

**Acceptance Criteria:**
- ✅ Detects if user is roughly aligned
- ✅ Feedback is helpful
- ✅ Score ranges 0-100
- ✅ Real-time (no lag)

---

### Task 3: "Hold Still" State (2-3 hours)

**What:** Show "Hold still..." when aligned, wait for stability

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — add hold state UI

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, add "hold still" state:

1. When alignment score >= 80:
   - Show message: "Perfect! Hold very still..."
   - Change outline color from white to GREEN
   - Start 2-second stability timer

2. Stability check (check for movement):
   - Monitor frame-to-frame pixel differences
   - If movement detected → restart timer
   - If stable for full 2 seconds → ready to capture

3. Visual feedback:
   - Show countdown: "Hold 3... 2... 1..."
   - Progress ring filling up as timer counts down
   - GREEN when stable, YELLOW when moving

4. During hold:
   - If movement detected → "Stay still! 3... 2... 1..."
   - Reset countdown

5. State management:
   - const [holdingStill, setHoldingStill] = useState(false)
   - const [holdCountdown, setHoldCountdown] = useState(0)
   - const [isStable, setIsStable] = useState(false)

Show clear, large text and progress indicator.
```

**Acceptance Criteria:**
- ✅ "Hold still..." shows at right time
- ✅ Countdown visible
- ✅ Movement resets timer
- ✅ Smooth transitions

---

### Task 4: Movement Detection During Capture (3-4 hours)

**What:** Detect if user moves while capturing

**Create new file:** `services/movementDetectionService.ts`

**Claude Code Prompt:**
```
Create movementDetectionService.ts:

1. Function: detectMovement(frame1, frame2) → boolean
   - Compare consecutive camera frames
   - Return true if movement detected
   - Return false if stable

2. Algorithm (simple):
   - Convert frames to grayscale
   - Calculate difference between frames
   - Count pixels that changed
   - If change > threshold → movement detected
   - Threshold: ~5-10% pixel change

3. Function: captureWithMovementCheck(duration) → object
   {
     captured: boolean,
     hadMovement: boolean,
     retryNeeded: boolean
   }
   
   - Capture for 2 seconds (duration)
   - Monitor for movement during capture
   - If ANY movement detected → return hadMovement: true
   - App decides to retake

4. Optimization:
   - Skip movement check during first 500ms (steadying)
   - Check movement in last 1.5 seconds of capture
   - More sensitive in final second

Keep it fast and simple (real-time processing).
```

**Acceptance Criteria:**
- ✅ Detects movement accurately
- ✅ Fast processing (no lag)
- ✅ Doesn't false-trigger
- ✅ Works in various lighting

---

### Task 5: Auto-Capture & Retake Logic (2-3 hours)

**What:** Auto-capture when stable, retake if movement detected

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — capture flow

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, implement capture logic:

1. When user is aligned and holding still for 2 seconds:
   - Show "Capturing..." message
   - Auto-trigger photo capture
   - Monitor for movement during capture (2 seconds)

2. After photo is captured:
   - If NO movement detected → "Photo captured! ✓"
   - If movement detected → "You moved! Retaking... 3... 2... 1..."
   - Auto-restart capture sequence

3. Retry logic:
   - Allow up to 3 auto-retakes
   - After 3 retakes, show button to "Try manually"
   - Manual tap always works

4. When photo is good:
   - Show preview
   - Show "Looks good!" message
   - Transition to next pose (front → side)

5. State management:
   - const [capturing, setCapturing] = useState(false)
   - const [captureAttempts, setCaptureAttempts] = useState(0)
   - const [photoReady, setPhotoReady] = useState(false)

Wire to existing captureGuidedBodyPhoto() function.
```

**Acceptance Criteria:**
- ✅ Auto-captures when ready
- ✅ Detects movement and retakes
- ✅ Allows up to 3 auto-retakes
- ✅ Manual fallback available
- ✅ Smooth transitions

---

### Task 6: Outline Color & Glow Feedback (1-2 hours)

**What:** Outline changes appearance based on alignment (glow effect)

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — outline styling

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, update outline styling:

REFERENCE: The outline stays white but gets visual feedback through:
1. Glow/shadow effects
2. Brightness changes
3. Border highlighting
4. Text feedback messages

1. Outline appearance based on alignment score:
   - 0-30: WHITE, dim, no glow (not aligned)
   - 30-60: WHITE, slightly brighter (getting closer)
   - 60-80: WHITE, brighter with subtle glow (almost there)
   - 80-100: WHITE with GREEN GLOW (perfect!)

2. During hold still:
   - WHITE with GREEN glow + pulse animation (calm, steady)
   - Message: "Hold very still... 3... 2... 1..."

3. During capture:
   - WHITE with GREEN glow (capturing)
   - If movement detected → RED flash + "You moved! Retaking..."

4. Effects:
   - Glow: Soft shadow around outline (blur 8-12px)
   - Pulse: Subtle animation of glow brightness
   - Transitions: Smooth (0.3s)

5. Text feedback overlay:
   - Show alignment status below outline
   - "Move into frame" / "Getting closer" / "Almost there" / "Perfect!"
   - Large, clear, white text

Keep outline itself WHITE - use glow/effects for feedback.
Style with SVG filters or CSS shadows.
```

**Acceptance Criteria:**
- ✅ Outline stays clean white
- ✅ Green glow when aligned/ready
- ✅ Smooth transitions
- ✅ Clear text feedback
- ✅ Professional appearance

---

### Task 7: Front → Side Transition (2-3 hours)

**What:** Smooth transition from front to side photo

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — flow logic

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, add transition logic:

1. After front photo is captured:
   - Show "Front photo captured! ✓" (2 seconds)
   - Then show "Now take side photo..."
   - Fade out front outline
   - Fade in side outline

2. Side pose capture:
   - Same alignment detection
   - Same hold still logic
   - Same movement detection
   - Same auto-retake

3. After side photo:
   - Show "Both photos captured! ✓"
   - Transition to results screen
   - Send both photos to Claude Vision

4. Handling errors:
   - If user skips or cancels → allow manual retake
   - If network error → show retry option

Keep transitions smooth and intuitive.
```

**Acceptance Criteria:**
- ✅ Smooth front → side transition
- ✅ Clear instructions
- ✅ Both photos captured successfully
- ✅ No confusion about next step

---

### Task 8: Integration & Testing (2-3 hours)

**What:** Wire everything together and test

**Files to modify:**
- `app/screens/FitnessProfileScreen.tsx` — full integration

**Claude Code Prompt:**
```
In FitnessProfileScreen.tsx, integrate all components:

1. Complete capture flow:
   - Open camera → Show front outline
   - Wait for alignment (score >= 80)
   - Wait for hold still (2 seconds stable)
   - Auto-capture with movement detection
   - Show result (good or retake)
   - Transition to side pose
   - Repeat for side
   - Send to Claude Vision

2. Error handling:
   - Network errors → show retry
   - Poor lighting → warn user
   - No body detected → helpful message
   - Timeout after 30 seconds → allow manual capture

3. Testing checklist:
   [ ] Front outline visible and correct
   [ ] Alignment detection works
   [ ] Hold still countdown works
   [ ] Movement detection triggers retakes
   [ ] Front → side transition smooth
   [ ] Side capture works same as front
   [ ] Photos sent to Claude Vision correctly
   [ ] Results display properly
   [ ] No crashes or errors
   [ ] Works on real device

4. Performance:
   - Check frame rate (should be 30+ FPS)
   - Check battery usage
   - Check memory (no leaks)

Document any adjustments made.
```

**Acceptance Criteria:**
- ✅ Full flow works end-to-end
- ✅ All 8 tasks integrated
- ✅ No crashes
- ✅ Smooth performance
- ✅ Professional UX

---

## Integration Points

```
User opens body scan
    ↓
See FRONT outline (Task 1)
    ↓
Position body in outline
    ↓
Calculate alignment (Task 2)
    ↓
When aligned → "Hold still..." (Task 3)
    ↓
Monitor for movement (Task 4)
    ↓
Auto-capture or retake (Task 5)
    ↓
Outline color feedback (Task 6)
    ↓
Front photo captured → Transition to side (Task 7)
    ↓
Repeat for side photo
    ↓
Both photos ready → Send to Claude Vision
    ↓
Display results
    ↓
Full integration & testing (Task 8)
```

---

## Files to Create/Modify

### Create (New Files)
- `services/bodyAlignmentService.ts` — alignment detection
- `services/movementDetectionService.ts` — movement detection

### Modify (Existing Files)
- `app/screens/FitnessProfileScreen.tsx` — main integration
- Create outline SVG components (or inline)

---

## Success Criteria

✅ Clear body outlines on camera  
✅ Real-time alignment detection  
✅ "Hold still..." state with countdown  
✅ Auto-capture when stable  
✅ Movement detection triggers retake  
✅ Color feedback (red/yellow/green)  
✅ Smooth front → side transition  
✅ Professional, guided UX  
✅ No crashes or errors  
✅ Good performance (30+ FPS)  

---

## Timeline

- **Task 1:** 2-3 hours (outlines)
- **Task 2:** 3-4 hours (alignment detection)
- **Task 3:** 2-3 hours (hold still UI)
- **Task 4:** 3-4 hours (movement detection)
- **Task 5:** 2-3 hours (capture logic)
- **Task 6:** 1-2 hours (color feedback)
- **Task 7:** 2-3 hours (transition)
- **Task 8:** 2-3 hours (testing)

**Total: 18-28 hours**

---

## Key Differences from Previous Spec

**Before:**
- Generic pose guidance
- Lighting detection
- Image quality checks

**Now:**
- Clear body outline overlay
- Users position themselves in outline
- Movement detection during capture
- Auto-retake if movement
- Color feedback (red/yellow/green)
- Professional, guided experience

---

## Next Steps

1. ✅ Copy this entire spec
2. ✅ Paste into Claude Code with prompt
3. ✅ Start with Task 1
4. ✅ Follow tasks in order
5. ✅ Test as you go
6. ✅ Send code when ready

---

**Ready to build?** This approach will give you a **much better UX** like Zing Coach! 🚀

---

Last updated: 2026-06-06
