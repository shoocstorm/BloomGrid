// The New Chapter dialog's showcase overview (D-085, D-103): a rendered bird's-eye of the live founding city.
// Regenerate after changing the founding-city scenario:  bun run showcase
(async () => {
  const g = window.bloomgrid;
  // A clean plate: hide the HUD and Flora's orb for the capture.
  document.getElementById('hud')?.setAttribute('style', 'display:none');
  document.querySelector('.ai-fab')?.setAttribute('style', 'display:none');
  const cam = g.cameraCtl;
  const od = cam.overviewDistance;
  cam.lookAt(256, 268, od * 1.18, true);
  cam.yaw = cam.goalYaw = 0.38;
  cam.pitch = cam.goalPitch = 0.95;
  cam.distance = cam.goalDistance = od * 1.18;
  g.city.timeOfDay = 0.45;
  await new Promise((r) => setTimeout(r, 500)); // let a frame render from the new view
  return g.renderer.domElement.toDataURL('image/webp', 0.85);
})();
