/**
 * The class monitor as one video, for browsers that can float a single video
 * above other windows but not a whole panel (Safari). The four panes are
 * painted onto a canvas several times a second, and the canvas is played by a
 * video element that the browser can put into picture-in-picture.
 *
 * Browsers slow timers in a background tab, so while the teacher is in another
 * window this picture may update only about once a second.
 */
const WIDTH = 640;
const HEIGHT = 360;
const GAP = 6;
const FRAME_MS = 100;
const FONT = '500 15px "Geist", "Helvetica Neue", sans-serif';

const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

/** Whether this browser can float a single video (and has no way to float a whole panel). */
export function canFloatVideo() {
  const video = document.createElement('video');
  return Boolean(document.pictureInPictureEnabled && video.requestPictureInPicture)
    || typeof video.webkitSetPresentationMode === 'function';
}

function drawPane(context, pane, video, x, y, width, height) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = '#141413';
  context.fillRect(x, y, width, height);

  if (video && video.readyState >= 2 && video.videoWidth) {
    // Cover the pane, mirrored like every camera in the room.
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    context.translate(x + width, y);
    context.scale(-1, 1);
    context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    const radius = Math.min(width, height) * 0.18;
    context.fillStyle = '#3d3c39';
    context.beginPath();
    context.arc(x + width / 2, y + height / 2 - 8, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#efeeea';
    context.font = `600 ${Math.round(radius * 0.8)}px "Geist", "Helvetica Neue", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(initials(pane.name), x + width / 2, y + height / 2 - 8);
  }

  // Name, with the microphone state in words since there is no room for icons at this size.
  const label = `${pane.name}${pane.muted ? ' · mic off' : ''}`;
  context.font = FONT;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  const labelWidth = Math.min(width - 16, context.measureText(label).width + 16);
  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.fillRect(x + 8, y + height - 34, labelWidth, 26);
  context.fillStyle = '#ffffff';
  context.fillText(label, x + 16, y + height - 21, labelWidth - 16);
  context.restore();

  if (pane.isSpeaking) {
    context.strokeStyle = '#34d399';
    context.lineWidth = 5;
    context.strokeRect(x + 2.5, y + 2.5, width - 5, height - 5);
  }
}

/**
 * Starts painting. `getPanes` returns the current panes (`name`, `stream`,
 * `muted`, `isSpeaking`) and `getStatus` a line for when there are none.
 * Returns `{ float, stop }`: call `float()` directly from a click to open the
 * floating video, and `stop()` when the monitor closes.
 */
export function createCompositeVideo({ getPanes, getStatus, onFloatingChange }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  // One hidden player per camera stream, to read frames from.
  const players = new Map();

  const playerFor = (stream) => {
    let player = players.get(stream);
    if (!player) {
      player = document.createElement('video');
      player.muted = true;
      player.playsInline = true;
      player.srcObject = stream;
      player.play().catch(() => {});
      players.set(stream, player);
    }
    return player;
  };

  const paint = () => {
    const panes = getPanes();
    const live = new Set(panes.map((pane) => pane.stream).filter(Boolean));
    for (const [stream, player] of players) {
      if (!live.has(stream)) {
        player.srcObject = null;
        players.delete(stream);
      }
    }
    context.fillStyle = '#0b0b0a';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    if (!panes.length) {
      context.fillStyle = '#a8a7a2';
      context.font = FONT;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(getStatus(), WIDTH / 2, HEIGHT / 2);
      return;
    }
    const columns = panes.length === 1 ? 1 : 2;
    const rows = Math.ceil(panes.length / columns);
    const width = (WIDTH - GAP * (columns + 1)) / columns;
    const height = (HEIGHT - GAP * (rows + 1)) / rows;
    panes.forEach((pane, index) => {
      const x = GAP + (index % columns) * (width + GAP);
      const y = GAP + Math.floor(index / columns) * (height + GAP);
      drawPane(context, pane, pane.stream ? playerFor(pane.stream) : null, x, y, width, height);
    });
  };

  paint();
  const timer = window.setInterval(paint, FRAME_MS);

  // The video has to be in the page, playing, before a browser will float it.
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '0', bottom: '0' });
  video.srcObject = canvas.captureStream(1000 / FRAME_MS);
  document.body.appendChild(video);
  video.play().catch(() => {});

  const entered = () => onFloatingChange(true);
  const left = () => onFloatingChange(false);
  const presentationChanged = () => onFloatingChange(video.webkitPresentationMode === 'picture-in-picture');
  video.addEventListener('enterpictureinpicture', entered);
  video.addEventListener('leavepictureinpicture', left);
  video.addEventListener('webkitpresentationmodechanged', presentationChanged);

  return {
    /** Must be called directly from a click, or the browser refuses. */
    async float() {
      if (video.requestPictureInPicture) await video.requestPictureInPicture();
      else video.webkitSetPresentationMode('picture-in-picture');
    },
    async dock() {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode('inline');
    },
    stop() {
      window.clearInterval(timer);
      this.dock().catch(() => {});
      video.removeEventListener('enterpictureinpicture', entered);
      video.removeEventListener('leavepictureinpicture', left);
      video.removeEventListener('webkitpresentationmodechanged', presentationChanged);
      for (const track of video.srcObject?.getTracks() ?? []) track.stop();
      video.srcObject = null;
      video.remove();
      for (const player of players.values()) player.srcObject = null;
      players.clear();
    },
  };
}
