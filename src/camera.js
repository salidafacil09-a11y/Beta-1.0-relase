(function (G) {
  'use strict';

  // Cámara en tercera persona sobre el hombro. Se acerca al apuntar y se
  // pega al personaje cuando hay paredes, techos o árboles detrás.

  const U = G.Util;
  const HEAD = 1.5;
  const DIST = 2.15, DIST_AIM = 1.4;       // cerca, como en los juegos de supervivencia de cámara al hombro
  const SHOULDER = 0.62, SHOULDER_AIM = 0.7; // el personaje queda a la izquierda del encuadre
  const PITCH_MIN = -0.45, PITCH_MAX = 1.05;

  const Cam = {
    yaw: Math.PI,      // mirando hacia -Z al empezar (hacia la puerta de la casa inicial)
    pitch: 0.14,
    dist: DIST,
    shoulder: SHOULDER,
    camera: null,
    near: false,        // la cámara quedó muy cerca del personaje
    dir: new THREE.Vector3(),
    pos: new THREE.Vector3(),

    init(camera) { this.camera = camera; },

    // Sacudida breve al golpear (se apaga sola)
    shakeAmt: 0,
    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); },

    // Retroceso de un disparo: la mira sube; una parte vuelve sola y otra se queda
    kickOff: 0,
    kick(a) {
      this.kickOff -= a * 0.7;
      this.pitch = U.clamp(this.pitch - a * 0.3, PITCH_MIN, PITCH_MAX);
      this.yaw += (Math.random() - 0.5) * a * 0.25;
    },

    forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; },
    right() { return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) }; },

    update(dt, player, input, sens) {
      sens = sens || 1;
      this.yaw -= input.look.x * sens;
      this.pitch = U.clamp(this.pitch + input.look.y * sens, PITCH_MIN, PITCH_MAX);
      const aiming = player.aiming;

      // Plano de cine durante el remate: la cámara se va a un lado del personaje
      const cine = !!(player.action && player.action.kind === 'finisher');
      if (cine && !this.cineOn) {
        const a1 = player.facing + 1.35, a2 = player.facing - 1.35;
        this.cineSide = Math.abs(U.angleDiff(a1, this.yaw)) < Math.abs(U.angleDiff(a2, this.yaw)) ? 1.35 : -1.35;
      }
      this.cineOn = cine;
      this.cine = (this.cine || 0) + ((cine ? 1 : 0) - (this.cine || 0)) * Math.min(1, dt * 4.5);
      const w = U.smooth(this.cine);
      const yawE = this.yaw + U.angleDiff(player.facing + (this.cineSide || 1.35), this.yaw) * w;
      this.kickOff *= Math.exp(-dt * 9);
      const pitchE = U.lerp(U.clamp(this.pitch + this.kickOff, PITCH_MIN, PITCH_MAX), 0.42, w);
      const wantD = U.lerp(aiming ? DIST_AIM : DIST, 2.6, w);
      const wantS = U.lerp(aiming ? SHOULDER_AIM : SHOULDER, 0, w);
      this.shoulder += (wantS - this.shoulder) * Math.min(1, dt * 8);

      const f = { x: Math.sin(yawE), z: Math.cos(yawE) }, r = { x: -Math.cos(yawE), z: Math.sin(yawE) };
      const cp = Math.cos(pitchE), sp = Math.sin(pitchE);
      // dirección de la mirada (adelante y un poco hacia abajo)
      this.dir.set(f.x * cp, -sp, f.z * cp);
      const hx = player.pos.x, hz = player.pos.z;
      const hy = player.y + HEAD - 0.42 * (player.crouchAmt || 0) - 1.0 * (player.proneAmt || 0) - 0.35 * w;
      // posición deseada
      const tx = hx + r.x * this.shoulder - this.dir.x * wantD;
      const ty = hy - this.dir.y * wantD + 0.12;
      const tz = hz + r.z * this.shoulder - this.dir.z * wantD;
      // planta para las paredes: la del jugador (en la escalera, la de arriba en cuanto sube un poco)
      const st = G.World.stairAt(hx, hz);
      const lv = st ? (G.World.stairProgress(st, hx, hz) > 0.3 ? 1 : 0) : (player.lv || 0);
      const free = sweep(hx, hy, hz, tx, ty, tz, lv);
      const d = Math.max(0.05, free * wantD);
      if (d < this.dist) this.dist = d;                       // acercarse rápido
      else this.dist += (d - this.dist) * Math.min(1, dt * 5); // alejarse suave
      const k = this.dist / wantD;
      this.pos.set(hx + (tx - hx) * k, hy + (ty - hy) * k, hz + (tz - hz) * k);
      this.camera.position.copy(this.pos);
      this.camera.lookAt(this.pos.x + this.dir.x, this.pos.y + this.dir.y, this.pos.z + this.dir.z);
      if (this.shakeAmt > 0.002) {
        const s = this.shakeAmt;
        this.camera.rotation.x += (Math.random() - 0.5) * 0.09 * s;
        this.camera.rotation.y += (Math.random() - 0.5) * 0.09 * s;
        this.camera.position.y += (Math.random() - 0.5) * 0.05 * s;
        this.shakeAmt *= Math.exp(-dt * 14);
      } else this.shakeAmt = 0;
      this.near = this.dist < 0.55;
    }
  };

  // Devuelve la fracción libre (0 a 1) del recorrido cabeza -> cámara
  function sweep(x0, y0, z0, x1, y1, z1, lv) {
    const W = G.World, E = W.E;
    const base = lv ? W.FLOOR_H : 0;          // suelo de la planta
    const ceil = base + W.WALL_H - 0.18;
    const steps = 32;
    let px = x0, pz = z0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
      const tx = Math.floor(x), tz = Math.floor(z);
      const ptx = Math.floor(px), ptz = Math.floor(pz);
      let hit = false;
      // aristas cruzadas en este paso
      const yl = y - base;
      const test = (e) => {
        if (e === E.NONE) return false;
        if (e === E.FENCE) return yl < W.FENCE_H + 0.1;
        if (e === E.RAIL) return yl < 1.0;
        if (e === E.DOOR_OPEN || e === E.DOOR_BROKEN || e === E.ARCH) return yl > W.DOOR_H - 0.15;
        if (e === E.GATE) return yl > 2.45;
        return true;
      };
      if (tx !== ptx || tz !== ptz) hit = W.lineBlocked(px, pz, x, z, test, lv);
      // techo (sobre la escalera no hay techo hasta la planta de arriba)
      const inside = W.isIndoor(tx, tz, lv);
      const c2 = W.stairAt(x, z) ? W.FLOOR_H + W.WALL_H - 0.18 : ceil;
      if (!hit && inside && y > c2) hit = true;
      if (!hit && lv && !inside && W.isIndoor(ptx, ptz, lv)) hit = true;     // arriba no se sale por las paredes
      if (!hit && W.isIndoor(ptx, ptz, lv) && !inside && yl > W.DOOR_H) hit = true;
      // distancia mínima a paredes y troncos
      if (!hit && yl < W.WALL_H + 0.2 && W.circleBlocked(x, z, 0.16, lv, true)) hit = true;
      // muebles y vehículos: solo si la cámara queda por debajo de su altura
      if (!hit && y < W.furnTop(x, z, lv, 0.12)) hit = true;
      if (!hit && yl < W.DOOR_H + 0.05 && W.nearDoorLeaf(x, z, 0.14, lv)) hit = true;
      if (hit) return Math.max(0, (i - 1.6) / steps);
      px = x; pz = z;
    }
    return 1;
  }

  G.Camera = Cam;
})(window.Game = window.Game || {});
