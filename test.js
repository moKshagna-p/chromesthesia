// node test.js — self-check for the colour model and the analysis.
const assert = require('assert');
const S = require('./synesthesia.js');

const SR = 48000, N = 8192, BIN = SR / N;
// Fake AnalyserNode output: each partial as a 3-bin main lobe over a -120 dB floor.
function spectrum(partials) {
  const lin = new Float64Array(N / 2);
  for (const [hz, a] of partials) {
    const x = hz / BIN, k = Math.round(x), d = x - k;
    for (let j = -1; j <= 1; j++) if (k + j > 0 && k + j < lin.length) lin[k + j] += a * Math.exp(-2 * (j - d) ** 2);
  }
  return Float32Array.from(lin, (v) => (v ? 20 * Math.log10(v) : -120));
}
const harmonic = (f0, n, amp = (h) => 1 / h) => Array.from({ length: n }, (_, i) => [f0 * (i + 1), 0.1 * amp(i + 1)]);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// 1. pure sine A4: one note, ~zero richness
let notes = S.detectNotes(spectrum([[440, 0.1]]), SR, N);
assert.strictEqual(notes.length, 1);
assert.strictEqual(notes[0].name, 'A4');
assert(Math.abs(notes[0].hz - 440) < 3, notes[0].hz);
assert(notes[0].richness < 0.05);

// 2. sawtooth C4: one note (harmonics absorbed), rich
notes = S.detectNotes(spectrum(harmonic(hz(60), 10)), SR, N);
assert.deepStrictEqual(notes.map((n) => n.name), ['C4']);
assert(notes[0].richness > 0.3, notes[0].richness);

// 3. C major triad: three separate notes
notes = S.detectNotes(spectrum([...harmonic(hz(60), 6), ...harmonic(hz(64), 6), ...harmonic(hz(67), 6)]), SR, N);
assert.deepStrictEqual(notes.map((n) => n.name).sort(), ['C4', 'E4', 'G4']);

// a lone note with a strong 2nd harmonic (low piano, voice) must stay one note
notes = S.detectNotes(spectrum(harmonic(hz(48), 8, (h) => [0.6, 1, 0.5, 0.3, 0.2, 0.15, 0.1, 0.08][h - 1])), SR, N);
assert.deepStrictEqual(notes.map((n) => n.name), ['C3']);
notes = S.detectNotes(spectrum(harmonic(hz(48), 8, (h) => [0.3, 1, 0.5, 0.3, 0.2, 0.15, 0.1, 0.08][h - 1])), SR, N);
assert.deepStrictEqual(notes.map((n) => n.name), ['C3']);
// odd-harmonics-only tone (clarinet / square wave) must stay one note
notes = S.detectNotes(spectrum(harmonic(hz(48), 15, (h) => (h % 2 ? 1 / h : 0)).filter(([, v]) => v)), SR, N);
assert.deepStrictEqual(notes.map((n) => n.name), ['C3']);

// 4. lightness rises with pitch (Ward 2006)
const Ls = [36, 48, 60, 72, 84].map((m) => S.noteColor(hz(m)).L);
Ls.reduce((a, b) => (assert(b > a, Ls), b));
// 5. chroma: rich timbre > sine; sine peaks mid-range not at extremes
assert(S.noteColor(hz(59), 1).C > S.noteColor(hz(59), 0).C);
assert(S.noteColor(hz(59), 0).C > S.noteColor(hz(24), 0).C);
assert(S.noteColor(hz(59), 0).C > S.noteColor(hz(87), 0).C);
// 6. hue order (Itoh 2017): C red, D yellowish, G cyan/blue, B violet
const rgb = (m) => S.noteColor(hz(m)).rgb;
const [cr, cg, cb] = rgb(60); assert(cr > cg && cr > cb, 'C red');
const [dr, dg, db] = rgb(62); assert(dr > db && dg > db, 'D yellow');
const [gr, , gb] = rgb(67); assert(gb > gr, 'G blue-ish');
const [br, bg, bb] = rgb(71); assert(bb > bg && br > bg, 'B violet');
// 7. always a valid screen colour
for (let m = 21; m <= 108; m++) for (const r of [0, 1]) S.noteColor(hz(m), r).rgb.forEach((v) => assert(v >= 0 && v <= 255 && Number.isInteger(v)));

// 8. key / mode
const prof = (pcs) => Array.from({ length: 12 }, (_, i) => (pcs.includes(i) ? 1 : 0));
let k = S.detectKey(prof([0, 2, 4, 5, 7, 9, 11]).map((v, i) => v + (i === 0 || i === 7 ? 1 : 0) + (i === 4 ? 0.5 : 0)));
assert.strictEqual(k.tonic + ' ' + k.mode, 'C major');
k = S.detectKey(prof([9, 11, 0, 2, 4, 5, 7]).map((v, i) => v + (i === 9 || i === 4 ? 1 : 0) + (i === 0 ? 0.5 : 0)));
assert.strictEqual(k.tonic + ' ' + k.mode, 'A minor');

// 9. tempo: onset impulses at 120 and 90 BPM, sampled at 60 fps
for (const bpm of [120, 90]) {
  const dt = 1 / 60, period = 60 / bpm / dt;
  const env = Array.from({ length: 360 }, (_, i) => (i % period < 1 ? 1 : 0));
  const got = S.detectBpm(env, dt);
  assert(Math.abs(got - bpm) < 3, `${bpm} → ${got}`);
}
// ...and no tempo for beatless noise
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
assert.strictEqual(S.detectBpm(Array.from({ length: 360 }, rnd), 1 / 60), 0);
// 10. mood colour: positive mood lighter than negative
const lum = ([r, g, b]) => r + g + b;
assert(lum(S.moodColor(1)) > lum(S.moodColor(-1)));
const [, , mb] = S.moodColor(-1), [mr2, , mb2] = S.moodColor(1);
assert(mb > S.moodColor(-1)[0] && mr2 > mb2, 'sad blue, happy yellow');

// 11. shape: sine round, piano mostly round, saw/square jagged, cluster and noise jagged (Adeli 2014)
const jag = (partials) => {
  const d = spectrum(partials), n = S.detectNotes(d, SR, N)[0];
  return S.jaggedness(n.brightness, n.hz);
};
const H = (f0, amp) => Array.from({ length: 30 }, (_, i) => [f0 * (i + 1), 0.1 * amp(i + 1)]).filter(([f, a]) => a > 0 && f < SR / 2);
for (const m of [48, 60, 72]) {
  const sine = jag(H(hz(m), (h) => +(h === 1))), piano = jag(H(hz(m), (h) => h ** -2));
  const saw = jag(H(hz(m), (h) => 1 / h)), square = jag(H(hz(m), (h) => (h % 2 ? 1 / h : 0)));
  assert(sine < 0.05 && piano < 0.35 && saw > 0.55 && square > 0.55, [m, sine, piano, saw, square]);
}
// roughness → grain, not spikes: soft piano triad stays round but textured; clusters are coarse
{
  const grainOf = (parts) => { const d = spectrum(parts), ns = S.detectNotes(d, SR, N), all = ns.map((n) => n.hz);
    return Math.min(...ns.map((n) => S.grain(S.roughness(d, SR, N, n.hz, all)))); };
  const triad = [60, 64, 67].flatMap((m) => H(hz(m), (h) => h ** -2));
  assert(jag(triad) < 0.35, 'piano triad round');
  assert(grainOf(H(hz(60), (h) => h ** -2)) === 0, 'single piano smooth');
  assert(grainOf([60, 61, 62].flatMap((m) => H(hz(m), (h) => 1 / h))) > 0.8, 'cluster coarse');
  assert(grainOf(triad) < grainOf([60, 61, 62].flatMap((m) => H(hz(m), (h) => h ** -2))), 'triad smoother than cluster');
}
assert(jag(H(hz(84), (h) => 1 / h)) > jag(H(hz(48), (h) => 1 / h)), 'higher F0 → sharper');
// per-note roughness: a buzzy lead next to a soft note doesn't roughen the soft note
{
  const d = spectrum([...H(hz(48), (h) => h ** -2), ...[76, 77].flatMap((m) => H(hz(m), (h) => 1 / h))]);
  const notes2 = S.detectNotes(d, SR, N), soft = notes2.find((n) => n.name === 'C3');
  const all = notes2.map((n) => n.hz);
  assert(S.roughness(d, SR, N, soft.hz, all) < 0.03, S.roughness(d, SR, N, soft.hz, all));
  for (const n of notes2.filter((n) => n !== soft)) assert(S.roughness(d, SR, N, n.hz, all) > 0.05, n.name);
  assert(S.roughness(d, SR, N) > 0.05);
}
// noise: no fake notes, high flatness; a tone has low flatness
seed = 7;
const noiseDb = Float32Array.from({ length: N / 2 }, () => 10 * Math.log10(-Math.log(rnd() || 1e-9)) - 60); // exponential power, like windowed white noise
assert.strictEqual(S.detectNotes(noiseDb, SR, N).length, 0, 'noise makes no notes');
assert(S.noise(noiseDb, SR, N).flatness > 0.4);
assert(S.noise(spectrum(harmonic(hz(60), 10)), SR, N).flatness < 0.05);
// outline: soft blob at j=0, splintered at j=1, same seed → same shape
const span = (r) => Math.max(...r) / Math.min(...r);
for (const seed of [1, 2, 3]) {
  const soft = S.outline(0, seed), hard = S.outline(1, seed);
  assert(Math.min(...soft) > 0.8 && Math.max(...soft) < 1.2 && span(soft) > 1.02, 'soft blob, not a perfect circle');
  assert(span(hard) > 2 && Math.min(...hard) > 0.5, 'long shards on a solid body');
  assert(span(S.outline(0.4, seed)) > span(soft) && span(S.outline(0.4, seed)) < span(hard));
}
assert.deepStrictEqual(S.outline(0.5, 9), S.outline(0.5, 9));

console.log('ok');
for (const m of [36, 48, 60, 62, 64, 65, 67, 69, 71, 72, 84]) {
  const c = S.noteColor(hz(m), 1);
  console.log(c.name.padEnd(4), 'L', c.L.toFixed(0).padStart(3), 'C', c.C.toFixed(0).padStart(3), 'rgb', c.rgb.join(','));
}
