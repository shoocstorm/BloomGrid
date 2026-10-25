// Green Weaver & reclamation drill: weaves sky-bridges between the first canopy towers that are
// close enough, merges one with a banyan, reclaims a strip of shallow coast and raises the sea a
// little (`window.NORECLAIM = 1` frames the same coast without filling it). `window.NEAR` sets the camera distance; `window.FOCUS = 'coast'` frames the new land.
(() => {
  const g = window.bloomgrid;
  const c = g.city;
  c.credits = 1e6;
  const towers = c.buildingEntities().filter((e) => c.buildingDef(e).tower).map((e) => c.buildingRecord(e));
  let woven = 0;
  let focus = towers[0];
  outer: for (const a of towers)
    for (const b of towers) {
      if (a === b) continue;
      if (g.commands.execute('weave', { a: [a.x, a.z], b: [b.x, b.z] })) {
        woven++;
        focus = a;
        g.commands.execute('banyan', { x: a.x, z: a.z });
        if (woven >= 3) break outer;
      }
    }
  // Reclaim a substantial patch of shallow coast east of the downtown (≥ 25 tiles' worth of cost).
  let coast = null;
  for (let z = Math.round(c.size * 0.6); z < c.size * 0.8 && !coast; z += 2)
    for (let x = Math.round(c.size * 0.6); x < c.size * 0.95; x += 2) {
      const before = c.credits;
      if (!g.commands.execute('reclaim', { x0: x, z0: z, x1: x + 10, z1: z + 10 })) continue;
      if (before - c.credits < 1200) {
        g.commands.undo();
        continue;
      }
      if (window.NORECLAIM) g.commands.undo();
      coast = { x: x + 5, z: z + 5 };
      break;
    }
  c.steward.seaRise = 0.25;
  const at = window.FOCUS === 'coast' && coast ? coast : { x: focus.x + 1, z: focus.z + 1 };
  const frame = () => {
    c.timeOfDay = window.NIGHT ? 0.9 : 0.42;
    g.cameraCtl.lookAt(at.x, at.z, window.NEAR ?? 26, true);
  };
  frame();
  [2000, 4000].forEach((t) => setTimeout(frame, t));
  return { woven, coast, towers: towers.length };
})();
