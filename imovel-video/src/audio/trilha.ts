/**
 * Trilha de fundo gerada por síntese (sem samples nem músicas de terceiros),
 * portanto livre de direitos autorais. Cada vídeo recebe uma trilha com a
 * duração exata, em um de dois estilos:
 *  - "suave": piano elétrico + pad + baixo, 78 BPM (vídeo padrão)
 *  - "ritmo": o mesmo, mais bateria leve, 96 BPM
 *  - "dinamico": pop/house de Reels, 120 BPM, com virada ("drop") no fim do gancho (vídeo com ganchos)
 */
import fs from "node:fs/promises";

export type EstiloTrilha = "suave" | "ritmo" | "dinamico";

const SR = 44100;

/* ---------------- utilidades ---------------- */

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Gerador pseudoaleatório determinístico (a mesma semente gera a mesma música). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

type Bus = { L: Float32Array; R: Float32Array };
const bus = (n: number): Bus => ({ L: new Float32Array(n), R: new Float32Array(n) });

function add(b: Bus, i: number, v: number, pan = 0) {
  if (i < 0 || i >= b.L.length) return;
  const l = Math.cos(((pan + 1) * Math.PI) / 4);
  const r = Math.sin(((pan + 1) * Math.PI) / 4);
  b.L[i] += v * l;
  b.R[i] += v * r;
}

/* ---------------- instrumentos ---------------- */

/** Piano elétrico (FM simples, timbre tipo Rhodes). */
function epiano(b: Bus, t0: number, dur: number, midi: number, vel: number, pan: number) {
  const f = midiHz(midi);
  const n = Math.floor((dur + 1.2) * SR);
  const start = Math.floor(t0 * SR);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * (2.2 + midi / 60)) * (t > dur ? Math.exp(-(t - dur) * 6) : 1);
    const idx = 1.6 * Math.exp(-t * 7) + 0.25;
    const mod = Math.sin(2 * Math.PI * f * t) * idx;
    const v = Math.sin(2 * Math.PI * f * t + mod) + 0.18 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 4);
    add(b, start + k, v * env * vel * 0.16, pan);
  }
}

/** Pad quente: osciladores levemente desafinados, ataque e soltura lentos, filtrado. */
function pad(b: Bus, t0: number, dur: number, notes: number[], vel: number) {
  const n = Math.floor((dur + 1.5) * SR);
  const start = Math.floor(t0 * SR);
  const atk = 0.8;
  const rel = 1.4;
  notes.forEach((m, j) => {
    const f = midiHz(m);
    const pan = (j / Math.max(1, notes.length - 1)) * 1.2 - 0.6;
    let lp = 0;
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const env = t < atk ? t / atk : t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel);
      const raw =
        Math.sin(2 * Math.PI * f * t) +
        0.5 * Math.sin(2 * Math.PI * f * 1.003 * t + 1.3) +
        0.35 * Math.sin(2 * Math.PI * 2 * f * 0.998 * t) +
        0.15 * Math.sin(2 * Math.PI * 3 * f * t);
      lp += 0.08 * (raw - lp); // passa-baixas simples
      add(b, start + k, lp * env * vel * 0.05, pan);
    }
  });
}

/** Baixo arredondado. */
function bass(b: Bus, t0: number, dur: number, midi: number, vel: number) {
  const f = midiHz(midi);
  const n = Math.floor((dur + 0.3) * SR);
  const start = Math.floor(t0 * SR);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.01) * (t < dur ? Math.exp(-t * 2.5) : Math.exp(-dur * 2.5) * Math.exp(-(t - dur) * 20));
    const v = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * t);
    add(b, start + k, v * env * vel * 0.09, 0);
  }
}

function kick(b: Bus, t0: number, vel: number) {
  const n = Math.floor(0.35 * SR);
  const start = Math.floor(t0 * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const f = 45 + 75 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    add(b, start + k, Math.sin(ph) * Math.exp(-t * 12) * vel * 0.3, 0);
  }
}

function hat(b: Bus, t0: number, vel: number, rand: () => number, pan: number) {
  const n = Math.floor(0.06 * SR);
  const start = Math.floor(t0 * SR);
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const noise = rand() * 2 - 1;
    const hp = noise - prev; // passa-altas simples
    prev = noise;
    add(b, start + k, hp * Math.exp(-t * 70) * vel * 0.05, pan);
  }
}

/** "Snap" suave nos tempos 2 e 4. */
function snap(b: Bus, t0: number, vel: number, rand: () => number) {
  const n = Math.floor(0.18 * SR);
  const start = Math.floor(t0 * SR);
  let bp = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const noise = rand() * 2 - 1;
    bp += 0.25 * (noise - bp);
    const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30);
    add(b, start + k, (bp * 0.9 + body * 0.4) * Math.exp(-t * 22) * vel * 0.12, 0.1);
  }
}

/* ---------------- efeitos ---------------- */

/** Passa-altas biquad (Butterworth) para limpar graves acumulados e DC. */
function highpass(x: Float32Array, fc: number): Float32Array {
  const w0 = (2 * Math.PI * fc) / SR;
  const alpha = Math.sin(w0) / Math.SQRT2;
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = (1 + cos) / 2 / a0;
  const a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/** Reverb de Schroeder (4 combs em paralelo + 2 all-pass), estéreo. */
function reverb(input: Float32Array, wet: number, offset: number): Float32Array {
  const out = new Float32Array(input.length);
  const combs = [1557, 1617, 1491, 1422].map((d) => d + offset);
  const fb = 0.8;
  const damp = 0.3;
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < input.length; i++) {
      const y = buf[idx];
      lp = y * (1 - damp) + lp * damp;
      buf[idx] = input[i] + lp * fb;
      out[i] += y * 0.25;
      idx = (idx + 1) % d;
    }
  }
  for (const d of [225, 556]) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const bv = buf[idx];
      const x = out[i];
      const y = -x + bv;
      buf[idx] = x + bv * 0.5;
      out[i] = y;
      idx = (idx + 1) % d;
    }
  }
  const mix = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) mix[i] = input[i] + out[i] * wet;
  return mix;
}

/* ---------------- composição ---------------- */

// Progressão em Ré maior, com sétimas e nonas (som "aspiracional", elegante).
// Cada acorde: [fundamental do baixo, notas do pad/piano]
const PROGRESSAO: [number, number[]][] = [
  [38, [62, 66, 69, 73, 76]], // Dmaj9
  [47, [59, 62, 66, 69, 74]], // Bm9
  [43, [59, 62, 66, 67, 71]], // Gmaj7
  [45, [61, 64, 66, 69, 73]], // A6/9
];

export function compor(duracaoS: number, estilo: EstiloTrilha, seed = 7): Bus {
  const bpm = estilo === "ritmo" ? 96 : 78;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const total = Math.ceil((duracaoS + 2) * SR);
  const dry = bus(total);
  const pads = bus(total);
  const drums = bus(total);
  const rand = rng(seed);

  const bars = Math.ceil(duracaoS / bar) + 1;
  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const [root, notes] = PROGRESSAO[b % PROGRESSAO.length];
    // Pad sustenta o compasso inteiro.
    pad(pads, t, bar, notes.slice(0, 4), 1);
    // Baixo: tempo 1 (e 3 no estilo com ritmo).
    bass(dry, t, beat * (estilo === "ritmo" ? 1.6 : 3.5), root, 1);
    if (estilo === "ritmo") bass(dry, t + beat * 2.5, beat * 1.2, root, 0.75);

    // Piano: arpejo em colcheias (ritmo) ou semínimas (suave), com variação.
    const step = estilo === "ritmo" ? beat / 2 : beat;
    const count = Math.round(bar / step);
    for (let s = 0; s < count; s++) {
      if (estilo === "suave" && s === 3 && b % 2 === 1) continue; // respiro
      if (estilo === "ritmo" && rand() < 0.18) continue;
      const order = [0, 2, 1, 3, 4, 2, 3, 1];
      const note = notes[order[(s + b) % order.length] % notes.length] + (s % 4 === 3 ? 12 : 0);
      const vel = 0.55 + 0.35 * rand() + (s === 0 ? 0.15 : 0);
      epiano(dry, t + s * step + (rand() - 0.5) * 0.01, step * 1.6, note, vel, (rand() - 0.5) * 0.8);
    }

    if (estilo === "ritmo") {
      for (let q = 0; q < 4; q++) {
        const tb = t + q * beat;
        if (q === 0 || q === 2) kick(drums, tb, q === 0 ? 1 : 0.8);
        if (q === 1 || q === 3) snap(drums, tb, 0.9, rand);
        hat(drums, tb + beat / 2, 0.8 + 0.3 * rand(), rand, 0.3);
        if (rand() < 0.5) hat(drums, tb, 0.45, rand, -0.3);
      }
    }
  }

  // Mixagem: reverb no piano e pad, bateria seca.
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const rvL = reverb(dry.L.map((v, i) => v + pads.L[i]), 0.35, 0);
  const rvR = reverb(dry.R.map((v, i) => v + pads.R[i]), 0.35, 23);
  for (let i = 0; i < total; i++) {
    L[i] = rvL[i] + drums.L[i];
    R[i] = rvR[i] + drums.R[i];
  }
  // Graves limpos: corta abaixo de ~55 Hz (inaudível no celular e só ocupa volume).
  L.set(highpass(highpass(L, 55), 55));
  R.set(highpass(highpass(R, 55), 55));

  // Corta na duração, fades e normalização (RMS alvo) com limitador suave.
  const n = Math.floor(duracaoS * SR);
  const outL = L.subarray(0, n);
  const outR = R.subarray(0, n);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += outL[i] * outL[i] + outR[i] * outR[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const gain = 0.12 / rms; // ≈ -18 dBFS RMS
  const fadeIn = 0.4 * SR;
  const fadeOut = 2.5 * SR;
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, i / fadeIn, (n - i) / fadeOut);
    outL[i] = Math.tanh(outL[i] * gain * 1.2) * f * 0.89;
    outR[i] = Math.tanh(outR[i] * gain * 1.2) * f * 0.89;
  }
  return { L: outL, R: outR };
}

/* ---------------- estilo dinâmico (Reels) ---------------- */

/** Pluck sintetizado (dente de serra limitado em banda, harmônicos altos decaem antes = filtro fechando). */
function pluck(b: Bus, t0: number, dur: number, midi: number, vel: number, pan: number, bright = 1) {
  const f = midiHz(midi);
  const n = Math.floor((dur + 0.25) * SR);
  const start = Math.floor(t0 * SR);
  const H = Math.min(10, Math.floor(9000 / f));
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.003) * (t < dur ? Math.exp(-t * 5) : Math.exp(-dur * 5) * Math.exp(-(t - dur) * 25));
    let v = 0;
    for (let h = 1; h <= H; h++) {
      v += (Math.sin(2 * Math.PI * f * h * t) + Math.sin(2 * Math.PI * f * 1.006 * h * t)) * (1 / h) * Math.exp(-t * (2 + h * 3.5 / bright));
    }
    add(b, start + k, v * env * vel * 0.07, pan);
  }
}

/** Baixo sintetizado curto e marcado (contratempo). */
function synthBass(b: Bus, t0: number, dur: number, midi: number, vel: number) {
  const f = midiHz(midi);
  const n = Math.floor((dur + 0.05) * SR);
  const start = Math.floor(t0 * SR);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.004) * (t < dur ? 1 - 0.4 * (t / dur) : Math.exp(-(t - dur) * 60));
    const v = Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 8) + 0.2 * Math.sin(2 * Math.PI * 3 * f * t) * Math.exp(-t * 14);
    add(b, start + k, v * env * vel * 0.1, 0);
  }
}

function kickPunch(b: Bus, t0: number, vel: number) {
  const n = Math.floor(0.3 * SR);
  const start = Math.floor(t0 * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const f = 52 + 110 * Math.exp(-t * 35);
    ph += (2 * Math.PI * f) / SR;
    const click = t < 0.004 ? (1 - t / 0.004) * 0.5 : 0;
    add(b, start + k, (Math.sin(ph) * Math.exp(-t * 11) + click) * vel * 0.3, 0);
  }
}

function clap(b: Bus, t0: number, vel: number, rand: () => number) {
  const n = Math.floor(0.25 * SR);
  const start = Math.floor(t0 * SR);
  let lp = 0;
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const noise = rand() * 2 - 1;
    lp += 0.45 * (noise - lp);
    const bp = lp - prev * 0.6; // banda média-alta
    prev = lp;
    // três "batidas" rápidas típicas de palma
    const burst = [0, 0.011, 0.022].reduce((a, d) => a + (t >= d ? Math.exp(-(t - d) * 120) : 0), 0) * 0.5 + Math.exp(-t * 16);
    add(b, start + k, bp * burst * vel * 0.13, 0.05);
  }
}

function openHat(b: Bus, t0: number, vel: number, rand: () => number) {
  const n = Math.floor(0.16 * SR);
  const start = Math.floor(t0 * SR);
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const noise = rand() * 2 - 1;
    const hp = noise - prev;
    prev = noise;
    add(b, start + k, hp * Math.exp(-t * 22) * vel * 0.045, 0.25);
  }
}

/** Subida de ruído antes do drop, e prato no drop. */
function riser(b: Bus, t0: number, dur: number, rand: () => number) {
  const n = Math.floor(dur * SR);
  const start = Math.floor(t0 * SR);
  let lp = 0;
  for (let k = 0; k < n; k++) {
    const p = k / n;
    const noise = rand() * 2 - 1;
    lp += (0.02 + 0.6 * p * p) * (noise - lp); // filtro abrindo
    add(b, start + k, lp * p * p * 0.22, Math.sin(p * 12) * 0.4);
  }
}
function crash(b: Bus, t0: number, rand: () => number) {
  const n = Math.floor(1.8 * SR);
  const start = Math.floor(t0 * SR);
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const noise = rand() * 2 - 1;
    const hp = noise - prev;
    prev = noise;
    add(b, start + k, hp * Math.exp(-t * 2.8) * 0.07, (rand() - 0.5) * 0.6);
  }
}

// vi–IV–I–V em Ré (Bm–G–D–A): progressão pop, energia positiva.
const PROG_DIN: [number, number[]][] = [
  [35, [59, 62, 66, 69]], // Bm
  [31, [59, 62, 67, 71]], // G (add9 no topo)
  [38, [57, 62, 66, 69]], // D
  [33, [57, 61, 64, 69]], // A
];

function comporDinamico(duracaoS: number, dropS: number, seed: number): Bus {
  const bpm = 120;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const total = Math.ceil((duracaoS + 2) * SR);
  const music = bus(total); // vai para o reverb e sofre "pumping"
  const low = bus(total); // baixo (pumping, sem reverb)
  const drums = bus(total);
  const fx = bus(total);
  const rand = rng(seed);
  const drop = Math.max(0, dropS);

  // Grade de compassos ancorada no drop (o tempo 1 cai exatamente no corte de cena).
  const firstBar = -Math.ceil(drop / bar);
  const lastBar = Math.ceil((duracaoS - drop) / bar) + 1;
  const endFull = duracaoS - 2.5; // últimos segundos: tira bateria para a música "pousar"
  for (let bi = firstBar; bi < lastBar; bi++) {
    const t = drop + bi * bar;
    const [root, notes] = PROG_DIN[((bi % 4) + 4) % 4];
    const intro = t < drop;

    // Acordes em pluck, ritmo sincopado (1, 1.75 "e", 2.5, 3.5, 4.25).
    const stabs = [0, 0.75, 1.5, 2.5, 3.25];
    for (const s of stabs) {
      const ts = t + s * beat;
      if (ts < 0) continue;
      notes.forEach((m, j) => pluck(music, ts, beat * 0.45, m, intro ? 0.55 : 0.85, (j - 1.5) * 0.35, intro ? 0.45 : 1));
    }
    // Melodia de arpejo em semicolcheias na oitava de cima (só depois do drop).
    if (!intro) {
      const order = [3, 2, 1, 2, 3, 2, 1, 0];
      for (let s = 0; s < 8; s++) {
        if ((s === 3 || s === 7) && rand() < 0.5) continue;
        const ts = t + s * (beat / 2);
        pluck(music, ts, beat * 0.3, notes[order[s]] + 12, 0.32 + 0.12 * rand(), (rand() - 0.5) * 0.9, 1.4);
      }
    }

    for (let q = 0; q < 4; q++) {
      const tb = t + q * beat;
      if (tb < 0) continue;
      if (!intro && tb < endFull) {
        kickPunch(drums, tb, q === 0 ? 1 : 0.9);
        synthBass(low, tb + beat / 2, beat * 0.42, root + 12, 1);
        if (q % 2 === 1) clap(drums, tb, 0.95, rand);
        openHat(drums, tb + beat / 2, 0.9, rand);
        for (const sx of [0.25, 0.75]) hat(drums, tb + sx * beat, 0.4 + 0.2 * rand(), rand, -0.25);
      } else if (intro) {
        hat(drums, tb + beat / 2, 0.5, rand, 0.2); // pulso leve no gancho
      }
    }
  }
  if (drop > 0.8) riser(fx, Math.max(0, drop - Math.min(2.4, drop)), Math.min(2.4, drop), rand);
  if (drop > 0) crash(fx, drop, rand);

  // "Pumping": abaixa acordes e baixo logo após cada bumbo.
  for (let i = 0; i < total; i++) {
    const t = i / SR - drop;
    if (t < 0 || i / SR >= endFull) continue;
    const ph = ((t % beat) + beat) % beat;
    const g = 1 - 0.55 * Math.exp(-ph * 14);
    music.L[i] *= g; music.R[i] *= g; low.L[i] *= g; low.R[i] *= g;
  }

  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const rvL = reverb(music.L, 0.25, 0);
  const rvR = reverb(music.R, 0.25, 23);
  for (let i = 0; i < total; i++) {
    L[i] = rvL[i] + low.L[i] + drums.L[i] + fx.L[i];
    R[i] = rvR[i] + low.R[i] + drums.R[i] + fx.R[i];
  }
  L.set(highpass(highpass(L, 45), 45));
  R.set(highpass(highpass(R, 45), 45));
  return finalizar(L, R, duracaoS, 0.15, 0.08);
}

/** Corta na duração, aplica fades, normaliza (RMS alvo) com limitador suave. */
function finalizar(L: Float32Array, R: Float32Array, duracaoS: number, alvoRms: number, fadeInS: number): Bus {
  const n = Math.floor(duracaoS * SR);
  const outL = L.subarray(0, n);
  const outR = R.subarray(0, n);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += outL[i] * outL[i] + outR[i] * outR[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const gain = alvoRms / rms;
  const fadeIn = fadeInS * SR;
  const fadeOut = 2.5 * SR;
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, i / fadeIn, (n - i) / fadeOut);
    outL[i] = Math.tanh(outL[i] * gain * 1.2) * f * 0.89;
    outR[i] = Math.tanh(outR[i] * gain * 1.2) * f * 0.89;
  }
  return { L: outL, R: outR };
}

/** Grava WAV estéreo 16 bits. */
export async function gravarWav(arquivo: string, audio: Bus) {
  const n = audio.L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.R[i])) * 32767), 46 + i * 4);
  }
  await fs.writeFile(arquivo, buf);
}

/**
 * @param dropS instante (s) da virada no estilo dinâmico — normalmente o fim do gancho,
 *              para a música "explodir" junto com o primeiro corte de cena.
 */
export async function gerarTrilha(arquivo: string, duracaoS: number, estilo: EstiloTrilha, dropS = 3) {
  const audio = estilo === "dinamico" ? comporDinamico(duracaoS, dropS, 11) : compor(duracaoS, estilo);
  await gravarWav(arquivo, audio);
}
