(function (G) {
  'use strict';

  const U = G.Util;

  // Zombis lentos. Ajusta estos valores para cambiar la dificultad.
  const SIGHT_RANGE = 14;
  const CROUCH_SIGHT = 6;        // a un jugador agachado solo lo ven hasta esta distancia
  const PRONE_SIGHT = 3.5;       // tumbado, aún más cerca
  const NOTICE_TIME = 1.0;       // segundos que tienen que mirarte para notarte agachado
  const FOV_HALF = 0.8;          // solo ven de frente (~92°)
  const WANDER_SPEED = 0.42;
  const INVESTIGATE_SPEED = 0.62;
  const CHASE_SPEED = 0.95;      // más lentos que el jugador caminando
  const REACH = 0.95;            // distancia a la que intentan agarrarte
  const WINDUP = 0.9;            // preparación del ataque: larga y clara, se puede esquivar
  const RADIUS = 0.28;
  const HP_MIN = 2.4, HP_MAX = 3.4;   // vida de cada zombi
  // Corredores: una parte de los zombis es agresiva (ven más lejos, te notan antes,
  // corren casi como tú, chillan al verte y se lanzan a por ti). El resto, lentos.
  const RUNNER_CHANCE = 0.25;
  const RUNNER = { chase: 3.1, sight: 18, notice: 0.45, windup: 0.5, reach: 1.25, lunge: 1.1, hp: [2.0, 2.8], scream: 12 };

  // piel pálida y enfermiza, entre gris, verde y amarillo
  const SKINS = [0x9aa08a, 0xa3a690, 0x8c957f, 0xb0ad98, 0x9a9580, 0x87907c, 0xa59f8c];
  const SHIRTS = [0x5a4a3a, 0x6b5d4f, 0x4a5560, 0x6e4b4b, 0x55603f, 0x7a7a72, 0x3f4a5a, 0x8a7a5a, 0x5e3f3f, 0x9a9488];
  const PANTS = [0x2f3340, 0x3b3a33, 0x4a4036, 0x28303a, 0x3d4a5a, 0x5a5448];
  const HAIR = [0x2a2018, 0x3a2a1c, 0x5a4630, 0x1a1a1a, 0x7a6a5a, null, null];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // estados en los que un ruido no le hace cambiar de idea
  const BUSY = { dead: 1, down: 1, rise: 1, stagger: 1, attack: 1, recover: 1, climb: 1, chase: 1, bang: 1, grabbed: 1, alert: 1 };

  function randomLook() {
    const fungus = Math.random() < 0.4 ? 0 : (Math.random() < 0.65 ? 1 : 2);
    return {
      fungus, facePlate: fungus === 2 && Math.random() < 0.6,
      belt: Math.random() < 0.4 ? 0x2e2620 : null, pocket: Math.random() < 0.5,
      skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR),
      longHair: Math.random() < 0.3, longSleeves: Math.random() < 0.4,
      shoes: pick([0x2a2622, 0x3b3029, 0x4a4a4a, 0x5a4636]),
      seed: Math.floor(Math.random() * 1e9), drag: Math.random() < 0.3,
      armsUp: Math.random() < 0.35 ? 0.6 : 0,
      runner: Math.random() < RUNNER_CHANCE
    };
  }

  class Zombie {
    constructor(scene, x, z, look, facing, extra) {
      this.scene = scene;
      this.pos = { x, z };
      this.lv = (extra && extra.lv) || 0;
      this.y = G.World.groundY(x, z, this.lv);
      this.facing = facing != null ? facing : Math.random() * Math.PI * 2;
      this.look = look || randomLook();
      // los corredores: menos hongo y más sangre, no arrastran la pierna
      if (this.look.runner) { this.look.fungus = Math.min(this.look.fungus, 1); this.look.facePlate = false; this.look.drag = false; this.look.armsUp = 0; }
      this.runner = !!this.look.runner;
      this.model = G.Models.createHumanoid(Object.assign({ zombie: true, blood: U.mulberry32(this.look.seed) }, this.look));
      scene.add(this.model.root);
      this.hp = extra && extra.hp != null ? extra.hp
        : (this.runner ? RUNNER.hp[0] + Math.random() * (RUNNER.hp[1] - RUNNER.hp[0]) : HP_MIN + Math.random() * (HP_MAX - HP_MIN));
      this.state = 'idle';
      this.timer = 1 + Math.random() * 3;
      this.target = null;
      this.lastSeen = 0;
      this.hearTimer = 0;
      this.path = null; this.pathTimer = 0; this.clear = true; this.clearTimer = 0;
      this.stuck = 0;
      this.phase = Math.random() * 10;
      this.speedNow = 0;
      this.reach = 0;
      this.notice = 0;
      this.stagger = 0;
      this.kb = { x: 0, z: 0 };
      this.fall = 0;          // 0 de pie, 1 en el suelo
      this.fallDir = -1;
      this.edge = null;
      this.climbing = null;
      this.bangT = 0;
      this.resume = 'chase';
      this.tilt = (Math.random() - 0.5) * 1.6;
      this.lean = (Math.random() - 0.5) * 0.12;
      if (extra && extra.dead) { this.state = 'dead'; this.fall = 1; this.fallDir = extra.fallDir || -1; }
      // los que aparecen dentro de una casa no salen de su habitación hasta oír un ruido
      this.homebound = !!(extra && extra.homebound);
      if (this.homebound) { const r = G.World.roomAt(Math.floor(x), Math.floor(z), this.lv); this.homeRoom = r; if (!r) this.homebound = false; }
      this.apply(0);
    }

    get alive() { return this.state !== 'dead'; }
    get downed() { return this.state === 'down' || (this.state === 'rise' && this.timer > 0.6); }
    get standing() { return this.alive && !this.downed && this.state !== 'rise'; }

    dispose() {
      this.scene.remove(this.model.root);
      G.Models.disposeHumanoid(this.model);
    }

    enter(state, timer) {
      this.state = state;
      this.timer = timer || 0;
      this.exposed = false;
      this.pathTimer = 0;
      this.clearTimer = 0;
      this.stuck = 0;
    }

    aware() {
      return this.state === 'chase' || this.state === 'attack' || this.state === 'recover' || this.state === 'alert';
    }

    // Un ruido en (x, z) con alcance r
    hear(x, z, r, lv) {
      if (BUSY[this.state]) return;
      lv = lv || 0;
      const other = lv !== (this.lv || 0);
      if (other) r *= 0.55;                      // de otra planta se oye peor
      const d = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (d > r) return;
      if (!other && d > r * 0.6 && !G.World.hasLOS(this.pos.x, this.pos.z, x, z, this.lv)) return;
      this.homebound = false;
      this.target = { x: x + (Math.random() - 0.5) * 2, z: z + (Math.random() - 0.5) * 2, lv };
      this.enter('investigate', 14);
    }

    // ---------- Golpes recibidos ----------
    // dx, dz: dirección del golpe (desde el atacante hacia el zombi)
    takeHit(dmg, knock, dx, dz, behind, side) {
      if (!this.alive) return 'none';
      this.hp -= dmg;
      this.flinch = side || (Math.random() < 0.5 ? 1 : -1);   // hacia qué lado se dobla al recibir el golpe
      // caer hacia donde lo empujan: de espaldas si le pegan de frente, boca abajo si es por detrás
      const dir = behind ? 1 : -1;
      if (this.hp <= 0) { this.die(dir); return 'kill'; }
      if (this.downed) return 'hit';
      if (Math.random() < knock + (behind ? 0.25 : 0)) { this.knockDown(dir, dx, dz); return 'down'; }
      this.doStagger(dx, dz, 1.6);
      return 'hit';
    }

    doStagger(dx, dz, force) {
      const l = Math.hypot(dx, dz) || 1;
      this.kb.x = dx / l * force; this.kb.z = dz / l * force;
      this.reach = 0;
      this.edge = null;
      this.enter('stagger', 0.55);
      this.stagger = 0.001;
    }

    // extra: segundos de más en el suelo (el empujón añade 2)
    knockDown(dir, dx, dz, extra) {
      const l = Math.hypot(dx, dz) || 1;
      this.kb.x = dx / l * 1.2; this.kb.z = dz / l * 1.2;
      this.fallDir = dir;
      this.reach = 0;
      this.edge = null;
      this.homebound = false;
      this.enter('down', 2.5 + Math.random() * 2 + (extra || 0));
    }

    // Agarrado por la espalda: se queda delante del jugador forcejeando hasta morir
    grab(player) {
      this.grabber = player;
      this.reach = 0;
      this.edge = null;
      this.path = null;
      this.homebound = false;
      this.enter('grabbed', 0);
    }

    release() {
      this.grabber = null;
      this.target = null;
      this.doStagger(Math.sin(this.facing), Math.cos(this.facing), 1.5);
    }

    die(dir) {
      this.fallDir = dir;
      this.reach = 0;
      this.edge = null;
      this.state = 'dead';
      this.timer = 0;
    }

    // ---------- IA ----------
    update(dt, player, all, combat) {
      if (this.state === 'dead') {
        this.fall = Math.min(1, this.fall + dt * 2.2);
        this.knockback(dt);
        this.apply(dt);
        return;
      }
      const px = player.pos.x, pz = player.pos.z;
      const dx = px - this.pos.x, dz = pz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      let speed = 0;
      const plv = player.lv || 0;
      const sameLv = plv === (this.lv || 0);

      // estados sin control
      if (this.state === 'grabbed') {
        const p = this.grabber, a = p && p.action;
        if (!p || p.dead || !a || a.kind !== 'grab' || a.target !== this) { this.release(); this.apply(dt); return; }
        const f = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
        const tx = p.pos.x + f.x * 0.36, tz = p.pos.z + f.z * 0.36;
        const k = Math.min(1, dt * 14);
        this.pos.x += (tx - this.pos.x) * k; this.pos.z += (tz - this.pos.z) * k;
        this.facing = U.turnToward(this.facing, p.facing, 12 * dt);
        this.grabT = Math.min(1, a.t);
        this.speedNow = 0;
        this.apply(dt);
        return;
      }
      if (this.state === 'stagger') {
        this.timer -= dt;
        this.stagger = 1 - this.timer / 0.55;
        this.knockback(dt);
        if (this.timer <= 0) { this.stagger = 0; this.enter(this.target ? 'chase' : 'idle', 0); }
        this.apply(dt);
        return;
      }
      if (this.state === 'down') {
        this.fall = Math.min(1, this.fall + dt * 2.5);
        this.knockback(dt);
        this.timer -= dt;
        if (this.timer <= 0) this.enter('rise', 1.3);
        this.apply(dt);
        return;
      }
      if (this.state === 'rise') {
        this.timer -= dt;
        this.fall = Math.max(0, this.timer / 1.3);
        if (this.timer <= 0) { this.fall = 0; this.enter('chase', 0); this.target = { x: px, z: pz, lv: plv }; }
        this.apply(dt);
        return;
      }
      if (this.state === 'climb') {
        const c = this.climbing;
        c.t += dt / c.dur;
        const t = Math.min(1, c.t);
        this.pos.x = U.lerp(c.x0, c.x1, U.smooth(t));
        this.pos.z = U.lerp(c.z0, c.z1, U.smooth(t));
        this.lift = Math.sin(Math.PI * t) * 0.6;
        if (c.t >= 1) { this.lift = 0; this.climbing = null; this.enter(this.resume, 14); this.path = null; }
        this.phase += dt * 3;
        this.apply(dt);
        return;
      }

      // ---- sentidos ----
      let sees = false;
      // si ya te persigue no te pierde por agacharte; si no, agachado te ve de más cerca y tarda en notarte
      const sneaky = (player.stealth || 0) > 0 && !this.aware();
      const R = this.runner;
      const range = sneaky ? (player.stealth === 2 ? PRONE_SIGHT : CROUCH_SIGHT) * (R ? 1.2 : 1) : (R ? RUNNER.sight : SIGHT_RANGE);
      if (dist < range && !player.dead) {
        const diff = Math.abs(U.angleDiff(Math.atan2(dx, dz), this.facing));
        if ((diff < FOV_HALF || (dist < 1.4 && diff < 1.6)) && sameLv && G.World.hasLOS(this.pos.x, this.pos.z, px, pz, this.lv)) sees = true;
      }
      if (sees && sneaky && dist > 1.6) {
        this.notice += dt * (1.6 - dist / range) / (NOTICE_TIME * (R ? RUNNER.notice : 1) * (player.stealth === 2 ? 1.5 : 1));
        if (this.notice < 1) sees = false;
      } else if (!sees) this.notice = Math.max(0, this.notice - dt * 0.5);
      let hearsRun = false;
      if (!sees && player.noise > 0 && dist < player.noise) {
        hearsRun = dist < player.noise * 0.6 || (sameLv && G.World.hasLOS(this.pos.x, this.pos.z, px, pz, this.lv));
      }
      this.hearTimer -= dt;

      if (sees) {
        this.lastSeen = 0;
        this.homebound = false;
        this.target = { x: px, z: pz, lv: plv };
        if (this.state !== 'chase' && this.state !== 'attack' && this.state !== 'recover' && this.state !== 'bang' && this.state !== 'alert') {
          // el corredor se para un instante y chilla (avisa a los de alrededor) antes de lanzarse
          if (R && !this.screamed) { this.screamed = true; this.enter('alert', 0.55); G.World.emit(this.pos.x, this.pos.z, RUNNER.scream, this.lv); }
          else this.enter('chase', 0);
        }
      } else {
        this.lastSeen += dt;
        if (hearsRun && this.hearTimer <= 0 && this.state !== 'attack' && this.state !== 'recover') {
          this.hearTimer = 1;
          this.homebound = false;
          this.target = { x: px + (Math.random() - 0.5) * 1.5, z: pz + (Math.random() - 0.5) * 1.5, lv: plv };
          if (this.state !== 'chase' && this.state !== 'bang') this.enter('investigate', 14);
        }
        if (this.state === 'chase' && this.lastSeen > 1.5) this.enter('investigate', 12);
      }

      this.reach = Math.max(0, this.reach - dt * 3);

      switch (this.state) {
        case 'idle':
          this.timer -= dt;
          if (this.timer <= 0) {
            if (this.homebound) {
              // dentro de casa: da unos pasos sin salir de su habitación
              const a = Math.random() * Math.PI * 2, d = 0.8 + Math.random() * 2;
              const tx = this.pos.x + Math.sin(a) * d, tz = this.pos.z + Math.cos(a) * d;
              if (G.World.roomAt(Math.floor(tx), Math.floor(tz), this.lv) === this.homeRoom && G.World.hasClearLine(this.pos.x, this.pos.z, tx, tz, this.lv)) {
                this.target = { x: tx, z: tz, lv: this.lv }; this.enter('wander', 6);
              } else this.timer = 1 + Math.random() * 2;
              break;
            }
            const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 6;
            const tx = this.pos.x + Math.sin(a) * d, tz = this.pos.z + Math.cos(a) * d;
            if (!G.World.solidObj(G.World.obj(Math.floor(tx), Math.floor(tz), this.lv)) && (!this.lv || G.World.isIndoor(Math.floor(tx), Math.floor(tz), 1))) { this.target = { x: tx, z: tz, lv: this.lv }; this.enter('wander', 12); }
            else this.timer = 1;
          }
          break;
        case 'wander':
        case 'investigate': {
          this.timer -= dt;
          const g = this.target;
          if (!g || this.timer <= 0 || (Math.hypot(g.x - this.pos.x, g.z - this.pos.z) < 0.7 && (g.lv || 0) === (this.lv || 0))) {
            this.target = null;
            this.enter('idle', 2 + Math.random() * 5);
          } else speed = this.state === 'wander' ? WANDER_SPEED : INVESTIGATE_SPEED;
          break;
        }
        case 'alert':
          this.timer -= dt;
          this.facing = U.turnToward(this.facing, Math.atan2(dx, dz), 6 * dt);
          if (this.timer <= 0) this.enter('chase', 0);
          break;
        case 'chase':
          if (player.dead) { this.enter('idle', 3); this.target = null; break; }
          if (dist < (R ? RUNNER.reach : REACH) && sees && sameLv) {
            this.enter('attack', R ? RUNNER.windup : WINDUP);
            this.lungeT = R ? 0 : -1;
          } else speed = R ? RUNNER.chase : CHASE_SPEED;
          break;
        case 'attack':
          this.facing = U.turnToward(this.facing, Math.atan2(dx, dz), 4 * dt);
          this.timer -= dt;
          this.reach = Math.min(1, 1 - this.timer / (R ? RUNNER.windup : WINDUP) + 0.15);
          // el corredor se abalanza hacia delante al final de la preparación
          if (R && this.timer < 0.25 && dist > 0.7) {
            const st = Math.min(dist - 0.65, RUNNER.lunge * dt / 0.25);
            G.World.move(this.pos, Math.sin(this.facing) * st, Math.cos(this.facing) * st, RADIUS, this.lv);
            this.lungeT = 1;
          }
          if (this.timer <= 0) {
            const hit = combat ? combat.zombieStrike(this, player, Math.hypot(px - this.pos.x, pz - this.pos.z)) : false;
            // si falla porque esquivaste, se queda vendido un rato (ventana para contraatacar)
            const over = this.overextended; this.overextended = false;
            this.enter('recover', over ? 1.4 : (hit ? 0.9 : 0.6));
            if (over) { this.reach = 1; this.exposed = true; }
          }
          break;
        case 'recover':
          this.timer -= dt;
          this.reach = Math.max(this.reach, 0.5);
          this.facing = U.turnToward(this.facing, Math.atan2(dx, dz), 3 * dt);
          if (this.timer <= 0) this.enter('chase', 0);
          break;
        case 'bang':
          this.updateBang(dt, player, dist, sees);
          break;
      }

      let moved = 0;
      if (speed > 0 && this.target) moved = this.stepToward(this.target, speed, dt);
      this.speedNow = moved;

      if (speed > 0 && moved < speed * 0.25 && this.state !== 'bang' && this.state !== 'climb') {
        this.stuck += dt;
        if (this.stuck > 1.2) { this.clear = false; this.clearTimer = 1; this.pathTimer = 0; }
        if (this.stuck > 6) { this.target = null; this.enter('idle', 2); }
      } else this.stuck = Math.max(0, this.stuck - dt);

      // separación entre zombis
      for (let i = 0; i < all.length; i++) {
        const o = all[i];
        if (o === this || !o.alive || o.downed) continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
        const d2 = ox * ox + oz * oz;
        if (d2 < 0.3 && d2 > 1e-4) {
          const d = Math.sqrt(d2), push = (0.55 - d) * 0.5;
          G.World.move(this.pos, ox / d * push, oz / d * push, RADIUS, this.lv);
        }
      }
      // no atravesar al jugador
      if (!player.dead && dist < 0.55 && dist > 1e-3) {
        const push = (0.55 - dist);
        G.World.move(this.pos, -dx / dist * push, -dz / dist * push, RADIUS, this.lv);
      }

      this.phase += dt * (1.4 + this.speedNow * (this.runner && this.speedNow > 1.5 ? 3.4 : 5.5));
      this.apply(dt);
    }

    knockback(dt) {
      const k = this.kb;
      if (Math.abs(k.x) + Math.abs(k.z) < 0.01) return;
      G.World.move(this.pos, k.x * dt, k.z * dt, RADIUS, this.lv);
      const f = Math.max(0, 1 - dt * 5);
      k.x *= f; k.z *= f;
    }

    // ---------- Puertas, ventanas y vallas ----------
    updateBang(dt, player, dist, sees) {
      const W = G.World, E = W.E;
      const ref = this.edge;
      const e = ref ? W.edgeGet(ref) : E.NONE;
      if (!ref || !W.blocksWalkEdge(e)) { this.edge = null; this.enter(this.resume, 12); return; }
      if (W.climbableEdge(e)) { this.startClimb(ref, e); return; }
      const mx = ref.o === 'N' ? ref.x + 0.5 : ref.x, mz = ref.o === 'N' ? ref.z : ref.z + 0.5;
      this.facing = U.turnToward(this.facing, Math.atan2(mx - this.pos.x, mz - this.pos.z), 4 * dt);
      this.bangT += dt;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 1;
        W.emit(mx, mz, 9, this.lv);
        if (W.damageEdge(ref, 1)) {
          const after = W.edgeGet(ref);
          if (W.climbableEdge(after)) this.startClimb(ref, after);
          else { this.edge = null; this.enter(this.resume, 12); }
        }
      }
      // si deja de oír o ver al jugador durante mucho rato, se rinde
      if (!sees && this.bangT > 25 && dist > 12) { this.edge = null; this.target = null; this.enter('idle', 3); }
    }

    startClimb(ref, e) {
      const mx = ref.o === 'N' ? ref.x + 0.5 : ref.x, mz = ref.o === 'N' ? ref.z : ref.z + 0.5;
      const nx = ref.o === 'N' ? 0 : 1, nz = ref.o === 'N' ? 1 : 0;
      const side = (this.pos.x - mx) * nx + (this.pos.z - mz) * nz > 0 ? 1 : -1;
      const tx = mx - nx * side * 0.6, tz = mz - nz * side * 0.6;
      if (G.World.circleBlocked(tx, tz, RADIUS, this.lv)) { this.edge = null; this.enter('idle', 2); return; }
      this.climbing = { x0: this.pos.x, z0: this.pos.z, x1: tx, z1: tz, t: 0, dur: e === G.World.E.FENCE ? 1.4 : 2.0 };
      this.facing = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      this.edge = null;
      this.state = 'climb';
    }

    // Si la meta está en otra planta, primero va a la escalera (arriba o abajo)
    routeGoal(goal) {
      const lv = this.lv || 0;
      if (goal.lv == null || goal.lv === lv) return goal;
      const W = G.World;
      const b = W.bldAt(Math.floor(goal.x), Math.floor(goal.z), goal.lv) || W.bldAt(Math.floor(this.pos.x), Math.floor(this.pos.z), lv);
      const s = b && b.stair;
      if (!s) return goal;
      const k = lv === 0 ? s.len - 1 : 0;
      const sx = s.x + s.dx * k + 0.5, sz = s.z + s.dz * k + 0.5;
      // la casilla del otro extremo de la escalera: al pasar la mitad ya cambia de planta
      return { x: sx, z: sz, lv };
    }

    // Avanza hacia la meta: en línea recta si se puede, si no con A*
    stepToward(goal, speed, dt) {
      const W = G.World;
      goal = this.routeGoal(goal);
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        this.clear = W.hasClearLine(this.pos.x, this.pos.z, goal.x, goal.z, this.lv);
        this.clearTimer = 0.25;
      }
      let gx = goal.x, gz = goal.z;
      if (!this.clear) {
        this.pathTimer -= dt;
        if (this.pathTimer <= 0) {
          this.path = W.findPath(this.pos.x, this.pos.z, goal.x, goal.z, 0, this.lv);
          this.pathTimer = 1 + Math.random() * 0.6;
        }
        if (this.path) {
          while (this.path.length && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.35) this.path.shift();
          if (this.path.length) {
            gx = this.path[0].x; gz = this.path[0].z;
            // ¿hay una puerta, ventana o valla entre esta casilla y la siguiente?
            const tx = Math.floor(this.pos.x), tz = Math.floor(this.pos.z);
            const nx = Math.floor(gx), nz = Math.floor(gz);
            if (Math.abs(nx - tx) + Math.abs(nz - tz) === 1) {
              const ref = W.edgeRefBetween(tx, tz, nx, nz, this.lv);
              const e = W.edgeGet(ref);
              if (W.blocksWalkEdge(e)) {
                const mx = ref.o === 'N' ? ref.x + 0.5 : ref.x, mz = ref.o === 'N' ? ref.z : ref.z + 0.5;
                const dEdge = ref.o === 'N' ? Math.abs(this.pos.z - mz) : Math.abs(this.pos.x - mx);
                if (dEdge < 0.6) {
                  this.resume = this.state === 'chase' ? 'chase' : 'investigate';
                  if (W.climbableEdge(e)) { this.startClimb(ref, e); return 0; }
                  this.edge = ref; this.bangT = 0;
                  this.state = 'bang'; this.timer = 0.6;
                  return 0;
                }
                // ir hacia el centro de la arista
                gx = ref.o === 'N' ? mx : gx; gz = ref.o === 'N' ? gz : mz;
                if (ref.o === 'N') gz = mz + (tz < nz ? -0.3 : 0.3);
                else gx = mx + (tx < nx ? -0.3 : 0.3);
              }
            }
          }
        }
      } else this.path = null;

      const ddx = gx - this.pos.x, ddz = gz - this.pos.z;
      const d = Math.hypot(ddx, ddz);
      if (d < 0.01) return 0;
      this.facing = U.turnToward(this.facing, Math.atan2(ddx, ddz), 3 * dt);
      const step = speed * dt;
      const bx = this.pos.x, bz = this.pos.z;
      W.move(this.pos, ddx / d * step, ddz / d * step, RADIUS, this.lv);
      return Math.hypot(this.pos.x - bx, this.pos.z - bz) / Math.max(dt, 1e-4);
    }

    // ---------- Modelo ----------
    apply(dt) {
      const m = this.model;
      this.lv = G.World.levelAt(this.pos.x, this.pos.z, this.lv);
      this.y += (G.World.groundY(this.pos.x, this.pos.z, this.lv) - this.y) * Math.min(1, (dt || 0.016) * 14);
      m.root.position.set(this.pos.x, this.y + (this.lift || 0), this.pos.z);
      // lejos de la cámara, malla ligera
      const cp = G.Camera && G.Camera.pos;
      if (cp) {
        const d2 = (cp.x - this.pos.x) * (cp.x - this.pos.x) + (cp.z - this.pos.z) * (cp.z - this.pos.z);
        if (m.lod && d2 > 18 * 18) G.Models.setLOD(m, 0);
        else if (!m.lod && d2 < 15 * 15) G.Models.setLOD(m, 1);
      }
      m.root.rotation.y = this.facing;
      // espasmos: sacudidas sueltas de cabeza y hombros, más seguidas al perseguir
      if (this.state !== 'dead' && !(this.fall > 0)) {
        this.twitchT = (this.twitchT == null ? Math.random() * 4 : this.twitchT) - (dt || 0);
        if (this.twitchT <= 0) {
          this.twitch = 1;
          this.twitchKind = (Math.random() * 4) | 0;
          this.twitchT = ((this.state === 'chase' ? 1.2 : 2.5) + Math.random() * 4) * (this.runner ? 0.5 : 1);
        }
      }
      this.twitch = Math.max(0, (this.twitch || 0) - (dt || 0) * 3.2);
      G.Models.poseZombie(m, {
        phase: this.phase, amt: Math.min(1, this.speedNow / 0.9) * 0.7,
        chase: this.state === 'chase' || this.state === 'attack' || this.state === 'recover' || this.state === 'bang' || this.state === 'alert',
        runner: this.runner, sprint: this.runner && this.state === 'chase' ? Math.min(1, this.speedNow / 2.5) : 0,
        alert: this.state === 'alert' ? 1 - this.timer / 0.55 : 0,
        armsUp: this.look.armsUp || 0,
        reach: this.reach, stagger: this.state === 'stagger' ? this.stagger : 0, flinch: this.flinch || 1,
        grabbed: this.state === 'grabbed' ? (this.grabT || 0) : null,
        twitch: this.twitch || 0, twitchKind: this.twitchKind || 0,
        bang: this.state === 'bang' ? this.bangT : 0,
        drag: this.look.drag, seed: this.look.seed % 7, lean: this.lean, tilt: this.tilt,
        dt: dt || 0.016, time: (this.time = (this.time || 0) + (dt || 0))
      });
      if (this.fall > 0) G.Models.poseFall(m, this.fall, this.fallDir);
      else { m.body.rotation.x = 0; m.body.position.y = 0; }
    }

    // Datos para dormirlo y despertarlo después
    snapshot() {
      return { x: this.pos.x, z: this.pos.z, lv: this.lv || 0, facing: this.facing, look: this.look, hp: this.hp, dead: !this.alive, fallDir: this.fallDir, homebound: this.homebound };
    }
  }

  Zombie.randomLook = randomLook;
  G.Zombie = Zombie;
})(window.Game = window.Game || {});
