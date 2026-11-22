(() => {
  'use strict';

  function createDetector(size, rate) {
    // Zero-padding gives a finer grid for the interpolated peak locations.
    const bins = size * 2;
    const real = new Float64Array(bins), imag = new Float64Array(bins);
    const reverse = new Uint16Array(bins);
    const window = new Float64Array(size);
    const cosine = new Float64Array(bins / 2), sine = new Float64Array(bins / 2);
    const spectrum = new Float64Array(Math.min(bins / 2, Math.ceil(15500 / rate * bins)));
    const hzPerBin = rate / bins;
    const midiOf = frequency => 69 + 12 * Math.log2(frequency / 440);
    for (let i = 1; i < bins; i++) reverse[i] = (reverse[i >> 1] >> 1) | ((i & 1) * bins / 2);
    for (let i = 0; i < size; i++) window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / size);
    for (let i = 0; i < bins / 2; i++) {
      const angle = 2 * Math.PI * i / bins;
      cosine[i] = Math.cos(angle);
      sine[i] = -Math.sin(angle);
    }

    return samples => {
      let power = 0;
      real.fill(0);
      imag.fill(0);
      for (let i = 0; i < size; i++) {
        const sample = samples[i];
        power += sample * sample;
        real[reverse[i]] = sample * window[i];
      }
      const level = Math.sqrt(power / size);
      const notes = new Map();
      if (level < .0015) return notes;
      for (let span = 2; span <= bins; span *= 2) {
        const half = span / 2, stride = bins / span;
        for (let base = 0; base < bins; base += span) {
          for (let i = 0; i < half; i++) {
            const a = base + i, b = a + half, k = i * stride;
            const x = real[b] * cosine[k] - imag[b] * sine[k];
            const y = real[b] * sine[k] + imag[b] * cosine[k];
            real[b] = real[a] - x;
            imag[b] = imag[a] - y;
            real[a] += x;
            imag[a] += y;
          }
        }
      }

      for (let i = 0; i < spectrum.length; i++) spectrum[i] = Math.hypot(real[i], imag[i]) * 4 / size;
      let strongest = 0;
      const peaks = [];
      for (let i = Math.max(2, Math.floor(25 / hzPerBin)); i < spectrum.length - 1; i++) {
        const a = spectrum[i - 1], b = spectrum[i], c = spectrum[i + 1];
        if (b < .0004 || b <= a || b < c) continue;
        const logA = Math.log(Math.max(a, 1e-10)), logB = Math.log(b), logC = Math.log(Math.max(c, 1e-10));
        const offset = .5 * (logA - logC) / (logA - 2 * logB + logC);
        const hz = (i + offset) * hzPerBin;
        const amplitude = Math.exp(logB - .25 * (logA - logC) * offset);
        strongest = Math.max(strongest, amplitude);
        peaks.push({ hz, amplitude });
      }

      // A pitched sound concentrates its energy in peaks. Ignore the broadband
      // onset and nearby spectral leakage before looking for piano notes.
      if (strongest < Math.max(.0012, level * .12)) return notes;
      const floor = Math.max(.0008, strongest * .022, level * .048);
      const peakNear = (hz, width) => {
        let start = 0, end = peaks.length;
        while (start < end) {
          const mid = (start + end) >>> 1;
          if (peaks[mid].hz < hz - width) start = mid + 1;
          else end = mid;
        }
        let amplitude = 0;
        for (let i = start; i < peaks.length && peaks[i].hz <= hz + width; i++) {
          amplitude = Math.max(amplitude, peaks[i].amplitude);
        }
        return amplitude;
      };
      const harmonic = (hz, n) => peakNear(hz * n, Math.max(hzPerBin * .7, hz * n * .012));
      const harmonicOrder = (frequency, fundamental) => {
        const ratio = frequency / fundamental;
        const order = Math.round(ratio);
        return order >= 2 && order <= 28 && Math.abs(ratio - order) <= order * .015 ? order : 0;
      };
      const explainedByLower = (candidate, lowerNotes) => {
        const relatives = lowerNotes.flatMap(lower => {
          const order = harmonicOrder(candidate.hz, lower.hz);
          return order ? [{ lower, order }] : [];
        });
        if (!relatives.length) return false;
        // Add the estimated power from the lower notes sharing these partials.
        const background = partial => Math.sqrt(relatives.reduce((sum, { lower, order }) => {
          const n = order * partial;
          const left = harmonic(lower.hz, n - 1), right = harmonic(lower.hz, n + 1);
          const adjacent = left && right ? Math.sqrt(left * right) : Math.max(left, right) * .55;
          return sum + Math.max(lower.amplitude * .33 / n ** .65, adjacent * .94) ** 2;
        }, 0));
        // A shared peak alone can be an overtone. Confirm the stronger
        // fundamental with energy in its own upper partials.
        const fundamental = candidate.amplitude / background(1);
        const second = harmonic(candidate.hz, 2) / Math.max(floor, background(2));
        const third = harmonic(candidate.hz, 3) / Math.max(floor, background(3));
        if (fundamental >= 1.32 && second > 1.42 && third > 1.42) return false;

        // A quieter octave may have a weak shared fundamental. Look across
        // several upper partials before deciding it is only an overtone.
        if (fundamental >= .72 && relatives.some(({order}) => order === 2 || order === 4 || order === 8)) {
          const fourth = harmonic(candidate.hz, 4) / Math.max(floor, background(4));
          const fifth = harmonic(candidate.hz, 5) / Math.max(floor, background(5));
          const partials = [second, third, fourth, fifth].sort((a,b) => b-a);
          if (partials[0] >= 1.85 && partials[2] >= 1 && partials[3] >= .55) return false;
        }
        const upper = Math.max(second, third), companion = Math.min(second, third);
        return fundamental < .62 || upper < 1.8 || companion < .7 ||
          fundamental * upper * companion < (fundamental >= 1.05 ? 1.72 : 2.2);
      };

      const fundamentals = [];
      for (const peak of peaks) {
        if (peak.amplitude < floor || peak.hz > 4230) continue;
        const midi = midiOf(peak.hz), pitch = Math.round(midi);
        if (pitch < 21 || pitch > 108 || Math.abs(midi - pitch) > .32) continue;
        if (explainedByLower(peak, fundamentals)) continue;
        fundamentals.push(peak);
        notes.set(pitch, Math.max(notes.get(pitch) || 0, peak.amplitude));
      }
      if (notes.size <= 12) return notes;
      return new Map([...notes].sort((a, b) => b[1] - a[1]).slice(0, 12));
    };
  }

  function trackNotes(states, notes, now) {
    const pressed = [], released = [], events = [];
    for (const [pitch, state] of states) {
      if (notes.has(pitch)) continue;
      if (++state.misses < (state.active ? 3 : 2)) continue;
      if (state.active) {
        released.push(pitch);
        events.push({ pitch, at: state.lastSeen, pressed: false });
      }
      states.delete(pitch);
    }
    for (const [pitch, amplitude] of notes) {
      if (!states.has(pitch)) {
        states.set(pitch, { frames: 1, misses: 0, amplitude, active: false, attack: 0, firstSeen: now, lastSeen: now });
        continue;
      }
      const state = states.get(pitch);
      const renewed = state.active && now - state.attack > 175 && amplitude > state.amplitude * 1.75;
      state.amplitude = Math.max(amplitude, state.amplitude * .78);
      state.misses = 0;
      state.lastSeen = now;
      if ((!state.active && ++state.frames >= 2) || renewed) {
        state.active = true;
        state.attack = now;
        pressed.push(pitch);
        events.push({ pitch, at: renewed ? now : state.firstSeen, pressed: true });
      }
    }
    return { pressed, released, events };
  }

  function connect({ onNotes, enabled, name }) {
    const buttons = ['sound-start', 'practice-sound'].map(id => document.getElementById(id));
    const setListening = listening => buttons.forEach(button => {
      button.textContent = listening ? 'Dừng nghe' : 'Nghe tiếng đàn';
      button.setAttribute('aria-pressed', String(listening));
    });
    const device = document.getElementById('sound-device');
    const statuses = ['sound-status', 'practice-sound-status'].map(id => document.getElementById(id));
    const say = text => statuses.forEach(status => { status.textContent = text; });
    let stream, context, timer, generation = 0;
    const states = new Map();
    function clearNotes() {
      const released = [...states].filter(([, state]) => state.active).map(([pitch]) => pitch);
      states.clear();
      if (released.length) onNotes([], released, released.map(pitch => ({ pitch, cancelled: true })));
    }
    function stop(message = '') {
      generation++;
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      context?.close().catch(() => {});
      context = null;
      clearNotes();
      setListening(false);
      say(message);
    }
    async function start(id) {
      stop('Đang mở đầu vào âm thanh…');
      const token = generation;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Error('Hãy mở địa chỉ HTTPS của ứng dụng để dùng micro qua Wi-Fi.');
        }
        const Audio = window.AudioContext || window.webkitAudioContext;
        context = new Audio();
        const resumed = context.resume();
        resumed.catch(() => {});
        const input = await navigator.mediaDevices.getUserMedia({ audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          ...(id ? { deviceId: { exact: id } } : {})
        } });
        if (token !== generation) { input.getTracks().forEach(t => t.stop()); return; }
        stream = input;
        await resumed;
        if (token !== generation) return;
        const track = input.getAudioTracks()[0];
        track.onended = () => { if (token === generation) stop('Đầu vào đã ngắt kết nối.'); };
        const sources = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (token !== generation) return;
        device.replaceChildren(new Option('Đầu vào mặc định', ''), ...sources.filter(s => s.kind === 'audioinput')
          .map((s, i) => new Option(s.label || 'Đầu vào ' + (i + 1), s.deviceId)));
        device.value = track.getSettings?.().deviceId || '';
        device.hidden = false;
        const analyser = context.createAnalyser();
        analyser.fftSize = context.sampleRate > 55000 ? 32768 : 16384;
        context.createMediaStreamSource(input).connect(analyser);
        const buffer = new Float32Array(analyser.fftSize);
        const detect = createDetector(buffer.length, context.sampleRate);
        setListening(true);
        const listening = 'Đang nghe · ' + (track.label || 'Micro');
        say(listening);
        timer = setInterval(() => {
          if (!enabled()) { clearNotes(); return; }
          analyser.getFloatTimeDomainData(buffer);
          const center = performance.now() - buffer.length * 500 / context.sampleRate;
          const { pressed, released, events } = trackNotes(states, detect(buffer), center);
          if (!pressed.length && !released.length) return;
          const audible = [...states].filter(([, state]) => state.active).map(([pitch]) => pitch).sort((a, b) => a - b);
          say(audible.length ? 'Nghe được ' + audible.map(name).join(' · ') : listening);
          // The long FFT sees a loud tone as soon as its attack enters the
          // window and keeps seeing its tail near the opposite edge.
          const windowMs = buffer.length * 1000 / context.sampleRate;
          const timed = events.map(event => ({ ...event,
            at: event.at + windowMs * (event.pressed ? .20 : -.23) }));
          onNotes(pressed, released, timed);
        }, 35);
      } catch (error) {
        if (token === generation) stop(error.name === 'NotAllowedError' ? 'Hãy cấp quyền micro để nghe đàn.' :
          error.name === 'NotFoundError' ? 'Chưa tìm thấy đầu vào USB hoặc micro.' : error.message);
      }
    }
    buttons.forEach(button => button.addEventListener('click', () => context ? stop('Đã dừng nghe.') : start(device.value)));
    device.addEventListener('change', () => start(device.value));
    window.addEventListener('pagehide', () => stop());
  }
  globalThis.PianoAudioInput = { createDetector, trackNotes, connect };
})();
