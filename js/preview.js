// On a laptop, buttons to show the app at the size of a phone, to check
// that the layout fits. The app runs in a frame the size of the phone's
// screen, so its short- and narrow-screen styles apply as on the phone.
// Not shown on phones and tablets (no mouse), in narrow windows, or
// inside the frame itself. No problem logic.

const PREVIEW_KEY = 'bridge-practicer-preview';
// Each phone's screen in points, and the room its status bar (top) and
// home indicator (bottom) take, which the app doesn't draw in.
const PHONES = {
  mini: { name: 'iPhone 12 mini', width: 375, height: 812, top: 50, bottom: 34 },
  'mini-zoom': { name: '12 mini, Larger Text', width: 320, height: 693, top: 43, bottom: 29 },
};

// The chosen phone is a convenience: without storage, it's the window.
function loadChoice() {
  try {
    return localStorage.getItem(PREVIEW_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveChoice(choice) {
  try {
    localStorage.setItem(PREVIEW_KEY, choice);
  } catch {}
}

// Shows the preview buttons if this is a laptop. Returns true if a phone
// is chosen, in which case the app runs in the frame instead of here.
export function startPreview() {
  const laptop = window.top === window
    && matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)').matches;
  if (!laptop) return false;

  const choice = PHONES[loadChoice()] ? loadChoice() : '';
  const button = (key, name) =>
    `<button data-preview="${key}" aria-pressed="${key === choice}">${name}</button>`;
  const bar = document.createElement('nav');
  bar.className = 'preview-bar';
  bar.setAttribute('aria-label', 'Preview at phone size');
  bar.innerHTML = [button('', 'Window'), ...Object.entries(PHONES).map(([key, { name }]) => button(key, name))].join('');
  // A new choice reloads the page, which starts the app afresh at that size.
  bar.addEventListener('click', (event) => {
    const key = event.target.closest('[data-preview]')?.dataset.preview;
    if (key === undefined || key === choice) return;
    saveChoice(key);
    location.reload();
  });
  document.body.prepend(bar);
  if (!choice) return false;

  const phone = PHONES[choice];
  document.getElementById('app').remove();
  const frame = document.createElement('div');
  frame.className = 'phone';
  frame.innerHTML = `
    <div style="height: ${phone.top}px"></div>
    <iframe title="${phone.name}" src="${location.href}"
      style="width: ${phone.width}px; height: ${phone.height - phone.top - phone.bottom}px"></iframe>
    <div class="home-indicator" style="height: ${phone.bottom}px"></div>`;
  document.body.append(frame);
  return true;
}
