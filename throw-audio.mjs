/** Short original oscillator effects. No files, samples, or gameplay dependencies. */
export function createArcadeAudio() {
  let context = null, muted = false;
  const voices = new Set();
  const supported = Boolean(window.AudioContext || window.webkitAudioContext);
  function stop() {
    for (const voice of voices) { try { voice.stop(); } catch { /* already ended */ } }
    voices.clear();
  }
  function unlock() {
    if (!supported || muted) return;
    try {
      context ??= new (window.AudioContext || window.webkitAudioContext)();
      context.resume().catch(() => {});
    } catch { /* The same game works without an audio device. */ }
  }
  function tone(frequency, end, duration, type = 'triangle', offset = 0) {
    if (!context || muted || context.state !== 'running') return;
    const at = context.currentTime + offset;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.035, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .02);
  }
  return {
    supported, unlock,
    setMuted(value) { muted = value; if (muted) stop(); else unlock(); },
    play(kind, outcome) {
      if (kind === 'throw') tone(320, 110, .21);
      if (kind === 'hit') tone(150, 48, .17, 'square');
      if (kind === 'perfect') { tone(460, 720, .18); tone(690, 920, .23, 'triangle', .11); }
      if (kind === 'result') {
        const notes = outcome === 'win' ? [392, 494, 587, 784] : outcome === 'loss' ? [330, 262, 196] : [330, 440, 330];
        notes.forEach((note, i) => tone(note, note, .19, 'triangle', i * .13));
      }
    },
    stop,
    suspend() { stop(); context?.suspend().catch(() => {}); },
    close() { stop(); context?.close().catch(() => {}); context = null; },
  };
}
