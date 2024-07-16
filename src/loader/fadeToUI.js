// @ts-check

const DEFAULT_FADE_TIME = 500;

/**
 * @param {HTMLIFrameElement} boot
 * @param {HTMLIFrameElement} shell
 * @param {number} [time]
 */
export async function fadeToUI(boot, shell, time) {
  shell.style.opacity = '0';
  shell.style.display = 'block';

  await new Promise(resolve => setTimeout(resolve, 1));

  const start = Date.now();
  const fadeinTime = Math.min(DEFAULT_FADE_TIME, (start - (timings.domStarted || 0)) / 2);

  shell.style.transition = 'opacity ' + fadeinTime.toFixed() + 'ms ease-in-out';
  boot.style.transition = 'opacity ' + fadeinTime.toFixed() + 'ms ease-in-out';

  await new Promise(resolve => setTimeout(resolve, 1));

  shell.style.opacity = '1';
  boot.style.opacity = '0';
  shell.style.pointerEvents = 'none';
  boot.style.pointerEvents = 'none';

  await new Promise(resolve => setTimeout(resolve, fadeinTime));

  boot.style.display = 'none';
  shell.style.pointerEvents = 'auto';

  await new Promise(resolve => setTimeout(resolve, 1));

  boot.style.transition = '';
  shell.style.transition = '';

} // fadeToUI
