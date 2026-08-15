(() => {
  if (!matchMedia('(pointer:fine)').matches) return;
  const cursor = document.createElement('div');
  cursor.className = 'universal-compass-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = '<i></i>';
  document.body.appendChild(cursor);

  let frame = 0;
  let x = innerWidth * .5;
  let y = innerHeight * .35;
  const render = () => {
    document.documentElement.style.setProperty('--compass-x', `${x}px`);
    document.documentElement.style.setProperty('--compass-y', `${y}px`);
    frame = 0;
  };
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    x = event.clientX;
    y = event.clientY;
    document.body.classList.add('universal-pointer-active');
    cursor.classList.toggle('is-action', Boolean(event.target.closest?.('a,button,input,textarea,select,label,[role="button"],[tabindex]')));
    if (!frame) frame = requestAnimationFrame(render);
  }, { passive:true });
  document.addEventListener('pointerdown', (event) => {
    if (!event.pointerType || event.pointerType === 'mouse') cursor.classList.add('is-pressed');
  }, { passive:true });
  document.addEventListener('pointerup', () => cursor.classList.remove('is-pressed'), { passive:true });
  document.documentElement.addEventListener('mouseleave', () => document.body.classList.remove('universal-pointer-active'));
  window.addEventListener('blur', () => document.body.classList.remove('universal-pointer-active'));
})();
