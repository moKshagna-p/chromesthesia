// Sound → colour model for chromesthesia, built from published data.
// Every mapping names its source. Numbers marked "digitised" were read off the papers' figures.
//
//  pitch height  → lightness   Ward, Huckstep & Tsakanikos 2006, Cortex 42:264, Fig 4 (synaesthetes)
//  pitch + timbre → chroma      same paper, Fig 5: peaks near B3; piano/strings more colourful than sine
//  pitch class   → hue          Itoh, Sakata, Kwee & Nakada 2017, Sci Rep 7:17781: hue ≈ pitch class
//                               (do=red … si=violet), saturation falls from do to si
//  chords        → separate colours, not a blend (Ward 2006 + older reports it cites)
//  tempo + mode  → overall mood colour: fast/major = lighter, more saturated, yellower;
//                  slow/minor = darker, greyer, bluer (Palmer, Schloss, Xu & Prado-León 2013, PNAS 110:8836)
//  timbre        → shape        harsh = sharp/jagged, soft = rounded, mixed = both; higher F0 pushes
//                               toward jagged (Adeli, Rouat & Molotchnikoff 2014, Front Hum Neurosci 8:352;
//                               replicated by Gurman, McCormick & Klein 2021). Sine round, square angular
//                               (Parise & Spence 2012). "Harsh" measured as auditory sharpness + roughness.
//  sound → object               synaesthetes see discrete coloured geometric objects; higher pitch =
//                               smaller, higher, brighter (Chiou, Stelter & Rich 2013, Cortex 49:1750)
(function (root) {
  'use strict';

  // ---- Ward 2006, synaesthete group, notes C1…Eb6 one fifth (7 semitones) apart. Digitised. ----
  const WARD_C1 = 32.703;
  const WARD_VALUE = [3.0, 3.25, 3.35, 4.2, 5.2, 5.7, 7.15, 7.85, 8.6, 8.65]; // Munsell value (0 black, 10 white)
  const WARD_CHROMA_PURE = [4.8, 6.6, 6.8, 6.9, 10.5, 12.0, 11.6, 10.5, 9.3, 7.8]; // Munsell chroma, sine tones
  const WARD_CHROMA_PIANO = [10.3, 10.7, 11.9, 15.0, 14.8, 14.5, 14.5, 13.2, 12.2, 11.0];
  const WARD_CHROMA_STRING = [7.8, 8.9, 10.2, 12.3, 13.5, 12.8, 13.1, 14.2, 12.2, 11.7];
  const WARD_CHROMA_RICH = WARD_CHROMA_PIANO.map((v, i) => (v + WARD_CHROMA_STRING[i]) / 2);

  // Outside C1…Eb6 there is no data, so the curves are held flat at the end values.
  function wardCurve(hz, ys) {
    const x = Math.min(ys.length - 1, Math.max(0, (12 * Math.log2(hz / WARD_C1)) / 7));
    const i = Math.min(ys.length - 2, Math.floor(x));
    return ys[i] + (ys[i + 1] - ys[i]) * (x - i);
  }

  // Munsell value → CIE L* via the ASTM D1535 polynomial (Y in %).
  function munsellValueToL(v) {
    const y = 1.1914 * v - 0.22533 * v ** 2 + 0.23352 * v ** 3 - 0.020484 * v ** 4 + 0.00081939 * v ** 5;
    return 116 * Math.cbrt(Math.min(1, y / 100)) - 16;
  }
  // ponytail: Munsell chroma → CIELAB C* has no closed form (needs renotation tables); ~5× is the
  // average over red/yellow/blue reference chips. Swap in a renotation lookup if exact chroma matters.
  const MUNSELL_TO_CAB = 5;

  // ---- colour space maths (sRGB, D65) ----
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const WHITE = [0.95047, 1, 1.08883];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fi = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

  function rgbToLab([r, g, b]) {
    [r, g, b] = [r, g, b].map(toLin);
    const xyz = [
      0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      0.2126729 * r + 0.7151522 * g + 0.072175 * b,
      0.0193339 * r + 0.119192 * g + 0.9503041 * b,
    ].map((v, i) => f(v / WHITE[i]));
    return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
  }

  function labToLinRgb([L, a, b]) {
    const fy = (L + 16) / 116;
    const [x, y, z] = [fi(fy + a / 500), fi(fy), fi(fy - b / 200)].map((v, i) => v * WHITE[i]);
    return [
      3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      -0.969266 * x + 1.8760108 * y + 0.041556 * z,
      0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
  }

  // LCh → sRGB 0..255, keeping L and hue and lowering chroma until it fits the screen gamut.
  function lchToRgb(L, C, h) {
    const lab = (c) => [L, c * Math.cos(h), c * Math.sin(h)];
    const ok = (c) => labToLinRgb(lab(c)).every((v) => v >= -1e-6 && v <= 1 + 1e-6);
    let lo = 0, hi = C;
    if (!ok(hi)) {
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; ok(m) ? (lo = m) : (hi = m); }
      C = lo;
    }
    return labToLinRgb(lab(C)).map((v) => Math.round(255 * toGam(Math.min(1, Math.max(0, v)))));
  }

  function hsvHueToRgb(hue) { // hue in radians, S = V = 1
    const h6 = ((hue / (2 * Math.PI)) % 1 + 1) % 1 * 6;
    const x = 1 - Math.abs((h6 % 2) - 1);
    return [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][Math.floor(h6) % 6];
  }

  // ---- Itoh 2017: white keys do..si sit at k·2π/7 in HSV hue (red → violet). ----
  // The hue follows the note's *name*, so C# (reddish) and Db (yellowish) differ. Audio can't tell
  // the spelling, so black keys take the midpoint between their two neighbours.
  const PC_STEP = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6]; // C C# D D# E F F# G G# A A# B
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
  const noteName = (midi) => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

  // richness 0 = pure sine, 1 = harmonically rich like piano/strings.
  function noteColor(hz, richness = 1) {
    const midi = Math.round(hzToMidi(hz));
    const phase = (PC_STEP[((midi % 12) + 12) % 12] * 2 * Math.PI) / 7;
    const L = munsellValueToL(wardCurve(hz, WARD_VALUE));
    const pure = wardCurve(hz, WARD_CHROMA_PURE), rich = wardCurve(hz, WARD_CHROMA_RICH);
    // Itoh: saturation slope -0.36 across the do→si cycle (read as per full cycle; per-radian is impossible).
    const satFactor = 1 - (0.36 * phase) / (2 * Math.PI);
    const C = (pure + (rich - pure) * richness) * MUNSELL_TO_CAB * satFactor;
    const [, a, b] = rgbToLab(hsvHueToRgb(phase));
    const h = Math.atan2(b, a);
    const rgb = lchToRgb(L, C, h);
    return { midi, name: noteName(midi), L, C, h, rgb };
  }

  // Palmer 2013 mood: -1 = slow/minor (dark, grey, blue) … +1 = fast/major (light, vivid, yellow).
  // ponytail: direction is from the paper, the exact magnitudes are mine: wide enough that upbeat songs
  // fill the field with light warm colour and sad ones with dark muted blue, as synaesthetes draw them.
  function moodColor(m) {
    const t = (Math.max(-1, Math.min(1, m)) + 1) / 2;
    const [L, a, b] = [12 + 66 * t, 2 + 4 * t * t, -14 + 66 * t * t]; // warmth mostly at the light end: mid-light yellow reads as brown
    return lchToRgb(L, Math.hypot(a, b), Math.atan2(b, a));
  }

  // ---- analysis ----
  // A real partial stands well above its neighbourhood; ripples in noise, cymbals and clicks don't.
  function standsOut(db, i) {
    const near = Array.from(db.subarray(Math.max(0, i - 24), i + 25)).sort((x, y) => x - y);
    return db[i] >= near[near.length >> 1] + 15;
  }

  // Polyphonic note picking from an AnalyserNode spectrum (dB). Spectral peaks are scored by
  // harmonic summation; the strongest wins and its harmonics are removed, repeat.
  // ponytail: a note exactly an octave/12th/2 octaves above another is absorbed as its harmonic.
  // Fix needs temporal cues (separate onsets) or a learned multi-pitch model, not a threshold.
  function detectNotes(db, sampleRate, fftSize, maxNotes = 6) {
    const binHz = sampleRate / fftSize, n = db.length;
    const lin = (i) => (i < n ? 10 ** (db[i] / 20) : 0);
    const amp = (hz) => { const k = Math.round(hz / binHz); return Math.max(lin(k - 1), lin(k), lin(k + 1)); };
    const lo = Math.max(1, Math.ceil(27.5 / binHz)), hi = Math.min(n - 2, Math.floor(4200 / binHz));
    let maxDb = -Infinity;
    for (let i = lo; i <= hi; i++) if (db[i] > maxDb) maxDb = db[i];

    const cands = [];
    for (let i = lo; i <= hi; i++) {
      const a = db[i - 1], b = db[i], c = db[i + 1];
      if (!(b > a && b >= c && b > -85 && b > maxDb - 30)) continue;
      if (!standsOut(db, i)) continue;
      const den = a - 2 * b + c;
      const p = isFinite(a) && isFinite(c) && den !== 0 ? (0.5 * (a - c)) / den : 0;
      const hz = (i + p) * binHz;
      if (hz < 27.5) continue;
      let sal = 0, e1 = 0, eAll = 0;
      const partials = [];
      for (let h = 1; h <= 20 && h * hz < sampleRate / 2; h++) {
        const m = amp(h * hz);
        partials.push([h * hz, m]);
        if (h > 10) continue;
        sal += m * 0.8 ** (h - 1);
        eAll += m * m;
        if (h === 1) e1 = m * m;
      }
      cands.push({ hz, db: b, salience: sal, richness: eAll ? 1 - e1 / eAll : 0, partials });
    }
    cands.sort((x, y) => y.salience - x.salience);

    const out = [];
    for (const c of cands) {
      if (out.length >= maxNotes || c.salience < 0.2 * (out[0] ? out[0].salience : 0)) break;
      const dup = out.some((o) => {
        const r = c.hz / o.hz, h = Math.round(r);
        // Within a quarter tone of a harmonic → treat as that note's overtone. Splitting real octaves
        // from overtones needs more than one magnitude spectrum: a spectral-smoothness test was tried
        // and invented wrong notes whenever the shared partials beat (any slight detune).
        return h >= 1 && Math.abs(1200 * Math.log2(r / h)) < 50;
      });
      if (!dup) out.push(c);
    }
    // Brightness from the partials this note owns: a partial that is a lower harmonic of another
    // sounding note is that note's (in a chord, C3's 5th harmonic is E4's root, not C3's brightness).
    const harmonicNo = (hz, base) => { const h = Math.round(hz / base); return h >= 1 && Math.abs(1200 * Math.log2(hz / base / h)) < 50 ? h : Infinity; };
    return out.map(({ partials, ...c }) => {
      const owned = partials.map(([hz, a], i) => [hz, out.every((o) => o.hz === c.hz || harmonicNo(hz, o.hz) >= i + 1) ? a : 0]);
      return { ...c, brightness: brightness(owned), midi: Math.round(hzToMidi(c.hz)), name: noteName(Math.round(hzToMidi(c.hz))) };
    });
  }

  // ---- harshness → shape ----
  // Timbral brightness: amplitude-weighted spectral centroid in harmonic numbers (centroid / F0), the
  // main acoustic correlate of brightness in timbre-space studies (Grey 1977; McAdams et al. 1995).
  // Pitch-independent, so a piano stays soft at any octave. Sine = 1, piano ≈ 2, saw/square ≈ 5.
  function brightness(partials) {
    let num = 0, den = 0;
    partials.forEach(([, a], i) => { num += (i + 1) * a; den += a; });
    return den ? num / den : 1;
  }

  // Sensory roughness of a whole frame: Plomp–Levelt dissonance curve in Sethares' (1993) form,
  // summed over pairs of tonal peaks and divided by total peak amplitude. Beating partials, clusters
  // and distortion score high; one clean harmonic tone scores low. Noise is left to noise() so a
  // click or breath doesn't read as dense beating.
  // With f0: only the roughness that note takes part in (pairs where a peak is one of its harmonics),
  // so a buzzy lead doesn't make the soft piano next to it look harsh. A peak shared by several
  // notes' harmonic series belongs to the note it is the lowest harmonic of (allF0s = all notes).
  function roughness(db, sampleRate, fftSize, f0, allF0s = [], maxPeaks = 40) {
    const binHz = sampleRate / fftSize, peaks = [];
    let maxDb = -Infinity;
    for (let i = 1; i < db.length - 1; i++) if (db[i] > maxDb) maxDb = db[i];
    for (let i = 1; i < db.length - 1 && i * binHz < 8000; i++)
      if (db[i] > db[i - 1] && db[i] >= db[i + 1] && db[i] > -85 && db[i] > maxDb - 40 && standsOut(db, i)) peaks.push([i * binHz, 10 ** (db[i] / 20)]);
    peaks.sort((x, y) => y[1] - x[1]).length = Math.min(peaks.length, maxPeaks);
    const harmonicNo = (hz, base) => { const h = Math.round(hz / base); return h >= 1 && Math.abs(1200 * Math.log2(hz / base / h)) < 50 ? h : Infinity; };
    const own = (hz) => {
      if (!f0) return true;
      const h = harmonicNo(hz, f0);
      return h < Infinity && allF0s.every((b) => b === f0 || harmonicNo(hz, b) >= h);
    };
    let r = 0, total = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (own(peaks[i][0])) total += peaks[i][1];
      for (let j = i + 1; j < peaks.length; j++) {
        if (!own(peaks[i][0]) && !own(peaks[j][0])) continue;
        const [f1, a1] = peaks[i][0] < peaks[j][0] ? peaks[i] : peaks[j], [f2, a2] = peaks[i][0] < peaks[j][0] ? peaks[j] : peaks[i];
        const x = ((0.24 / (0.0207 * f1 + 18.96)) * (f2 - f1));
        r += Math.min(a1, a2) * (Math.exp(-3.5 * x) - Math.exp(-5.75 * x));
      }
    }
    return total ? r / total : 0;
  }

  // Sharp and rough are separate visual qualities: listeners sort sounds into smooth, rough and sharp
  // shapes, with auditory sharpness predicting "sharp" and roughness predicting "rough" (audio-visual
  // roughness study, 2025). So brightness → spikes, roughness → grain and a ragged edge.
  // ponytail: range constants are calibrated on test tones (sine/piano/saw/square/chords/clusters in
  // test.js), and the F0 gain is direction-only; no listener data gives the exact magnitudes.
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const BRIGHT_SOFT = 1.5, BRIGHT_HARSH = 4.5, ROUGH_SOFT = 0.03, ROUGH_HARSH = 0.3;
  // 0 = round (soft), 1 = spiky (harsh); higher F0 makes harsh sounds sharper (Adeli 2014).
  function jaggedness(bright, hz) {
    const b = clamp01((bright - BRIGHT_SOFT) / (BRIGHT_HARSH - BRIGHT_SOFT));
    return b * (0.6 + 0.4 * clamp01(Math.log2(hz / 130) / 3));
  }
  // 0 = smooth … 1 = coarse grain (synaesthetes describe textures such as "granulated").
  const grain = (rough) => clamp01((rough - ROUGH_SOFT) / (ROUGH_HARSH - ROUGH_SOFT));

  // Noise (cymbals, hi-hats, snares, breath): spectral flatness (geometric / arithmetic mean power,
  // ~0.56 for white noise through the analyser's Blackman window, near 0 for tones) and centroid.
  function noise(db, sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    let logSum = 0, sum = 0, num = 0, cnt = 0;
    for (let i = Math.ceil(100 / binHz); i < db.length && i * binHz < 16000; i++) {
      const p = 10 ** (Math.max(db[i], -200) / 10);
      logSum += Math.log(p); sum += p; num += p * i * binHz; cnt++;
    }
    const mean = sum / cnt;
    return { flatness: mean > 0 ? Math.exp(logSum / cnt) / mean : 0, centroid: sum ? num / sum : 0, db: 10 * Math.log10(mean || 1e-20) };
  }

  // Adeli 2014: harsh timbres like crash cymbals were matched with red/yellow, jagged shapes. Unpitched,
  // so no Itoh hue; lightness follows brightness through Ward's pitch curve at the spectral centroid.
  // ponytail: orange (between Adeli's red and yellow) at moderate chroma is my pick within that finding.
  function noiseColor(centroidHz) {
    return lchToRgb(munsellValueToL(wardCurve(centroidHz, WARD_VALUE)), 45, (60 * Math.PI) / 180);
  }

  // Organic outline: radius (fraction of size) at n angles, never a perfect geometric figure.
  // j=0 soft blob with a slight wobble; j≈0.3–0.5 broad uneven bumps (Adeli's mixed shape);
  // j=1 a body splintering into long, thin, irregular shards. Seeded so an object keeps its shape.
  // rough 0…1 adds a fine ragged fringe to the edge (the "rough" category, distinct from spikes).
  function outline(j, seed, rough = 0, n = 180) {
    let s = seed >>> 0 || 1;
    const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
    const wobble = [2, 3, 4, 5].map((k) => [k, 0.035 * (0.5 + rand()), rand() * 2 * Math.PI]);
    for (let k = 11; k <= 41; k += 3) wobble.push([k, 0.02 * rough * (0.5 + rand()), rand() * 2 * Math.PI]);
    const count = Math.round(5 + 11 * j), spikes = [];
    for (let k = 0; k < count; k++)
      spikes.push([((k + 0.6 * (rand() - 0.5)) / count) * 2 * Math.PI, j * (0.35 + 0.9 * rand()), ((0.9 - 0.65 * j) * Math.PI) / count]);
    const p = 1 + 2 * j, r = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * 2 * Math.PI;
      let v = 1 - 0.3 * j;
      for (const [k, a, ph] of wobble) v += a * Math.sin(k * th + ph);
      for (const [at, len, w] of spikes) {
        const d = Math.abs(((th - at + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); // angular distance
        if (d < w) v += len * (1 - d / w) ** p; // linear-or-steeper flank = sharp tip
      }
      r[i] = v;
    }
    return r;
  }

  // Krumhansl–Kessler key profiles; mode from best major vs best minor correlation.
  const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function pearson(x, y) {
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  }
  function detectKey(chroma12) {
    let best = { r: -2 };
    const top = { major: -2, minor: -2 };
    for (const [mode, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]])
      for (let k = 0; k < 12; k++) {
        const r = pearson(chroma12, prof.map((_, i) => prof[(i - k + 12) % 12]));
        top[mode] = Math.max(top[mode], r);
        if (r > best.r) best = { r, tonic: NAMES[k], mode };
      }
    return { ...best, majorness: Math.max(-1, Math.min(1, (top.major - top.minor) * 5)) };
  }

  // Tempo from an onset-strength envelope sampled every dt seconds (autocorrelation, 60–180 BPM,
  // with a mild preference for ~120 BPM to settle octave ambiguity, as most beat trackers do).
  function detectBpm(env, dt) {
    const n = env.length, mean = env.reduce((s, v) => s + v, 0) / n;
    const e = env.map((v) => v - mean);
    const minLag = Math.max(1, Math.floor(60 / (180 * dt))), maxLag = Math.min(n - 2, Math.ceil(60 / (60 * dt)));
    const ac = (lag) => { let s = 0; for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag]; return s / (n - lag); };
    let best = 0, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const w = Math.exp(-0.5 * Math.log2(60 / (lag * dt) / 120) ** 2);
      const v = ac(lag) * w;
      if (v > best) { best = v; bestLag = lag; }
    }
    // No clear beat (steady drone, noise): periodicity must explain a fair share of the variance.
    if (!bestLag || ac(bestLag) < 0.3 * ac(0)) return 0;
    const [a, b, c] = [ac(bestLag - 1), ac(bestLag), ac(bestLag + 1)];
    const den = a - 2 * b + c;
    const lag = bestLag + (den ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0);
    return 60 / (lag * dt);
  }

  const api = { noteColor, moodColor, detectNotes, detectKey, detectBpm, hzToMidi, noteName, NAMES, brightness, roughness, jaggedness, outline, noise, noiseColor, grain };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Synesthesia = api;
})(this);
