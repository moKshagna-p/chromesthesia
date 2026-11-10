# Chromesthesia

See the colours of music in real time. Chromesthesia is a form of synaesthesia where sounds trigger colours. This page listens to your microphone or an audio file and paints what a chromesthete might see, using mappings taken from published research rather than invented rules.

Every synaesthete sees something different. This is a generalised version: the patterns that hold across people, with the specific numbers taken from the studies below.

## Run it

```bash
python3 -m http.server 8765
```

Open http://localhost:8765, then click **Use microphone** or **Open audio file**. The microphone only works on `localhost` or HTTPS, not when the file is opened directly.

## How sound becomes vision

| Sound | Vision | Source |
|---|---|---|
| Pitch height | Low notes dark, high notes light | Ward, Huckstep & Tsakanikos 2006, *Cortex* 42:264 (curve digitised from their synaesthete data) |
| Pitch + timbre | Colourfulness peaks around B3; piano and strings more vivid than pure tones | Ward et al. 2006 |
| Note name | Hue: C red, D yellow, E yellow-green, F green, G cyan-blue, A blue-violet, B violet; saturation falls from C to B | Itoh, Sakata, Kwee & Nakada 2017, *Sci Rep* 7:17781 |
| Tempo + key | Whole field: fast/major light, warm, vivid; slow/minor dark, blue, muted | Palmer, Schloss, Xu & Prado-León 2013, *PNAS* 110:8836 |
| Timbre | Soft sounds make diffuse clouds; bright, harsh sounds make denser, splintered forms | Adeli, Rouat & Molotchnikoff 2014, *Front Hum Neurosci* 8:352; replicated by Gurman, McCormick & Klein 2021 |
| Roughness | Grainy, shimmering texture | Listeners sort sounds into smooth, rough and sharp shapes, with roughness predicting "rough" |
| Each note | A soft cloud of light: higher notes sit higher and are smaller, louder notes are bigger | Chiou, Stelter & Rich 2013, *Cortex* 49:1750 |
| Chords | One colour per note, not a blend | Ward et al. 2006 |
| Gliding pitch | A soft trail, "like a sparkler" | A synaesthete's description in Ward et al. 2006 |
| Stereo position | Left/right placement | — |

Colours linger for a few seconds and blend, so each song builds its own wash. Nothing has hard edges, because synaesthetes describe and draw their experiences as blurred, luminous light.

## Known limits

- **Hue is the least universal part.** The rainbow mapping comes from synaesthetes with perfect pitch, whose colours follow the note's *name*. Audio can't tell C♯ from D♭, so sharps and flats get the colour halfway between their neighbours.
- **Some magnitudes are judgement calls.** The papers give directions but not formulas for the mood tint, jaggedness, blur and how long colour lingers. These spots are marked with `ponytail:` comments in `synesthesia.js` and `index.html`.
- **A note exactly an octave or a twelfth above another is merged into the lower note.** Telling it apart from an overtone needs more than a single spectrum.
- **Key detection can confuse relative keys** (C major vs A minor share every note), so the mood is smoothed over a few seconds.

## Test

```bash
node test.js
```

A dependency-free self-check of the colour model, note, key and tempo detection, and the shape/texture mappings.

## Files

- `synesthesia.js`: the colour model and audio analysis (no dependencies; works in the browser and Node)
- `index.html`: the visualizer
- `test.js`: the self-check
