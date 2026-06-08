/**
 * BodyOutline.tsx — SVG body silhouette guides for the camera capture overlay.
 * Stroke-only (no fill) so the camera feed shows through.
 * Male front proportions traced from anatomical reference illustration.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

interface Props {
  pose: 'front' | 'side';
  gender: 'male' | 'female' | 'other';
  color?: string;
  opacity?: number;
  height?: number;
}

// ─────────────────────────────────────────
// MALE FRONT  (viewBox 0 0 260 720)
// Proportions match anatomical reference: broad shoulders, natural arm hang,
// defined waist, hip flare, calf taper, visible feet.
// ─────────────────────────────────────────
function MaleFront({ c, sw, h }: { c: string; sw: number; h: number }) {
  return (
    <Svg viewBox="0 0 260 720" width={h * 0.361} height={h}>

      {/* ── Head ── */}
      <Ellipse cx="130" cy="52" rx="38" ry="47"
        stroke={c} strokeWidth={sw} fill="none" />

      {/* ── Torso + legs (one closed path) ── */}
      {/* Starts at left neck base, goes clockwise around full body */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 110,98
          C  90,106  62,116  46,130
          C  38,138  36,148  40,158
          C  44,166  54,172  60,180
          C  62,200  64,228  64,256
          C  64,272  62,286  58,302
          C  54,320  48,338  46,358
          C  42,378  40,396  40,412
          C  38,440  38,468  40,496
          C  42,514  42,530  42,548
          C  42,568  44,590  46,610
          C  46,620  44,630  38,642
          C  30,654  18,664  12,672
          C   8,678   8,684  14,690
          C  24,698  48,704  70,702
          C  84,700  94,694  96,684
          C  98,674  98,662  98,648
          C  98,626  98,600  98,574
          C  98,550  98,524  98,506
          C  98,478 100,450 104,428
          C 108,416 114,406 122,402
          C 126,400 130,400 134,402
          C 140,406 146,416 150,428
          C 154,450 156,478 156,506
          C 156,524 156,550 156,574
          C 156,600 156,626 156,648
          C 156,662 156,674 158,684
          C 160,694 170,700 184,702
          C 206,704 230,698 240,690
          C 246,684 246,678 242,672
          C 236,664 224,654 216,642
          C 210,630 208,620 208,610
          C 210,590 212,568 212,548
          C 212,530 212,514 214,496
          C 216,468 216,440 214,412
          C 214,396 210,378 206,358
          C 202,338 196,320 192,302
          C 188,286 186,272 186,256
          C 186,228 188,200 190,180
          C 196,172 206,166 210,158
          C 214,148 212,138 204,130
          C 188,116 160,106 140,98
          Z
        `}
      />

      {/* ── Left arm (outer edge → hand → inner edge → armpit) ── */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 46,130
          C  32,146  18,168   8,200
          C   2,224   0,252   2,280
          C   4,308   8,334  12,358
          C  14,376  14,392  12,408
          C  12,418  10,428   8,438
          C   6,448   6,458  10,464
          C  14,470  20,468  24,460
          C  28,454  28,444  28,434
          C  28,424  30,416  36,412
          C  42,408  50,412  54,422
          C  56,434  58,454  58,474
          C  58,494  58,514  58,534
          C  58,552  60,570  60,584
        `}
      />

      {/* ── Right arm (mirror) ── */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 214,130
          C 228,146 242,168 252,200
          C 258,224 260,252 258,280
          C 256,308 252,334 248,358
          C 246,376 246,392 248,408
          C 248,418 250,428 252,438
          C 254,448 254,458 250,464
          C 246,470 240,468 236,460
          C 232,454 232,444 232,434
          C 232,424 230,416 224,412
          C 218,408 210,412 206,422
          C 204,434 202,454 202,474
          C 202,494 202,514 202,534
          C 202,552 200,570 200,584
        `}
      />
    </Svg>
  );
}

// ─────────────────────────────────────────
// FEMALE FRONT  (viewBox 0 0 240 720)
// ─────────────────────────────────────────
function FemaleFront({ c, sw, h }: { c: string; sw: number; h: number }) {
  return (
    <Svg viewBox="0 0 240 720" width={h * 0.333} height={h}>

      {/* Head — slightly smaller/rounder */}
      <Ellipse cx="120" cy="50" rx="34" ry="43"
        stroke={c} strokeWidth={sw} fill="none" />

      {/* Torso + legs — wider hips, defined waist, narrower shoulders */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 102,92
          C  84,100  60,112  46,126
          C  38,134  36,144  40,154
          C  44,162  54,168  60,176
          C  62,194  64,216  66,238
          C  66,254  64,268  60,282
          C  56,298  52,316  52,334
          C  52,352  54,370  58,386
          C  62,402  64,416  60,432
          C  54,454  48,480  46,506
          C  44,526  44,546  46,564
          C  46,580  46,596  44,612
          C  38,626  28,642  20,656
          C  16,664  16,672  22,678
          C  34,688  56,694  74,692
          C  86,690  94,684  96,674
          C  98,664  98,652  98,638
          C  98,614  98,588  98,562
          C  98,538  98,514  98,496
          C  98,470 100,444 104,424
          C 108,410 114,402 120,400
          C 126,402 132,410 136,424
          C 140,444 142,470 142,496
          C 142,514 142,538 142,562
          C 142,588 142,614 142,638
          C 142,652 142,664 144,674
          C 146,684 154,690 166,692
          C 184,694 206,688 218,678
          C 224,672 224,664 220,656
          C 212,642 202,626 196,612
          C 194,596 194,580 194,564
          C 196,546 196,526 194,506
          C 192,480 186,454 180,432
          C 176,416 178,402 182,386
          C 186,370 188,352 188,334
          C 188,316 184,298 180,282
          C 176,268 174,254 174,238
          C 176,216 178,194 180,176
          C 186,168 196,162 200,154
          C 204,144 202,134 194,126
          C 180,112 156,100 138,92
          Z
        `}
      />

      {/* Left arm */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 46,126
          C  34,142  20,164  12,196
          C   6,220   4,248   6,276
          C   8,302  12,326  14,350
          C  16,368  14,384  12,400
          C  12,410  10,420   8,430
          C   6,440   6,450  10,456
          C  14,462  20,460  24,452
          C  28,446  28,436  28,426
          C  28,418  32,412  38,410
          C  44,408  52,412  54,422
          C  56,434  56,454  56,474
          C  56,492  56,510  56,528
        `}
      />

      {/* Right arm */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 194,126
          C 206,142 220,164 228,196
          C 234,220 236,248 234,276
          C 232,302 228,326 226,350
          C 224,368 226,384 228,400
          C 228,410 230,420 232,430
          C 234,440 234,450 230,456
          C 226,462 220,460 216,452
          C 212,446 212,436 212,426
          C 212,418 208,412 202,410
          C 196,408 188,412 186,422
          C 184,434 184,454 184,474
          C 184,492 184,510 184,528
        `}
      />
    </Svg>
  );
}

// ─────────────────────────────────────────
// MALE SIDE  (viewBox 0 0 220 720)
// Traced from anatomical reference: natural S-curve spine, chest/belly/buttocks
// protrusions, calf bulge, heel extension, flat foot with toes, hanging arm.
// Figure faces RIGHT.
// ─────────────────────────────────────────
function MaleSide({ c, sw, h }: { c: string; sw: number; h: number }) {
  return (
    <Svg viewBox="0 0 220 720" width={h * 0.306} height={h}>

      {/* Head — slightly oval, angled naturally */}
      <Ellipse cx="108" cy="52" rx="34" ry="42"
        stroke={c} strokeWidth={sw} fill="none" />

      {/* Full body outline: front-neck → chest → belly → legs → foot
          → heel → calf → thigh → buttocks → back → nape */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 122,90
          C 128,102 134,122 136,150
          C 136,170 132,194 128,220
          C 126,240 122,260 118,282
          C 114,302 110,320 110,346
          C 110,372 110,400 110,428
          C 110,448 114,466 116,484
          C 114,506 108,530 104,552
          C 102,564 104,576 112,584
          C 120,590 138,594 148,594
          L 56,594
          C 46,592 40,580 42,566
          C 44,550 50,532 54,512
          C 56,490 58,464 56,432
          C 56,412 60,392 64,372
          C 68,350 70,324 68,298
          C 66,270 58,248 52,222
          C 48,198 50,174 56,150
          C 60,130 66,112 72,98
          C 78,88 84,82 90,80
        `}
      />

      {/* Near-side arm — from shoulder, hanging naturally, hand at mid-thigh */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 88,108
          C 74,126 62,154 56,184
          C 50,212 50,240 52,268
          C 54,292 58,314 58,334
          C 58,348 56,362 54,374
          C 52,386 50,398 54,408
          C 58,414 66,414 70,406
          C 74,398 74,386 74,374
          C 74,362 76,352 82,346
          C 88,340 96,344 100,356
          C 102,368 100,388 98,406
          C 96,422 96,438 96,454
        `}
      />
    </Svg>
  );
}

// ─────────────────────────────────────────
// FEMALE SIDE  (viewBox 0 0 220 720)
// Similar structure to male but with defined bust, narrower waist,
// more pronounced buttocks curve. Faces RIGHT.
// ─────────────────────────────────────────
function FemaleSide({ c, sw, h }: { c: string; sw: number; h: number }) {
  return (
    <Svg viewBox="0 0 220 720" width={h * 0.292} height={h}>

      {/* Head */}
      <Ellipse cx="106" cy="50" rx="32" ry="40"
        stroke={c} strokeWidth={sw} fill="none" />

      {/* Full body outline: front-neck → bust → waist → legs → foot
          → heel → calf → thigh → buttocks → back → nape */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 120,88
          C 128,100 136,122 140,150
          C 142,172 138,192 132,210
          C 126,228 118,240 114,258
          C 110,276 110,294 110,316
          C 110,340 110,370 110,400
          C 110,422 114,444 116,464
          C 114,488 108,514 104,538
          C 102,550 104,562 112,570
          C 120,578 138,582 148,582
          L 54,582
          C 44,580 38,568 40,554
          C 42,538 48,520 52,500
          C 54,478 56,452 54,420
          C 54,398 58,376 62,356
          C 66,334 66,308 62,282
          C 58,256 50,234 46,208
          C 42,182 44,158 50,136
          C 54,118 60,102 68,92
          C 74,84 82,80 88,80
        `}
      />

      {/* Arm — female side */}
      <Path stroke={c} strokeWidth={sw} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        d={`
          M 86,106
          C 72,124 60,152 54,182
          C 48,210 48,238 50,266
          C 52,290 56,312 56,332
          C 56,346 54,360 52,372
          C 50,384 48,396 52,406
          C 56,412 64,412 68,404
          C 72,396 72,384 72,372
          C 72,360 74,350 80,344
          C 86,338 94,342 98,354
          C 100,366 98,386 96,404
          C 94,420 94,436 94,452
        `}
      />
    </Svg>
  );
}

// ─────────────────────────────────────────
// Main export
// ─────────────────────────────────────────
export default function BodyOutline({ pose, gender, color = '#FFFFFF', opacity = 0.7, height = 400 }: Props) {
  const isFemale = gender === 'female';
  const sw = 3.0;

  return (
    <View style={{ opacity }}>
      {pose === 'front'
        ? isFemale
          ? <FemaleFront c={color} sw={sw} h={height} />
          : <MaleFront c={color} sw={sw} h={height} />
        : isFemale
          ? <FemaleSide c={color} sw={sw} h={height} />
          : <MaleSide c={color} sw={sw} h={height} />}
    </View>
  );
}
