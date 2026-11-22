(() => {
  'use strict';

  // YIN difference function with a fixed window for comparable lag scores.
  function detect(samples, rate) {
    const size = Math.floor(samples.length / 2);
    let power = 0;
    for (const sample of samples) power += sample * sample;
    const level = Math.sqrt(power / samples.length);
    if (level < .003) return { pitch: null, level };
    const limit = Math.min(size - 1, Math.ceil(rate / 26));
    const minLag = Math.floor(rate / 4400);
    let sum = 0, previous = 1, before = 1;
    for (let lag = 1; lag <= limit; lag++) {
      let difference = 0;
      for (let i = 0; i < size; i += 2) {
        const delta = samples[i] - samples[i + lag];
        difference += delta * delta;
      }
      sum += difference;
      const score = sum ? difference * lag / sum : 1;
      if (lag > minLag && previous < .16 && score >= previous && previous < before) {
        const correction = (before - score) / (2 * (before + score - 2 * previous));
        const frequency = rate / (lag - 1 + correction);
        const midi = 69 + 12 * Math.log2(frequency / 440);
        const pitch = Math.round(midi);
        return { pitch: pitch >= 21 && pitch <= 108 && Math.abs(midi - pitch) < .46 ? pitch : null, level };
      }
      before = previous;
      previous = score;
    }
    return { pitch: null, level };
  }

  function connect({ onNote, onRelease, enabled, name }) {
    const button = document.getElementById('sound-start');
    const device = document.getElementById('sound-device');
    const status = document.getElementById('sound-status');
    let stream, context, timer, generation = 0, activePitch = null;
    function clearNote() {
      if (activePitch !== null) onRelease();
      activePitch = null;
    }
    function stop(message = '') {
      generation++;
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      context?.close().catch(() => {});
      context = null;
      clearNote();
      button.textContent = 'Nghe tiếng đàn';
      button.setAttribute('aria-pressed', 'false');
      status.textContent = message;
    }
    async function start(id) {
      stop('Đang mở đầu vào âm thanh…');
      const token = generation;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Error('Hãy mở ứng dụng trên localhost bằng Chrome hoặc Edge để dùng micro.');
        context = new AudioContext();
        await context.resume();
        if (token !== generation) return;
        const input = await navigator.mediaDevices.getUserMedia({ audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          ...(id ? { deviceId: { exact: id } } : {})
        } });
        if (token !== generation) { input.getTracks().forEach(t => t.stop()); return; }
        stream = input;
        const track = input.getAudioTracks()[0];
        track.onended = () => { if (token === generation) stop('Đầu vào đã ngắt kết nối.'); };
        const sources = await navigator.mediaDevices.enumerateDevices();
        if (token !== generation) return;
        device.replaceChildren(new Option('Đầu vào mặc định', ''), ...sources.filter(s => s.kind === 'audioinput')
          .map((s, i) => new Option(s.label || 'Đầu vào ' + (i + 1), s.deviceId)));
        device.value = track.getSettings().deviceId || '';
        device.hidden = false;
        const analyser = context.createAnalyser();
        analyser.fftSize = context.sampleRate > 55000 ? 8192 : 4096;
        context.createMediaStreamSource(input).connect(analyser);
        const buffer = new Float32Array(analyser.fftSize);
        let lastPitch = null, stable = 0, levelBefore = 0, lastAttack = 0;
        button.textContent = 'Dừng nghe'; button.setAttribute('aria-pressed', 'true');
        status.textContent = 'Đang nghe · ' + track.label;
        timer = setInterval(() => {
          if (!enabled()) { clearNote(); stable = 0; return; }
          analyser.getFloatTimeDomainData(buffer);
          const { pitch, level } = detect(buffer, context.sampleRate);
          stable = pitch === lastPitch ? stable + 1 : 1;
          lastPitch = pitch;
          const attack = levelBefore > 0 && level > levelBefore * 1.8 && performance.now() - lastAttack > 170;
          levelBefore = level;
          if (attack && activePitch === pitch) clearNote();
          if (stable < 2 || activePitch === pitch) return;
          clearNote();
          if (pitch !== null) {
            activePitch = pitch; lastAttack = performance.now();
            status.textContent = 'Nghe được ' + name(pitch);
            onNote(pitch);
          }
        }, 35);
      } catch (error) {
        if (token === generation) stop(error.name === 'NotAllowedError' ? 'Hãy cấp quyền micro để nghe đàn.' :
          error.name === 'NotFoundError' ? 'Chưa tìm thấy đầu vào USB hoặc micro.' : error.message);
      }
    }
    button.addEventListener('click', () => context ? stop('Đã dừng nghe.') : start(device.value));
    device.addEventListener('change', () => start(device.value));
    window.addEventListener('pagehide', () => stop());
  }
  globalThis.PianoAudioInput = { detect, connect };
})();
