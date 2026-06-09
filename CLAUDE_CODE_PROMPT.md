# Claude Code Prompt for Phase 1

Copy everything below and paste into Claude Code.

---

## FULL PROMPT

```
I'm improving the body scan image capture in my SpiceStrong fitness app.

GOAL: Better guided image capture while keeping Claude Vision API as the backend for body composition analysis.

I have a detailed spec file: PHASE1_IMPROVED_CAPTURE_SPEC.md

Please read this entire spec and build Phase 1 following all the tasks in order:

PHASE 1 SPEC:

---

[COPY ENTIRE CONTENT OF PHASE1_IMPROVED_CAPTURE_SPEC.md HERE]

---

INSTRUCTIONS:
1. Start with Task 1: Real-Time Pose Guidance UI
2. Follow each task in order (1-8)
3. Test each task before moving to the next
4. When each task is complete, ask me if I want to proceed to the next task
5. Keep Claude Vision API integration intact (no changes to backend)
6. Focus on improving the capture UX, not the analysis

FILE LOCATIONS:
- Main file to modify: app/screens/FitnessProfileScreen.tsx
- New files to create:
  - services/basicPoseService.ts
  - services/imageQualityService.ts

START WITH TASK 1 NOW.
```

---

## HOW TO USE

1. Open this file: `CLAUDE_CODE_PROMPT.md`
2. Copy everything between the triple backticks (```)
3. Open Claude Code in VS Code
4. Paste the entire prompt
5. Send it to Claude Code

Claude Code will:
- Read the full spec
- Understand all 8 tasks
- Start building Task 1
- Ask for confirmation before moving to next tasks

---

## ALTERNATIVE: SIMPLER VERSION

If the above is too long, use this shorter version:

```
I'm improving body scan image capture in SpiceStrong.

Here's the full spec with 8 tasks. Read it completely and build Phase 1 following all instructions:

[PASTE ENTIRE CONTENT OF PHASE1_IMPROVED_CAPTURE_SPEC.md]

Start with Task 1. Test before moving to Task 2.
```

---

## WHAT TO EXPECT

Claude Code will:
1. Acknowledge the spec
2. Understand Task 1 requirements
3. Ask clarifying questions (if any)
4. Start writing code for Task 1
5. Test and verify Task 1
6. Ask "Ready for Task 2?" when done

---

That's it! 🚀
