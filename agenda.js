/* Agenda: tareas tipo Google Tasks / Microsoft To Do dentro del Pomodoro.
 * - `L` es la lógica pura (fechas, rutinas, filtros, fusión): se prueba en Node sin navegador.
 * - `Agenda` es la interfaz; se crea al llamar a Agenda.iniciar(). Datos en localStorage y, si se conecta,
 *   sincronizados con Drive mediante Nube (fusión por elemento, gana el cambio más reciente). */
(function (g) {
  'use strict';
  const p2 = n => String(n).padStart(2, '0');
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const COLORES = ['#4f8fe0', '#4fb286', '#e8553d', '#f0a93b', '#9b6ad8', '#e06fa4', '#3aa6b9'];
  const PRIO = ['Sin prioridad', 'Baja', 'Media', 'Alta'];
  const DIA_MS = 864e5, SESENTA_DIAS = 60 * DIA_MS;

  // =========================================================== LÓGICA PURA
  const L = {};
  const aFecha = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  L.hoy = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  L.sumar = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return L.hoy(d); };
  L.dow = s => aFecha(s).getDay();
  L.diff = (a, b) => { const x = aFecha(a), y = aFecha(b); return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / DIA_MS); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  /** Texto corto de una fecha: Hoy, Mañana, un día de la semana, o «9 nov». */
  L.etiquetaFecha = (s, hoy = L.hoy()) => {
    const n = L.diff(hoy, s), d = aFecha(s);
    if (n === 0) return 'Hoy';
    if (n === 1) return 'Mañana';
    if (n === -1) return 'Ayer';
    if (n > 1 && n < 7) return cap(DIAS_LARGO[d.getDay()]);
    return `${d.getDate()} ${MESES[d.getMonth()]}` + (d.getFullYear() !== aFecha(hoy).getFullYear() ? ` ${d.getFullYear()}` : '');
  };

  L.nueva = (datos, ahora) => ({
    id: 't' + ahora.toString(36) + Math.random().toString(36).slice(2, 6), titulo: '', notas: '', lista: 'inbox', etiquetas: [],
    prio: 0, fecha: null, hecha: false, hechaEn: null, subs: [], est: 0, pomos: 0, rep: null, veces: 0, creada: ahora, t: ahora, ...datos,
  });
  L.vacio = () => ({ v: 1, listas: [{ id: 'inbox', nombre: 'Pendientes', color: COLORES[0], t: 0 }], tareas: [], borrados: {} });
  L.normalizar = raw => {
    const e = L.vacio();
    if (!raw || typeof raw !== 'object') return e;
    if (Array.isArray(raw.listas)) e.listas = raw.listas.filter(l => l && l.id && l.nombre).map(l => ({ color: COLORES[0], t: 0, ...l }));
    if (!e.listas.some(l => l.id === 'inbox')) e.listas.unshift({ id: 'inbox', nombre: 'Pendientes', color: COLORES[0], t: 0 });
    e.tareas = (Array.isArray(raw.tareas) ? raw.tareas : []).filter(t => t && t.id).map(t => ({
      ...L.nueva({}, 0), ...t, subs: Array.isArray(t.subs) ? t.subs : [], etiquetas: Array.isArray(t.etiquetas) ? t.etiquetas : [],
    }));
    e.borrados = raw.borrados && typeof raw.borrados === 'object' ? { ...raw.borrados } : {};
    return e;
  };

  /** Interpreta «Comprar pan #casa !alta mañana»: etiquetas con #, prioridad con !, y hoy/mañana/día de la semana. */
  L.parsear = (texto, hoy = L.hoy()) => {
    const o = { titulo: '', etiquetas: [], prio: 0, fecha: null };
    let t = ' ' + texto + ' ';
    t = t.replace(/\s#([\p{L}\p{N}_-]+)(?=\s)/gu, (m, tag) => { o.etiquetas.push(tag.toLowerCase()); return ' '; });
    t = t.replace(/\s!(alta|media|baja|[1-3])(?=\s)/gi, (m, v) => { v = v.toLowerCase(); o.prio = { alta: 3, media: 2, baja: 1 }[v] || Number(v); return ' '; });
    t = t.replace(/\s(pasado mañana|pasado manana)(?=\s)/i, () => { o.fecha = L.sumar(hoy, 2); return ' '; });
    t = t.replace(/\s(hoy|mañana|manana)(?=\s)/i, (m, v) => { o.fecha = L.sumar(hoy, v.toLowerCase() === 'hoy' ? 0 : 1); return ' '; });
    if (!o.fecha) {
      t = t.replace(/\s(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)(?=\s)/i, (m, v) => {
        const i = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
        let n = (i - L.dow(hoy) + 7) % 7; if (n === 0) n = 7;
        o.fecha = L.sumar(hoy, n); return ' ';
      });
    }
    o.titulo = t.replace(/\s+/g, ' ').trim();
    if (o.fecha) o.titulo = o.titulo.replace(/\s+(para el|para|el|este|de)$/i, '');   // «…mamá el lunes» → «…mamá»
    return o;
  };

  // --- rutinas (tareas que se repiten)
  const diasDelMes = (y, m) => new Date(y, m + 1, 0).getDate();
  /** Próxima fecha de una tarea repetida, siempre posterior a hoy. rep = { t:'dia'|'semana'|'mes', dias:[0-6] } */
  L.siguiente = (fecha, rep, hoy = L.hoy()) => {
    const base = fecha && fecha > hoy ? fecha : hoy;
    if (rep.t === 'semana') {
      const dias = rep.dias && rep.dias.length ? rep.dias : [L.dow(fecha || hoy)];
      for (let i = 1; i <= 14; i++) { const d = L.sumar(base, i); if (dias.includes(L.dow(d))) return d; }
    }
    if (rep.t === 'mes') {
      const orig = aFecha(fecha || hoy), dia = orig.getDate();
      let k = 0, d;
      do { k++; const m = new Date(orig.getFullYear(), orig.getMonth() + k, 1); d = L.hoy(new Date(m.getFullYear(), m.getMonth(), Math.min(dia, diasDelMes(m.getFullYear(), m.getMonth())))); } while (d <= hoy);
      return d;
    }
    return L.sumar(base, 1);   // diaria
  };
  /** Completar una tarea. Si se repite, no desaparece: salta a su próxima fecha con las subtareas sin marcar. */
  L.completar = (tarea, ahora, hoy = L.hoy()) => {
    if (tarea.rep) {
      return { ...tarea, fecha: L.siguiente(tarea.fecha, tarea.rep, hoy), hecha: false, hechaEn: null, ultima: hoy,
        veces: (tarea.veces || 0) + 1, subs: tarea.subs.map(s => ({ ...s, hecha: false })), t: ahora };
    }
    return { ...tarea, hecha: true, hechaEn: ahora, t: ahora };
  };

  // --- vistas
  const cmpFecha = (a, b) => (a.fecha || '9999') < (b.fecha || '9999') ? -1 : (a.fecha || '9999') > (b.fecha || '9999') ? 1 : 0;
  const cmp = (a, b) => (a.hecha - b.hecha) || cmpFecha(a, b) || (b.prio - a.prio) || (a.creada - b.creada);
  L.filtrar = (e, v, hoy = L.hoy(), q = '', verHechas = false) => {
    const ql = q.trim().toLowerCase();
    const coincide = t => t.titulo.toLowerCase().includes(ql) || t.notas.toLowerCase().includes(ql)
      || t.etiquetas.some(x => x.includes(ql)) || t.subs.some(s => (s.txt || '').toLowerCase().includes(ql));
    let xs;
    if (ql) xs = e.tareas.filter(coincide);
    else xs = e.tareas.filter(t => {
      switch (v.tipo) {
        case 'hoy': return !t.hecha && t.fecha && t.fecha <= hoy;
        case 'proximas': return !t.hecha && t.fecha && t.fecha > hoy;
        case 'todas': return !t.hecha;
        case 'rutinas': return !!t.rep;
        case 'hechas': return t.hecha;
        case 'lista': return t.lista === v.id && (!t.hecha || verHechas);
        case 'etiqueta': return t.etiquetas.includes(v.nombre) && (!t.hecha || verHechas);
        default: return false;
      }
    });
    return v.tipo === 'hechas' && !ql ? xs.sort((a, b) => (b.hechaEn || 0) - (a.hechaEn || 0)) : xs.sort(cmp);
  };
  L.conteos = (e, hoy = L.hoy()) => {
    const c = { hoy: 0, proximas: 0, todas: 0, rutinas: 0, listas: {}, etiquetas: {} };
    for (const t of e.tareas) {
      if (t.rep) c.rutinas++;
      if (t.hecha) continue;
      c.todas++;
      if (t.fecha && t.fecha <= hoy) c.hoy++; else if (t.fecha) c.proximas++;
      c.listas[t.lista] = (c.listas[t.lista] || 0) + 1;
      for (const x of t.etiquetas) c.etiquetas[x] = (c.etiquetas[x] || 0) + 1;
    }
    return c;
  };

  // --- fusión con otro dispositivo (conmutativa e idempotente): por elemento gana el `t` mayor; las lápidas borran
  L.fusionar = (a, b, ahora = Date.now()) => {
    a = L.normalizar(a); b = L.normalizar(b);
    const bor = { ...a.borrados };
    for (const k of Object.keys(b.borrados)) bor[k] = Math.max(bor[k] || 0, b.borrados[k]);
    for (const k of Object.keys(bor)) if (ahora - bor[k] > SESENTA_DIAS) delete bor[k];
    const unir = (xs, ys) => {
      const m = new Map();
      for (const x of xs.concat(ys)) {
        const o = m.get(x.id);
        if (!o || (x.t || 0) > (o.t || 0) || ((x.t || 0) === (o.t || 0) && JSON.stringify(x) > JSON.stringify(o))) m.set(x.id, x);
      }
      return [...m.values()].filter(x => !(bor[x.id] >= (x.t || 0))).sort((p, q) => (p.id < q.id ? -1 : 1));
    };
    const listas = unir(a.listas, b.listas);
    if (!listas.some(l => l.id === 'inbox')) listas.unshift({ id: 'inbox', nombre: 'Pendientes', color: COLORES[0], t: 0 });
    return { v: 1, listas, tareas: unir(a.tareas, b.tareas), borrados: bor };
  };
  L.canon = e => JSON.stringify(L.fusionar(e, e, 0));

  if (typeof module !== 'undefined' && module.exports) { module.exports = { L }; }
  if (typeof document === 'undefined') return;

  // =========================================================== INTERFAZ
  const h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const ICO = {
    play: '<path d="M7 5l12 7-12 7z"/>', cerrar: '<path d="M6 6l12 12M18 6L6 18"/>', mas: '<path d="M12 5v14M5 12h14"/>',
    repetir: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    nube: '<path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z"/>',
    hoy: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    prox: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 15h3"/>',
    todas: '<path d="M4 6h16M4 12h16M4 18h16"/>', rutinas: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    hechas: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>', prev: '<path d="M15 5l-7 7 7 7"/>', sig: '<path d="M9 5l7 7-7 7"/>',
    basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  };
  const ico = (k, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ag-ico' + (cls ? ' ' + cls : '')); s.innerHTML = ICO[k]; return s; };

  let E = L.normalizar(null), abierta = false, refs = {}, alCambiarActiva = null, temporizadorSync = 0, activa = null, calAbierto = false;
  const ui = { vista: { tipo: 'hoy' }, sel: null, q: '', verHechas: false, nuevaLista: false, renombrar: false, sidebar: false };
  const CLAVE = 'agenda.v1';

  function cargar() {
    try { E = L.normalizar(JSON.parse(localStorage.getItem(CLAVE) || 'null')); } catch { E = L.vacio(); }
    // migración de la lista sencilla anterior
    if (!E.tareas.length) {
      try {
        const viejas = JSON.parse(localStorage.getItem('pomo.tareas') || '[]');
        if (Array.isArray(viejas) && viejas.length) {
          const ahora = Date.now();
          E.tareas = viejas.filter(v => v && v.texto).map((v, i) => L.nueva({ titulo: v.texto, hecha: !!v.hecha, hechaEn: v.hecha ? ahora : null, pomos: v.pomos || 0 }, ahora + i));
          guardarLocal();
        }
      } catch { /* sin datos viejos */ }
    }
    activa = localStorage.getItem('agenda.activa') || null;
  }
  function guardarLocal() { try { localStorage.setItem(CLAVE, JSON.stringify(E)); } catch { /* sin espacio */ } }
  const tarea = id => E.tareas.find(t => t.id === id) || null;
  const lista = id => E.listas.find(l => l.id === id) || E.listas[0];
  function guardar() { guardarLocal(); programarSync(); }
  function editar(id, cambios, refrescar = 'lista') {
    const t = tarea(id); if (!t) return;
    Object.assign(t, cambios, { t: Date.now() });
    guardar();
    if (refrescar === 'todo') { listaUI(); lado(); detalle(); } else if (refrescar === 'lista') { listaUI(); lado(); }
  }
  function crear(datos) {
    const t = L.nueva(datos, Date.now()); E.tareas.push(t); guardar(); return t;
  }
  function eliminarTarea(id) {
    E.tareas = E.tareas.filter(t => t.id !== id); E.borrados[id] = Date.now();
    if (activa === id) fijarActiva(null);
    if (ui.sel === id) ui.sel = null;
    guardar(); todo();
  }
  function alternarHecha(id) {
    const t = tarea(id); if (!t) return;
    const antes = t.fecha, nueva = L.completar(t, Date.now());
    Object.assign(t, nueva);
    if (t.hecha && activa === id) fijarActiva(null);
    guardar(); todo();
    if (t.rep && t.fecha !== antes && g.aviso) g.aviso(`Listo. Se repite: ${L.etiquetaFecha(t.fecha)}.`);
  }
  function fijarActiva(id) {
    activa = id; localStorage.setItem('agenda.activa', id || '');
    if (alCambiarActiva) alCambiarActiva(Agenda.activaTitulo());
    if (refs.centro) listaUI();
  }
  function enfocar(id) {
    fijarActiva(id); cerrar();
    if (typeof corriendo !== 'undefined' && !corriendo) { if (modo !== 'enfoque') cambiarModo('enfoque'); alternar(); }
  }

  // ---------------------------------------------------------------- sincronización
  function programarSync() { clearTimeout(temporizadorSync); if (g.Nube && Nube.conectada()) temporizadorSync = setTimeout(() => sincronizar(false), 3000); }
  async function sincronizar(manual) {
    if (!g.Nube || !Nube.conectada()) return;
    if (manual) { if (!Nube.estado || Nube.estado === 'auth') await Nube.conectar(); }
    try {
      const fus = await Nube.sincronizar(E, L.fusionar, L.canon);
      // Lo editado mientras subía gana por su sello de tiempo; solo se reemplaza E si de verdad hay algo nuevo
      const nuevo = L.fusionar(E, fus);
      if (L.canon(nuevo) !== L.canon(E)) { E = nuevo; guardarLocal(); if (ui.sel && !tarea(ui.sel)) ui.sel = null; if (abierta) todo(); }
      if (L.canon(nuevo) !== L.canon(fus)) programarSync();
    } catch { /* el estado ya quedó reflejado en Nube.estado */ }
  }
  async function conectarNube() {
    if (await Nube.conectar()) await sincronizar(false);
  }

  // ---------------------------------------------------------------- calendario propio
  function calendario(valor, alElegir) {
    const ref = valor ? aFecha(valor) : new Date();
    let ver = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const caja = h('div', { class: 'ag-cal' });
    const hoy = L.hoy();
    const pintar = () => {
      caja.textContent = '';
      caja.append(h('div', { class: 'ag-cal-cab' },
        h('button', { class: 'ag-mini', 'aria-label': 'Mes anterior', onclick: () => { ver = new Date(ver.getFullYear(), ver.getMonth() - 1, 1); pintar(); } }, ico('prev')),
        h('b', null, `${cap(MESES_LARGO[ver.getMonth()])} ${ver.getFullYear()}`),
        h('button', { class: 'ag-mini', 'aria-label': 'Mes siguiente', onclick: () => { ver = new Date(ver.getFullYear(), ver.getMonth() + 1, 1); pintar(); } }, ico('sig'))));
      const grid = h('div', { class: 'ag-cal-grid' }, ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => h('span', { class: 'ag-cal-dow' }, d)));
      const vacios = (ver.getDay() + 6) % 7;
      for (let i = 0; i < vacios; i++) grid.append(h('span'));
      for (let d = 1; d <= diasDelMes(ver.getFullYear(), ver.getMonth()); d++) {
        const s = L.hoy(new Date(ver.getFullYear(), ver.getMonth(), d));
        grid.append(h('button', { class: 'ag-cal-dia' + (s === hoy ? ' hoy' : '') + (s === valor ? ' sel' : ''), onclick: () => alElegir(s) }, d));
      }
      caja.append(grid, h('div', { class: 'ag-chips' },
        h('button', { class: 'ag-chip', onclick: () => alElegir(hoy) }, 'Hoy'),
        h('button', { class: 'ag-chip', onclick: () => alElegir(L.sumar(hoy, 1)) }, 'Mañana'),
        h('button', { class: 'ag-chip', onclick: () => alElegir(L.sumar(hoy, (8 - L.dow(hoy)) % 7 || 7)) }, 'Próx. lunes'),
        valor && h('button', { class: 'ag-chip', onclick: () => alElegir(null) }, 'Sin fecha')));
    };
    pintar();
    return caja;
  }

  // ---------------------------------------------------------------- piezas de interfaz
  function metaFecha(t, hoy) {
    if (!t.fecha) return null;
    const vencida = !t.hecha && t.fecha < hoy;
    return h('span', { class: 'ag-meta fecha' + (vencida ? ' vencida' : (t.fecha === hoy ? ' hoy' : '')) }, ico('cal'), L.etiquetaFecha(t.fecha, hoy));
  }
  function fila(t, hoy) {
    const l = lista(t.lista), hechasSub = t.subs.filter(s => s.hecha).length;
    const metas = [
      metaFecha(t, hoy),
      t.rep && h('span', { class: 'ag-meta' }, ico('repetir')),
      (ui.vista.tipo !== 'lista' || ui.q) && t.lista !== 'inbox' && h('span', { class: 'ag-meta' }, h('i', { class: 'ag-punto', style: `background:${l.color}` }), l.nombre),
      t.subs.length > 0 && h('span', { class: 'ag-meta' }, `${hechasSub}/${t.subs.length} pasos`),
      (t.est > 0 || t.pomos > 0) && h('span', { class: 'ag-meta' }, `${t.pomos}${t.est ? '/' + t.est : ''} pomodoros`),
      ...t.etiquetas.map(x => h('span', { class: 'ag-meta etq' }, '#' + x)),
    ].filter(Boolean);
    return h('div', { class: 'ag-fila' + (t.hecha ? ' hecha' : '') + (ui.sel === t.id ? ' sel' : '') + (activa === t.id ? ' activa' : ''), onclick: () => seleccionar(t.id) },
      h('button', { class: 'ag-check p' + t.prio, 'aria-label': 'Completar tarea', onclick: e => { e.stopPropagation(); alternarHecha(t.id); } }),
      h('div', { class: 'ag-cuerpo' }, h('div', { class: 'ag-titulo' }, t.titulo || '(sin título)'), metas.length > 0 && h('div', { class: 'ag-metas' }, metas)),
      !t.hecha && h('button', { class: 'ag-play', dataset: { tip: 'Enfocar en esta tarea' }, 'aria-label': 'Enfocar en esta tarea', onclick: e => { e.stopPropagation(); enfocar(t.id); } }, ico('play')));
  }
  const TITULOS = { hoy: 'Hoy', proximas: 'Próximas', todas: 'Todas las tareas', rutinas: 'Rutinas', hechas: 'Completadas' };
  function tituloVista() {
    if (ui.q) return `Búsqueda: «${ui.q}»`;
    const v = ui.vista;
    return v.tipo === 'lista' ? lista(v.id).nombre : v.tipo === 'etiqueta' ? '#' + v.nombre : TITULOS[v.tipo];
  }

  function listaUI() {
    const c = refs.lista; if (!c) return;
    const hoy = L.hoy(), xs = L.filtrar(E, ui.vista, hoy, ui.q, ui.verHechas);
    refs.titulo.textContent = tituloVista();
    refs.cuenta.textContent = xs.length ? `${xs.length} ${xs.length === 1 ? 'tarea' : 'tareas'}` : '';
    c.textContent = '';
    if (!xs.length) {
      const msg = { hoy: 'Nada para hoy. Disfruta o añade algo arriba.', proximas: 'Sin tareas con fecha futura.', rutinas: 'Aún no tienes rutinas. Abre una tarea y elige «Repetir».', hechas: 'Todavía no has completado ninguna.' }[ui.vista.tipo] || 'No hay tareas aquí.';
      c.append(h('div', { class: 'ag-vacio' }, ui.q ? 'Sin resultados.' : msg));
    } else {
      let grupo = null;
      for (const t of xs) {
        let g2 = null;
        if (!ui.q && ui.vista.tipo === 'hoy') g2 = t.fecha < hoy ? 'Vencidas' : 'Hoy';
        else if (!ui.q && ui.vista.tipo === 'proximas') g2 = L.etiquetaFecha(t.fecha, hoy);
        else if (!ui.q && (ui.vista.tipo === 'lista' || ui.vista.tipo === 'etiqueta') && t.hecha) g2 = 'Completadas';
        if (g2 !== grupo) { grupo = g2; if (g2) c.append(h('div', { class: 'ag-grupo' }, g2)); }
        c.append(fila(t, hoy));
      }
    }
    refs.pie.textContent = '';
    if (!ui.q && (ui.vista.tipo === 'lista' || ui.vista.tipo === 'etiqueta')) {
      refs.pie.append(h('button', { class: 'ag-chip' + (ui.verHechas ? ' on' : ''), onclick: () => { ui.verHechas = !ui.verHechas; listaUI(); } }, ui.verHechas ? 'Ocultar completadas' : 'Mostrar completadas'));
    }
    accionesLista();
  }
  function accionesLista() {
    const a = refs.acciones; a.textContent = '';
    const v = ui.vista;
    if (ui.q || v.tipo !== 'lista') return;
    const l = lista(v.id);
    if (ui.renombrar) {
      const inp = h('input', { type: 'text', class: 'ag-input chico', value: l.nombre, maxLength: 40, onkeydown: e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { ui.renombrar = false; accionesLista(); } e.stopPropagation(); },
        onblur: () => { const n = inp.value.trim(); if (ui.renombrar && n) { l.nombre = n; l.t = Date.now(); guardar(); } ui.renombrar = false; lado(); listaUI(); } });
      a.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
      return;
    }
    if (l.id === 'inbox') return;
    a.append(h('button', { class: 'ag-chip', onclick: () => { ui.renombrar = true; accionesLista(); } }, 'Renombrar'), confirmable('Eliminar lista', '¿Seguro? Sus tareas pasan a Pendientes', () => {
      const ahora = Date.now();
      E.tareas.filter(t => t.lista === l.id).forEach(t => { t.lista = 'inbox'; t.t = ahora; });
      E.listas = E.listas.filter(x => x.id !== l.id); E.borrados[l.id] = ahora;
      ui.vista = { tipo: 'todas' }; guardar(); todo();
    }));
  }
  /** Botón que pide una segunda pulsación (sin diálogos nativos). */
  function confirmable(texto, aviso2, alConfirmar) {
    let armado = false, tm;
    const b = h('button', { class: 'ag-chip peligro', onclick: () => {
      if (!armado) { armado = true; b.textContent = aviso2; b.classList.add('on'); tm = setTimeout(() => { armado = false; b.textContent = texto; b.classList.remove('on'); }, 3500); }
      else { clearTimeout(tm); alConfirmar(); }
    } }, texto);
    return b;
  }

  function lado() {
    const c = refs.lado; if (!c) return;
    const cu = L.conteos(E), v = ui.vista;
    const item = (tipo, nombre, icono, n, extra = {}) => h('button', { class: 'ag-nav' + (!ui.q && v.tipo === tipo && (extra.id ? v.id === extra.id : extra.nombre ? v.nombre === extra.nombre : true) ? ' on' : ''),
      onclick: () => { ui.vista = { tipo, ...extra }; ui.q = ''; refs.buscar.value = ''; ui.verHechas = false; ui.renombrar = false; ui.sidebar = false; todo(); } },
      extra.color ? h('i', { class: 'ag-punto grande', style: `background:${extra.color}` }) : ico(icono), h('span', { class: 'ag-nav-t' }, nombre), n > 0 && h('em', null, n));
    c.textContent = '';
    c.append(...[
      h('div', { class: 'ag-seccion' }, item('hoy', 'Hoy', 'hoy', cu.hoy), item('proximas', 'Próximas', 'prox', cu.proximas), item('todas', 'Todas', 'todas', cu.todas),
        item('rutinas', 'Rutinas', 'rutinas', cu.rutinas), item('hechas', 'Completadas', 'hechas', 0)),
      h('div', { class: 'ag-seccion' },
        h('div', { class: 'ag-sec-tit' }, 'Listas', h('button', { class: 'ag-mini', 'aria-label': 'Nueva lista', onclick: () => { ui.nuevaLista = true; lado(); } }, ico('mas'))),
        E.listas.map(l => item('lista', l.nombre, null, cu.listas[l.id] || 0, { id: l.id, color: l.color })),
        ui.nuevaLista && h('input', { type: 'text', class: 'ag-input chico', placeholder: 'Nombre de la lista', maxLength: 40, id: 'agNuevaLista',
          onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { ui.nuevaLista = false; lado(); } if (e.key === 'Enter') e.target.blur(); },
          onblur: e => { const n = e.target.value.trim(); ui.nuevaLista = false;
            if (n) { const l = { id: 'l' + Date.now().toString(36), nombre: n, color: COLORES[E.listas.length % COLORES.length], t: Date.now() }; E.listas.push(l); guardar(); ui.vista = { tipo: 'lista', id: l.id }; todo(); } else lado(); } })),
      Object.keys(cu.etiquetas).length > 0 && h('div', { class: 'ag-seccion' }, h('div', { class: 'ag-sec-tit' }, 'Etiquetas'),
        Object.keys(cu.etiquetas).sort().map(x => item('etiqueta', '#' + x, null, cu.etiquetas[x], { nombre: x, color: 'transparent' }))),
      nubeUI()].filter(Boolean));
    if (ui.nuevaLista) setTimeout(() => { const i = document.getElementById('agNuevaLista'); if (i) i.focus(); }, 0);
  }
  function hace(ms) { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; }
  function nubeUI() {
    if (!g.Nube || !g.NUBE_ACTIVA) return null;
    const on = Nube.conectada(), est = Nube.estado;
    if (!on) return h('div', { class: 'ag-nube' }, h('p', null, 'Tus tareas se guardan solo en este navegador.'),
      h('button', { class: 'ag-btn', onclick: conectarNube }, ico('nube'), 'Sincronizar con Google Drive'));
    const texto = { sincronizando: 'Sincronizando…', ok: `Sincronizado ${Nube.ult ? hace(Nube.ult) : ''}`, espera: 'Conectado', offline: 'Sin conexión: se guarda aquí y se subirá luego',
      auth: 'Hay que volver a conectar tu cuenta', error: 'No se pudo sincronizar' }[est] || 'Conectado';
    return h('div', { class: 'ag-nube' }, h('p', null, h('b', null, texto), Nube.email && h('span', { class: 'ag-correo' }, Nube.email)),
      h('div', { class: 'ag-chips' },
        est === 'auth' ? h('button', { class: 'ag-btn', onclick: conectarNube }, 'Reconectar') : h('button', { class: 'ag-chip', onclick: () => sincronizar(true) }, 'Sincronizar ahora'),
        h('button', { class: 'ag-chip', onclick: () => { Nube.desconectar(); lado(); } }, 'Desconectar')));
  }

  function seleccionar(id) { ui.sel = ui.sel === id ? null : id; calAbierto = false; listaUI(); detalle(); refs.caja.classList.toggle('con-detalle', !!ui.sel); }

  function detalle() {
    const c = refs.detalle; if (!c) return;
    const t = tarea(ui.sel);
    c.textContent = ''; refs.caja.classList.toggle('con-detalle', !!t);
    if (!t) return;
    const hoy = L.hoy();
    const chipsPrio = h('div', { class: 'ag-chips' }, PRIO.map((n, i) => h('button', { class: 'ag-chip prio' + i + (t.prio === i ? ' on' : ''), onclick: () => { editar(t.id, { prio: i }, 'todo'); } }, n)));
    const chipsLista = h('div', { class: 'ag-chips' }, E.listas.map(l => h('button', { class: 'ag-chip' + (t.lista === l.id ? ' on' : ''), onclick: () => editar(t.id, { lista: l.id }, 'todo') }, h('i', { class: 'ag-punto', style: `background:${l.color}` }), l.nombre)));
    const rep = t.rep;
    const setRep = r => editar(t.id, { rep: r, fecha: r && !t.fecha ? hoy : t.fecha }, 'todo');
    const chipsRep = h('div', { class: 'ag-chips' },
      [['Nunca', null], ['Cada día', { t: 'dia' }], ['Cada semana', { t: 'semana', dias: [] }], ['Cada mes', { t: 'mes' }]].map(([n, r]) =>
        h('button', { class: 'ag-chip' + ((!rep && !r) || (rep && r && rep.t === r.t) ? ' on' : ''), onclick: () => setRep(r && rep && rep.t === r.t ? rep : r) }, n)),
      h('button', { class: 'ag-chip' + (rep && rep.t === 'semana' && rep.dias.length === 5 && rep.dias.join() === '1,2,3,4,5' ? ' on' : ''), onclick: () => setRep({ t: 'semana', dias: [1, 2, 3, 4, 5] }) }, 'Lun a vie'));
    const diasRep = rep && rep.t === 'semana' && h('div', { class: 'ag-dias' }, [1, 2, 3, 4, 5, 6, 0].map(d => h('button', { class: 'ag-dia' + (rep.dias.includes(d) ? ' on' : ''),
      onclick: () => setRep({ t: 'semana', dias: rep.dias.includes(d) ? rep.dias.filter(x => x !== d) : [...rep.dias, d].sort() }) }, DIAS[d].charAt(0).toUpperCase())));

    const etqInput = h('input', { type: 'text', class: 'ag-input chico', placeholder: 'Añadir etiqueta…', maxLength: 24, onkeydown: e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const n = e.target.value.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-'); if (n && !t.etiquetas.includes(n)) editar(t.id, { etiquetas: [...t.etiquetas, n] }, 'todo'); }
    } });
    const subs = h('div', { class: 'ag-subs' }, t.subs.map(s => h('div', { class: 'ag-sub' + (s.hecha ? ' hecha' : '') },
      h('button', { class: 'ag-check mini', 'aria-label': 'Completar paso', onclick: () => { s.hecha = !s.hecha; editar(t.id, { subs: t.subs }, 'todo'); } }),
      h('input', { type: 'text', class: 'ag-sub-txt', value: s.txt, maxLength: 120, oninput: e => { s.txt = e.target.value; t.t = Date.now(); guardar(); }, onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); } }),
      h('button', { class: 'ag-mini', 'aria-label': 'Quitar paso', onclick: () => editar(t.id, { subs: t.subs.filter(x => x !== s) }, 'todo') }, ico('cerrar')))),
      h('input', { type: 'text', class: 'ag-input chico', placeholder: 'Añadir paso…', maxLength: 120, onkeydown: e => {
        e.stopPropagation();
        if (e.key === 'Enter' && e.target.value.trim()) editar(t.id, { subs: [...t.subs, { id: 's' + Date.now().toString(36), txt: e.target.value.trim(), hecha: false }] }, 'todo');
      } }));

    c.append(
      h('div', { class: 'ag-det-cab' },
        h('button', { class: 'ag-check p' + t.prio, 'aria-label': 'Completar tarea', onclick: () => alternarHecha(t.id) }),
        h('input', { type: 'text', class: 'ag-det-titulo', value: t.titulo, maxLength: 200, placeholder: 'Título', oninput: e => { t.titulo = e.target.value; t.t = Date.now(); guardar(); listaUI(); },
          onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); } }),
        h('button', { class: 'ag-mini', 'aria-label': 'Cerrar detalle', onclick: () => seleccionar(t.id) }, ico('cerrar'))),
      h('div', { class: 'ag-campo' }, h('label', null, 'Fecha límite'),
        h('div', { class: 'ag-chips' }, h('button', { class: 'ag-chip' + (t.fecha ? ' on' : ''), onclick: () => { calAbierto = !calAbierto; detalle(); } }, ico('cal'), t.fecha ? L.etiquetaFecha(t.fecha, hoy) : 'Sin fecha'),
          t.fecha && h('button', { class: 'ag-chip', onclick: () => { calAbierto = false; editar(t.id, { fecha: null }, 'todo'); } }, 'Quitar')),
        calAbierto && calendario(t.fecha, s => { calAbierto = false; editar(t.id, { fecha: s }, 'todo'); })),
      h('div', { class: 'ag-campo' }, h('label', null, 'Prioridad'), chipsPrio),
      h('div', { class: 'ag-campo' }, h('label', null, 'Lista'), chipsLista),
      h('div', { class: 'ag-campo' }, h('label', null, 'Repetir (rutina)'), chipsRep, diasRep,
        rep && h('p', { class: 'ag-nota' }, `Al completarla pasará sola a: ${L.etiquetaFecha(L.siguiente(t.fecha, rep, hoy), hoy)}.${t.veces ? ` Completada ${t.veces} ${t.veces === 1 ? 'vez' : 'veces'}.` : ''}`)),
      h('div', { class: 'ag-campo' }, h('label', null, 'Pomodoros'),
        h('div', { class: 'ag-paso' }, h('button', { 'aria-label': 'Menos', onclick: () => editar(t.id, { est: Math.max(0, t.est - 1) }, 'todo') }, '−'),
          h('output', null, t.est ? `${t.pomos} de ${t.est}` : `${t.pomos} hechos`), h('button', { 'aria-label': 'Más', onclick: () => editar(t.id, { est: Math.min(30, t.est + 1) }, 'todo') }, '+'),
          h('span', { class: 'ag-nota' }, 'estimados'))),
      h('div', { class: 'ag-campo' }, h('label', null, 'Etiquetas'),
        t.etiquetas.length > 0 && h('div', { class: 'ag-chips' }, t.etiquetas.map(x => h('button', { class: 'ag-chip on', 'aria-label': 'Quitar etiqueta ' + x, onclick: () => editar(t.id, { etiquetas: t.etiquetas.filter(y => y !== x) }, 'todo') }, '#' + x, ico('cerrar', 'chico')))), etqInput),
      h('div', { class: 'ag-campo' }, h('label', null, 'Pasos'), subs),
      h('div', { class: 'ag-campo' }, h('label', null, 'Notas'),
        h('textarea', { class: 'ag-notas', placeholder: 'Detalles, enlaces, ideas…', value: t.notas, rows: 5, oninput: e => { t.notas = e.target.value; t.t = Date.now(); guardar(); },
          onkeydown: e => e.stopPropagation() })),
      h('div', { class: 'ag-det-pie' }, h('span', { class: 'ag-nota' }, 'Creada ' + L.etiquetaFecha(L.hoy(new Date(t.creada)), hoy)),
        confirmable('Eliminar tarea', '¿Seguro? Pulsa otra vez', () => eliminarTarea(t.id))));
  }

  function todo() { lado(); listaUI(); detalle(); }

  function nuevaDesdeTexto(texto) {
    const p = L.parsear(texto);
    if (!p.titulo) return;
    const v = ui.vista, datos = { titulo: p.titulo, prio: p.prio, etiquetas: p.etiquetas, fecha: p.fecha };
    if (v.tipo === 'lista') datos.lista = v.id;
    if (v.tipo === 'etiqueta' && !datos.etiquetas.includes(v.nombre)) datos.etiquetas = [...datos.etiquetas, v.nombre];
    if (!datos.fecha && v.tipo === 'hoy') datos.fecha = L.hoy();
    if (!datos.fecha && v.tipo === 'proximas') datos.fecha = L.sumar(L.hoy(), 1);
    if (v.tipo === 'rutinas') datos.rep = { t: 'dia' }, datos.fecha = datos.fecha || L.hoy();
    const t = crear(datos);
    if (!activa) fijarActiva(t.id);
    todo();
  }

  function construir() {
    refs.raiz = document.getElementById('agenda');
    refs.buscar = h('input', { type: 'text', class: 'ag-input', placeholder: 'Buscar…', oninput: e => { ui.q = e.target.value; listaUI(); }, onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { e.target.value = ''; ui.q = ''; listaUI(); } } });
    refs.lado = h('div', { class: 'ag-lado-cont' });
    refs.titulo = h('h2', { class: 'ag-h' }); refs.cuenta = h('span', { class: 'ag-cuenta' }); refs.acciones = h('div', { class: 'ag-acciones' });
    refs.lista = h('div', { class: 'ag-lista' }); refs.pie = h('div', { class: 'ag-pie' });
    const entrada = h('input', { type: 'text', class: 'ag-input grande', placeholder: 'Añadir tarea…  (ej: Estudiar química #clase !alta mañana)', maxLength: 200, onkeydown: e => {
      e.stopPropagation();
      if (e.key === 'Enter') { nuevaDesdeTexto(e.target.value); e.target.value = ''; }
    } });
    refs.entrada = entrada;
    refs.centro = h('section', { class: 'ag-centro' },
      h('div', { class: 'ag-cab' }, h('button', { class: 'ag-mini menu', 'aria-label': 'Menú', onclick: () => { refs.caja.classList.toggle('ver-lado'); } }, ico('todas')), refs.titulo, refs.cuenta, h('span', { style: 'flex:1' }), refs.acciones,
        h('button', { class: 'ag-mini', 'aria-label': 'Cerrar agenda', onclick: cerrar }, ico('cerrar'))),
      h('div', { class: 'ag-nueva' }, h('span', { class: 'ag-mas' }, ico('mas')), entrada), refs.lista, refs.pie);
    refs.detalle = h('aside', { class: 'ag-detalle' });
    refs.caja = h('div', { class: 'ag-caja', onclick: e => e.stopPropagation() },
      h('aside', { class: 'ag-lado' }, h('div', { class: 'ag-buscar' }, ico('buscar'), refs.buscar), refs.lado), refs.centro, refs.detalle);
    refs.raiz.append(refs.caja);
    refs.raiz.addEventListener('click', cerrar);
    if (g.Nube) Nube.alCambiar = () => { if (abierta) lado(); };
  }

  function abrir() {
    abierta = true; refs.raiz.classList.add('abierto'); document.body.classList.add('agenda-abierta');
    todo(); sincronizar(false);
    setTimeout(() => refs.entrada.focus(), 200);
  }
  function cerrar() {
    abierta = false; refs.raiz.classList.remove('abierto'); document.body.classList.remove('agenda-abierta'); calAbierto = false;
  }

  const Agenda = {
    L,
    iniciar(opciones = {}) {
      alCambiarActiva = opciones.alCambiarActiva || null;
      cargar(); construir();
      if (alCambiarActiva) alCambiarActiva(Agenda.activaTitulo());
      addEventListener('keydown', e => { if (abierta && e.key === 'Escape' && !e.defaultPrevented) { if (ui.sel) seleccionar(ui.sel); else cerrar(); } });
      addEventListener('online', () => sincronizar(false));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(false); });
      setInterval(() => sincronizar(false), 90000);
      sincronizar(false);
    },
    abrir, cerrar, abierta: () => abierta,
    /** ¿Hay tareas pendientes para hoy (o atrasadas)? */
    hayHoy() { return L.conteos(E).hoy > 0; },
    /** Abre la agenda directamente en «Hoy». */
    abrirHoy() { ui.vista = { tipo: 'hoy' }; ui.q = ''; ui.sel = null; if (refs.buscar) refs.buscar.value = ''; abrir(); },
    /** Crea una tarea desde el campo «¿En qué vas a enfocarte?» y la deja como activa, sin abrir la agenda. */
    crearRapida(texto) {
      const p = L.parsear(texto);
      if (!p.titulo) return;
      const t = crear({ titulo: p.titulo, prio: p.prio, etiquetas: p.etiquetas, fecha: p.fecha || L.hoy() });
      fijarActiva(t.id);
    },
    activaTitulo() { const t = tarea(activa); return t && !t.hecha ? t.titulo : ''; },
    /** Suma un pomodoro completado a la tarea activa. */
    sumarPomodoro() { const t = tarea(activa); if (t && !t.hecha) { t.pomos = (t.pomos || 0) + 1; t.t = Date.now(); guardar(); if (abierta) { listaUI(); detalle(); } } },
  };
  g.Agenda = Agenda;
})(typeof window !== 'undefined' ? window : globalThis);
