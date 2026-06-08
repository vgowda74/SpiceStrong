# Claude Code Prompt — Outline-Guided Body Scan Capture

Copy this entire prompt and paste into Claude Code.

---

## FULL PROMPT

```
I'm improving the body scan image capture in SpiceStrong with a better UX approach.

Instead of generic pose guidance, I want:
1. Clear body outlines (silhouette) on camera
2. User positions themselves into the outline
3. App confirms alignment and says "Hold still..."
4. Auto-captures when stable for 2 seconds
5. If movement detected during capture → auto-retake
6. Smooth transition to side photo
7. Repeat for side

Here's my detailed spec with 8 tasks:

[PASTE ENTIRE CONTENT OF PHASE1_OUTLINE_GUIDED_CAPTURE.md HERE]

INSTRUCTIONS:
1. Start with Task 1: Outline Rendering
2. Follow each task in order (1-8)
3. Test each task before moving to the next
4. When each task is complete, confirm and ask "Ready for Task 2?"
5. Keep Claude Vision API integration intact (no backend changes)
6. Focus on capture UX and outline guidance

FILE LOCATIONS:
- Main file to modify: app/screens/FitnessProfileScreen.tsx
- New files to create:
  - services/bodyAlignmentService.ts
  - services/movementDetectionService.ts

VISUAL BEHAVIOR:
- Outline color: White (40% opacity) → Changes based on alignment
- Colors: Red (0-30) → Orange (30-60) → Yellow (60-80) → Green (80-100)
- During hold: Green with pulse
- During capture: Monitor for movement
- If movement: Red flash + auto-retake

START WITH TASK 1 NOW.
```

---

## HOW TO USE

1. Open `PHASE1_OUTLINE_GUIDED_CAPTURE.md` in VS Code
2. Copy entire content
3. Open Claude Code
4. Paste the prompt above, replacing `[PASTE ENTIRE CONTENT OF PHASE1_OUTLINE_GUIDED_CAPTURE.md HERE]` with the actual file content
5. Send to Claude Code

---

## ALTERNATIVE: SHORTER VERSION

If the above is too long:

```
I'm rebuilding body scan capture with outline-guided UX.

Users see a clear body outline and position themselves into it.
App confirms alignment, says "Hold still...", auto-captures when stable.
If they move during capture, auto-retake.

Here's the full spec:

[PASTE ENTIRE CONTENT OF PHASE1_OUTLINE_GUIDED_CAPTURE.md]

Build all 8 tasks in order. Test as you go.
```

---

**That's it!** 🚀

Claude Code will build this step-by-step and create a professional-grade body scan experience like Zing Coach.
