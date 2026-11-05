const ASCII_CHARS = ' .:-=+*#%@';
const MODES = ['hd', 'pixel', 'ascii'];
const MODE_LABELS = {
  hd: 'MODE: HD BROADCAST',
  pixel: 'MODE: 8-BIT RETRO BOWL / JAM',
  ascii: 'MODE: LIVE COLORED ASCII'
};

export class SportsReelPlayer {
  constructor() {
    this.video = document.getElementById('vault-video');
    this.canvas = document.getElementById('vault-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.toastEl = document.getElementById('mode-toast');
    this.clipNowPlayingEl = document.getElementById('clip-now-playing');
    this.clipCounterEl = document.getElementById('clip-counter-badge');
    this.playlistEl = document.getElementById('reel-playlist');
    this.modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
    this.prevClipBtn = document.getElementById('prev-clip-btn');
    this.nextClipBtn = document.getElementById('next-clip-btn');

    this.sampleCanvas = document.createElement('canvas');
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });

    this.playlist = [];
    this.currentIndex = 0;
    this.mode = 'hd';
    this.isActive = false;
    this.rafId = null;
    this.toastTimer = null;

    this.bindEvents();
  }

  bindEvents() {
    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });

    this.prevClipBtn.addEventListener('click', () => this.playIndex(this.currentIndex - 1));
    this.nextClipBtn.addEventListener('click', () => this.playIndex(this.currentIndex + 1));

    // Auto-advance to next clip in the ~7-minute Game Reel when current clip finishes
    this.video.addEventListener('ended', () => {
      if (this.currentIndex + 1 < this.playlist.length) {
        this.playIndex(this.currentIndex + 1);
      } else {
        this.showToast('Reel Complete • Replaying from Clip 1');
        this.playIndex(0);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const key = e.key.toLowerCase();
      if (key === 'm') {
        e.preventDefault();
        this.cycleMode();
      } else if (key === 'n') {
        e.preventDefault();
        this.playIndex(this.currentIndex + 1);
      } else if (key === 'p') {
        e.preventDefault();
        this.playIndex(this.currentIndex - 1);
      } else if (key === ' ') {
        e.preventDefault();
        if (this.video.paused) this.video.play();
        else this.video.pause();
      } else if (key === 'j' || e.key === 'ArrowLeft') {
        e.preventDefault();
        this.video.currentTime = Math.max(0, this.video.currentTime - 10);
        this.showToast('⏪ -10s');
      } else if (key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.video.currentTime = Math.min(this.video.duration || 9999, this.video.currentTime + 10);
        this.showToast('⏩ +10s');
      } else if (key === 'f') {
        e.preventDefault();
        this.toggleFullscreen();
      }
    });
  }

  loadReel(clips = []) {
    this.isActive = true;
    this.playlist = clips;
    this.currentIndex = 0;

    this.renderPlaylist();
    if (this.playlist.length > 0) {
      this.playIndex(0, false);
    } else {
      this.clipNowPlayingEl.textContent = 'No video clips available for this matchup';
      this.clipCounterEl.textContent = '0 Clips';
      this.video.removeAttribute('src');
      this.video.load();
    }

    this.setMode(this.mode, false);
    this.startRenderLoop();
  }

  stop() {
    this.isActive = false;
    this.video.pause();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  playIndex(idx, showNotification = true) {
    if (!this.playlist.length) return;
    if (idx < 0) idx = this.playlist.length - 1;
    if (idx >= this.playlist.length) idx = 0;

    this.currentIndex = idx;
    const clip = this.playlist[idx];

    this.video.crossOrigin = 'anonymous';
    this.video.src = clip.mp4Url;
    this.video.play().catch(() => {});

    const totalSec = this.playlist.reduce((acc, c) => acc + (c.duration || 45), 0);
    const totalMin = Math.max(1, Math.round(totalSec / 60));

    this.clipNowPlayingEl.textContent = clip.headline;
    this.clipCounterEl.textContent = `Clip ${idx + 1}/${this.playlist.length} • ~${totalMin}m Reel`;

    Array.from(this.playlistEl.querySelectorAll('.reel-item')).forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      if (i === idx) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });

    if (showNotification) {
      this.showToast(`▶ Clip ${idx + 1}/${this.playlist.length}: ${clip.headline.slice(0, 42)}...`);
    }
  }

  renderPlaylist() {
    if (!this.playlist.length) {
      this.playlistEl.innerHTML = `<div class="empty-note">No video clips attached to this game. Check out the Box Score & Team Stats!</div>`;
      return;
    }

    this.playlistEl.innerHTML = '';
    this.playlist.forEach((clip, idx) => {
      const item = document.createElement('button');
      item.className = `reel-item ${idx === this.currentIndex ? 'active' : ''}`;
      const dur = clip.duration ? `${Math.floor(clip.duration / 60)}:${String(clip.duration % 60).padStart(2, '0')}` : '0:45';
      item.innerHTML = `
        <span class="reel-idx">${idx + 1}</span>
        <div class="reel-info">
          <div class="reel-tag-row">
            <span class="reel-tag">${clip.tag || 'HIGHLIGHT'}</span>
            <span class="reel-dur">${dur}</span>
          </div>
          <div class="reel-headline">${clip.headline}</div>
        </div>
      `;
      item.addEventListener('click', () => this.playIndex(idx, false));
      this.playlistEl.appendChild(item);
    });
  }

  cycleMode() {
    const nextIndex = (MODES.indexOf(this.mode) + 1) % MODES.length;
    this.setMode(MODES[nextIndex], true);
  }

  setMode(newMode, notify = true) {
    this.mode = newMode;
    this.modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === newMode);
    });

    if (newMode === 'hd') {
      this.canvas.style.display = 'none';
      this.video.style.opacity = '1';
      this.canvas.classList.remove('pixel-crisp');
    } else if (newMode === 'pixel') {
      this.canvas.style.display = 'block';
      this.video.style.opacity = '0';
      this.canvas.classList.add('pixel-crisp');
    } else if (newMode === 'ascii') {
      this.canvas.style.display = 'block';
      this.video.style.opacity = '0';
      this.canvas.classList.remove('pixel-crisp');
    }

    if (notify) {
      this.showToast(MODE_LABELS[newMode]);
    }
  }

  startRenderLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);

    const renderFrame = () => {
      if (!this.isActive) return;

      if (this.mode !== 'hd' && this.video.readyState >= 2) {
        try {
          if (this.mode === 'pixel') {
            this.renderPixelFrame();
          } else if (this.mode === 'ascii') {
            this.renderAsciiFrame();
          }
        } catch (_) {
          this.setMode('hd', false);
        }
      }

      this.rafId = requestAnimationFrame(renderFrame);
    };

    this.rafId = requestAnimationFrame(renderFrame);
  }

  renderPixelFrame() {
    const cols = 148;
    const aspect = (this.video.videoHeight || 9) / (this.video.videoWidth || 16);
    const rows = Math.max(64, Math.round(cols * aspect));

    if (this.canvas.width !== cols || this.canvas.height !== rows) {
      this.canvas.width = cols;
      this.canvas.height = rows;
    }

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.video, 0, 0, cols, rows);

    const frame = this.ctx.getImageData(0, 0, cols, rows);
    const data = frame.data;
    for (let y = 0; y < rows; y++) {
      const scanline = y % 2 === 0 ? 1.0 : 0.85;
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        data[i] = Math.min(255, Math.round(data[i] / 36) * 36 * scanline);
        data[i + 1] = Math.min(255, Math.round(data[i + 1] / 36) * 36 * scanline);
        data[i + 2] = Math.min(255, Math.round(data[i + 2] / 36) * 36 * scanline);
      }
    }
    this.ctx.putImageData(frame, 0, 0);
  }

  renderAsciiFrame() {
    const cols = 104;
    const aspect = (this.video.videoHeight || 9) / (this.video.videoWidth || 16);
    const rows = Math.max(34, Math.round(cols * aspect * 0.52));

    if (this.sampleCanvas.width !== cols || this.sampleCanvas.height !== rows) {
      this.sampleCanvas.width = cols;
      this.sampleCanvas.height = rows;
    }

    const cellW = 10;
    const cellH = 18;
    const targetW = cols * cellW;
    const targetH = rows * cellH;

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    this.sampleCtx.drawImage(this.video, 0, 0, cols, rows);
    const pixels = this.sampleCtx.getImageData(0, 0, cols, rows).data;

    this.ctx.fillStyle = '#05070b';
    this.ctx.fillRect(0, 0, targetW, targetH);
    this.ctx.font = 'bold 15px "JetBrains Mono", "SF Mono", monospace';
    this.ctx.textBaseline = 'top';

    const charCount = ASCII_CHARS.length - 1;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = (y * cols + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (luma < 0.04) continue;

        const charIdx = Math.min(charCount, Math.floor(luma * charCount));
        const ch = ASCII_CHARS[charIdx];

        const boost = 1.35;
        const br = Math.min(255, Math.round(r * boost + 20));
        const bg = Math.min(255, Math.round(g * boost + 20));
        const bb = Math.min(255, Math.round(b * boost + 20));

        this.ctx.fillStyle = `rgb(${br},${bg},${bb})`;
        this.ctx.fillText(ch, x * cellW, y * cellH);
      }
    }
  }

  toggleFullscreen() {
    const stage = document.querySelector('.video-stage-wrap');
    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  showToast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 1800);
  }
}
