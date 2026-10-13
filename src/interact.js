(function (G) {
  'use strict';

  // Busca con qué puede interactuar el jugador (puertas, ventanas, vallas,
  // interruptores y armas en el suelo) y ejecuta la acción.

  const U = G.Util;
  const REACH = 1.45;

  function label(t) {
    return t ? t.label : '';
  }

  function find(player, camF) {
    const W = G.World, E = W.E;
    if (player.dead || player.busy()) return null;
    const px = player.pos.x, pz = player.pos.z, lv = player.lv || 0;
    const look = Math.atan2(camF.x, camF.z);
    let best = null, bestScore = Infinity;
    const consider = (x, z, data, maxD) => {
      const d = Math.hypot(x - px, z - pz);
      if (d > (maxD || REACH)) return;
      const a = Math.abs(U.angleDiff(Math.atan2(x - px, z - pz), look));
      if (a > 1.25 && d > 0.75) return;
      const score = d + a * 0.7;
      if (score < bestScore) { bestScore = score; best = data; best.x = x; best.z = z; }
    };

    // Aristas cercanas
    const tx0 = Math.floor(px) - 2, tz0 = Math.floor(pz) - 2;
    for (let tz = tz0; tz <= tz0 + 4; tz++) {
      for (let tx = tx0; tx <= tx0 + 4; tx++) {
        for (const o of ['N', 'W']) {
          const e = o === 'N' ? W.eN(tx, tz, lv) : W.eW(tx, tz, lv);
          if (!e) continue;
          const ref = { o, x: tx, z: tz, lv };
          const mx = o === 'N' ? tx + 0.5 : tx, mz = o === 'N' ? tz : tz + 0.5;
          let lab = null, kind = null;
          if (e === E.DOOR) { lab = 'Abrir puerta'; kind = 'door'; }
          else if (e === E.DOOR_OPEN) { lab = 'Cerrar puerta'; kind = 'door'; }
          else if (e === E.WIN) { lab = 'Abrir ventana'; kind = 'window'; }
          else if (e === E.WIN_OPEN) { lab = 'Cerrar ventana'; kind = 'window'; }
          else if (e === E.WIN_BROKEN) { if (lv) continue; lab = 'Saltar por la ventana rota'; kind = 'climb'; }
          else if (e === E.FENCE) { lab = 'Saltar la valla'; kind = 'fence'; }
          if (!lab) continue;
          // climbable: se puede saltar con el botón Saltar (X en el teclado)
          // arriba no se salta por las ventanas
          consider(mx, mz, { kind, label: lab, ref, e, climbable: !lv && (e === E.WIN_OPEN || e === E.WIN_BROKEN || e === E.FENCE) }, kind === 'door' ? REACH + 0.1 : REACH);
        }
      }
    }

    // Interruptores de la habitación en la que estás (o de la de al lado, si los ves)
    const cx0 = Math.floor((px - 3) / W.CS), cx1 = Math.floor((px + 3) / W.CS);
    const cz0 = Math.floor((pz - 3) / W.CS), cz1 = Math.floor((pz + 3) / W.CS);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = W.chunkAt(cx, cz);
        for (const b of c.buildings) {
          if (px < b.x0 - 2 || pz < b.z0 - 2 || px > b.x0 + b.w + 2 || pz > b.z0 + b.h + 2) continue;
          for (const r of b.rooms) {
            if (!r.sw || (r.lv || 0) !== lv) continue;
            const p = G.WorldView.switchPoint(r);
            if (Math.hypot(p.x - px, p.z - pz) > REACH) continue;
            // tienes que estar del lado de la habitación
            if (!W.hasLOS(px, pz, p.x + p.nx * 0.05, p.z + p.nz * 0.05, lv)) continue;
            consider(p.x, p.z, { kind: 'switch', label: r.on ? 'Apagar luz' : 'Encender luz', room: r });
          }
        }
      }
    }

    // Muebles y vehículos que se pueden registrar
    for (const { f } of W.furnNear(px, pz, 1.5, lv)) {
      if (!f.cont || f.cont.searched) continue;
      const fp = G.Furniture.frontPoint(f);
      if (Math.hypot(fp.x - px, fp.z - pz) > 1.7) continue;
      if (!W.hasLOS(px, pz, fp.x, fp.z, lv)) continue;
      const qx = U.clamp(px, f.x0, f.x1), qz = U.clamp(pz, f.z0, f.z1);
      consider(qx, qz, { kind: 'search', label: 'Registrar ' + f.cont.name.charAt(0).toLowerCase() + f.cont.name.slice(1), f }, 1.5);
    }

    // Armas en el suelo
    for (const { c, it } of W.itemsNear(px, pz, 1.3, lv)) {
      if (!W.hasLOS(px, pz, it.x, it.z, lv)) continue;
      const nm = G.Weapons.nameOf(it.id) + (G.Weapons.ammoOfItem(it.id) ? ' (' + it.cond + ')' : '');
      consider(it.x, it.z, { kind: 'item', label: 'Coger ' + nm, c, it }, 1.3);
    }
    return best;
  }

  // Devuelve un mensaje para mostrar (o null)
  function use(t, player) {
    const W = G.World, E = W.E;
    if (!t) return null;
    if (t.kind === 'door') {
      const e = W.edgeGet(t.ref);
      W.setEdge(t.ref, e === E.DOOR ? E.DOOR_OPEN : E.DOOR);
      W.emit(t.x, t.z, 3 * player.noiseMul, player.lv);
      return null;
    }
    if (t.kind === 'window') {
      W.setEdge(t.ref, W.edgeGet(t.ref) === E.WIN ? E.WIN_OPEN : E.WIN);
      W.emit(t.x, t.z, 2 * player.noiseMul, player.lv);
      return null;
    }
    if (t.kind === 'climb' || t.kind === 'fence') {
      if (!player.startClimb(t.ref, t.kind === 'fence' ? 'fence' : 'window')) return 'No hay sitio al otro lado';
      W.emit(t.x, t.z, 2.5 * player.noiseMul);
      return null;
    }
    if (t.kind === 'search') {
      player.startSearch(t.f);
      return null;
    }
    if (t.kind === 'switch') {
      W.toggleLight(t.room);
      return null;
    }
    if (t.kind === 'item' && G.Weapons.isItem(t.it.id)) {
      // munición y accesorios: a la mochila
      W.removeItem(t.c, t.it);
      return player.takeItem(t.it.id, t.it.cond);
    }
    if (t.kind === 'item') {
      W.removeItem(t.c, t.it);
      const r = player.pickUp(t.it.id, t.it.cond);
      if (r.dropped) W.dropItem(player.pos.x, player.pos.z, r.dropped.id, r.dropped.cond, player.lv);
      const w = G.Weapons.get(t.it.id);
      let msg = 'Cogiste: ' + w.name;
      if (G.Weapons.isGun(w) && t.it.cond > 0) msg += w.gun === 'bow' ? ' (con una flecha puesta)' : ' (' + t.it.cond + ' en el cargador)';
      if (r.dropped) msg += ' (soltaste ' + G.Weapons.get(r.dropped.id).name + ')';
      else if (!r.equipped) msg += ' · al bolsillo';
      return msg;
    }
    return null;
  }

  // Saltar por una ventana abierta o rota, o una valla
  function climb(t, player) {
    if (!t || !t.climbable) return null;
    if (!player.startClimb(t.ref, t.e === G.World.E.FENCE ? 'fence' : 'window')) return 'No hay sitio al otro lado';
    G.World.emit(t.x, t.z, 2.5 * player.noiseMul);
    return null;
  }

  // Termina de registrar un mueble: la munición va a la mochila; las armas quedan delante para cogerlas
  function finishSearch(player, f) {
    const W = G.World;
    if (!f || !f.cont || f.cont.searched) return null;
    f.cont.searched = true;
    const items = f.cont.items;
    if (!items.length) return 'No hay nada útil';
    const got = [];
    const fp = G.Furniture.frontPoint(f);
    let k = 0;
    for (const id of items) {
      if (G.Weapons.isItem(id)) {
        const n = G.Weapons.stackSize(id);
        player.takeItem(id, n);
        const a = G.Weapons.ammoOfItem(id);
        got.push(a ? n + ' ' + G.Weapons.AMMO[a].name : 'un silenciador');
      } else {
        const w = G.Weapons.get(id);
        const cond = G.Weapons.isGun(w) ? Math.max(w.gun === 'bow' ? 0 : 1, Math.floor(Math.random() * (w.mag + 1))) : 0.5 + Math.random() * 0.5;
        const a = (k++ - (items.length - 1) / 2) * 0.35;
        const dx = fp.x - (f.x0 + f.x1) / 2, dz = fp.z - (f.z0 + f.z1) / 2, L = Math.hypot(dx, dz) || 1;
        W.dropItem(fp.x - dz / L * a, fp.z + dx / L * a, id, cond, f.lv || 0);
        got.push(w.name.toLowerCase());
      }
    }
    return 'Encontraste: ' + got.join(', ');
  }

  G.Interact = { find, use, label, climb, finishSearch };
})(window.Game = window.Game || {});
