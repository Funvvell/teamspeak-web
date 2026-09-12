// ═══════════════════════════════════════════════════════════════════════════
// aec-processor.js  v2.1
// Cascaded FDAF + NLMS AEC — AudioWorkletProcessor
//
// v2.1 changes vs v2.0:
//   • Reference signal now comes from inputs[1] (sample-accurate, no setTimeout)
//   • NLMS weight update restricted to new HOP samples only (prevents voice attenuation)
//   • ALPHA reduced 0.92 → 0.85 (faster H(f) convergence)
//   • Default mu reduced 0.10 → 0.05 (less aggressive NLMS)
//   • Added bypass mode (postMessage { type:'bypass', value:bool })
//   • Removed ring buffer (no longer needed)
// ═══════════════════════════════════════════════════════════════════════════


// ─── Cooley-Tukey Radix-2 DIT FFT ──────────────────────────────────────────
class FFT {
  constructor(n) {
    if ((n & (n - 1)) !== 0) throw new Error(`FFT boyutu 2^k olmalı: ${n}`);
    this.n = n;
    this.cosT = new Float32Array(n);
    this.sinT = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = -2 * Math.PI * i / n;
      this.cosT[i] = Math.cos(a);
      this.sinT[i] = Math.sin(a);
    }
  }

  forward(re, im) {
    const n = this.n;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cosT[k * step];
          const wi = this.sinT[k * step];
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + half] * wr - im[i + k + half] * wi;
          const vi = re[i + k + half] * wi + im[i + k + half] * wr;
          re[i + k]        = ur + vr;  im[i + k]        = ui + vi;
          re[i + k + half] = ur - vr;  im[i + k + half] = ui - vi;
        }
      }
    }
  }

  inverse(re, im) {
    for (let i = 0; i < this.n; i++) im[i] = -im[i];
    this.forward(re, im);
    const inv = 1 / this.n;
    for (let i = 0; i < this.n; i++) { re[i] *= inv; im[i] = -im[i] * inv; }
  }
}


// ─── NLMS Filtresi ──────────────────────────────────────────────────────────
class NLMSFilter {
  constructor(order = 64, mu = 0.05) {
    this.order = order;
    this.MU    = mu;
    this.EPS   = 1e-6;
    this.w     = new Float32Array(order);
    this.xBuf  = new Float32Array(order);
    this.xIdx  = 0;
  }

  // updateWeights=false: filter only, no adaptation (for old OLA samples)
  process(micSample, refSample, updateWeights = true) {
    this.xBuf[this.xIdx] = refSample;
    this.xIdx = (this.xIdx + 1) % this.order;

    let echo = 0;
    for (let i = 0; i < this.order; i++) {
      echo += this.w[i] * this.xBuf[(this.xIdx + i) % this.order];
    }

    const err = micSample - echo;

    if (updateWeights) {
      let xPow = this.EPS;
      for (let i = 0; i < this.order; i++) xPow += this.xBuf[i] ** 2;
      const step = this.MU / xPow;
      for (let i = 0; i < this.order; i++) {
        this.w[i] += step * err * this.xBuf[(this.xIdx + i) % this.order];
      }
    }

    return err;
  }

  reset() {
    this.w.fill(0);
    this.xBuf.fill(0);
    this.xIdx = 0;
  }
}


// ─── AEC AudioWorkletProcessor ──────────────────────────────────────────────
class AECProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.N        = 512;
    this.HOP      = 128;
    this.ALPHA    = 0.85;   // faster H(f) convergence vs previous 0.92
    this.BETA     = 0.02;
    this.XPOW_MIN = 1e-8;
    this.RATIO_MIN = 0.01;
    this.RATIO_MAX = 5.0;
    this.OLA_SCALE = 2 / 3;
    this._bypass   = false;

    const N   = this.N;
    const HOP = this.HOP;

    this.fft  = new FFT(N);
    this.nlms = new NLMSFilter(64, 0.05);

    this.hann = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
    }

    this.micHist = new Float32Array(N);
    this.refHist = new Float32Array(N);

    this.H_re = new Float32Array(N);
    this.H_im = new Float32Array(N);

    this.mRe     = new Float32Array(N);
    this.mIm     = new Float32Array(N);
    this.xRe     = new Float32Array(N);
    this.xIm     = new Float32Array(N);
    this.vRe     = new Float32Array(N);
    this.vIm     = new Float32Array(N);
    this.nlmsOut = new Float32Array(N);

    this.olaBuf = new Float32Array(N + HOP);

    this._micPowSmooth = 0;
    this._refPowSmooth = 0;
    this._STAT_ALPHA   = 0.95;

    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'reset':
          this.H_re.fill(0);
          this.H_im.fill(0);
          this.nlms.reset();
          this.olaBuf.fill(0);
          this._micPowSmooth = 0;
          this._refPowSmooth = 0;
          break;
        case 'params':
          if (data.alpha     !== undefined) this.ALPHA         = data.alpha;
          if (data.beta      !== undefined) this.BETA          = data.beta;
          if (data.mu        !== undefined) this.nlms.MU       = data.mu;
          if (data.ratioMax  !== undefined) this.RATIO_MAX     = data.ratioMax;
          if (data.ratioMin  !== undefined) this.RATIO_MIN     = data.ratioMin;
          if (data.nlmsOrder !== undefined) {
            this.nlms = new NLMSFilter(data.nlmsOrder, this.nlms.MU);
          }
          break;
        case 'bypass':
          this._bypass = !!data.value;
          break;
      }
    };
  }

  _shouldUpdateH(micPow, refPow) {
    const A = this._STAT_ALPHA;
    this._micPowSmooth = A * this._micPowSmooth + (1 - A) * micPow;
    this._refPowSmooth = A * this._refPowSmooth + (1 - A) * refPow;

    if (this._refPowSmooth < this.XPOW_MIN) return false;

    const ratio = this._micPowSmooth / (this._refPowSmooth + 1e-10);
    if (ratio > this.RATIO_MAX) return false;
    if (ratio < this.RATIO_MIN) return false;

    return true;
  }

  process(inputs, outputs) {
    const mic = inputs[0]?.[0];
    const ref = inputs[1]?.[0];   // sample-accurate reference from AudioGraph
    const out = outputs[0]?.[0];
    if (!mic || !out) return true;

    const N   = this.N;
    const HOP = this.HOP;

    // Update sliding histories
    this.micHist.copyWithin(0, HOP);
    this.micHist.set(mic, N - HOP);

    this.refHist.copyWithin(0, HOP);
    if (ref) {
      this.refHist.set(ref, N - HOP);
    } else {
      this.refHist.fill(0, N - HOP);
    }

    // Bypass mode
    if (this._bypass) {
      out.set(mic);
      return true;
    }

    // Check if reference has signal (bot is speaking)
    let refPowNow = 0;
    for (let i = N - HOP; i < N; i++) refPowNow += this.refHist[i] ** 2;
    if (refPowNow < this.XPOW_MIN * HOP) {
      out.set(mic);
      return true;
    }

    // ── AŞAMA 1 — FDAF ────────────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      this.mRe[i] = this.micHist[i] * this.hann[i]; this.mIm[i] = 0;
      this.xRe[i] = this.refHist[i] * this.hann[i]; this.xIm[i] = 0;
    }

    this.fft.forward(this.mRe, this.mIm);
    this.fft.forward(this.xRe, this.xIm);

    let micPowNow = 0;
    refPowNow = 0;
    for (let k = 0; k < N; k++) {
      micPowNow += this.mRe[k] ** 2 + this.mIm[k] ** 2;
      refPowNow += this.xRe[k] ** 2 + this.xIm[k] ** 2;
    }
    const canUpdate = this._shouldUpdateH(micPowNow / N, refPowNow / N);

    for (let k = 0; k < N; k++) {
      const xPow = this.xRe[k] ** 2 + this.xIm[k] ** 2;

      if (canUpdate && xPow > this.XPOW_MIN) {
        const hRe = (this.mRe[k] * this.xRe[k] + this.mIm[k] * this.xIm[k]) / xPow;
        const hIm = (this.mIm[k] * this.xRe[k] - this.mRe[k] * this.xIm[k]) / xPow;
        this.H_re[k] = this.ALPHA * this.H_re[k] + (1 - this.ALPHA) * hRe;
        this.H_im[k] = this.ALPHA * this.H_im[k] + (1 - this.ALPHA) * hIm;
      }

      this.vRe[k] = this.mRe[k] - (this.H_re[k] * this.xRe[k] - this.H_im[k] * this.xIm[k]);
      this.vIm[k] = this.mIm[k] - (this.H_re[k] * this.xIm[k] + this.H_im[k] * this.xRe[k]);

      const vMag     = Math.sqrt(this.vRe[k] ** 2 + this.vIm[k] ** 2);
      const yMag     = Math.sqrt(this.mRe[k] ** 2 + this.mIm[k] ** 2);
      const floorMag = this.BETA * yMag;
      if (vMag > 0 && vMag < floorMag) {
        const s = floorMag / vMag;
        this.vRe[k] *= s;
        this.vIm[k] *= s;
      }
    }

    this.fft.inverse(this.vRe, this.vIm);

    // ── AŞAMA 2 — NLMS ────────────────────────────────────────────────────
    // Weight update only on new HOP samples to prevent voice attenuation
    for (let i = 0; i < N; i++) {
      this.nlmsOut[i] = this.nlms.process(this.vRe[i], this.refHist[i], i >= N - HOP);
    }

    // ── AŞAMA 3 — Overlap-Add ─────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      this.olaBuf[i] += this.nlmsOut[i] * this.hann[i];
    }
    for (let i = 0; i < HOP; i++) {
      out[i] = this.olaBuf[i] * this.OLA_SCALE;
    }
    this.olaBuf.copyWithin(0, HOP);
    this.olaBuf.fill(0, N);

    return true;
  }
}

registerProcessor('aec-processor', AECProcessor);
