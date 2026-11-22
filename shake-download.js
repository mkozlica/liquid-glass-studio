/** Opt-in motion shortcut. Sensor readings are processed locally and never stored. */
const finiteVector = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const magnitude = value => Math.hypot(value.x, value.y, value.z);

function motionVector(event) {
  if (finiteVector(event.acceleration)) return { mode: 'linear', vector: event.acceleration };
  if (finiteVector(event.accelerationIncludingGravity)) return { mode: 'gravity', vector: event.accelerationIncludingGravity };
  return null;
}

/** Detect two deliberate back-and-forth movements; reject isolated bumps and drift. */
export class ShakeDetector {
  constructor({ threshold = 12, windowMs = 1200, cooldownMs = 8000 } = {}) {
    this.threshold = threshold;
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
    this.lastTrigger = -Infinity;
    this.reset();
  }

  reset() {
    this.lastTime = null;
    this.startedAt = null;
    this.mode = null;
    this.gravity = null;
    this.peak = null;
    this.reversals = 0;
  }

  push(event, now) {
    const sample = motionVector(event);
    if (!sample || !Number.isFinite(now)) return false;
    if (this.lastTime !== null && (now < this.lastTime || now - this.lastTime > 350)) this.reset();
    if (this.mode !== sample.mode) this.reset();
    this.mode = sample.mode;
    const dt = this.lastTime === null ? 16 : Math.max(1, now - this.lastTime);
    this.lastTime = now;
    if (this.startedAt === null) this.startedAt = now;
    let vector = sample.vector;
    if (sample.mode === 'gravity') {
      if (!this.gravity) this.gravity = { ...vector };
      const alpha = Math.exp(-dt / 350);
      for (const axis of ['x', 'y', 'z']) this.gravity[axis] = alpha * this.gravity[axis] + (1 - alpha) * vector[axis];
      vector = { x: vector.x - this.gravity.x, y: vector.y - this.gravity.y, z: vector.z - this.gravity.z };
    }
    if (now - this.startedAt < 300 || now - this.lastTrigger < this.cooldownMs) return false;
    const strength = magnitude(vector);
    if (strength < this.threshold) return false;
    const direction = { x: vector.x / strength, y: vector.y / strength, z: vector.z / strength };
    if (!this.peak || now - this.peak.firstAt > this.windowMs) {
      this.peak = { ...direction, at: now, firstAt: now };
      this.reversals = 0;
      return false;
    }
    if (now - this.peak.at < 90) return false;
    const dot = direction.x * this.peak.x + direction.y * this.peak.y + direction.z * this.peak.z;
    if (dot > -0.5) return false;
    this.reversals += 1;
    this.peak = { ...direction, at: now, firstAt: this.peak.firstAt };
    if (this.reversals < 3) return false;
    this.lastTrigger = now;
    this.peak = null;
    this.reversals = 0;
    return true;
  }
}

/** Permission, lifecycle and one-download-per-enable protection, independent of UI. */
export class ShakeShortcut {
  constructor({ win, doc, onTrigger, onState = () => {} }) {
    this.win = win;
    this.doc = doc;
    this.onTrigger = onTrigger;
    this.onState = onState;
    this.detector = new ShakeDetector();
    this.active = false;
    this.requesting = false;
    this.generation = 0;
    this.cooldownUntil = -Infinity;
    this.timer = null;
    this.onMotion = this.onMotion.bind(this);
    this.onVisibility = () => {
      if (this.doc.hidden) this.disable('idle', 'Shake shortcut paused. Enable it again when you return.');
    };
    this.onPageHide = () => this.disable();
    this.doc.addEventListener('visibilitychange', this.onVisibility);
    this.win.addEventListener('pagehide', this.onPageHide);
    if (!win.isSecureContext) this.setState('unsupported', 'Motion needs a secure connection. Use Download source instead.');
    else if (!win.DeviceMotionEvent) this.setState('unsupported', 'Motion is unavailable in this browser. Use Download source instead.');
    else this.setState('idle', 'Enable motion, then shake your phone twice to download the source.');
  }

  setState(state, message) {
    this.state = state;
    this.onState(state, message);
  }

  async enable() {
    if (this.state === 'unsupported' || this.active || this.requesting || this.doc.hidden) return false;
    if (this.win.performance.now() < this.cooldownUntil) {
      this.setState('downloaded', 'Wait a few seconds before enabling another shake. You can also use Download source.');
      return false;
    }
    const generation = ++this.generation;
    this.requesting = true;
    this.setState('requesting', 'Allow motion access to use the shake shortcut.');
    try {
      // Invoke immediately within the enable button's click, before any await (iOS).
      const Motion = this.win.DeviceMotionEvent;
      const permission = typeof Motion.requestPermission === 'function' ? await Motion.requestPermission() : 'granted';
      if (generation !== this.generation || this.doc.hidden) return false;
      if (permission !== 'granted') {
        this.setState('denied', 'Motion access was not allowed. Use Download source, or allow motion in your browser and try again.');
        return false;
      }
      this.detector.reset();
      this.active = true;
      this.win.addEventListener('devicemotion', this.onMotion, { passive: true });
      this.setState('waiting', 'Shake your phone twice. Keep this page open.');
      this.timer = this.win.setTimeout(() => {
        this.disable('unavailable', 'No motion data received. Try Safari or another supported browser, or use Download source.');
      }, 10000);
      return true;
    } catch {
      if (generation === this.generation) this.setState('denied', 'Could not enable motion. Try opening this page in Safari, or use Download source.');
      return false;
    } finally {
      if (generation === this.generation) this.requesting = false;
    }
  }

  onMotion(event) {
    if (!this.active || this.doc.hidden || !motionVector(event)) return;
    if (this.state === 'waiting') {
      this.win.clearTimeout(this.timer);
      this.timer = null;
      this.setState('enabled', 'Shake your phone twice to download. Turn it off anytime.');
    }
    const now = this.win.performance.now();
    if (!this.detector.push(event, now)) return;
    this.cooldownUntil = now + 8000;
    // Disarm before requesting the download, including synchronous browser events.
    this.disable('downloaded', 'Shake detected. If the download does not start, tap Download source.');
    this.onTrigger();
  }

  disable(state = 'idle', message = 'Shake shortcut off. Enable it whenever you want.') {
    ++this.generation;
    this.requesting = false;
    this.active = false;
    this.win.clearTimeout(this.timer);
    this.timer = null;
    this.win.removeEventListener('devicemotion', this.onMotion);
    this.detector.reset();
    if (this.state !== 'unsupported') this.setState(state, message);
  }

  destroy() {
    this.disable();
    this.doc.removeEventListener('visibilitychange', this.onVisibility);
    this.win.removeEventListener('pagehide', this.onPageHide);
  }
}

export function mountShakeShortcut(doc = document, win = window) {
  const button = doc.getElementById('shakeToggle');
  const status = doc.getElementById('shakeStatus');
  const fallback = doc.getElementById('shakeFallback');
  const download = doc.getElementById('sourceDownload');
  if (!button || !status || !fallback || !download) return null;
  const shortcut = new ShakeShortcut({
    win, doc,
    onTrigger: () => download.click(),
    onState: (state, message) => {
      const enabled = state === 'enabled' || state === 'waiting';
      button.setAttribute('aria-pressed', String(enabled));
      button.disabled = state === 'unsupported' || state === 'requesting';
      button.textContent = enabled ? 'Turn off shake' : state === 'requesting' ? 'Enabling…' : state === 'unsupported' ? 'Motion unavailable' : 'Enable shake';
      button.closest('.shake-shortcut').dataset.state = state;
      status.textContent = message;
      fallback.hidden = !['downloaded', 'denied', 'unavailable', 'unsupported'].includes(state);
    }
  });
  button.addEventListener('click', () => {
    if (shortcut.active) shortcut.disable();
    else void shortcut.enable();
  });
  // A normal download also disarms motion, avoiding a second download during handling.
  doc.querySelectorAll('a[download]').forEach(link => {
    link.addEventListener('click', () => { if (shortcut.active || shortcut.requesting) shortcut.disable(); });
  });
  return shortcut;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') mountShakeShortcut();
