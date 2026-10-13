(function (G) {
  'use strict';

  // Personajes con esqueleto: cuerpo redondeado (esferas y cilindros) unido en
  // una sola malla con huesos, así cada personaje es una sola llamada de dibujo.
  // El modelo mira hacia +Z. Su izquierda es +X.

  const U = G.Util;

  // Huesos: [nombre, padre, posición relativa al padre]. 24 huesos: sin cara; los dedos de cada
  // mano van juntos en un hueso (para cerrar la mano o hacer garras).
  // Columna en tres tramos, clavículas para los hombros y dedos del pie para que ruede al pisar.
  const BONES = [
    ['hips', -1, [0, 0.95, 0]],
    ['spine', 0, [0, 0.12, 0]],                 // lumbar
    ['spine2', 1, [0, 0.13, 0]],                // dorsal
    ['chest', 2, [0, 0.13, 0]],                 // pecho
    ['neck', 3, [0, 0.2, 0]],
    ['head', 4, [0, 0.08, 0]],
    ['clavL', 3, [0.035, 0.09, 0]], ['armL', 6, [0.155, 0.02, 0]], ['foreL', 7, [0, -0.28, 0]], ['handL', 8, [0, -0.25, 0]],
    ['clavR', 3, [-0.035, 0.09, 0]], ['armR', 10, [-0.155, 0.02, 0]], ['foreR', 11, [0, -0.28, 0]], ['handR', 12, [0, -0.25, 0]],
    ['legL', 0, [0.1, -0.06, 0]], ['shinL', 14, [0, -0.42, 0]], ['footL', 15, [0, -0.4, 0]], ['toeL', 16, [0, -0.035, 0.1]],
    ['legR', 0, [-0.1, -0.06, 0]], ['shinR', 18, [0, -0.42, 0]], ['footR', 19, [0, -0.4, 0]], ['toeR', 20, [0, -0.035, 0.1]],
    // dedos (los cuatro juntos, como una manopla): para cerrar la mano sobre el arma o hacer garras
    ['fingL', 9, [0, -0.06, 0]], ['fingR', 13, [0, -0.06, 0]]
  ];
  const BI = {};
  BONES.forEach((b, i) => { BI[b[0]] = i; });

  // Posición de cada hueso en reposo (en el espacio del modelo)
  const REST = [];
  BONES.forEach((b, i) => {
    const p = b[2];
    REST[i] = b[1] < 0 ? p.slice() : [REST[b[1]][0] + p[0], REST[b[1]][1] + p[1], REST[b[1]][2] + p[2]];
  });

  // Articulaciones: donde la piel se reparte entre el hueso padre (a) y el hijo (b).
  // axis va del padre hacia el hijo; r es el ancho de la zona de mezcla; lim, lo lejos del eje que afecta.
  const JOINTS = [];
  (function () {
    const J = (a, b, p, axis, r, lim) => {
      const l = Math.hypot(axis[0], axis[1], axis[2]);
      JOINTS.push({ a: BI[a], b: BI[b], p, ax: [axis[0] / l, axis[1] / l, axis[2] / l], r, lim });
    };
    const R = (n) => REST[BI[n]];
    J('hips', 'spine', [0, 1.0, 0], [0, 1, 0], 0.06, 0.3);
    J('spine', 'spine2', [0, 1.14, 0], [0, 1, 0], 0.06, 0.3);
    J('spine2', 'chest', [0, 1.26, 0], [0, 1, 0], 0.06, 0.3);
    J('chest', 'neck', [0, 1.49, 0], [0, 1, 0], 0.035, 0.09);
    J('neck', 'head', [0, 1.575, 0], [0, 1, 0], 0.03, 0.12);
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      J('chest', 'clav' + s, [0.11 * sg, 1.43, 0], [sg, 0, 0], 0.06, 0.1);
      J('clav' + s, 'arm' + s, R('arm' + s), [0, -1, 0], 0.06, 0.1);
      J('arm' + s, 'fore' + s, R('fore' + s), [0, -1, 0], 0.05, 0.1);
      J('fore' + s, 'hand' + s, R('hand' + s), [0, -1, 0], 0.03, 0.08);
      J('hand' + s, 'fing' + s, R('fing' + s), [0, -1, 0], 0.018, 0.06);
      J('hips', 'leg' + s, R('leg' + s), [0, -1, 0], 0.07, 0.085);
      J('leg' + s, 'shin' + s, R('shin' + s), [0, -1, 0], 0.05, 0.12);
      J('shin' + s, 'foot' + s, R('foot' + s), [0, -1, 0], 0.03, 0.1);
      J('foot' + s, 'toe' + s, R('toe' + s), [0, -0.33, 0.94], 0.035, 0.1);
    }
  })();

  // Reparte un vértice entre dos huesos según su distancia a la articulación más cercana
  function skinWeight(x, y, z, bone) {
    let best = null, bestT = Infinity;
    for (const j of JOINTS) {
      if (j.a !== bone && j.b !== bone) continue;
      const dx = x - j.p[0], dy = y - j.p[1], dz = z - j.p[2];
      const t = dx * j.ax[0] + dy * j.ax[1] + dz * j.ax[2];
      if (Math.abs(t) > j.r * 1.0001) continue;
      const lx = dx - t * j.ax[0], ly = dy - t * j.ax[1], lz = dz - t * j.ax[2];
      if (Math.hypot(lx, ly, lz) > j.lim) continue;
      if (Math.abs(t) < bestT) { bestT = Math.abs(t); best = { j, t }; }
    }
    if (!best) return null;
    const { j, t } = best;
    const wb = U.smooth((t + j.r) / (2 * j.r));
    return [j.a, 1 - wb, j.b, wb];
  }

  let matPlayer = null, matZombie = null, matWeapon = null;
  function mats() {
    if (!matPlayer) {
      matPlayer = new THREE.MeshLambertMaterial({ vertexColors: true, skinning: true });
      matZombie = new THREE.MeshLambertMaterial({ vertexColors: true, skinning: true });
      matWeapon = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
  }

  // ---------- Geometría del cuerpo ----------
  // o.lod: 1 = detallado (cerca), 0 = ligero (lejos). o.outlineOnly: solo la silueta.
  function bodyGeometry(o) {
    const m = new G.Mesher(true);
    const hi = o.lod !== 0 && !o.outlineOnly;
    const D = hi ? 2 : 1;                 // detalle de las esferas
    const C = hi ? 16 : 9;                // lados de los cilindros
    const skin = o.skin, shirt = o.shirt, pants = o.pants, shoes = o.shoes || 0x2a2622;
    const sleeve = o.longSleeves ? shirt : skin;
    const detail = !o.outlineOnly;
    const dark = (c, f) => U.shade(c, f);

    // ---- pelvis y torso (tres tramos de columna)
    m.sphere(0, 0.93, 0, 0.165, 0.11, 0.115, pants, D, BI.hips);
    m.cyl(0, 1.03, 0, 0.152, 0.15, 0.14, shirt, C, BI.spine);
    m.cyl(0, 1.155, 0, 0.15, 0.162, 0.13, shirt, C, BI.spine2);
    m.cyl(0, 1.27, 0, 0.162, 0.185, 0.14, shirt, C, BI.chest);
    m.sphere(0, 1.35, 0, 0.19, 0.15, 0.115, shirt, D, BI.chest);
    if (hi) {
      // pecho, omóplatos y abdomen
      m.sphere(0.075, 1.33, 0.07, 0.085, 0.07, 0.06, shirt, 1, BI.chest);
      m.sphere(-0.075, 1.33, 0.07, 0.085, 0.07, 0.06, shirt, 1, BI.chest);
      m.sphere(0.08, 1.33, -0.07, 0.08, 0.09, 0.05, shirt, 1, BI.chest);
      m.sphere(-0.08, 1.33, -0.07, 0.08, 0.09, 0.05, shirt, 1, BI.chest);
      m.sphere(0, 1.1, 0.045, 0.12, 0.1, 0.11, shirt, 1, BI.spine2);
    }
    // trapecios: dan forma a los hombros (se mueven con las clavículas)
    for (const sg of [1, -1]) {
      m.sphere(0.1 * sg, 1.445, -0.01, 0.085, 0.045, 0.07, shirt, D, BI[sg > 0 ? 'clavL' : 'clavR']);
    }
    // cinturón
    if (detail && o.belt) m.cyl(0, 0.985, 0, 0.158, 0.158, 0.04, o.belt, C, BI.hips);
    // cuello de la camisa o chaqueta
    if (detail && o.collar) m.cyl(0, 1.475, -0.005, 0.07, 0.062, 0.05, o.collar, C, BI.chest);

    // ---- cuello y cabeza
    m.cyl(0, 1.52, 0, 0.05, 0.045, 0.1, skin, C, BI.neck);
    m.sphere(0, 1.665, 0.005, 0.1, 0.122, 0.112, skin, hi ? 3 : 2, BI.head);
    if (detail) {
      m.sphere(0, 1.605, 0.02, 0.07, 0.045, 0.07, o.beard != null ? o.beard : skin, D, BI.head);   // mandíbula
      m.sphere(0, 1.66, 0.108, 0.012, 0.018, 0.012, dark(skin, 0.92), 1, BI.head);            // nariz
      if (hi) {
        m.sphere(0.098, 1.665, 0, 0.014, 0.024, 0.012, dark(skin, 0.95), 1, BI.head);         // orejas
        m.sphere(-0.098, 1.665, 0, 0.014, 0.024, 0.012, dark(skin, 0.95), 1, BI.head);
        m.sphere(0, 1.705, 0.095, 0.06, 0.012, 0.02, dark(skin, 0.9), 1, BI.head);             // ceja
      }
      const eye = o.zombie ? 0xd8d4b8 : 0x1a1612;
      if (!o.facePlate) {
        m.sphere(0.038, 1.69, 0.098, 0.016, 0.012, 0.01, eye, 1, BI.head);
        m.sphere(-0.038, 1.69, 0.098, 0.016, 0.012, 0.01, eye, 1, BI.head);
      } else {
        m.sphere(-0.038, 1.69, 0.098, 0.016, 0.012, 0.01, eye, 1, BI.head);
      }
      if (o.zombie) m.sphere(0, 1.615, 0.1, 0.03, 0.012, 0.012, 0x3a1612, 1, BI.head);   // boca
    }
    if (o.hair != null) {
      m.sphere(0, 1.71, -0.012, 0.108, 0.1, 0.118, o.hair, D, BI.head);
      if (o.longHair && detail) m.sphere(0, 1.6, -0.07, 0.1, 0.12, 0.06, o.hair, 1, BI.head);
    }

    // ---- brazos
    for (const sg of [1, -1]) {
      const A = sg > 0 ? 'L' : 'R';
      const x = 0.19 * sg;
      m.sphere(x - 0.01 * sg, 1.415, 0, 0.058, 0.06, 0.058, shirt, D, BI['arm' + A]);       // hombro
      m.cyl(x + 0.004 * sg, 1.29, 0, 0.046, 0.054, 0.26, shirt, C, BI['arm' + A]);
      if (hi) m.sphere(x, 1.3, 0.012, 0.045, 0.075, 0.046, shirt, 1, BI['arm' + A]);         // bíceps
      m.sphere(x, 1.16, 0, 0.046, 0.046, 0.046, sleeve, D, BI['fore' + A]);                   // codo
      m.cyl(x, 1.04, 0, 0.037, 0.046, 0.24, sleeve, C, BI['fore' + A]);
      if (hi) m.sphere(x, 1.09, 0.008, 0.044, 0.07, 0.042, sleeve, 1, BI['fore' + A]);        // antebrazo
      if (detail && o.cuffs && o.longSleeves) m.cyl(x, 0.935, 0, 0.041, 0.041, 0.03, dark(shirt, 0.85), C, BI['fore' + A]);
      // mano en forma de manopla con pulgar
      m.sphere(x, 0.865, 0.008, 0.035, 0.05, 0.024, skin, D, BI['hand' + A]);
      m.sphere(x, 0.815, 0.01, 0.03, 0.03, 0.021, skin, 1, BI['fing' + A]);
      if (hi) m.sphere(x - 0.022 * sg, 0.86, 0.025, 0.012, 0.03, 0.012, skin, 1, BI['hand' + A]);
    }

    // ---- piernas
    for (const sg of [1, -1]) {
      const A = sg > 0 ? 'L' : 'R';
      const x = 0.1 * sg;
      m.cyl(x, 0.69, 0, 0.066, 0.085, 0.44, pants, C, BI['leg' + A]);
      if (hi) m.sphere(x, 0.74, 0.02, 0.075, 0.13, 0.072, pants, 1, BI['leg' + A]);             // muslo
      m.sphere(x, 0.48, 0.008, 0.062, 0.062, 0.064, pants, D, BI['shin' + A]);                   // rodilla
      m.cyl(x, 0.28, 0, 0.046, 0.06, 0.4, pants, C, BI['shin' + A]);
      if (hi) m.sphere(x, 0.36, -0.02, 0.055, 0.1, 0.055, pants, 1, BI['shin' + A]);             // pantorrilla
      if (detail && o.pocket) m.box(x + 0.06 * sg, 0.7, 0.01, 0.03, 0.12, 0.1, dark(pants, 0.85), 0, BI['leg' + A]);
      // zapato: talón, puntera y suela
      m.sphere(x, 0.06, 0.02, 0.055, 0.048, 0.09, shoes, D, BI['foot' + A]);
      m.sphere(x, 0.042, 0.12, 0.05, 0.036, 0.062, shoes, D, BI['toe' + A]);
      if (hi) {
        m.box(x, 0.012, 0.03, 0.1, 0.022, 0.16, 0x1a1816, 0, BI['foot' + A]);
        m.box(x, 0.012, 0.13, 0.09, 0.022, 0.08, 0x1a1816, 0, BI['toe' + A]);
      }
    }

    // ---- mochila del superviviente
    if (detail && o.backpack) {
      const bp = o.backpack;
      m.box(0, 1.24, -0.2, 0.3, 0.38, 0.14, bp, 0, BI.chest);
      m.sphere(0, 1.42, -0.2, 0.15, 0.06, 0.075, bp, D, BI.chest);
      m.box(0, 1.12, -0.29, 0.22, 0.14, 0.05, dark(bp, 0.85), 0, BI.chest);        // bolsillo
      m.cyl(0, 1.06, -0.2, 0.06, 0.06, 0.26, 0x4a4436, C, BI.chest, 0, 0, Math.PI / 2); // saco de dormir
      for (const sg of [1, -1]) {
        m.box(0.1 * sg, 1.35, 0.1, 0.035, 0.22, 0.02, dark(bp, 0.7), 0, BI.chest, -0.15);   // correas
        m.box(0.11 * sg, 1.2, 0.12, 0.035, 0.12, 0.02, dark(bp, 0.7), 0, BI.chest, 0.1);
      }
    }

    // ---- infectados: ropa rota, manchas y hongos (inspirado, no copiado)
    if (o.zombie && detail) {
      const r = o.blood || U.mulberry32(1);
      for (let i = 0; i < 4; i++) {
        const ang = r() * 6.28, y = 1.05 + r() * 0.4;
        m.sphere(Math.sin(ang) * 0.17, y, Math.cos(ang) * 0.11, 0.06 + r() * 0.05, 0.05 + r() * 0.05, 0.02, 0x5a1a14, 1, y > 1.27 ? BI.chest : (y > 1.12 ? BI.spine2 : BI.spine));
      }
      m.sphere(0.02, 1.6, 0.085, 0.05, 0.03, 0.03, 0x5a1a14, 1, BI.head);
      // desgarros: piel a la vista en el torso
      for (let i = 0; i < 2; i++) {
        const ang = r() * 6.28, y = 1.08 + r() * 0.3;
        m.sphere(Math.sin(ang) * 0.158, y, Math.cos(ang) * 0.12, 0.045, 0.06, 0.02, skin, 1, y > 1.27 ? BI.chest : BI.spine2);
      }
      const fl = o.fungus || 0;
      if (fl > 0) {
        const FUN = [0x6d5d3e, 0x7b6a48, 0x5a4b32, 0x8a7a55];
        const n = fl === 1 ? (hi ? 7 : 4) : (hi ? 16 : 8);
        for (let i = 0; i < n; i++) {
          // racimos en cabeza, cuello y hombros
          const where = r();
          let bx, by, bz, bone;
          if (where < 0.5) { const ang = r() * 6.28; bx = Math.sin(ang) * 0.09; by = 1.68 + r() * 0.06; bz = Math.cos(ang) * 0.1 - 0.02; bone = BI.head; }
          else if (where < 0.75) { bx = (r() - 0.5) * 0.1; by = 1.5 + r() * 0.05; bz = -0.04 - r() * 0.03; bone = BI.neck; }
          else { const sg = r() < 0.5 ? 1 : -1; bx = (0.08 + r() * 0.1) * sg; by = 1.42 + r() * 0.05; bz = (r() - 0.5) * 0.1; bone = BI[sg > 0 ? 'clavL' : 'clavR']; }
          const sz = 0.02 + r() * (fl === 2 ? 0.035 : 0.022);
          m.sphere(bx, by, bz, sz * 1.3, sz * 0.8, sz * 1.3, FUN[Math.floor(r() * FUN.length)], 1, bone);
        }
        if (o.facePlate) {
          // placa de hongo que cubre medio rostro, con láminas
          for (let i = 0; i < (hi ? 6 : 3); i++) {
            const yy = 1.64 + i * 0.018;
            m.sphere(0.035 + r() * 0.01, yy, 0.085 - i * 0.004, 0.06 - i * 0.004, 0.012, 0.04, FUN[i % FUN.length], 1, BI.head);
          }
          m.sphere(0.05, 1.68, 0.06, 0.07, 0.07, 0.06, 0x5d4f34, D, BI.head);
        }
      }
    }

    const g = m.build(skinWeight);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.5);
    return g;
  }

  // ---------- Personaje ----------
  function createHumanoid(o) {
    mats();
    const root = new THREE.Group();        // posición en el mundo y orientación
    const body = new THREE.Group();        // se inclina al caer
    root.add(body);

    const bones = BONES.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b[0];
      bone.position.fromArray(b[2]);
      return bone;
    });
    BONES.forEach((b, i) => { if (b[1] >= 0) bones[b[1]].add(bones[i]); });

    const geoHigh = bodyGeometry(o);
    const mesh = new THREE.SkinnedMesh(geoHigh, o.zombie ? matZombie : matPlayer);
    mesh.add(bones[0]);
    bones[0].updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);

    const rest = bones.map((b) => b.position.clone());
    const h = {
      root, body, mesh, bones, rest, zombie: !!o.zombie, opts: o, geoHigh, geoLow: null, lod: 1,
      weapon: null, weaponId: null
    };
    BONES.forEach((b, i) => { h[b[0]] = bones[i]; });
    return h;
  }

  // Contorno amarillo (como al apuntar en el original): una copia de la malla,
  // un poco inflada y vista por dentro, que comparte el esqueleto
  let outlineMat = null;
  function setOutline(h, on) {
    if (on && !h.outline) {
      if (!outlineMat) {
        outlineMat = new THREE.MeshBasicMaterial({ color: 0xf2c230, side: THREE.BackSide, skinning: true });
        outlineMat.toneMapped = false;
        outlineMat.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ) + normal * 0.03;');
        };
      }
      const geo = bodyGeometry(Object.assign({}, h.opts, { outlineOnly: true, blood: null }));
      const o = new THREE.SkinnedMesh(geo, outlineMat);
      o.bind(h.mesh.skeleton, h.mesh.bindMatrix);
      o.frustumCulled = false;
      h.body.add(o);
      h.outline = o;
    }
    if (h.outline) h.outline.visible = !!on;
  }

  // Detalle según la distancia: lejos se usa una malla más ligera con los mismos huesos
  function setLOD(h, level) {
    if (h.lod === level) return;
    h.lod = level;
    if (!level && !h.geoLow) h.geoLow = bodyGeometry(Object.assign({}, h.opts, { lod: 0 }));
    h.mesh.geometry = level ? h.geoHigh : h.geoLow;
  }

  function disposeHumanoid(h) {
    h.geoHigh.dispose();
    if (h.geoLow) h.geoLow.dispose();
    if (h.outline) h.outline.geometry.dispose();
    h.mesh.skeleton.dispose && h.mesh.skeleton.dispose();
  }

  // Coloca un arma en la mano derecha. Las armas de fuego y el arco van en un soporte
  // (h.gunAnchor) unido al pecho: la pose lo mueve y las manos lo siguen con IK.
  function setWeapon(h, id, opt) {
    const key = (id || '') + (opt && opt.sil ? '_sil' : '');
    if (h.weaponKey === key) return;
    if (h.weapon) { if (h.weapon.parent) h.weapon.parent.remove(h.weapon); h.weapon = null; }
    h.gun = null;
    h.weaponKey = key;
    h.weaponId = id;
    if (!id || id === 'manos') return;
    mats();
    const wd = G.Weapons.get(id);
    if (wd.cat === 'gun') { setGun(h, id, wd, opt); return; }
    const w = new THREE.Mesh(weaponGeometry(id), matWeapon);
    w.castShadow = true;
    const cat = wd.cat;
    // ángulo en la mano: la lanza apunta hacia abajo en reposo, el resto hacia delante y abajo
    w.rotation.x = cat === 'spear' ? Math.PI - 0.08 : 2.35;
    w.position.set(0, -0.05, 0.015);
    if (cat === 'spear') w.position.y = 0.5;   // se agarra por el medio (la punta queda lejos)
    h.handR.add(w);
    h.weapon = w;
    // dónde va la mano izquierda (distancia desde el agarre de la derecha, a lo largo del mango)
    h.weaponGrip = cat === 'spear' ? 0.12 : (G.Weapons.isLong(wd) ? 0.2 : 0.09);
  }

  // Arma de fuego o arco. holder: origen en el agarre, cañón hacia +Z, arriba +Y
  const MUZZLE = { pistol: [0, 0.18, -0.036], shotgun: [0, 0.71, -0.039], rifle: [0, 0.74, -0.03], bow: [0, 0.7, 0] };
  function setGun(h, id, wd, opt) {
    if (!h.gunAnchor) {
      h.gunAnchor = new THREE.Group();
      h.chest.add(h.gunAnchor);
    }
    h.gunAnchorOk = false;
    const kind = wd.gun;
    const holder = new THREE.Group();
    const bodyId = kind === 'pistol' ? (opt && opt.sil ? 'pistola_sil' : 'pistola') : (id + '_body');
    const mesh = new THREE.Mesh(weaponGeometry(bodyId), matWeapon);
    mesh.castShadow = true;
    mesh.rotation.x = Math.PI / 2;         // +Y de la geometría -> +Z (adelante); -Z -> arriba
    holder.add(mesh);
    const g = { kind, holder, mesh, part: null, arrow: null, string: null, muzzle: new THREE.Object3D() };
    const mz = MUZZLE[kind];
    g.muzzle.position.set(mz[0], mz[1] + (opt && opt.sil ? 0.15 : 0), mz[2]);
    mesh.add(g.muzzle);
    if (kind === 'shotgun') {
      g.part = new THREE.Mesh(weaponGeometry('escopeta_pump'), matWeapon);
      g.part.position.set(0, 0.3, -0.016); g.partRest = 0.3;
      mesh.add(g.part);
    } else if (kind === 'rifle') {
      g.part = new THREE.Mesh(weaponGeometry('rifle_bolt'), matWeapon);
      g.part.position.set(0, 0.0, -0.03); g.partRest = 0.0;
      mesh.add(g.part);
    } else if (kind === 'bow') {
      g.arrow = new THREE.Mesh(weaponGeometry('flecha'), matWeapon);
      mesh.add(g.arrow);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.07, -0.56, 0, -0.07, 0, 0, -0.07, 0.56], 3));
      g.string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xd8d0b8 }));
      g.string.frustumCulled = false;
      mesh.add(g.string);
    }
    h.gunAnchor.add(holder);
    h.weapon = holder;
    h.gun = g;
  }

  // Arma larga a la espalda, cruzada en diagonal
  function setBackWeapon(h, id) {
    if (h.backId === id) return;
    if (h.back) { h.chest.remove(h.back); h.back = null; }
    h.backId = id;
    if (!id) return;
    mats();
    const w = new THREE.Mesh(weaponGeometry(id), matWeapon);
    w.castShadow = true;
    const len = G.Weapons.get(id).len || 0.9;
    w.rotation.set(0.12, 0, -0.62);
    w.position.set(-0.18 - 0.12 * (len - 0.9), -0.32 - 0.25 * (len - 0.9), -0.3);   // por fuera de la mochila
    h.chest.add(w);
    h.back = w;
  }

  // ---------- Poses y animación ----------
  function reset(h) {
    for (let i = 0; i < h.bones.length; i++) {
      h.bones[i].rotation.set(0, 0, 0);
      h.bones[i].position.copy(h.rest[i]);
    }
  }

  const sin = Math.sin, cos = Math.cos, max = Math.max, abs = Math.abs;
  const c01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const easeOut = (t) => { t = c01(t); return 1 - (1 - t) * (1 - t) * (1 - t); };
  const easeIn = (t) => { t = c01(t); return t * t; };

  // Suaviza el paso de una pose a otra: cada hueso persigue su pose objetivo
  // con una inercia corta, así no hay saltos bruscos entre animaciones.
  function blend(h, dt, rate) {
    const n = h.bones.length;
    if (!h.prev) { h.prev = new Float32Array(n * 3 + 1); h.prevOk = false; }
    const k = (h.prevOk && dt != null) ? 1 - Math.exp(-dt * rate) : 1;
    const p = h.prev;
    for (let i = 0; i < n; i++) {
      const r = h.bones[i].rotation, j = i * 3;
      r.x = p[j] + (r.x - p[j]) * k; p[j] = r.x;
      r.y = p[j + 1] + (r.y - p[j + 1]) * k; p[j + 1] = r.y;
      r.z = p[j + 2] + (r.z - p[j + 2]) * k; p[j + 2] = r.z;
    }
    const hp = h.hips.position;
    hp.y = p[n * 3] + (hp.y - p[n * 3]) * (h.prevOk ? k : 1); p[n * 3] = hp.y;
    h.prevOk = true;
  }

  // Ciclo de piernas. p = fase, a = intensidad (0 a 1)
  function legs(h, p, a, run, drag) {
    const amp = (run ? 0.92 : 0.58) * a;
    const ampL = drag ? amp * 0.55 : amp;
    const knee = run ? 1.55 : 0.9;
    h.legL.rotation.x = -sin(p) * ampL;
    h.legR.rotation.x = sin(p) * amp;
    // la rodilla se dobla mientras la pierna avanza
    const fl = max(0, cos(p)), fr = max(0, -cos(p));
    h.shinL.rotation.x = a * (0.08 + knee * fl * fl * (drag ? 0.45 : 1));
    h.shinR.rotation.x = a * (0.08 + knee * fr * fr);
    // el pie se levanta al apoyar el talón y se estira al despegar
    h.footL.rotation.x = a * (-0.25 * max(0, -sin(p)) + 0.3 * fl * 0.5);
    h.footR.rotation.x = a * (-0.25 * max(0, sin(p)) + 0.3 * fr * 0.5);
    // los dedos se doblan al despegar el pie del suelo
    h.toeL.rotation.x = -a * (run ? 0.7 : 0.5) * max(0, -sin(p)) * (drag ? 0.3 : 1);
    h.toeR.rotation.x = -a * (run ? 0.7 : 0.5) * max(0, sin(p));
    // los hombros acompañan el paso
    h.clavL.rotation.y = -sin(p) * (run ? 0.1 : 0.05) * a;
    h.clavR.rotation.y = -sin(p) * (run ? 0.1 : 0.05) * a;
    // cadera: sube al pasar la pierna, baja al apoyar, y se balancea
    h.hips.position.y = 0.95 - 0.02 * a + (run ? 0.035 : 0.018) * a * cos(2 * p);
    h.hips.rotation.y = sin(p) * 0.11 * a;
    h.hips.rotation.z = sin(p) * 0.045 * a;
    h.spine.rotation.z = -sin(p) * 0.03 * a;
    h.chest.rotation.y = -sin(p) * 0.15 * a;
  }

  // Brazos al caminar, con el codo un poco retrasado
  function armSwing(h, p, a, run, side) {
    const A = side === 'L' ? 'L' : 'R';
    const sg = side === 'L' ? 1 : -1;
    const sw = sin(p) * sg;
    h['arm' + A].rotation.x = sw * (run ? 0.75 : 0.42) * a;
    h['arm' + A].rotation.z = sg * (0.07 + (run ? 0.1 : 0) * a);
    const lag = max(0, -sin(p - 0.45) * sg);
    h['fore' + A].rotation.x = run ? -1.25 - 0.25 * lag * a : -0.18 - 0.38 * lag * a;
  }

  // Pose del jugador
  function posePlayer(h, s) {
    reset(h);
    const a = s.amt, t = s.time || 0;
    const two = !!s.two;
    const armed = s.cat && s.cat !== 'none';

    // ---- movimiento omnidireccional: la cadera gira hacia donde vas y el torso sigue mirando al frente
    let rel = s.rel || 0, p = s.phase, twist = 0;
    if (a > 0.05) {
      if (Math.abs(rel) <= 2.0) twist = Math.max(-0.95, Math.min(0.95, rel));
      else { p = -p; twist = Math.max(-0.8, Math.min(0.8, U.angleDiff(rel, Math.PI * Math.sign(rel)))); }
    }
    legs(h, p, a, s.run, false);
    h.hips.rotation.y += twist * a;
    h.spine.rotation.y -= twist * 0.55 * a;
    h.chest.rotation.y -= twist * 0.45 * a;
    armSwing(h, p, a, s.run, 'L');
    armSwing(h, p, a, s.run, 'R');
    if (s.run) { h.spine.rotation.x = 0.26; h.neck.rotation.x = -0.16; }
    // respiración y pequeño balanceo de peso en reposo
    const idle = 1 - a;
    h.chest.rotation.x += sin(t * 1.7) * 0.022 * idle;
    h.hips.rotation.z += sin(t * 0.55) * 0.02 * idle;
    h.armL.rotation.z += sin(t * 1.7) * 0.012 * idle;
    h.armR.rotation.z -= sin(t * 1.7) * 0.012 * idle;
    h.clavL.rotation.z += sin(t * 1.7) * 0.025 * idle;
    h.clavR.rotation.z -= sin(t * 1.7) * 0.025 * idle;

    const gs = s.gun || null;
    if (armed && !gs) {
      if (s.aim) {
        // en guardia
        h.armR.rotation.x = -0.95; h.armR.rotation.z = -0.18;
        h.foreR.rotation.x = -1.15 + sin(t * 2) * 0.03;
        if (two) { h.armL.rotation.x = -0.95; h.armL.rotation.z = -0.52; h.foreL.rotation.x = -1.15; }
        else { h.armL.rotation.x = -0.25; h.foreL.rotation.x = -0.5; }
        h.spine.rotation.x = Math.max(h.spine.rotation.x, 0.12); h.chest.rotation.y -= 0.18;
        h.clavR.rotation.y += 0.16; h.clavR.rotation.z -= 0.08;
        if (two) h.clavL.rotation.y -= 0.22;
      } else if (two) {
        // a dos manos, el arma cruzada por delante
        h.armR.rotation.x = -0.4 + sin(p) * 0.05 * a; h.armR.rotation.z = -0.12;
        h.foreR.rotation.x = -0.95;
        h.armL.rotation.x = -0.5; h.armL.rotation.z = -0.45;
        h.foreL.rotation.x = -1.0;
        h.clavL.rotation.y -= 0.15;
      } else {
        // a una mano, relajada al costado
        h.armR.rotation.x = -0.1 - sin(p) * (s.run ? 0.35 : 0.18) * a;
        h.foreR.rotation.x = -0.18 - (s.run ? 0.6 : 0.08) * a;
      }
    } else if (!armed && s.aim) {
      h.armL.rotation.x = -0.95; h.armR.rotation.x = -0.95;
      h.foreL.rotation.x = -1.0; h.foreR.rotation.x = -1.0;
    }

    // armas de fuego: al apuntar el torso sigue la mirada (arriba y abajo), los hombros se adelantan
    // y con escopeta o rifle la cabeza se apoya en la culata
    if (gs) {
      const ai = U.smooth(c01(gs.aim)) * (s.climb != null ? 0 : 1) * (1 - (s.prone || 0));
      const pt = s.pitch || 0;
      h.spine.rotation.x += pt * 0.4 * ai + 0.05 * ai;
      h.neck.rotation.x += pt * 0.25 * ai;
      if (gs.kind === 'shotgun' || gs.kind === 'rifle') {
        h.neck.rotation.z += 0.14 * ai; h.neck.rotation.y -= 0.1 * ai; h.head.rotation.x += 0.12 * ai;
        h.clavL.rotation.y -= 0.45 * ai; h.clavR.rotation.y += 0.1 * ai; h.chest.rotation.y -= 0.1 * ai;
      } else if (gs.kind === 'pistol') {
        h.clavL.rotation.y -= 0.25 * ai; h.clavR.rotation.y += 0.18 * ai; h.head.rotation.x += 0.06 * ai;
      } else {
        // arco: el cuerpo de perfil, el hombro izquierdo hacia el blanco
        h.clavL.rotation.y -= 0.3 * ai; h.chest.rotation.y -= 0.3 * ai; h.spine.rotation.y -= 0.15 * ai;
        h.neck.rotation.y += 0.25 * ai; h.clavR.rotation.z -= 0.1 * ai * c01(gs.draw || 0);
      }
    }

    // agachado (sigilo): agachado hondo, torso muy inclinado, cabeza levantada mirando al frente,
    // brazos algo separados y bajos, hombros encogidos
    const c = s.crouch || 0;
    if (c > 0.01) {
      h.hips.position.y -= 0.3 * c;
      h.legL.rotation.x -= 1.1 * c; h.legR.rotation.x -= 1.1 * c;
      h.legL.rotation.z += 0.08 * c; h.legR.rotation.z -= 0.08 * c;
      h.shinL.rotation.x += 1.65 * c; h.shinR.rotation.x += 1.65 * c;
      h.footL.rotation.x -= 0.55 * c; h.footR.rotation.x -= 0.55 * c;
      h.toeL.rotation.x -= 0.25 * c; h.toeR.rotation.x -= 0.25 * c;
      h.spine.rotation.x += 0.55 * c;
      h.neck.rotation.x -= 0.32 * c; h.head.rotation.x -= 0.12 * c;
      h.clavL.rotation.y -= 0.12 * c; h.clavR.rotation.y += 0.12 * c;
      h.clavL.rotation.z += 0.06 * c; h.clavR.rotation.z -= 0.06 * c;
      if (!s.aim && !(armed && two)) {
        const sw2 = sin(p) * 0.18 * a;
        h.armL.rotation.x = U.lerp(h.armL.rotation.x, -0.45 + sw2, c); h.armL.rotation.z = U.lerp(h.armL.rotation.z, 0.24, c);
        h.foreL.rotation.x = U.lerp(h.foreL.rotation.x, -0.85, c);
        if (!armed) {
          h.armR.rotation.x = U.lerp(h.armR.rotation.x, -0.45 - sw2, c); h.armR.rotation.z = U.lerp(h.armR.rotation.z, -0.24, c);
          h.foreR.rotation.x = U.lerp(h.foreR.rotation.x, -0.85, c);
        }
      }
    }

    // saltito
    if (s.hop) {
      const k = sin(Math.PI * s.hop);
      h.legL.rotation.x -= 0.6 * k; h.shinL.rotation.x += 1.0 * k;
      h.legR.rotation.x -= 0.3 * k; h.shinR.rotation.x += 0.7 * k;
      h.armL.rotation.x -= 0.5 * k; h.armR.rotation.x -= 0.5 * k;
    }

    if (s.action) action(h, s.action, s.t, two, s);
    if (s.dodge != null) dodgePose(h, s.dodge, s.dodgeRel || 0, armed, two);
    if (s.climb != null) {
      const k = sin(Math.PI * s.climb);
      h.legL.rotation.x = -1.2 * k; h.shinL.rotation.x = 1.4 * k;
      h.legR.rotation.x = -0.4 * k; h.shinR.rotation.x = 0.8 * k;
      h.spine.rotation.x = 0.5 * k;
      h.armL.rotation.x = -1.0 * k; h.armR.rotation.x = -1.0 * k;
    }

    // ---- pecho a tierra: el cuerpo se tumba boca abajo y se arrastra
    const pr = s.prone || 0;
    if (pr > 0.01) {
      const q = Math.sin(s.phase), am = a;
      const P = {
        armL: [-2.75 + q * 0.45 * am, 0, 0.35], armR: [-2.75 - q * 0.45 * am, 0, -0.35],
        foreL: [-0.55 - 0.4 * Math.max(0, -q) * am, 0, 0], foreR: [-0.55 - 0.4 * Math.max(0, q) * am, 0, 0],
        legL: [0.05 + q * 0.3 * am, 0, 0.16], legR: [0.05 - q * 0.3 * am, 0, -0.16],
        shinL: [0.15 + 0.7 * Math.max(0, q) * am, 0, 0], shinR: [0.15 + 0.7 * Math.max(0, -q) * am, 0, 0],
        footL: [0.4, 0, 0], footR: [0.4, 0, 0],
        spine: [0, 0, q * 0.06 * am], chest: [0, q * 0.08 * am, 0],
        neck: [-0.7, 0, 0], head: [-0.25, 0, 0], hips: [0, 0, -q * 0.05 * am]
      };
      for (const name in P) {
        const r = h[name].rotation, v = P[name];
        r.x = U.lerp(r.x, v[0], pr); r.y = U.lerp(r.y, v[1], pr); r.z = U.lerp(r.z, v[2], pr);
      }
      h.hips.position.y = U.lerp(h.hips.position.y, 0.95, pr);
    }
    const th = Math.PI / 2 * U.smooth(pr);
    h.body.rotation.x = th;
    h.body.position.set(0, (0.9 - 0.9 * Math.cos(th)) - 0.76 * Math.sin(th), -0.9 * Math.sin(th));

    // la cabeza compensa el giro del cuerpo (mira hacia delante)
    if (pr < 0.5) h.head.rotation.y -= (h.hips.rotation.y + h.spine.rotation.y + h.chest.rotation.y) * 0.6;
    // dedos: la mano se cierra sobre lo que agarra; relajada si está libre; abierta al empujar
    {
      const open = s.action === 'shove' || s.action === 'search';
      let cR = armed ? 1.15 : 0.35, cL = armed && two ? 1.0 : 0.3;
      if (gs) {
        cR = gs.kind === 'bow' ? 0.7 : 1.15;
        cL = gs.kind === 'pistol' ? 0.3 + 0.8 * U.smooth(c01(gs.aim)) : 1.05;
      }
      if (s.action === 'grab') { cL = 1.1; cR = s.grabKnife ? 1.15 : 1.0; }
      if (open) { cL = 0.1; cR = armed ? cR : 0.1; }
      h.fingR.rotation.z = cR; h.fingL.rotation.z = -cL;
    }
    distributeSpine(h);
    blend(h, s.dt, (s.action || s.dodge != null) ? 30 : 15);
    if (h.weapon && !gs) h.weapon.visible = (s.action !== 'grab' || !!(s.grabKnife && armed && s.cat === 'sblade')) && s.action !== 'search';
    if (s.action === 'grab') { if (gs) gunIK(h, s, gs); grabIK(h, s); }
    else if (s.action === 'search') { if (h.weapon) h.weapon.visible = false; }
    else if (gs) gunIK(h, s, gs);
    // mano izquierda sobre el arma cuando se agarra a dos manos
    else if (armed && two && pr < 0.5 && s.climb == null && s.action !== 'shove' && s.action !== 'stomp') leftHandIK(h);
    if (h.grabKnife) h.grabKnife.visible = s.action === 'grab' && !!s.grabKnife && !(armed && s.cat === 'sblade' && !gs);
  }

  // Agarre por la espalda: el brazo izquierdo rodea el cuello; con cuchillo, la derecha apuñala;
  // sin cuchillo, la derecha agarra la muñeca izquierda y estrangula
  const _gL = new THREE.Vector3(), _gR = new THREE.Vector3(), _gp1 = new THREE.Vector3(), _gp2 = new THREE.Vector3();
  const POLE_GL = new THREE.Vector3(1, -0.6, -0.3).normalize(), POLE_GR = new THREE.Vector3(-1, -0.7, -0.2).normalize();
  function grabIK(h, s) {
    const t = s.t;
    const k = win(t, 0, 0.12) * (1 - win(t, 0.86, 1));
    if (k <= 0) return;
    h.root.updateMatrixWorld(true);
    const shake = sin(t * 40) * 0.02 * (1 - win(t, 0.55, 0.8));
    h.chest.localToWorld(_gL.set(-0.1 + shake, 0.24, 0.44));
    armIK(h, 'L', _gL, _gp1.copy(POLE_GL), k);
    if (s.grabKnife) {
      // tres puñaladas al cuello
      let st = 0;
      for (const c of [0.3, 0.45, 0.6]) st = Math.max(st, win(t, c - 0.08, c) * (1 - win(t, c, c + 0.07)));
      h.chest.localToWorld(_gR.set(-0.28 + 0.18 * st, 0.32 - 0.05 * st, 0.12 + 0.28 * st));
      if (!h.grabKnife) {
        mats();
        h.grabKnife = new THREE.Mesh(weaponGeometry('cuchillo_caza'), matWeapon);
        h.grabKnife.rotation.x = 2.35; h.grabKnife.position.set(0, -0.05, 0.015);
        h.handR.add(h.grabKnife);
      }
    } else {
      h.chest.localToWorld(_gR.set(0.02 + shake, 0.22, 0.4));
    }
    armIK(h, 'R', _gR, _gp2.copy(POLE_GR), k);
  }

  // Esquiva: se agacha y se aparta hacia un lado o hacia atrás, con la guardia alta.
  // rel = dirección de la esquiva respecto a donde mira el personaje
  function dodgePose(h, t, rel, armed, two) {
    const k = sin(Math.PI * c01(t * 1.15)) ;
    const fc = cos(rel), sc = sin(rel);            // adelante (+) / atrás (-), izquierda (+) / derecha (-)
    const L = sc >= 0;
    h.hips.position.y -= 0.17 * k;
    h.hips.rotation.y += -sc * 0.25 * k;
    h.spine.rotation.x += 0.3 * k + 0.12 * fc * k;
    h.spine.rotation.z += -sc * 0.32 * k;
    h.neck.rotation.x -= 0.2 * k; h.neck.rotation.z += sc * 0.22 * k;
    // pierna que lleva el paso hacia la esquiva, la otra empuja
    const lead = L ? 'L' : 'R', push = L ? 'R' : 'L';
    h['leg' + lead].rotation.x += (-0.35 - 0.35 * fc) * k; h['leg' + lead].rotation.z += (L ? 1 : -1) * 0.38 * abs(sc) * k;
    h['shin' + lead].rotation.x += 0.75 * k;
    h['leg' + push].rotation.x += (0.15 - 0.25 * fc) * k; h['shin' + push].rotation.x += 0.55 * k;
    h['leg' + push].rotation.z += (L ? 1 : -1) * 0.12 * abs(sc) * k;
    h['toe' + push].rotation.x -= 0.6 * k;
    // guardia: brazos recogidos delante de la cara
    h.armL.rotation.x = U.lerp(h.armL.rotation.x, -1.1, k); h.foreL.rotation.x = U.lerp(h.foreL.rotation.x, -1.6, k);
    h.armL.rotation.z = U.lerp(h.armL.rotation.z, -0.2, k);
    if (!armed || two) { h.armR.rotation.x = U.lerp(h.armR.rotation.x, -1.0, k); h.foreR.rotation.x = U.lerp(h.foreR.rotation.x, -1.5, k); }
    else { h.armR.rotation.x = U.lerp(h.armR.rotation.x, -0.6, k); h.foreR.rotation.x = U.lerp(h.foreR.rotation.x, -1.2, k); }
    h.clavL.rotation.y -= 0.2 * k; h.clavR.rotation.y += 0.2 * k;
  }

  // Reparte la curva y el giro de la columna entre sus tres tramos (espalda más natural)
  function distributeSpine(h) {
    const sp = h.spine.rotation, s2 = h.spine2.rotation, ch = h.chest.rotation;
    const bx = sp.x, by = sp.y, bz = sp.z, cy = ch.y;
    sp.x = bx * 0.5; s2.x += bx * 0.5;
    sp.y = by * 0.6; s2.y += by * 0.4 + cy * 0.3; ch.y = cy * 0.7;
    sp.z = bz * 0.6; s2.z += bz * 0.4;
  }

  // ---- IK de dos huesos: lleva una mano a un punto (en el mundo)
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
  const _down = new THREE.Vector3(0, -1, 0);
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
  const POLE = new THREE.Vector3(0.45, -1, -0.35).normalize();
  // side 'L' o 'R'; target en el mundo (se modifica); pole en el espacio de la clavícula; w = peso (0 FK, 1 IK)
  function armIK(h, side, target, pole, w) {
    if (w <= 0.001) return;
    const clav = h['clav' + side], arm = h['arm' + side], fore = h['fore' + side];
    const T = clav.worldToLocal(target);
    const S = arm.position;
    const A = 0.28, B = 0.31;
    const v = _v2.copy(T).sub(S);
    let d = v.length();
    if (d < 1e-4) return;
    v.divideScalar(d);
    d = Math.max(0.08, Math.min(A + B - 0.003, d));
    const cosA = U.clamp((A * A + d * d - B * B) / (2 * A * d), -1, 1);
    const ang = Math.acos(cosA);
    const pp = _v3.copy(pole).addScaledVector(v, -v.dot(pole));
    if (pp.lengthSq() < 1e-6) pp.set(0, -1, 0);
    pp.normalize();
    const u = _v4.copy(v).multiplyScalar(Math.cos(ang)).addScaledVector(pp, Math.sin(ang)).normalize();
    _q1.setFromUnitVectors(_down, u);
    const E = u.multiplyScalar(A).add(S);
    const fdir = T.sub(E).normalize().applyQuaternion(_q2.copy(_q1).invert());
    _q3.setFromUnitVectors(_down, fdir);
    if (w >= 0.999) { arm.quaternion.copy(_q1); fore.quaternion.copy(_q3); }
    else {
      _q4.copy(arm.quaternion); arm.quaternion.copy(_q4.slerp(_q1, w));
      _q4.copy(fore.quaternion); fore.quaternion.copy(_q4.slerp(_q3, w));
    }
  }

  function leftHandIK(h) {
    if (!h.weapon) return;
    h.root.updateMatrixWorld(true);
    const grip = h.weaponGrip || 0.2;
    armIK(h, 'L', h.weapon.localToWorld(_v1.set(0, grip, 0)), POLE, 1);
    h.handL.rotation.set(0, 0, 0.3);
  }

  // ---- Armas de fuego: pose del soporte (en el espacio del pecho) y manos con IK
  // [x, y, z, cabeceo, giro, alabeo]; cabeceo positivo = cañón hacia abajo; giro positivo = hacia la izquierda
  const GP = {
    pistol: { ready: [-0.24, -0.4, 0.16, 1.25, 0.08, 0], aim: [-0.05, 0.2, 0.45, 0, 0.05, 0], load: [-0.05, 0.03, 0.3, 0.35, 0.3, -0.6], L: [0.03, -0.035, 0.0] },
    shotgun: { ready: [-0.06, -0.1, 0.2, 0.4, 0.45, 0.2], aim: [-0.13, 0.155, 0.28, 0, 0.03, 0], load: [-0.07, -0.02, 0.27, 0.3, 0.35, -0.75], L: [0, -0.016, 0.3] },
    rifle: { ready: [-0.06, -0.1, 0.2, 0.4, 0.45, 0.2], aim: [-0.13, 0.155, 0.28, 0, 0.03, 0], load: [-0.08, 0.0, 0.27, 0.2, 0.3, -0.45], L: [0, -0.012, 0.3] },
    bow: { ready: [0.25, -0.3, 0.1, 0.35, 0, 0.1], aim: [0.04, 0.25, 0.5, 0, -0.04, -0.22], load: null, L: [0, 0, 0] }
  };
  const PRONE_GUN = [-0.16, 0.55, 0.12, -1.5, 0, 0];
  const RECOIL = { pistol: [0.06, 0.45], shotgun: [0.08, 0.32], rifle: [0.07, 0.26], bow: [0, 0] };
  const POLE_R = new THREE.Vector3(-0.5, -1, -0.25).normalize(), POLE_RA = new THREE.Vector3(-1, -0.35, -0.1).normalize();
  const POLE_L = new THREE.Vector3(0.45, -1, -0.2).normalize(), POLE_LA = new THREE.Vector3(0.25, -1, 0.1).normalize();
  const POLE_DRAW = new THREE.Vector3(-0.7, 0.15, -1).normalize();
  const _pR = new THREE.Vector3(), _pL = new THREE.Vector3(), _poleR = new THREE.Vector3(), _poleL = new THREE.Vector3();
  const lerp6 = (a, b, k, out) => { for (let i = 0; i < 6; i++) out[i] = a[i] + (b[i] - a[i]) * k; return out; };
  const _T = [0, 0, 0, 0, 0, 0], _B = [0, 0, 0, 0, 0, 0];
  const win = (t, a, b) => U.smooth((t - a) / (b - a));      // 0 antes de a, 1 después de b

  function gunIK(h, s, gs) {
    const g = h.gun;
    if (!g) return;
    const G6 = GP[g.kind];
    const ai = s.climb != null ? 0 : U.smooth(c01(gs.aim));
    const T = lerp6(G6.ready, G6.aim, ai, _T);
    const rw = G6.load ? c01(gs.rw || 0) : 0;
    if (rw > 0) lerp6(T, G6.load, U.smooth(rw), T);
    const cyc = gs.cycle != null && gs.cycle >= 0 ? gs.cycle : -1;
    if (cyc >= 0 && g.kind !== 'bow') { const d = sin(Math.PI * cyc); T[1] -= 0.03 * d; T[3] += 0.12 * d; }
    T[3] += (s.pitch || 0) * 0.6 * ai;
    // culatazo / golpe con la pistola
    let bw = 0;
    if (s.action === 'bash') {
      const t = s.t;
      bw = win(t, 0, 0.12) * (1 - win(t, 0.8, 1));
      const wind = easeOut(t / 0.3), hit = easeIn((t - 0.28) / 0.17), back = U.smooth((t - 0.6) / 0.4);
      const f = hit * (1 - back);
      if (g.kind === 'pistol') {
        _B[0] = -0.2 + 0.14 * f; _B[1] = 0.3 * wind * (1 - hit) - 0.05 * f; _B[2] = 0.12 + 0.3 * f;
        _B[3] = -1.2 * wind * (1 - hit) + 1.0 * f; _B[4] = 0; _B[5] = 0;
      } else {
        _B[0] = -0.02; _B[1] = 0.06 + 0.04 * f; _B[2] = 0.16 - 0.05 * wind * (1 - hit) + 0.28 * f;
        _B[3] = 0; _B[4] = 1.3; _B[5] = 0;
      }
      lerp6(T, _B, bw, T);
    }
    const pr = U.smooth(c01(s.prone || 0));
    if (pr > 0) lerp6(T, PRONE_GUN, pr, T);

    // suavizado del soporte (el retroceso se suma después, para que sea seco)
    if (!h.gunT || !h.gunAnchorOk) { h.gunT = T.slice(); h.gunAnchorOk = true; }
    const k = s.dt != null ? 1 - Math.exp(-s.dt * 16) : 1;
    for (let i = 0; i < 6; i++) h.gunT[i] += (T[i] - h.gunT[i]) * k;
    const R = h.gunT, rc = RECOIL[g.kind], rec = (gs.recoil || 0) * (1 - pr);
    const an = h.gunAnchor;
    an.rotation.order = 'YXZ';
    an.position.set(R[0], R[1] + 0.02 * rec, R[2] - rc[0] * rec);
    an.rotation.set(R[3] - rc[1] * rec, R[4], R[5]);
    h.weapon.visible = s.action !== 'grab';

    // piezas móviles
    if (g.kind === 'shotgun') {
      g.part.position.y = g.partRest - (cyc >= 0 ? 0.1 * sin(Math.PI * cyc) : 0);
    } else if (g.kind === 'rifle') {
      let rot = 0, back = 0;
      if (cyc >= 0) {
        const up = win(cyc, 0.18, 0.32) - win(cyc, 0.72, 0.84);
        const bk = win(cyc, 0.34, 0.52) - win(cyc, 0.54, 0.7);
        rot = up; back = bk;
      }
      rot = Math.max(rot, rw); back = Math.max(back, rw);
      g.part.rotation.y = -1.1 * rot;
      g.part.position.y = g.partRest - 0.08 * back;
    }
    let nockY = -0.07;
    if (g.kind === 'bow') {
      const draw = cyc >= 0 ? 0 : c01(gs.draw || 0);
      nockY = -0.07 - 0.4 * draw;
      const p = g.string.geometry.attributes.position;
      p.setY(1, nockY); p.needsUpdate = true;
      g.arrow.visible = gs.arrow && (cyc < 0 || cyc > 0.8);
      g.arrow.position.y = nockY;
    }

    h.root.updateMatrixWorld(true);
    const hold = (x, y, z) => h.weapon.localToWorld(_pR.set(x, y, z));
    const chestP = (x, y, z, out) => h.chest.localToWorld(out.set(x, y, z));

    // ---- mano derecha
    let wR = 1, poleR = _poleR.copy(POLE_R).lerp(POLE_RA, g.kind === 'pistol' ? ai * 0.3 : ai).normalize();
    let tR;
    if (g.kind === 'bow') {
      wR = Math.max(ai, cyc >= 0 ? 1 : 0, bw);
      tR = hold(-0.015, 0, nockY);
      if (cyc >= 0) {
        const a = _v3.copy(tR);
        const ft = chestP(-0.14, 0.27, -0.06, _pL.clone());
        const qv = chestP(-0.12, 0.34, -0.2, _pL.clone());
        const rest = hold(-0.015, 0, -0.07).clone();
        let p = a.clone().lerp(ft, win(cyc, 0, 0.12));
        p.lerp(qv, win(cyc, 0.12, 0.45));
        p.lerp(rest, win(cyc, 0.45, 0.8));
        tR = _pR.copy(p);
      }
      poleR = _poleR.copy(POLE_DRAW);
    } else {
      tR = hold(0, 0, 0).clone();
      if (g.kind === 'rifle' && cyc >= 0) {
        const knob = g.part.localToWorld(_v3.set(-0.05, 0, 0.004)).clone();
        tR.lerp(knob, win(cyc, 0.04, 0.18) * (1 - win(cyc, 0.84, 0.98)));
      }
      if (g.kind === 'rifle' && rw > 0) {
        const u = gs.ru || 0;
        const pocket = chestP(-0.2, -0.3, 0.1, _v3.clone());
        const port = hold(0, 0.03, 0.04).clone();
        const toPocket = win(u, 0, 0.4) * (1 - win(u, 0.45, 0.85));
        tR.lerp(port.lerp(pocket, toPocket), U.smooth(rw));
      }
    }
    armIK(h, 'R', tR, poleR, wR);

    // ---- mano izquierda
    let wL = 1, tL;
    if (g.kind === 'bow') tL = hold(0, 0, 0).clone();
    else {
      tL = hold(G6.L[0], G6.L[1], G6.L[2] + (g.kind === 'shotgun' && cyc >= 0 ? -0.1 * sin(Math.PI * cyc) : 0)).clone();
      if (g.kind === 'pistol') {
        wL = Math.max(ai, rw);
        if (s.action === 'bash') wL *= 1 - bw;
        if (rw > 0) {
          const u = gs.ru || 0;
          const well = hold(0, -0.1, -0.04).clone();
          const pouch = chestP(0.14, -0.36, 0.12, _v3.clone());
          const slideA = hold(0, 0.045, -0.03).clone(), slideB = hold(0, 0.045, -0.1).clone();
          const p = tL.clone().lerp(well, win(u, 0, 0.14));
          p.lerp(pouch, win(u, 0.16, 0.38));
          p.lerp(well, win(u, 0.42, 0.62));
          p.lerp(slideA, win(u, 0.64, 0.74));
          p.lerp(slideB, win(u, 0.76, 0.84));
          p.lerp(tL, win(u, 0.86, 1));
          tL = p;
        }
      } else if (g.kind === 'shotgun' && rw > 0) {
        const u = gs.ru || 0;
        const belt = chestP(0.06, -0.33, 0.16, _v3.clone());
        const port = hold(0, -0.04, 0.06).clone();
        const p = tL.clone().lerp(belt, win(u, 0, 0.3) * U.smooth(rw));
        p.lerp(port, win(u, 0.4, 0.75) * U.smooth(rw));
        tL = p;
      }
      if (pr > 0.5) wL = 0;
    }
    const poleL = _poleL.copy(POLE_L).lerp(POLE_LA, ai).normalize();
    armIK(h, 'L', tL, poleL, wL);
    if (pr > 0.5 && g.kind === 'bow') { /* tumbado: el arco va en la mano izquierda igual */ }
  }

  // Ataques: t de 0 a 1, el golpe ocurre hacia t = 0.45.
  // Preparación rápida, golpe que acelera hasta el impacto y recuperación suave.
  function action(h, kind, t, two, s) {
    const wind = easeOut(t / 0.3);
    const hit = easeIn((t - 0.28) / 0.17);
    const back = U.smooth((t - 0.6) / 0.4);
    if (kind === 'swing2') {
      // golpe horizontal: giro de cadera y torso, con paso adelante
      const tw = -1.15 * wind + 2.15 * hit - 1.0 * back;
      h.hips.rotation.y = tw * 0.25;
      h.spine.rotation.y = tw * 0.35;
      h.chest.rotation.y = tw * 0.45;
      h.spine.rotation.x = 0.08 + 0.1 * hit * (1 - back);
      h.armR.rotation.x = -1.2 - 0.15 * wind * (1 - hit); h.armR.rotation.z = -0.3 + 0.25 * hit;
      h.foreR.rotation.x = -0.45 + 0.15 * hit;
      if (two) { h.armL.rotation.x = -1.15; h.armL.rotation.z = -0.6; h.foreL.rotation.x = -0.55; }
      else { h.armL.rotation.x = 0.3 * hit; h.armL.rotation.z = 0.35 * hit; }
      h.legL.rotation.x += -0.3 * hit * (1 - back);
      h.legR.rotation.x += 0.22 * hit * (1 - back);
      h.shinR.rotation.x += 0.2 * hit * (1 - back);
      h.toeR.rotation.x = -0.45 * hit * (1 - back);
      h.clavR.rotation.z = -0.22 * wind * (1 - hit); h.clavR.rotation.y = 0.25 * hit * (1 - back);
      if (two) h.clavL.rotation.y = -0.3 * hit * (1 - back);
    } else if (kind === 'swing1' || kind === 'floor') {
      // golpe de arriba abajo (o al suelo)
      const low = kind === 'floor';
      const up = -2.6 * wind;
      const down = (low ? 2.2 : 1.6) * hit;
      h.armR.rotation.x = -0.4 + up + down + 0.6 * back;
      h.armR.rotation.z = -0.3 * wind * (1 - hit);
      h.foreR.rotation.x = -0.95 * wind + 0.65 * hit;
      h.handR.rotation.x = 0.85 * hit * (1 - back * 0.6);
      h.spine.rotation.x = (low ? 0.55 : 0.14) * hit * (1 - back * 0.7) - 0.08 * wind * (1 - hit);
      h.chest.rotation.y = -0.4 * wind + 0.65 * hit * (1 - back);
      h.hips.rotation.y = -0.15 * wind + 0.25 * hit * (1 - back);
      if (two) { h.armL.rotation.x = h.armR.rotation.x; h.armL.rotation.z = -0.45; h.foreL.rotation.x = h.foreR.rotation.x - 0.3; }
      else { h.armL.rotation.x = -0.3 * wind + 0.4 * hit; h.armL.rotation.z = 0.2; }
      if (low) { h.legL.rotation.x = -0.5 * hit; h.shinL.rotation.x = 0.6 * hit; h.legR.rotation.x = 0.2 * hit; }
      else { h.legL.rotation.x += -0.2 * hit * (1 - back); }
    } else if (kind === 'swing2b') {
      // revés horizontal: el arma vuelve de izquierda a derecha cruzando el cuerpo
      const tw = 1.0 * wind - 2.0 * hit + 1.0 * back;
      h.hips.rotation.y = tw * 0.22;
      h.spine.rotation.y = tw * 0.35;
      h.chest.rotation.y = tw * 0.45;
      h.spine.rotation.x = 0.1 + 0.08 * hit * (1 - back);
      h.armR.rotation.x = -1.25 + 0.1 * hit; h.armR.rotation.z = 0.45 * wind * (1 - hit) - 0.55 * hit * (1 - back);
      h.foreR.rotation.x = -1.15 * wind * (1 - hit) - 0.35 * hit - 0.4 * back;
      h.handR.rotation.z = -0.4 * hit * (1 - back);
      if (two) { h.armL.rotation.x = -1.2; h.armL.rotation.z = -0.3; h.foreL.rotation.x = -0.7; }
      else { h.armL.rotation.x = -0.2 * wind; h.armL.rotation.z = 0.3 + 0.25 * hit; }
      h.clavR.rotation.y = 0.3 * wind * (1 - hit); h.clavR.rotation.z = -0.15 * hit * (1 - back);
      h.legR.rotation.x += -0.28 * hit * (1 - back); h.shinR.rotation.x += 0.15 * hit * (1 - back);
      h.legL.rotation.x += 0.18 * hit * (1 - back);
      h.toeL.rotation.x = -0.4 * hit * (1 - back);
    } else if (kind === 'swing1b') {
      // revés en diagonal hacia abajo, a una mano
      const tw = 0.9 * wind - 1.7 * hit + 0.8 * back;
      h.chest.rotation.y = tw * 0.5; h.spine.rotation.y = tw * 0.3; h.hips.rotation.y = tw * 0.18;
      h.armR.rotation.x = -1.9 * wind * (1 - hit) - 0.7 * hit - 0.2 * back;
      h.armR.rotation.z = 0.55 * wind * (1 - hit) - 0.45 * hit * (1 - back);
      h.foreR.rotation.x = -1.2 * wind * (1 - hit) - 0.25 * hit;
      h.handR.rotation.x = 0.6 * hit * (1 - back);
      h.spine.rotation.x = 0.06 + 0.16 * hit * (1 - back);
      h.armL.rotation.x = -0.35 * wind + 0.25 * hit; h.armL.rotation.z = 0.25;
      h.legR.rotation.x += -0.22 * hit * (1 - back);
    } else if (kind === 'overhead') {
      // golpe fuerte: levanta el arma por encima de la cabeza y la descarga con todo el cuerpo
      const wind2 = easeOut(t / 0.36);
      const hit2 = easeIn((t - 0.34) / 0.13);
      const up = wind2 * (1 - hit2), f = hit2 * (1 - back);
      h.armR.rotation.x = -0.6 - 2.35 * up - 0.15 * f + 0.3 * back; h.armR.rotation.z = -0.15 * up;
      h.foreR.rotation.x = -1.2 * up - 0.25 * f - 0.4 * back;
      h.handR.rotation.x = -0.4 * up + 0.9 * f;
      h.armL.rotation.x = h.armR.rotation.x; h.armL.rotation.z = -0.4; h.foreL.rotation.x = h.foreR.rotation.x - 0.3;
      h.spine.rotation.x = -0.2 * up + 0.5 * f + 0.1 * back;
      h.neck.rotation.x = 0.15 * up - 0.2 * f;
      h.clavL.rotation.z = 0.2 * up; h.clavR.rotation.z = -0.2 * up;
      h.clavL.rotation.y = -0.2 * f; h.clavR.rotation.y = 0.2 * f;
      h.hips.position.y -= 0.07 * f;
      h.legL.rotation.x += -0.55 * f - 0.15 * up; h.shinL.rotation.x += 0.45 * f;
      h.legR.rotation.x += 0.35 * f; h.shinR.rotation.x += 0.3 * f; h.toeR.rotation.x = -0.55 * f;
    } else if (kind === 'slash') {
      // tajo de revés con el cuchillo
      const tw = 0.8 * wind - 1.6 * hit + 0.8 * back;
      h.chest.rotation.y = tw * 0.5; h.spine.rotation.y = tw * 0.3;
      h.armR.rotation.x = -1.3 + 0.1 * hit; h.armR.rotation.z = 0.65 * wind * (1 - hit) - 0.7 * hit * (1 - back);
      h.foreR.rotation.x = -1.4 * wind * (1 - hit) - 0.2 * hit - 0.5 * back;
      h.handR.rotation.y = 0.5 * wind * (1 - hit) - 0.6 * hit * (1 - back);
      h.armL.rotation.x = -0.6; h.foreL.rotation.x = -1.2; h.armL.rotation.z = 0.2;
      h.spine.rotation.x = 0.12 + 0.1 * hit * (1 - back);
      h.legL.rotation.x += -0.2 * hit * (1 - back);
    } else if (kind === 'stab') {
      h.armR.rotation.x = -0.3 * (1 - hit) - 1.45 * hit * (1 - back) - 0.3 * back;
      h.foreR.rotation.x = -1.7 * wind * (1 - hit) - 0.15 * hit;
      h.handR.rotation.x = 0.75 * hit * (1 - back);
      h.chest.rotation.y = -0.35 * wind + 0.5 * hit * (1 - back);
      h.spine.rotation.x = 0.18 * hit * (1 - back);
      h.legL.rotation.x += -0.25 * hit * (1 - back);
      if (two) { h.armL.rotation.x = h.armR.rotation.x + 0.1; h.armL.rotation.z = -0.4; h.foreL.rotation.x = h.foreR.rotation.x; }
    } else if (kind === 'thrust') {
      const f = hit * (1 - back);
      h.armR.rotation.x = -1.2 - 0.35 * f + 0.2 * wind * (1 - hit); h.armR.rotation.z = -0.1;
      h.foreR.rotation.x = -0.9 * (1 - f) - 0.1;
      h.armL.rotation.x = -1.1 - 0.4 * f; h.armL.rotation.z = -0.45;
      h.foreL.rotation.x = -0.9 * (1 - f) - 0.2;
      h.spine.rotation.x = 0.22 * f - 0.08 * wind * (1 - hit);
      h.legL.rotation.x = -0.55 * f; h.legR.rotation.x = 0.35 * f;
    } else if (kind === 'shove') {
      const f = hit * (1 - back);
      for (const A of ['L', 'R']) {
        h['arm' + A].rotation.x = -0.6 - 0.95 * f;
        h['arm' + A].rotation.z = A === 'L' ? -0.15 : 0.15;
        h['fore' + A].rotation.x = -1.35 * (1 - f) - 0.1;
      }
      h.spine.rotation.x = 0.28 * f - 0.05 * wind * (1 - hit);
      h.legL.rotation.x = -0.5 * f; h.shinL.rotation.x = 0.2 * f;
      h.clavL.rotation.y = -0.35 * f; h.clavR.rotation.y = 0.35 * f;
      h.toeR.rotation.x = -0.4 * f;
    } else if (kind === 'finisher') {
      // remate: se arrodilla junto al zombi caído, levanta el arma y golpea hacia el suelo
      const kneel = U.smooth(t / 0.18) * (1 - U.smooth((t - 0.8) / 0.2));
      const raise = easeOut((t - 0.15) / 0.25);
      const smash = easeIn((t - 0.42) / 0.12);
      const rec = U.smooth((t - 0.66) / 0.2);
      h.hips.position.y -= 0.44 * kneel;
      h.legL.rotation.x = -1.35 * kneel; h.shinL.rotation.x = 1.45 * kneel; h.footL.rotation.x = -0.1 * kneel;
      h.legR.rotation.x = 0.25 * kneel; h.shinR.rotation.x = 1.9 * kneel; h.footR.rotation.x = 0.6 * kneel;
      h.toeR.rotation.x = -0.9 * kneel;
      h.clavR.rotation.z = -0.25 * raise * (1 - smash); h.clavR.rotation.y = 0.3 * smash * (1 - rec);
      let ax = U.lerp(-0.4, -3.0, raise);
      ax = U.lerp(ax, -0.5, smash);
      ax = U.lerp(ax, -0.6, rec);
      h.armR.rotation.x = ax; h.armR.rotation.z = -0.2 * raise * (1 - smash);
      h.foreR.rotation.x = U.lerp(U.lerp(-0.3, -0.85, raise), -0.1, smash);
      h.handR.rotation.x = 0.9 * smash * (1 - rec);
      h.spine.rotation.x = 0.28 * kneel + 0.5 * smash * (1 - rec) - 0.18 * raise * (1 - smash);
      h.chest.rotation.y = -0.3 * raise * (1 - smash);
      h.neck.rotation.x = 0.25 * kneel;
      if (two) { h.armL.rotation.x = ax; h.armL.rotation.z = -0.45; h.foreL.rotation.x = h.foreR.rotation.x - 0.3; }
      else { h.armL.rotation.x = -0.3 * kneel; h.armL.rotation.z = 0.3 * kneel; h.foreL.rotation.x = -0.9 * kneel; }
    } else if (kind === 'runatk' || kind === 'runshove') {
      // ataque en carrera: impulso hacia delante, el brazo izquierdo por delante y el arma
      // arriba detrás de la cabeza; golpe de arriba abajo al llegar y recuperación a trompicones
      const lean = U.smooth(t / 0.12) * (1 - U.smooth((t - 0.6) / 0.4));
      const up = easeOut(t / 0.24) * (1 - easeIn((t - 0.24) / 0.18));
      const f = easeIn((t - 0.24) / 0.18) * (1 - U.smooth((t - 0.55) / 0.45));
      h.spine.rotation.x += 0.3 * lean + 0.35 * f;
      h.hips.position.y -= 0.06 * lean + 0.08 * f;
      // zancada: la izquierda delante, la derecha empuja atrás
      h.legL.rotation.x = -0.9 * lean; h.shinL.rotation.x = 0.7 * lean;
      h.legR.rotation.x = 0.55 * lean; h.shinR.rotation.x = 0.5 * lean + 0.4 * up; h.toeR.rotation.x = -0.6 * lean;
      h.footL.rotation.x = -0.2 * lean;
      if (kind === 'runshove') {
        // placaje con el hombro
        h.spine.rotation.x += 0.25 * (up + f);
        h.armL.rotation.x = -1.2 * lean; h.armR.rotation.x = -1.25 * lean;
        h.armL.rotation.z = -0.25 * lean; h.armR.rotation.z = 0.25 * lean;
        h.foreL.rotation.x = -1.5 * lean + 0.9 * f; h.foreR.rotation.x = -1.5 * lean + 0.9 * f;
        h.clavL.rotation.y = -0.35 * f; h.clavR.rotation.y = 0.35 * f;
        h.chest.rotation.y = -0.3 * up + 0.2 * f;
      } else {
        h.chest.rotation.y = -0.5 * up + 0.55 * f;
        h.spine.rotation.y = -0.2 * up + 0.25 * f;
        // brazo derecho: arriba detrás de la cabeza y abajo con fuerza
        h.armR.rotation.x = -0.5 - 2.3 * up + 0.2 * f;
        h.armR.rotation.z = -0.35 * up;
        h.foreR.rotation.x = -1.3 * up - 0.25 * f;
        h.handR.rotation.x = -0.3 * up + 0.85 * f;
        h.clavR.rotation.z = -0.25 * up; h.clavR.rotation.y = 0.3 * f;
        if (two) { h.armL.rotation.x = h.armR.rotation.x; h.armL.rotation.z = -0.45; h.foreL.rotation.x = h.foreR.rotation.x - 0.3; }
        else {
          // el izquierdo se lanza adelante (como para agarrar) y luego tira hacia abajo
          h.armL.rotation.x = -1.55 * up * lean - 0.5 * f; h.armL.rotation.z = -0.25 * up;
          h.foreL.rotation.x = -0.25 * up - 0.9 * f;
          h.clavL.rotation.y = -0.3 * up;
        }
      }
    } else if (kind === 'bash') {
      // culatazo: paso adelante y empuje con el cuerpo (las manos las pone el IK del arma)
      const f = hit * (1 - back);
      h.spine.rotation.x += 0.22 * f - 0.08 * wind * (1 - hit);
      h.chest.rotation.y += -0.25 * wind * (1 - hit) + 0.2 * f;
      h.legL.rotation.x += -0.45 * f; h.shinL.rotation.x += 0.25 * f;
      h.legR.rotation.x += 0.2 * f; h.toeR.rotation.x = -0.4 * f;
    } else if (kind === 'grab') {
      // agarre por la espalda: rodillas dobladas, el cuerpo tira hacia atrás
      const k = win(t, 0, 0.12) * (1 - win(t, 0.86, 1));
      const pull = sin(t * 23) * 0.05 * (1 - win(t, 0.55, 0.8));
      h.hips.position.y -= 0.12 * k;
      h.legL.rotation.x -= 0.5 * k; h.shinL.rotation.x += 0.6 * k;
      h.legR.rotation.x += 0.15 * k; h.shinR.rotation.x += 0.5 * k; h.toeR.rotation.x -= 0.4 * k;
      h.spine.rotation.x += (-0.14 + pull) * k;
      h.chest.rotation.y += pull * 2 * k;
      h.neck.rotation.x += 0.15 * k;
      h.hips.rotation.z += pull * k;
    } else if (kind === 'search') {
      // registrar: agachado ante un mueble bajo o de pie ante uno alto; las manos rebuscan
      const k = win(t, 0, 0.15) * (1 - win(t, 0.88, 1));
      const low = s && s.searchLow;
      const r1 = sin(t * 26), r2 = sin(t * 26 + 2.1);
      const dig = (1 - win(t, 0.78, 0.88));
      if (low) {
        h.hips.position.y -= 0.42 * k;
        h.legL.rotation.x -= 1.35 * k; h.shinL.rotation.x += 1.9 * k; h.footL.rotation.x -= 0.5 * k;
        h.legR.rotation.x -= 0.5 * k; h.shinR.rotation.x += 2.1 * k; h.footR.rotation.x += 0.3 * k; h.toeR.rotation.x -= 0.8 * k;
        h.spine.rotation.x += 0.55 * k;
        h.armL.rotation.x = U.lerp(h.armL.rotation.x, -0.9 + 0.25 * r1 * dig, k); h.foreL.rotation.x = U.lerp(h.foreL.rotation.x, -0.5 - 0.3 * r2 * dig, k);
        h.armR.rotation.x = U.lerp(h.armR.rotation.x, -0.95 + 0.25 * r2 * dig, k); h.foreR.rotation.x = U.lerp(h.foreR.rotation.x, -0.5 - 0.3 * r1 * dig, k);
      } else {
        h.spine.rotation.x += 0.12 * k;
        h.armL.rotation.x = U.lerp(h.armL.rotation.x, -1.25 + 0.2 * r1 * dig, k); h.foreL.rotation.x = U.lerp(h.foreL.rotation.x, -0.9 - 0.3 * r2 * dig, k);
        h.armR.rotation.x = U.lerp(h.armR.rotation.x, -1.3 + 0.2 * r2 * dig, k); h.foreR.rotation.x = U.lerp(h.foreR.rotation.x, -0.9 - 0.3 * r1 * dig, k);
      }
      h.armL.rotation.z = U.lerp(h.armL.rotation.z, -0.15, k); h.armR.rotation.z = U.lerp(h.armR.rotation.z, 0.15, k);
      h.neck.rotation.x += 0.35 * k; h.head.rotation.x += 0.15 * k;
      h.clavL.rotation.y -= 0.2 * k; h.clavR.rotation.y += 0.2 * k;
    } else if (kind === 'stomp') {
      const lift = wind * (1 - hit);
      h.legR.rotation.x = -1.25 * lift - 0.3 * hit * (1 - back);
      h.shinR.rotation.x = 1.35 * lift + 0.1;
      h.footR.rotation.x = 0.3 * lift;
      h.spine.rotation.x = 0.28 * (wind + hit) * (1 - back);
      h.armL.rotation.z = 0.5 * wind * (1 - back); h.armR.rotation.z = -0.5 * wind * (1 - back);
      h.legL.rotation.x = 0.15 * lift; h.shinL.rotation.x = 0.35 * lift;
    }
  }

  // Pose del zombi
  function poseZombie(h, s) {
    reset(h);
    const t = s.time || 0, seed = s.seed || 0;
    const spr = s.sprint || 0;
    legs(h, s.phase, spr > 0.3 ? Math.max(s.amt, spr) : s.amt, spr > 0.3, s.drag);
    // paso torpe: la cadera se tuerce y el torso se balancea
    const sw = sin(s.phase * 0.5 + seed);
    h.hips.rotation.z += sin(s.phase) * 0.08 * s.amt;
    h.spine.rotation.z = sw * 0.07 + s.lean;
    h.spine.rotation.x = 0.14 + 0.05 * sin(s.phase * 2) * s.amt;
    h.neck.rotation.z = 0.25 * s.tilt + sw * 0.05;
    h.neck.rotation.y = sin(t * 0.8 + seed) * 0.18;
    h.head.rotation.x = 0.2 + sin(t * 1.3 + seed * 2) * 0.05;
    // brazos: colgando al vagar, hacia delante al perseguir
    const up = s.chase ? 1 : s.armsUp;
    const lag = sin(s.phase - 0.6);
    h.armL.rotation.x = -0.15 - 1.15 * up + lag * 0.16 + sin(t * 1.1 + seed) * 0.05;
    h.armR.rotation.x = -0.15 - 1.05 * up - lag * 0.16 + sin(t * 1.3 + seed) * 0.05;
    h.armL.rotation.z = 0.12 + 0.05 * sw; h.armR.rotation.z = -0.12 + 0.05 * sw;
    h.foreL.rotation.x = -0.25 - 0.2 * up - 0.1 * max(0, lag);
    h.foreR.rotation.x = -0.3 - 0.2 * up - 0.1 * max(0, -lag);
    if (s.reach > 0) {
      const r = s.reach;
      h.armL.rotation.x = U.lerp(h.armL.rotation.x, -1.55, r);
      h.armR.rotation.x = U.lerp(h.armR.rotation.x, -1.5, r);
      h.armL.rotation.z = -0.15 * r; h.armR.rotation.z = 0.15 * r;
      h.foreL.rotation.x = -0.1; h.foreR.rotation.x = -0.1;
      h.spine.rotation.x = 0.14 + 0.38 * r;
      h.head.rotation.x = 0.35 * r;
    }
    // corredor: carrera encorvada, brazos que se agitan y cabeza adelantada
    if (spr > 0.01) {
      const k = spr, q = sin(s.phase);
      h.spine.rotation.x = U.lerp(h.spine.rotation.x, 0.55, k);
      h.neck.rotation.x -= 0.3 * k; h.head.rotation.x = U.lerp(h.head.rotation.x, -0.15, k);
      h.armL.rotation.x = U.lerp(h.armL.rotation.x, -0.7 + q * 0.9, k); h.armR.rotation.x = U.lerp(h.armR.rotation.x, -0.7 - q * 0.9, k);
      h.armL.rotation.z = U.lerp(h.armL.rotation.z, 0.45, k); h.armR.rotation.z = U.lerp(h.armR.rotation.z, -0.45, k);
      h.foreL.rotation.x = U.lerp(h.foreL.rotation.x, -1.1 - 0.3 * max(0, q), k); h.foreR.rotation.x = U.lerp(h.foreR.rotation.x, -1.1 - 0.3 * max(0, -q), k);
      h.chest.rotation.y += -q * 0.25 * k;
    }
    // corredor que te acaba de ver: se yergue, echa la cabeza atrás y chilla
    if (s.alert > 0) {
      const k = sin(Math.PI * Math.min(1, s.alert));
      const sh = sin(t * 45) * 0.06 * k;
      h.spine.rotation.x = U.lerp(h.spine.rotation.x, -0.2, k);
      h.neck.rotation.x = -0.45 * k + sh; h.head.rotation.x = -0.35 * k;
      h.armL.rotation.z = 0.9 * k; h.armR.rotation.z = -0.9 * k;
      h.armL.rotation.x = -0.5 * k; h.armR.rotation.x = -0.5 * k;
      h.foreL.rotation.x = -1.2 * k; h.foreR.rotation.x = -1.2 * k;
    }
    if (s.bang) {
      const b = max(0, sin(s.bang * 9));
      h.armL.rotation.x = -1.4 - 0.4 * b; h.armR.rotation.x = -1.4 - 0.4 * max(0, sin(s.bang * 9 + 1.5));
      h.spine.rotation.x = 0.25 + 0.08 * b;
    }
    if (s.stagger > 0) {
      const k = sin(Math.PI * Math.min(1, s.stagger));
      const fl = s.flinch || 1;
      h.spine.rotation.x = -0.45 * k;
      h.spine.rotation.z += fl * 0.35 * k;            // se dobla hacia el lado del golpe
      h.neck.rotation.z -= fl * 0.35 * k; h.neck.rotation.y += fl * 0.4 * k;
      h.armL.rotation.z = 0.9 * k; h.armR.rotation.z = -0.9 * k;
      h.armL.rotation.x = -0.6 * k; h.armR.rotation.x = -0.6 * k;
      h.head.rotation.x = -0.3 * k;
      h.legL.rotation.x = 0.3 * k; h.shinL.rotation.x = 0.3 * k;
    }
    if (s.grabbed != null) {
      // agarrado por la espalda: forcejea con los brazos hacia atrás y la cabeza echada atrás; al final se afloja
      const g = s.grabbed, fade = 1 - win(g, 0.5, 0.8) * 0.85, limp = win(g, 0.72, 0.95);
      const f1 = sin(t * 13 + seed), f2 = sin(t * 11 + 1.3 + seed);
      h.armL.rotation.x = U.lerp(-2.0 + 0.5 * f1 * fade, -0.3, limp); h.armL.rotation.z = U.lerp(0.5 + 0.25 * f2 * fade, 0.15, limp);
      h.armR.rotation.x = U.lerp(-1.8 + 0.5 * f2 * fade, -0.3, limp); h.armR.rotation.z = U.lerp(-0.5 - 0.25 * f1 * fade, -0.15, limp);
      h.foreL.rotation.x = U.lerp(-1.0, -0.2, limp); h.foreR.rotation.x = U.lerp(-1.1, -0.2, limp);
      h.spine.rotation.x = U.lerp(-0.22, 0.3, limp); h.neck.rotation.x = U.lerp(-0.35, 0.5, limp);
      h.head.rotation.x = U.lerp(-0.25 + 0.12 * f1 * fade, 0.4, limp); h.neck.rotation.z = 0.15 * f2 * fade;
      h.legL.rotation.x = -0.15 + 0.3 * f1 * fade; h.shinL.rotation.x = 0.45;
      h.legR.rotation.x = 0.3 * f2 * fade; h.shinR.rotation.x = 0.35 + 0.3 * limp;
      h.hips.position.y -= 0.1 + 0.1 * limp;
    }
    // garras: dedos medio cerrados; se abren al estirarse para agarrar
    const claw = 0.65 + 0.15 * sin(t * 2 + seed) - 0.45 * (s.reach || 0) * (1 - max(0, (s.reach || 0) - 0.85) * 6);
    h.fingL.rotation.z = -claw; h.fingR.rotation.z = claw;
    // hombros: hacia delante al estirar los brazos
    const reachUp = Math.max(s.chase ? 0.6 : (s.armsUp || 0), s.reach || 0);
    h.clavL.rotation.y = -0.28 * reachUp; h.clavR.rotation.y = 0.28 * reachUp;
    h.clavL.rotation.z = 0.06 * sw; h.clavR.rotation.z = 0.06 * sw;
    distributeSpine(h);
    blend(h, s.dt, (s.stagger > 0 || s.reach > 0.2 || s.grabbed != null) ? 22 : 9);
    // espasmos (después de suavizar, para que sean secos)
    const tw = s.twitch || 0;
    if (tw > 0.01) {
      const j = tw * tw, jit = sin(t * 57 + seed) * 0.07 * j;
      switch (s.twitchKind | 0) {
        case 0: h.neck.rotation.z += 0.5 * j + jit; h.head.rotation.x -= 0.35 * j; break;          // cabeza a un lado
        case 1: h.clavL.rotation.z += 0.4 * j; h.armL.rotation.z += 0.35 * j + jit; break;          // hombro que se encoge
        case 2: h.neck.rotation.y += 0.7 * j; h.head.rotation.z -= 0.35 * j + jit; break;           // giro brusco de cabeza
        default: h.spine2.rotation.z -= 0.18 * j; h.chest.rotation.y += 0.3 * j; h.clavR.rotation.z -= 0.35 * j + jit; // sacudida del torso
      }
    }
  }

  // Tumbado: f de 0 (de pie) a 1 (en el suelo). dir = -1 de espaldas, 1 boca abajo
  function poseFall(h, f, dir) {
    const a = dir * Math.PI / 2 * U.smooth(f);
    h.body.rotation.x = a;
    h.body.position.y = 0.12 * U.smooth(f);
    h.body.position.z = 0;
    if (f > 0.5) {
      h.armL.rotation.z = 0.6; h.armR.rotation.z = -0.5;
      h.armL.rotation.x = dir > 0 ? -0.2 : 0.3; h.armR.rotation.x = dir > 0 ? -0.3 : 0.2;
      h.legL.rotation.z = 0.12; h.legR.rotation.z = -0.1;
      h.head.rotation.y = 0.4;
    }
  }

  // ---------- Armas (modelos) ----------
  const geoCache = {};
  function weaponGeometry(id) {
    if (geoCache[id]) return geoCache[id];
    const m = new G.Mesher();
    const WOOD = 0x9a7046, DARKW = 0x6e4e30, METAL = 0x9aa0a6, DARKM = 0x55595e, RED = 0xa8322a, BLACK = 0x26262a, RUST = 0x7a5a3e;
    const nails = (y0, y1, r) => { for (let y = y0; y <= y1; y += 0.07) { m.box(0, y, 0, r * 2 + 0.07, 0.008, 0.008, DARKM); m.box(0, y + 0.035, 0, 0.008, 0.008, r * 2 + 0.07, DARKM); } };
    switch (id) {
      case 'bate': case 'bate_clavos':
        m.cyl(0, 0.2, 0, 0.018, 0.022, 0.4, WOOD, 8);
        m.cyl(0, 0.62, 0, 0.022, 0.036, 0.46, WOOD, 8);
        m.sphere(0, 0.85, 0, 0.036, 0.02, 0.036, WOOD, 1);
        m.cyl(0, 0.02, 0, 0.026, 0.026, 0.03, DARKW, 8);
        if (id === 'bate_clavos') nails(0.55, 0.82, 0.032);
        break;
      case 'golf':
        m.cyl(0, 0.12, 0, 0.016, 0.016, 0.24, BLACK, 8);
        m.cyl(0, 0.6, 0, 0.007, 0.01, 0.76, METAL, 6);
        m.box(0, 0.98, 0.04, 0.03, 0.05, 0.11, DARKM);
        break;
      case 'mazo':
        m.cyl(0, 0.38, 0, 0.018, 0.02, 0.76, WOOD, 8);
        m.box(0, 0.8, 0, 0.09, 0.09, 0.24, DARKM);
        break;
      case 'pala':
        m.cyl(0, 0.45, 0, 0.017, 0.017, 0.9, WOOD, 8);
        m.box(0, 0.04, 0, 0.1, 0.03, 0.03, BLACK);
        m.box(0, 1.0, 0, 0.22, 0.26, 0.012, DARKM);
        break;
      case 'tabla': case 'tabla_clavos':
        m.box(0, 0.5, 0, 0.09, 1.0, 0.025, 0xa98a62);
        if (id === 'tabla_clavos') for (let y = 0.65; y < 0.98; y += 0.08) m.box(0, y, 0, 0.12, 0.008, 0.008, DARKM);
        break;
      case 'palanca':
        m.cyl(0, 0.36, 0, 0.012, 0.012, 0.72, 0x3e3e42, 6);
        m.box(0, 0.73, 0.03, 0.02, 0.02, 0.07, 0x3e3e42, 0, 0, 0.5);
        break;
      case 'martillo':
        m.cyl(0, 0.16, 0, 0.014, 0.017, 0.32, WOOD, 8);
        m.box(0, 0.33, 0.01, 0.03, 0.03, 0.13, DARKM);
        break;
      case 'llave':
        m.box(0, 0.16, 0, 0.026, 0.32, 0.012, METAL);
        m.box(0, 0.34, 0, 0.06, 0.04, 0.02, METAL);
        break;
      case 'sarten':
        m.cyl(0, 0.1, 0, 0.012, 0.014, 0.2, BLACK, 8);
        m.cyl(0, 0.33, 0, 0.12, 0.13, 0.025, 0x3a3a3e, 14, 0, Math.PI / 2, 0, 0);
        break;
      case 'tubo':
        m.cyl(0, 0.31, 0, 0.018, 0.018, 0.62, 0x6c7176, 8);
        break;
      case 'rodillo':
        m.cyl(0, 0.04, 0, 0.012, 0.012, 0.08, WOOD, 6);
        m.cyl(0, 0.22, 0, 0.03, 0.03, 0.28, 0xc9a77c, 10);
        m.cyl(0, 0.4, 0, 0.012, 0.012, 0.08, WOOD, 6);
        break;
      case 'porra':
        m.cyl(0, 0.3, 0, 0.016, 0.019, 0.6, BLACK, 8);
        m.cyl(0, 0.14, 0.04, 0.012, 0.012, 0.09, BLACK, 6, 0, Math.PI / 2, 0, 0);
        break;
      case 'hacha_bombero':
        m.cyl(0, 0.44, 0, 0.018, 0.02, 0.88, RED, 8);
        m.box(0, 0.84, 0.07, 0.022, 0.14, 0.13, METAL);
        m.box(0, 0.84, -0.07, 0.02, 0.05, 0.12, DARKM);
        break;
      case 'hacha_mano':
        m.cyl(0, 0.2, 0, 0.015, 0.018, 0.42, WOOD, 8);
        m.box(0, 0.4, 0.05, 0.02, 0.09, 0.1, METAL);
        break;
      case 'machete':
        m.cyl(0, 0.07, 0, 0.016, 0.016, 0.14, BLACK, 8);
        m.box(0, 0.4, 0.008, 0.006, 0.52, 0.05, METAL);
        break;
      case 'katana':
        m.cyl(0, 0.13, 0, 0.016, 0.016, 0.26, BLACK, 8);
        m.cyl(0, 0.27, 0, 0.04, 0.04, 0.012, 0xb59a52, 10);
        m.box(0, 0.64, 0.004, 0.005, 0.72, 0.03, 0xc4c9ce);
        break;
      case 'cuchillo':
        m.box(0, 0.06, 0, 0.022, 0.12, 0.016, BLACK);
        m.box(0, 0.2, 0.006, 0.004, 0.17, 0.035, METAL);
        break;
      case 'cuchillo_caza':
        m.box(0, 0.06, 0, 0.026, 0.12, 0.02, DARKW);
        m.box(0, 0.125, 0, 0.05, 0.012, 0.02, DARKM);
        m.box(0, 0.22, 0.006, 0.005, 0.18, 0.04, METAL);
        break;
      case 'destornillador':
        m.cyl(0, 0.05, 0, 0.016, 0.02, 0.1, 0xd0a42a, 8);
        m.cyl(0, 0.18, 0, 0.004, 0.004, 0.16, METAL, 6);
        break;
      case 'cuchilla':
        m.box(0, 0.06, 0, 0.024, 0.12, 0.018, DARKW);
        m.box(0, 0.22, 0.025, 0.005, 0.2, 0.09, METAL);
        break;
      case 'lanza':
        m.cyl(0, 0.75, 0, 0.016, 0.018, 1.5, WOOD, 8);
        m.box(0, 1.52, 0, 0.026, 0.04, 0.026, 0x6b6b6b);
        m.cone(0, 1.62, 0, 0.022, 0.18, METAL, 4);
        break;
      // ---- Armas de fuego: el cañón va a lo largo de +Y, la parte de arriba (miras) hacia -Z,
      // la empuñadura hacia +Z; el origen es donde agarra la mano derecha
      case 'pistola': case 'pistola_sil': {
        const GM = 0x2a2c2f, GM2 = 0x3d4044, GRIP = 0x3b3431;
        m.box(0, 0.07, -0.036, 0.027, 0.21, 0.033, GM);                  // corredera
        m.box(0, 0.045, -0.013, 0.023, 0.15, 0.016, GM2);                // armazón
        m.box(0, -0.025, 0.048, 0.026, 0.042, 0.1, GRIP, 0, 0, 0.3);     // empuñadura
        m.box(0, 0.028, 0.02, 0.006, 0.045, 0.006, GM);                  // guardamonte
        m.box(0, 0.168, -0.056, 0.005, 0.008, 0.007, GM);                // mira delantera
        m.box(0, -0.025, -0.056, 0.016, 0.008, 0.007, GM);               // mira trasera
        if (id === 'pistola_sil') m.cyl(0, 0.25, -0.036, 0.016, 0.016, 0.15, GM2, 10);
        break;
      }
      case 'escopeta': case 'escopeta_body': {
        const GM = 0x2b2c2e, GM2 = 0x45474b, W2 = 0x7a5232;
        m.box(0, 0.06, -0.026, 0.042, 0.2, 0.05, GM);                    // cajón de mecanismos
        m.cyl(0, 0.43, -0.039, 0.011, 0.011, 0.55, GM2, 8);              // cañón
        m.cyl(0, 0.34, -0.013, 0.01, 0.01, 0.38, GM, 8);                 // depósito
        m.box(0, -0.065, 0.025, 0.032, 0.1, 0.042, W2, 0, 0, 0.35);      // garganta
        m.box(0, -0.2, 0.014, 0.036, 0.24, 0.062, W2, 0, 0, -0.08);      // culata
        m.box(0, -0.325, 0.02, 0.039, 0.02, 0.072, BLACK);               // cantonera
        m.box(0, 0.0, 0.012, 0.006, 0.05, 0.006, GM);                    // guardamonte
        m.sphere(0, 0.7, -0.052, 0.004, 0.004, 0.004, METAL, 1);         // punto de mira
        if (id === 'escopeta') m.cyl(0, 0.3, -0.016, 0.022, 0.022, 0.16, W2, 8);
        break;
      }
      case 'escopeta_pump':
        m.cyl(0, 0, 0, 0.022, 0.022, 0.16, 0x7a5232, 8);
        for (let k = -2; k <= 2; k++) m.cyl(0, k * 0.025, 0, 0.0235, 0.0235, 0.008, 0x5e3f26, 8);
        break;
      case 'rifle': case 'rifle_body': {
        const GM = 0x2a2b2d, GM2 = 0x3f4245, W2 = 0x86562e;
        m.box(0, 0.14, -0.01, 0.036, 0.56, 0.04, W2);                    // caña de la culata
        m.box(0, -0.21, 0.026, 0.038, 0.24, 0.07, W2, 0, 0, -0.06);      // culata
        m.box(0, -0.335, 0.03, 0.04, 0.02, 0.075, 0x3a2a20);             // cantonera
        m.box(0, -0.06, 0.03, 0.03, 0.09, 0.048, W2, 0, 0, 0.3);         // garganta
        m.cyl(0, 0.52, -0.03, 0.0085, 0.0105, 0.44, GM2, 8);             // cañón
        m.cyl(0, 0.07, -0.03, 0.014, 0.014, 0.22, GM, 8);                // cerrojo (cajón)
        m.box(0, 0.0, 0.012, 0.006, 0.05, 0.006, GM);                    // guardamonte
        m.cyl(0, 0.07, -0.088, 0.015, 0.015, 0.2, BLACK, 10);            // mira telescópica
        m.cyl(0, -0.05, -0.088, 0.021, 0.016, 0.05, BLACK, 10);
        m.cyl(0, 0.19, -0.088, 0.016, 0.023, 0.06, BLACK, 10);
        m.box(0, 0.0, -0.062, 0.012, 0.016, 0.02, GM);
        m.box(0, 0.14, -0.062, 0.012, 0.016, 0.02, GM);
        if (id === 'rifle') { m.box(-0.03, 0.0, -0.03, 0.045, 0.01, 0.01, GM); m.sphere(-0.055, 0.0, -0.026, 0.012, 0.012, 0.012, GM, 1); }
        break;
      }
      case 'rifle_bolt':
        m.box(-0.025, 0, 0, 0.045, 0.01, 0.01, 0x2a2b2d);
        m.sphere(-0.05, 0, 0.004, 0.012, 0.012, 0.012, 0x2a2b2d, 1);
        break;
      case 'arco': case 'arco_body': {
        // origen en la empuñadura (mano izquierda). Palas hacia -Z (arriba) y +Z (abajo); la flecha va por +Y
        const BW = 0x8a5a33, BW2 = 0x5d3c22;
        const pts = [[0, 0], [0.035, 0.17], [0.032, 0.34], [-0.005, 0.47], [-0.07, 0.56]];
        for (const sg of [-1, 1]) {
          for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k], b = pts[k + 1];
            const dy = b[0] - a[0], dz = (b[1] - a[1]) * sg;
            const L = Math.hypot(dy, dz);
            const r0 = 0.016 - k * 0.0025, r1 = 0.016 - (k + 1) * 0.0025;
            m.cyl(0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 * sg, r0, r1, L, BW, 6, 0, Math.atan2(dz, dy));
          }
        }
        m.box(0, 0.005, 0, 0.032, 0.045, 0.12, BW2);                      // empuñadura forrada
        if (id === 'arco') m.box(0, -0.07, 0, 0.003, 0.003, 1.12, 0xd8d0b8); // cuerda (en reposo)
        break;
      }
      case 'flecha':
        m.cyl(0, 0.36, 0, 0.0045, 0.0045, 0.72, 0x9a7a52, 5);
        m.cone(0, 0.745, 0, 0.009, 0.05, METAL, 4);
        for (let k = 0; k < 3; k++) {
          const a = k * Math.PI * 2 / 3;
          m.box(Math.cos(a) * 0.008, 0.07, Math.sin(a) * 0.008, 0.002, 0.09, 0.016, k ? 0xd9d2c0 : 0xb5352a, -a);
        }
        break;
      // ---- Munición y accesorios (en el suelo; -Z queda hacia arriba)
      case 'mun_9mm': case 'mun_cartucho': case 'mun_rifle': {
        const col = id === 'mun_9mm' ? 0x8a6b3a : (id === 'mun_cartucho' ? 0x9c3528 : 0x4c6a3a);
        m.box(0, 0.075, -0.03, 0.1, 0.15, 0.06, col);
        m.box(0, 0.075, -0.0605, 0.08, 0.06, 0.002, 0xe6dcc0);
        break;
      }
      case 'mun_flecha':
        for (let k = -1; k <= 1; k++) {
          m.cyl(k * 0.02, 0.36, -0.01, 0.0045, 0.0045, 0.72, 0x9a7a52, 5);
          m.cone(k * 0.02, 0.745, -0.01, 0.009, 0.05, METAL, 4);
          m.box(k * 0.02, 0.07, -0.018, 0.002, 0.09, 0.016, 0xb5352a);
        }
        break;
      case 'silenciador':
        m.cyl(0, 0.08, -0.017, 0.017, 0.017, 0.15, 0x3d4044, 10);
        break;
      default:
        m.cyl(0, 0.3, 0, 0.02, 0.02, 0.6, RUST, 6);
    }
    return (geoCache[id] = m.build());
  }

  G.Models = {
    createHumanoid, disposeHumanoid, setWeapon, setBackWeapon, setOutline, setLOD,
    posePlayer, poseZombie, poseFall, reset,
    weaponGeometry, BI
  };
})(window.Game = window.Game || {});
