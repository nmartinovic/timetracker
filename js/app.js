// js/app.js
import { initApp } from './ui.js';
import { startCountUp /*, startTimer */ } from './timer.js';

// Boot UI
initApp();

/** Register Service Worker (works on GitHub Pages too). */
if ('serviceWorker' in navigator) {
  // Use a relative path so it also works under a repo subpath on GitHub Pages.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/** Optional: handle deep-link actions (used by PWA shortcuts and OS hotkeys). */
function handleDeepLink() {
  try {
    const url = new URL(window.location.href);
    const action = url.searchParams.get('action') || (location.hash ? location.hash.slice(1) : '');
    if (!action) return;

    if (action === 'countup') {
      // Start Count Up immediately
      setTimeout(() => startCountUp(), 0);
    } else if (action === 'start25') {
      const input = document.getElementById('duration');
      if (input) input.value = 25;
      // If you'd like this to auto-start, uncomment the next two lines:
      // import('./timer.js').then(m => m.startTimer());
    } else if (action === 'start50') {
      const input = document.getElementById('duration');
      if (input) input.value = 50;
      // Optionally auto-start here as well.
    }
  } catch (e) {
    // no-op
  }
}

window.addEventListener('load', handleDeepLink);

/** (Optional) Receive messages from the service worker — e.g., notification actions. */
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.addEventListener('message', (e) => {
//     const msg = e.data || {};
//     if (msg.type === 'NOTIFICATION_ACTION') {
//       // handle SW-triggered actions here (e.g., continue count-up)
//     }
//   });
// }
