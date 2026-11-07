/* Agenda: tareas tipo Google Tasks / Microsoft To Do dentro de TideTask.
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
    prio: 0, fecha: null, hora: null, limite: null, dur: 0, recordar: [], icono: '', color: '',
    hecha: false, hechaEn: null, subs: [], est: 0, pomos: 0, rep: null, veces: 0, creada: ahora, t: ahora, ...datos,
  });
  const INBOX = () => ({ id: 'inbox', nombre: 'Pendientes', color: COLORES[0], icono: '', orden: 0, t: 0 });
  L.vacio = () => ({ v: 1, listas: [INBOX()], grupos: [], tareas: [], borrados: {}, registro: [] });
  const horaValida = h => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  L.normalizar = raw => {
    const e = L.vacio();
    if (!raw || typeof raw !== 'object') return e;
    if (Array.isArray(raw.listas)) e.listas = raw.listas.filter(l => l && l.id && l.nombre).map(l => ({ color: COLORES[0], icono: '', orden: 0, t: 0, grupo: '', ...l }));
    if (Array.isArray(raw.grupos)) e.grupos = raw.grupos.filter(g => g && g.id && g.nombre).map(g => ({ orden: 0, t: 0, ...g }));
    if (!e.listas.some(l => l.id === 'inbox')) e.listas.unshift(INBOX());
    e.tareas = (Array.isArray(raw.tareas) ? raw.tareas : []).filter(t => t && t.id).map(t => ({
      ...L.nueva({}, 0), ...t, subs: Array.isArray(t.subs) ? t.subs : [], etiquetas: Array.isArray(t.etiquetas) ? t.etiquetas : [],
      hora: horaValida(t.hora) ? t.hora : null, limite: typeof t.limite === 'string' ? t.limite : null, dur: Number(t.dur) > 0 ? Number(t.dur) : 0,
      recordar: Array.isArray(t.recordar) ? t.recordar.filter(n => Number.isFinite(n) && n >= 0) : [],
    }));
    e.registro = (Array.isArray(raw.registro) ? raw.registro : []).filter(r => r && r.id && (r.k === 'foco' || r.k === 'hecha') && Number.isFinite(r.t)).map(r => ({ tarea: null, titulo: '', min: 0, ...r }));
    e.borrados = raw.borrados && typeof raw.borrados === 'object' ? { ...raw.borrados } : {};
    return e;
  };

  /** Interpreta «Comprar pan #casa !alta mañana»: etiquetas con #, prioridad con !, y hoy/mañana/día de la semana. */
  L.parsear = (texto, hoy = L.hoy()) => {
    const o = { titulo: '', etiquetas: [], prio: 0, fecha: null, hora: null };
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
    // hora: «15:30», «a las 3pm», «3 pm», «a las 9»
    const aHora = (hh, mm, ap) => {
      hh = Number(hh); mm = Number(mm || 0); ap = (ap || '').toLowerCase();
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      return hh < 24 && mm < 60 ? `${p2(hh)}:${p2(mm)}` : null;
    };
    t = t.replace(/\s(?:a\s+las?\s+)?(\d{1,2}):(\d{2})\s?(am|pm)?(?=\s)/i, (m, hh, mm, ap) => { const x = aHora(hh, mm, ap); if (!x) return m; o.hora = x; return ' '; });
    if (!o.hora) t = t.replace(/\s(?:a\s+las?\s+)?(\d{1,2})\s?(am|pm)(?=\s)/i, (m, hh, ap) => { const x = aHora(hh, 0, ap); if (!x) return m; o.hora = x; return ' '; });
    if (!o.hora) t = t.replace(/\sa\s+las?\s+(\d{1,2})(?=\s)/i, (m, hh) => { const x = aHora(hh, 0, ''); if (!x) return m; o.hora = x; return ' '; });
    o.titulo = t.replace(/\s+/g, ' ').trim();
    if (o.fecha || o.hora) o.titulo = o.titulo.replace(/\s+(para el|para|el|este|de|a)$/i, '');   // «…mamá el lunes» → «…mamá»
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
  const dia = t => t.fecha || t.limite || null;
  L.dia = dia;
  const claveOrden = t => (dia(t) || '9999') + ' ' + (t.hora || '99:99');
  const cmpFecha = (a, b) => claveOrden(a) < claveOrden(b) ? -1 : claveOrden(a) > claveOrden(b) ? 1 : 0;
  const cmp = (a, b) => (a.hecha - b.hecha) || cmpFecha(a, b) || (b.prio - a.prio) || (a.creada - b.creada);
  L.filtrar = (e, v, hoy = L.hoy(), q = '', verHechas = false) => {
    const ql = q.trim().toLowerCase();
    const coincide = t => t.titulo.toLowerCase().includes(ql) || t.notas.toLowerCase().includes(ql)
      || t.etiquetas.some(x => x.includes(ql)) || t.subs.some(s => (s.txt || '').toLowerCase().includes(ql));
    let xs;
    if (ql) xs = e.tareas.filter(coincide);
    else xs = e.tareas.filter(t => {
      switch (v.tipo) {
        case 'hoy': return !t.hecha && dia(t) && dia(t) <= hoy;
        case 'proximas': return !t.hecha && dia(t) && dia(t) > hoy;
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
      if (dia(t) && dia(t) <= hoy) c.hoy++; else if (dia(t)) c.proximas++;
      c.listas[t.lista] = (c.listas[t.lista] || 0) + 1;
      for (const x of t.etiquetas) c.etiquetas[x] = (c.etiquetas[x] || 0) + 1;
    }
    return c;
  };

  // --- registro: qué se hizo y cuándo (solo se añade; sirve de historial y de seguimiento de rutinas)
  const aleatorio = () => Math.random().toString(36).slice(2, 6);
  L.evento = (k, datos, ahora) => ({ id: 'r' + ahora.toString(36) + aleatorio(), k, tarea: null, titulo: '', min: 0, dia: L.hoy(new Date(ahora)), t: ahora, ...datos });
  L.diasCumplidos = (e, tareaId) => { const s = new Set(); for (const r of e.registro) if (r.k === 'hecha' && r.tarea === tareaId) s.add(r.dia); return s; };
  /** Días con actividad, del más reciente al más antiguo: tareas hechas y enfoques agrupados por tarea. */
  L.historial = (e, limite = 30) => {
    const m = new Map();
    for (const r of e.registro) {
      if (!m.has(r.dia)) m.set(r.dia, { dia: r.dia, hechas: [], focos: new Map(), min: 0, pomodoros: 0 });
      const d = m.get(r.dia);
      if (r.k === 'hecha') d.hechas.push(r);
      else {
        const clave = r.tarea || '', f = d.focos.get(clave) || { tarea: r.tarea, titulo: r.titulo, n: 0, min: 0 };
        f.n++; f.min += r.min || 0; f.titulo = r.titulo || f.titulo; d.focos.set(clave, f); d.min += r.min || 0; d.pomodoros++;
      }
    }
    return [...m.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1)).slice(0, limite)
      .map(d => ({ ...d, focos: [...d.focos.values()].sort((x, y) => y.min - x.min), hechas: d.hechas.sort((x, y) => x.t - y.t) }));
  };
  /** Pomodoros de los últimos n días terminando en `hoy`, para el gráfico. */
  L.ultimosDias = (e, hoy = L.hoy(), n = 7) => {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push({ dia: L.sumar(hoy, -i), pomodoros: 0, min: 0 });
    const idx = new Map(out.map((o, i) => [o.dia, i]));
    for (const r of e.registro) if (r.k === 'foco' && idx.has(r.dia)) { out[idx.get(r.dia)].pomodoros++; out[idx.get(r.dia)].min += r.min || 0; }
    return out;
  };
  /** Momento (ms) en que vence una tarea: su día + su hora, o las 9:00 si solo tiene día. */
  L.momento = t => {
    const d = t.fecha || t.limite; if (!d) return null;
    const [hh, mm] = (t.hora || '09:00').split(':').map(Number), f = aFecha(d);
    f.setHours(hh, mm, 0, 0); return f.getTime();
  };
  /** Recordatorios que ya tocan y no se han avisado: desde su momento hasta una hora después del vencimiento. */
  L.recordatorios = (e, ahora, avisados = new Set()) => {
    const out = [];
    for (const t of e.tareas) {
      if (t.hecha || !t.recordar.length) continue;
      const due = L.momento(t); if (due === null) continue;
      for (const min of t.recordar) {
        const clave = `${t.id}|${t.fecha || t.limite}|${t.hora || ''}|${min}`, cuando = due - min * 60000;
        if (cuando <= ahora && ahora <= due + 3600000 && !avisados.has(clave)) out.push({ clave, tarea: t, min, due });
      }
    }
    return out;
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
    if (!listas.some(l => l.id === 'inbox')) listas.unshift(INBOX());
    const registro = unir(a.registro, b.registro).filter(r => !ahora || ahora - r.t <= 400 * DIA_MS);
    return { v: 1, listas, grupos: unir(a.grupos, b.grupos), tareas: unir(a.tareas, b.tareas), borrados: bor, registro };
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

  // Iconos propios (trazo de línea, 24×24) para tareas y listas
  const ICONOS = {
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    libro: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    estudio: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
    trabajo: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    compras: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    corazon: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z"/>',
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    bandera: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    campana: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    rayo: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    fuego: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 2 2 2 0-3-1-5 1-8z"/>',
    hoja: '<path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14z"/><path d="M5 19l8-8"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    luna: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    gota: '<path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z"/>',
    pesas: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
    pulso: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    comida: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 3c-2 1-3 3-3 6v3h3v9"/>',
    cafe: '<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/>',
    musica: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    pelicula: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
    juego: '<rect x="3" y="8" width="18" height="10" rx="4"/><path d="M8 11v4M6 13h4"/><path d="M15.5 12h.01M17.5 14h.01"/>',
    codigo: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    telefono: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    personas: '<circle cx="9" cy="9" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    dinero: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2s1.3 1.8 3 2.1 3 .8 3 2.2-1.3 2.2-3 2.2c-1.3 0-2.4-.5-3-1.5"/>',
    avion: '<path d="M3 13l18-9-7 17-3-7z"/><path d="M11 14l10-10"/>',
    lugar: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    auto: '<path d="M5 16v-5l2-5h10l2 5v5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>',
    arte: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a4 4 0 0 0 4-4C21 7 17 3 12 3z"/><path d="M8 11h.01M12 7.5h.01M16 11h.01"/>',
    lapiz: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
    camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    huella: '<circle cx="7" cy="10" r="1.8"/><circle cx="12" cy="7" r="1.8"/><circle cx="17" cy="10" r="1.8"/><path d="M12 12c-3 0-5 3-5 5 0 2 2 2 5 1 3 1 5 1 5-1 0-2-2-5-5-5z"/>',
    planta: '<path d="M12 14V8"/><path d="M12 11c0-4-3-5-6-5 0 3 2 5 6 5zM12 9c0-3 2-5 6-5 0 3-2 5-6 5z"/><path d="M7 14h10l-1 6H8z"/>',
    regalo: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z"/>',
    salud: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    sueno: '<path d="M3 18v-8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11.5" r="1.5"/>',
    limpieza: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    paquete: '<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  };
  Object.keys(ICONOS).forEach(k => { ICO['i_' + k] = ICONOS[k]; });
  ICO.carpeta = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
  ICO.carpetamas = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>';
  ICO.chev = '<path d="M9 6l6 6-6 6"/>';
  const PALETA = ['#4f8fe0', '#3aa6b9', '#4fb286', '#9bbf4a', '#f0a93b', '#e8853d', '#e8553d', '#e06fa4', '#9b6ad8', '#6c7ae0', '#8a6a4f', '#7b8794'];
  /** Cuadrito con el icono (y el color) de una tarea o lista; nada si no tiene ninguno. */
  function insignia(o) {
    if (!o.icono && !o.color) return null;
    return h('span', { class: 'ag-ins', style: o.color ? `--c:${o.color}` : '' }, o.icono && ICO['i_' + o.icono] ? ico('i_' + o.icono) : null);
  }
  function selectorIconos(actual, alElegir) {
    return h('div', { class: 'ag-iconos' }, Object.keys(ICONOS).map(k => h('button', { class: 'ag-icono' + (actual === k ? ' on' : ''), 'aria-label': k, onclick: () => alElegir(actual === k ? '' : k) }, ico('i_' + k))));
  }
  function paleta(actual, alElegir, conNinguno) {
    return h('div', { class: 'ag-paleta' },
      conNinguno && h('button', { class: 'ag-color ninguno' + (!actual ? ' on' : ''), 'aria-label': 'Sin color', onclick: () => alElegir('') }),
      PALETA.map(c => h('button', { class: 'ag-color' + (actual === c ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Color ' + c, onclick: () => alElegir(c) })));
  }
  const textoDur = m => m >= 60 && m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  const textoAntes = m => m === 0 ? 'Ahora' : m >= 1440 ? 'Mañana' : m >= 60 ? `En ${m / 60} h` : `En ${m} min`;
  const sumarHora = (hora, min) => { const [hh, mm] = (hora || '09:00').split(':').map(Number), tot = Math.max(0, Math.min(23 * 60 + 45, hh * 60 + mm + min)); return `${p2(Math.floor(tot / 60))}:${p2(tot % 60)}`; };
  const animar = () => document.body.classList.contains('anim-siempre') || !matchMedia('(prefers-reduced-motion: reduce)').matches;

  let E = L.normalizar(null), abierta = false, refs = {}, alCambiarActiva = null, temporizadorSync = 0, activa = null, calAbierto = false, iconosAbierto = false, recien = null;
  const ui = { vista: { tipo: 'hoy' }, sel: null, q: '', verHechas: false, nuevaLista: false, renombrar: false, sidebar: false, personalizar: false, semana: 0 };
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
  function guardar() { guardarLocal(); programarSync(); refrescarHoy(); }

  // ---------------------------------------------------------------- inicio: la lista de hoy
  function agregarHoy(texto) {
    const p = L.parsear(texto); if (!p.titulo) return;
    crear({ titulo: p.titulo, prio: p.prio, etiquetas: p.etiquetas, fecha: p.fecha || L.hoy(), hora: p.hora });
  }
  const textoFecha = () => { const s = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); return s.charAt(0).toUpperCase() + s.slice(1); };
  /** Rutinas que ya se cumplieron hoy: siguen visibles, tachadas, hasta que pase el día. */
  const rutinasHechasHoy = hoy => E.tareas.filter(t => t.rep && !t.hecha && t.ultima === hoy);
  const vuelve = (t, hoy) => `Hecha hoy · vuelve ${L.etiquetaFecha(t.fecha, hoy).toLowerCase()}`;
  function refrescarHoy() {
    const c = refs.hoy; if (!c) return;
    const hoy = L.hoy(), xs = L.filtrar(E, { tipo: 'hoy' }, hoy, '', false);
    const normales = xs.filter(t => !t.rep), rutinas = xs.filter(t => t.rep), hechasR = rutinasHechasHoy(hoy);
    const hechasHoy = E.tareas.filter(t => (t.hecha && t.hechaEn && L.hoy(new Date(t.hechaEn)) === hoy) || (t.rep && t.ultima === hoy)).length;
    const a = document.activeElement, tecleando = !!(a && c.contains(a) && a.classList.contains('hy-nueva')), valor = tecleando ? a.value : '';
    const entrada = h('input', { type: 'text', class: 'hy-nueva', placeholder: matchMedia('(max-width: 760px)').matches ? 'Añadir una tarea…' : 'Añadir una tarea…  (ej: Estudiar química #clase !alta mañana)', maxLength: 200, 'aria-label': 'Añadir tarea para hoy',
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value; e.target.value = ''; agregarHoy(v); } } });
    entrada.value = valor;
    let orden = 0;
    const fila = t => {
      const metas = [
        ...metasTarea(t, hoy, 'hy-meta'),
        t.subs.length > 0 && h('span', { class: 'hy-meta' }, `${t.subs.filter(x => x.hecha).length}/${t.subs.length} pasos`),
        (t.pomos > 0 || t.est > 0) && h('span', { class: 'hy-meta' }, `${t.pomos}${t.est ? ' de ' + t.est : ''} pomodoros`),
        ...t.etiquetas.map(x => h('span', { class: 'hy-meta' }, '#' + x)),
      ].filter(Boolean);
      return deslizable(h('div', { class: 'hy-fila' + (activa === t.id ? ' activa' : '') + (recien === t.id ? ' nueva' : ''), style: `--i:${orden++}`, role: 'button', tabIndex: 0, onclick: () => Agenda.abrirTarea(t.id),
          onkeydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); Agenda.abrirTarea(t.id); } } },
        h('button', { class: 'ag-check p' + t.prio, 'aria-label': 'Completar ' + (t.titulo || 'tarea'), onclick: e => { e.stopPropagation(); completar(e.currentTarget, t.id); } }),
        insignia(t),
        h('div', { class: 'hy-cuerpo' }, h('div', { class: 'hy-t' }, t.titulo || '(sin título)'), metas.length > 0 && h('div', { class: 'hy-metas' }, metas)),
        h('button', { class: 'hy-play', 'aria-label': 'Enfocar en ' + (t.titulo || 'esta tarea'), onclick: e => { e.stopPropagation(); enfocar(t.id); } }, ico('play'))), t.id);
    };
    c.textContent = '';
    c.append(
      h('header', { class: 'hy-cab' },
        h('div', null, h('h1', { class: 'hy-h' }, 'Hoy'), h('p', { class: 'hy-fecha' }, textoFecha() + (xs.length ? ` · ${xs.length} ${xs.length === 1 ? 'pendiente' : 'pendientes'}` : ''))),
        h('button', { class: 'hy-ver', onclick: () => Agenda.abrirHoy() }, 'Agenda')),
      h('div', { class: 'hy-caja' }, h('span', { class: 'hy-mas' }, ico('mas')), entrada),
      h('div', { class: 'hy-lista' },
        xs.length === 0 && hechasR.length === 0 && h('p', { class: 'hy-vacio' }, 'Nada pendiente para hoy. Escribe arriba lo que quieras hacer, o empieza un enfoque libre.'),
        normales.map(fila),
        rutinas.length > 0 && h('div', { class: 'hy-grupo' }, 'Rutinas'),
        rutinas.map(fila),
        hechasR.length > 0 && h('div', { class: 'hy-grupo' }, 'Cumplidas hoy'),
        hechasR.map(t => h('div', { class: 'hy-fila hecha', role: 'button', tabIndex: 0, onclick: () => Agenda.abrirTarea(t.id) },
          h('button', { class: 'ag-check p' + t.prio, 'aria-label': 'Desmarcar ' + (t.titulo || 'rutina'), onclick: e => { e.stopPropagation(); alternarDia(t, hoy); } }),
          insignia(t),
          h('div', { class: 'hy-cuerpo' }, h('div', { class: 'hy-t' }, t.titulo || '(sin título)'), h('div', { class: 'hy-metas' }, h('span', { class: 'hy-meta' }, vuelve(t, hoy))))))),
      h('footer', { class: 'hy-pie' },
        hechasHoy > 0 && h('span', { class: 'hy-hechas' }, `${hechasHoy} ${hechasHoy === 1 ? 'hecha' : 'hechas'} hoy`),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'hy-libre', onclick: () => enfocar(null) }, ico('play'), 'Enfoque libre')));
    if (tecleando) entrada.focus();
  }

  function editar(id, cambios, refrescar = 'lista') {
    const t = tarea(id); if (!t) return;
    Object.assign(t, cambios, { t: Date.now() });
    guardar();
    if (refrescar === 'todo') { listaUI(); lado(); detalle(); } else if (refrescar === 'lista') { listaUI(); lado(); }
  }
  function crear(datos) {
    const t = L.nueva(datos, Date.now()); E.tareas.push(t); recien = t.id; setTimeout(() => { if (recien === t.id) recien = null; }, 1000); guardar(); return t;
  }
  function eliminarTarea(id) {
    E.tareas = E.tareas.filter(t => t.id !== id); E.borrados[id] = Date.now();
    if (activa === id) fijarActiva(null);
    if (ui.sel === id) ui.sel = null;
    guardar(); todo();
  }
  // ---- deslizar una tarea a la derecha para eliminarla (con botón de confirmar)
  const ABIERTO = 104;   // px que se descubren al dejar la fila abierta
  let filaAbierta = null;
  function cerrarDeslizada(f) {
    if (!f) return;
    f.classList.remove('desl-abierta', 'desl-arrastra'); f.style.removeProperty('--dx'); if (filaAbierta === f) filaAbierta = null;
  }
  function deslizable(f, id) {
    const fondo = h('div', { class: 'desl-fondo' },
      h('button', { class: 'desl-borrar', 'aria-label': 'Confirmar: eliminar tarea', onclick: e => { e.stopPropagation(); cerrarDeslizada(f); eliminarTarea(id); } }, ico('i_limpieza'), h('span', null, 'Eliminar')));
    f.prepend(fondo);
    let x0 = 0, y0 = 0, base = 0, activo = false, mover = false, pid = null;
    const poner = dx => f.style.setProperty('--dx', Math.max(0, Math.min(dx, ABIERTO + 36)) + 'px');
    f.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.desl-borrar')) return;
      if (filaAbierta && filaAbierta !== f) cerrarDeslizada(filaAbierta);
      x0 = e.clientX; y0 = e.clientY; base = f.classList.contains('desl-abierta') ? ABIERTO : 0; activo = true; mover = false; pid = e.pointerId;
    });
    f.addEventListener('pointermove', e => {
      if (!activo || e.pointerId !== pid) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!mover) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { activo = false; return; }   // es un desplazamiento vertical
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
        mover = true; f.classList.add('desl-arrastra'); try { f.setPointerCapture(pid); } catch { /* sin captura */ }
      }
      poner(base + dx);
    });
    const soltar = e => {
      if (!activo || e.pointerId !== pid) return; activo = false;
      if (!mover) return;
      f.dataset.arrastro = '1'; setTimeout(() => { delete f.dataset.arrastro; }, 60);
      const dx = parseFloat(f.style.getPropertyValue('--dx')) || 0;
      f.classList.remove('desl-arrastra');
      if (dx > ABIERTO * 0.55) { f.classList.add('desl-abierta'); f.style.setProperty('--dx', ABIERTO + 'px'); filaAbierta = f; }
      else cerrarDeslizada(f);
    };
    f.addEventListener('pointerup', soltar); f.addEventListener('pointercancel', soltar);
    // un toque sobre una fila abierta solo la cierra; y tras arrastrar no se abre la tarea
    f.addEventListener('click', e => {
      if (f.dataset.arrastro) { e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (f.classList.contains('desl-abierta') && !e.target.closest('.desl-borrar')) { e.stopImmediatePropagation(); e.preventDefault(); cerrarDeslizada(f); }
    }, true);
    return f;
  }
  function alternarHecha(id) {
    const t = tarea(id); if (!t) return;
    const hoy = L.hoy(), ahora = Date.now();
    if (t.hecha) {     // reabrir: se retira de hoy lo que se había anotado como hecho
      const evs = E.registro.filter(r => r.k === 'hecha' && r.tarea === id && r.dia === hoy);
      E.registro = E.registro.filter(r => !evs.includes(r)); evs.forEach(r => { E.borrados[r.id] = ahora; });
      Object.assign(t, { hecha: false, hechaEn: null, t: ahora });
      guardar(); todo(); return;
    }
    const antes = t.fecha, nueva = L.completar(t, ahora, hoy);
    Object.assign(t, nueva);
    E.registro.push(L.evento('hecha', { tarea: id, titulo: t.titulo }, ahora));
    if (t.hecha && activa === id) fijarActiva(null);
    guardar(); todo();
    if (t.rep && t.fecha !== antes && g.aviso) g.aviso(`Listo. Se repite: ${L.etiquetaFecha(t.fecha)}.`);
  }
  /** Completa con una pequeña animación (la fila se tacha y se pliega) antes de actualizar los datos. */
  function completar(el, id) {
    const f = el && el.closest && el.closest('.hy-fila, .ag-fila'), t = tarea(id);
    if (!f || !t || t.hecha || !animar()) return alternarHecha(id);
    f.style.maxHeight = f.offsetHeight + 'px'; void f.offsetHeight;
    f.classList.add('saliendo');
    setTimeout(() => alternarHecha(id), 460);
  }
  function fijarActiva(id) {
    activa = id; localStorage.setItem('agenda.activa', id || '');
    if (alCambiarActiva) alCambiarActiva(Agenda.activaTitulo());
    if (refs.centro) listaUI();
    refrescarHoy();
  }
  /** Arranca un enfoque sobre la tarea (o libre si id es null). La pantalla del timer la define la página. */
  function enfocar(id) {
    cerrar();
    if (typeof g.empezarEnfoque === 'function') g.empezarEnfoque(id); else fijarActiva(id);
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
      if (L.canon(nuevo) !== L.canon(E)) { E = nuevo; guardarLocal(); if (ui.sel && !tarea(ui.sel)) ui.sel = null; refrescarHoy(); if (abierta) todo(); }
      if (L.canon(nuevo) !== L.canon(fus)) programarSync();
    } catch { /* el estado ya quedó reflejado en Nube.estado */ }
  }
  // ---------------------------------------------------------------- recordatorios (solo con la función activada y la página abierta)
  function revisarRecordatorios() {
    if (!(g.recordatoriosActivos && g.recordatoriosActivos())) return;
    let av; try { av = new Set(JSON.parse(localStorage.getItem('agenda.avisados') || '[]')); } catch { av = new Set(); }
    const toca = L.recordatorios(E, Date.now(), av); if (!toca.length) return;
    for (const r of toca) {
      av.add(r.clave);
      const t = r.tarea, cuerpo = `${textoAntes(r.min)}${t.hora ? ' · ' + t.hora : ''}`;
      if (g.aviso) g.aviso(`${t.titulo || 'Tarea'}: ${cuerpo}`);
      if (g.Avisos) g.Avisos.enviar(t.titulo || 'Recordatorio', cuerpo);
    }
    if (typeof g.sonarAlarma === 'function') { try { g.sonarAlarma(); } catch { /* el audio puede no estar activo */ } }
    try { localStorage.setItem('agenda.avisados', JSON.stringify([...av].slice(-300))); } catch { /* sin espacio */ }
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
        grid.append(h('button', { class: 'ag-cal-dia' + (s === hoy ? ' ya' : '') + (s === valor ? ' sel' : ''), onclick: () => alElegir(s) }, d));
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
  /** Chips de información de una tarea (día y hora, límite, duración, recordatorio, repetición). `cls` cambia el estilo según dónde se pinte. */
  function metasTarea(t, hoy, cls) {
    const m = (extra, ...kids) => h('span', { class: cls + (extra ? ' ' + extra : '') }, ...kids);
    const d = t.fecha, pasada = d === hoy && t.hora && L.momento(t) < Date.now();
    const vencida = !t.hecha && ((d && d < hoy) || (!d && t.limite && t.limite < hoy) || pasada);
    return [
      d && m('fecha' + (vencida ? ' vencida' : d === hoy ? ' ya' : ''), ico('cal'), L.etiquetaFecha(d, hoy) + (t.hora ? ' · ' + t.hora : '')),
      !d && t.limite && m('fecha' + (vencida ? ' vencida' : ''), ico('i_bandera'), 'Vence ' + L.etiquetaFecha(t.limite, hoy)),
      d && t.limite && t.limite !== d && m(!t.hecha && t.limite < hoy ? 'vencida' : '', ico('i_bandera'), L.etiquetaFecha(t.limite, hoy)),
      t.dur > 0 && m('', ico('i_reloj'), textoDur(t.dur)),
      t.recordar.length > 0 && m('', ico('i_campana')),
      t.rep && m('', ico('repetir')),
    ].filter(Boolean);
  }
  function fila(t, hoy) {
    const l = lista(t.lista), hechasSub = t.subs.filter(s => s.hecha).length;
    const metas = [
      ...metasTarea(t, hoy, 'ag-meta'),
      (ui.vista.tipo !== 'lista' || ui.q) && t.lista !== 'inbox' && h('span', { class: 'ag-meta' }, l.icono ? ico('i_' + l.icono) : h('i', { class: 'ag-punto', style: `background:${l.color}` }), l.nombre),
      t.subs.length > 0 && h('span', { class: 'ag-meta' }, `${hechasSub}/${t.subs.length} pasos`),
      (t.est > 0 || t.pomos > 0) && h('span', { class: 'ag-meta' }, `${t.pomos}${t.est ? '/' + t.est : ''} pomodoros`),
      ...t.etiquetas.map(x => h('span', { class: 'ag-meta etq' }, '#' + x)),
    ].filter(Boolean);
    return deslizable(h('div', { class: 'ag-fila' + (t.hecha ? ' hecha' : '') + (ui.sel === t.id ? ' sel' : '') + (activa === t.id ? ' activa' : '') + (recien === t.id ? ' nueva' : ''), onclick: () => seleccionar(t.id) },
      h('button', { class: 'ag-check p' + t.prio, 'aria-label': 'Completar tarea', onclick: e => { e.stopPropagation(); completar(e.currentTarget, t.id); } }),
      insignia(t),
      h('div', { class: 'ag-cuerpo' }, h('div', { class: 'ag-titulo' }, t.titulo || '(sin título)'), metas.length > 0 && h('div', { class: 'ag-metas' }, metas)),
      !t.hecha && h('button', { class: 'ag-play', dataset: { tip: 'Enfocar en esta tarea' }, 'aria-label': 'Enfocar en esta tarea', onclick: e => { e.stopPropagation(); enfocar(t.id); } }, ico('play'))), t.id);
  }
  /** Título de la vista; en una lista lleva su icono (o su color) delante. */
  function pintarTitulo() {
    const v = ui.vista, t = refs.titulo; t.textContent = '';
    if (!ui.q && v.tipo === 'lista') {
      const l = lista(v.id);
      t.append(l.icono && ICO['i_' + l.icono] ? h('span', { class: 'ag-h-ico', style: `color:${l.color}` }, ico('i_' + l.icono)) : h('i', { class: 'ag-punto grande', style: `background:${l.color}` }), h('span', null, l.nombre));
    } else t.textContent = tituloVista();
  }
  const TITULOS = { hoy: 'Hoy', proximas: 'Próximas', todas: 'Todas las tareas', rutinas: 'Rutinas', hechas: 'Completadas', historial: 'Historial' };
  function tituloVista() {
    if (ui.q) return `Búsqueda: «${ui.q}»`;
    const v = ui.vista;
    return v.tipo === 'lista' ? lista(v.id).nombre : v.tipo === 'etiqueta' ? '#' + v.nombre : TITULOS[v.tipo];
  }

  function listaUI() {
    const c = refs.lista; if (!c) return;
    refs.nueva.hidden = ui.vista.tipo === 'historial' && !ui.q;
    if (!ui.q && ui.vista.tipo === 'historial') return historialUI();
    if (!ui.q && ui.vista.tipo === 'rutinas') return rutinasUI();
    const hoy = L.hoy(), xs = L.filtrar(E, ui.vista, hoy, ui.q, ui.verHechas);
    pintarTitulo();
    refs.cuenta.textContent = xs.length ? `${xs.length} ${xs.length === 1 ? 'tarea' : 'tareas'}` : '';
    c.textContent = '';
    if (!ui.q && ui.vista.tipo === 'lista' && ui.personalizar) c.append(estiloLista(lista(ui.vista.id)));
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
    if (!ui.q && ui.vista.tipo === 'hoy') {
      const hr = rutinasHechasHoy(hoy);
      if (hr.length) {
        if (!xs.length) c.textContent = '';
        c.append(h('div', { class: 'ag-grupo' }, 'Cumplidas hoy'));
        for (const t of hr) c.append(h('div', { class: 'ag-fila hecha' + (ui.sel === t.id ? ' sel' : ''), onclick: () => seleccionar(t.id) },
          h('button', { class: 'ag-check p' + t.prio, 'aria-label': 'Desmarcar', onclick: e => { e.stopPropagation(); alternarDia(t, hoy); } }),
          insignia(t), h('div', { class: 'ag-cuerpo' }, h('div', { class: 'ag-titulo' }, t.titulo || '(sin título)'), h('div', { class: 'ag-metas' }, h('span', { class: 'ag-meta' }, vuelve(t, hoy))))));
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
    a.append(h('button', { class: 'ag-chip' + (ui.personalizar ? ' on' : ''), onclick: () => { ui.personalizar = !ui.personalizar; listaUI(); } }, 'Personalizar'));
    if (l.id === 'inbox') return;
    a.append(h('button', { class: 'ag-chip', onclick: () => { ui.renombrar = true; accionesLista(); } }, 'Renombrar'), confirmable('Eliminar lista', '¿Seguro? Sus tareas pasan a Pendientes', () => eliminarLista(l)));
  }
  function eliminarLista(l) {
    const ahora = Date.now();
    E.tareas.filter(t => t.lista === l.id).forEach(t => { t.lista = 'inbox'; t.t = ahora; });
    E.listas = E.listas.filter(x => x.id !== l.id); E.borrados[l.id] = ahora;
    ui.vista = { tipo: 'todas' }; ui.personalizar = false; refs.caja.classList.add('en-menu'); guardar(); todo();
  }

  // ---- menú de una lista: se abre manteniéndola pulsada (o con clic derecho)
  function irALista(l) {
    ui.vista = { tipo: 'lista', id: l.id }; ui.q = ''; if (refs.buscar) refs.buscar.value = '';
    ui.verHechas = false; ui.renombrar = false; ui.personalizar = false; ui.sidebar = false; refs.caja.classList.remove('en-menu');
  }
  /** Coloca un menú flotante junto al dedo: hacia abajo si cabe; si no, hacia arriba; nunca bajo la barra inferior ni los bordes. */
  function situarMenu(m, x, y) {
    const margen = 10, tabs = document.querySelector('.tabs');
    // la barra inferior es position:fixed (offsetParent siempre nulo): se mide con su rectángulo real
    const barra = tabs && getComputedStyle(tabs).display !== 'none' ? Math.max(0, innerHeight - tabs.getBoundingClientRect().top) : 0;
    const vv = window.visualViewport, alto = vv ? vv.height : innerHeight;
    const fondo = Math.min(alto, innerHeight - barra) - margen, techo = margen;
    m.style.animation = 'none'; m.style.maxHeight = ''; m.style.overflowY = '';
    let r = m.getBoundingClientRect();
    const abajo = fondo - (y + 6), arriba = (y - 6) - techo;           // espacio libre debajo y encima del dedo
    const haciaAbajo = r.height <= abajo || (r.height > arriba && abajo >= arriba);
    const libre = haciaAbajo ? abajo : arriba;
    if (r.height > libre) { m.style.maxHeight = Math.max(120, libre) + 'px'; m.style.overflowY = 'auto'; r = m.getBoundingClientRect(); }
    let top = haciaAbajo ? y + 6 : y - 6 - r.height;
    top = Math.max(techo, Math.min(top, fondo - r.height));
    m.style.left = Math.max(margen, Math.min(x, innerWidth - r.width - margen)) + 'px';
    m.style.top = top + 'px';
    m.dataset.lado = haciaAbajo ? 'abajo' : 'arriba';
    m.style.transformOrigin = haciaAbajo ? 'top left' : 'bottom left';
    m.style.animation = '';
  }
  const cerrarMenuCtx = () => { const m = document.getElementById('agMenuCtx'); if (m) m.remove(); };
  function menuLista(l, x, y) {
    cerrarMenuCtx();
    const eliminar = h('button', { class: 'ag-ctx-op peligro', role: 'menuitem', onclick: e => {
      e.stopPropagation();
      if (!eliminar.dataset.armado) { eliminar.dataset.armado = '1'; eliminar.lastChild.textContent = '¿Seguro? Sus tareas pasan a Pendientes'; return; }
      cerrarMenuCtx(); eliminarLista(l);
    } }, ico('i_limpieza'), h('span', null, 'Eliminar lista'));
    const m = h('div', { class: 'ag-ctx', id: 'agMenuCtx', role: 'menu' },
      h('div', { class: 'ag-ctx-tit' }, l.nombre),
      h('button', { class: 'ag-ctx-op', role: 'menuitem', onclick: e => { e.stopPropagation(); cerrarMenuCtx(); irALista(l); ui.personalizar = true; todo(); } }, ico('i_arte'), h('span', null, 'Personalizar')),
      l.id !== 'inbox' && h('button', { class: 'ag-ctx-op', role: 'menuitem', onclick: e => { e.stopPropagation(); cerrarMenuCtx(); irALista(l); ui.renombrar = true; todo(); } }, ico('i_lapiz'), h('span', null, 'Renombrar')),
      l.id !== 'inbox' && eliminar,
      h('div', { class: 'ag-ctx-pista' }, 'Para cambiar su lugar o meterla en un grupo, mantenla pulsada y arrástrala'));
    refs.raiz.append(m);
    situarMenu(m, x, y);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* sin vibración */ } }
  }
  const grupoPorId = id => E.grupos.find(g => g.id === id) || null;
  const gruposOrdenados = () => [...E.grupos].sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.t || 0) - (b.t || 0));
  const grupoDe = l => (l.grupo ? grupoPorId(l.grupo) : null);   // un grupo borrado en otro dispositivo deja la lista suelta
  const cerrados = new Set((() => { try { return JSON.parse(localStorage.getItem('agenda.gcerrados') || '[]'); } catch { return []; } })());
  const guardarCerrados = () => { try { localStorage.setItem('agenda.gcerrados', JSON.stringify([...cerrados])); } catch { /* sin espacio */ } };
  function eliminarGrupo(g) {
    const ahora = Date.now();
    E.listas.filter(l => l.grupo === g.id).forEach(l => { l.grupo = ''; l.t = ahora; });
    E.grupos = E.grupos.filter(x => x.id !== g.id); E.borrados[g.id] = ahora; cerrados.delete(g.id);
    guardar(); todo();
  }
  function nuevoGrupo() {
    const ahora = Date.now(), g = { id: 'g' + ahora.toString(36), nombre: 'Nuevo grupo', orden: Math.max(0, ...E.grupos.map(x => x.orden || 0)) + 1, t: ahora };
    E.grupos.push(g); guardar(); ui.renombrarGrupo = g.id; ui.enfocarGrupo = true; ui.sidebar = true; lado();
  }
  function nuevaListaEn(g) {
    const l = { id: 'l' + Date.now().toString(36), nombre: 'Nueva lista', color: COLORES[E.listas.length % COLORES.length], icono: '', orden: Math.max(0, ...E.listas.map(x => x.orden || 0)) + 1, grupo: g.id, t: Date.now() };
    E.listas.push(l); cerrados.delete(g.id); guardarCerrados(); guardar(); irALista(l); ui.personalizar = true; ui.enfocarNombre = true; todo();
  }
  function colocarEnGrupo(l, gid) {
    l.grupo = gid; l.orden = Math.max(0, ...E.listas.map(x => x.orden || 0)) + 1; l.t = Date.now();
    cerrados.delete(gid); guardarCerrados(); guardar(); todo();
  }
  const listasOrdenadas = () => [...E.listas].sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.t || 0) - (b.t || 0));
  /** Coloca la lista `l` justo antes (o después) de `idDestino`. */
  function colocarLista(l, idDestino, despues) {
    const xs = listasOrdenadas().filter(x => x.id !== l.id), i = xs.findIndex(x => x.id === idDestino);
    if (i < 0) return;
    xs.splice(despues ? i + 1 : i, 0, l);
    const ahora = Date.now(), g = grupoDe(xs[despues ? i : i + 1]) ? xs[despues ? i : i + 1].grupo : '';
    if ((l.grupo || '') !== (g || '')) { l.grupo = g || ''; l.t = ahora; }
    xs.forEach((x, k) => { if ((x.orden || 0) !== k) { x.orden = k; x.t = ahora; } });
    guardar(); todo();
  }
  function moverLista(l, delta) {
    const xs = listasOrdenadas(), i = xs.findIndex(x => x.id === l.id), j = i + delta;
    if (j < 0 || j >= xs.length) return;
    [xs[i], xs[j]] = [xs[j], xs[i]];
    const ahora = Date.now();
    xs.forEach((x, k) => { if ((x.orden || 0) !== k) { x.orden = k; x.t = ahora; } });
    guardar(); todo();
  }
  /** Panel para cambiar color, icono y orden de una lista. */
  function estiloLista(l) {
    const cambiar = campos => { Object.assign(l, campos, { t: Date.now() }); guardar(); todo(); };
    const nombre = h('input', { type: 'text', class: 'ag-input', id: 'agNombreLista', value: l.nombre, maxLength: 40, placeholder: 'Nombre de la lista', disabled: l.id === 'inbox',
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') nombre.blur(); },
      oninput: () => {   // el nombre se actualiza en vivo: título de arriba y menú
        const n = nombre.value.trim(); if (!n) return;
        l.nombre = n; l.t = Date.now(); guardar();
        if (ui.vista.tipo === 'lista' && ui.vista.id === l.id && !ui.q) pintarTitulo();
        lado();
      },
      onchange: () => { if (!nombre.value.trim()) nombre.value = l.nombre; } });
    if (ui.enfocarNombre) { ui.enfocarNombre = false; setTimeout(() => { nombre.focus(); nombre.select(); }, 60); }
    return h('div', { class: 'ag-estilo' },
      h('div', { class: 'ag-campo' }, h('label', { for: 'agNombreLista' }, 'Nombre'), nombre),
      h('div', { class: 'ag-campo' }, h('label', null, 'Color'), paleta(l.color, c => cambiar({ color: c || COLORES[0] }), false)),
      h('div', { class: 'ag-campo' }, h('label', null, 'Icono'), selectorIconos(l.icono, k => cambiar({ icono: k }))),
      l.id !== 'inbox' && h('div', { class: 'ag-campo' }, h('label', null, 'Grupo'), h('div', { class: 'ag-chips' },
        h('button', { class: 'ag-chip' + (!grupoDe(l) ? ' on' : ''), onclick: () => cambiar({ grupo: '' }) }, 'Sin grupo'),
        gruposOrdenados().map(g => h('button', { class: 'ag-chip' + (l.grupo === g.id ? ' on' : ''), onclick: () => cambiar({ grupo: g.id }) }, g.nombre)),
        h('button', { class: 'ag-chip', onclick: () => { const ahora = Date.now(), g = { id: 'g' + ahora.toString(36), nombre: 'Nuevo grupo', orden: Math.max(0, ...E.grupos.map(x => x.orden || 0)) + 1, t: ahora }; E.grupos.push(g); ui.renombrarGrupo = g.id; ui.enfocarGrupo = true; cambiar({ grupo: g.id }); } }, '+ Grupo')))
    );
  }

  // ---------------------------------------------------------------- rutinas: seguimiento por días cumplidos
  const programado = (t, d) => {
    const r = t.rep; if (!r) return false;
    if (r.t === 'semana') return (r.dias && r.dias.length ? r.dias : [L.dow(t.fecha || d)]).includes(L.dow(d));
    if (r.t === 'mes') return aFecha(d).getDate() === aFecha(t.fecha || d).getDate();
    return true;
  };
  function alternarDia(t, d) {
    const hoy = L.hoy(), ahora = Date.now();
    const evs = E.registro.filter(r => r.k === 'hecha' && r.tarea === t.id && r.dia === d);
    if (evs.length || (d === hoy && t.rep && t.ultima === hoy)) {
      E.registro = E.registro.filter(r => !evs.includes(r)); evs.forEach(r => { E.borrados[r.id] = ahora; });
      if (d === hoy) Object.assign(t, { fecha: hoy, ultima: null, veces: Math.max(0, (t.veces || 0) - 1), t: ahora });   // lo de hoy se deshace: vuelve a quedar pendiente
    } else if (d === hoy) { alternarHecha(t.id); return; }
    else E.registro.push(L.evento('hecha', { tarea: t.id, titulo: t.titulo, dia: d }, new Date(`${d}T12:00:00`).getTime()));
    guardar(); todo();
  }
  function rutinasUI() {
    const c = refs.lista, hoy = L.hoy();
    const rs = E.tareas.filter(t => t.rep && !t.hecha).sort((a, b) => a.creada - b.creada);
    refs.titulo.textContent = 'Rutinas'; refs.cuenta.textContent = rs.length ? `${rs.length} ${rs.length === 1 ? 'rutina' : 'rutinas'}` : '';
    refs.pie.textContent = ''; refs.acciones.textContent = ''; c.textContent = '';
    if (!rs.length) { c.append(h('div', { class: 'ag-vacio' }, 'Aún no tienes rutinas. Escribe una arriba (se repite cada día) o abre una tarea y elige «Repetir».')); return; }
    const lunes = L.sumar(hoy, -((L.dow(hoy) + 6) % 7) + ui.semana * 7), dias = Array.from({ length: 7 }, (_, i) => L.sumar(lunes, i));
    const rango = `${aFecha(dias[0]).getDate()} ${MESES[aFecha(dias[0]).getMonth()]} – ${aFecha(dias[6]).getDate()} ${MESES[aFecha(dias[6]).getMonth()]}`;
    c.append(h('div', { class: 'ag-semana' },
      h('button', { class: 'ag-mini', 'aria-label': 'Semana anterior', onclick: () => { ui.semana--; listaUI(); } }, ico('prev')),
      h('b', null, ui.semana === 0 ? 'Esta semana' : rango), h('span', { class: 'ag-nota' }, ui.semana === 0 ? rango : ''),
      h('button', { class: 'ag-mini', 'aria-label': 'Semana siguiente', disabled: ui.semana >= 0, onclick: () => { ui.semana++; listaUI(); } }, ico('sig'))));
    const cab = h('div', { class: 'ag-rut cab' }, h('span', { class: 'ag-rut-n' }), dias.map(d => h('span', { class: 'ag-rut-d' + (d === hoy ? ' ya' : '') }, h('i', null, 'LMXJVSD'[dias.indexOf(d)]), h('b', null, aFecha(d).getDate()))), h('span', { class: 'ag-rut-t' }));
    c.append(cab);
    for (const t of rs) {
      const cumplidos = L.diasCumplidos(E, t.id);
      const prog = dias.filter(d => d <= hoy && programado(t, d)), hechos = prog.filter(d => cumplidos.has(d)).length;
      c.append(h('div', { class: 'ag-rut' + (ui.sel === t.id ? ' sel' : '') },
        h('button', { class: 'ag-rut-n', onclick: () => seleccionar(t.id) }, insignia(t), h('span', null, t.titulo || '(sin título)')),
        dias.map(d => {
          const hecho = cumplidos.has(d), toca = programado(t, d);
          return h('button', { class: 'ag-celda' + (hecho ? ' hecho' : '') + (toca ? '' : ' libre') + (d === hoy ? ' ya' : ''), disabled: d > hoy,
            'aria-label': `${t.titulo}, ${L.etiquetaFecha(d, hoy)}: ${hecho ? 'cumplido' : 'pendiente'}`, onclick: () => alternarDia(t, d) }, hecho ? ico('hechas') : null);
        }),
        h('span', { class: 'ag-rut-t' }, prog.length ? `${hechos} de ${prog.length}` : '')));
    }
    c.append(h('p', { class: 'ag-nota ag-rut-nota' }, 'Toca un día para marcarlo o desmarcarlo. Solo se cuentan los días que cumpliste.'));
  }

  // ---------------------------------------------------------------- historial: lo que se hizo, día por día
  function historialUI() {
    const c = refs.lista, hoy = L.hoy();
    refs.titulo.textContent = 'Historial'; refs.cuenta.textContent = ''; refs.pie.textContent = ''; refs.acciones.textContent = ''; c.textContent = '';
    const sem = L.ultimosDias(E, hoy, 7), max = Math.max(1, ...sem.map(d => d.pomodoros)), hoyD = sem[6];
    const totalSem = sem.reduce((n, d) => n + d.pomodoros, 0);
    const dato = (n, txt) => h('div', null, h('b', null, n), h('span', null, txt));
    c.append(h('div', { class: 'ag-resumen' }, dato(hoyD.pomodoros, 'pomodoros hoy'), dato(hoyD.min, 'min de enfoque hoy'), dato(totalSem, 'pomodoros en 7 días')),
      h('div', { class: 'ag-barras' }, sem.map(d => h('div', { class: 'ag-col' + (d.dia === hoy ? ' ya' : '') },
        h('span', { class: 'n' }, d.pomodoros || ''), h('div', { class: 'b', style: `height:${Math.max(4, d.pomodoros / max * 100)}%` }), h('span', { class: 'l' }, 'DLMXJVS'[L.dow(d.dia)])))));
    const dias = L.historial(E, 30);
    if (!dias.length) { c.append(h('div', { class: 'ag-vacio' }, 'Aún no hay actividad. Cuando completes tareas o termines pomodoros, aparecerán aquí día por día.')); return; }
    const abrir = id => { if (tarea(id)) seleccionar(id); };
    for (const d of dias) {
      const partes = [d.hechas.length && `${d.hechas.length} ${d.hechas.length === 1 ? 'tarea' : 'tareas'}`, d.pomodoros && `${d.pomodoros} ${d.pomodoros === 1 ? 'pomodoro' : 'pomodoros'}`, d.min && `${d.min} min`].filter(Boolean);
      c.append(h('div', { class: 'ag-grupo' }, L.etiquetaFecha(d.dia, hoy) + (partes.length ? ' · ' + partes.join(' · ') : '')));
      for (const r of d.hechas) c.append(h('div', { class: 'ag-hist' + (tarea(r.tarea) ? ' ir' : ''), onclick: () => abrir(r.tarea) }, ico('hechas'), h('span', { class: 'ag-hist-t' }, r.titulo || '(sin título)'), h('span', { class: 'ag-hist-m' }, 'hecha')));
      for (const f of d.focos) c.append(h('div', { class: 'ag-hist' + (f.tarea && tarea(f.tarea) ? ' ir' : ''), onclick: () => f.tarea && abrir(f.tarea) }, ico('i_reloj'), h('span', { class: 'ag-hist-t' }, f.titulo || 'Enfoque libre'), h('span', { class: 'ag-hist-m' }, `${f.n} ${f.n === 1 ? 'pomodoro' : 'pomodoros'} · ${f.min} min`)));
    }
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
    const item = (tipo, nombre, icono, n, extra = {}) => { let largo = false, tm = 0, sx = 0, sy = 0;
      const esLista = tipo === 'lista';
      let alzada = false, movio = false, destino = null, pid = null, el = null;
      const hermanas = () => [...refs.lado.querySelectorAll('.ag-nav[data-lid], .ag-grupo-cab[data-gid]')].filter(x => x !== el && x.offsetParent);
      const quitarGuia = () => refs.lado.querySelectorAll('.guia-antes,.guia-despues,.guia-dentro').forEach(x => x.classList.remove('guia-antes', 'guia-despues', 'guia-dentro'));
      const soltarLista = e => {
        clearTimeout(tm);
        if (!alzada) return;
        alzada = false; quitarGuia(); el.classList.remove('arrastrando'); el.style.transform = '';
        try { el.releasePointerCapture(pid); } catch { /* ya liberada */ }
        setTimeout(() => { largo = false; }, 120);
        if (e && e.type === 'pointercancel') return;
        if (movio && destino && destino.grupo) colocarEnGrupo(lista(extra.id), destino.id);
        else if (movio && destino) colocarLista(lista(extra.id), destino.id, destino.despues);
        else if (!movio) menuLista(lista(extra.id), sx, sy);
      };
      const pulsacion = !esLista ? {} : {
        'data-lid': extra.id,
        onpointerdown: e => { el = e.currentTarget; largo = false; alzada = false; movio = false; destino = null; pid = e.pointerId; sx = e.clientX; sy = e.clientY; clearTimeout(tm);
          tm = setTimeout(() => {   // mantener pulsada: la lista se levanta; si se arrastra se reordena, si se suelta quieta abre su menú
            largo = alzada = true; cerrarMenuCtx(); el.classList.add('arrastrando'); try { el.setPointerCapture(pid); } catch { /* sin captura */ }
            if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* sin vibración */ } }
          }, 450); },
        onpointermove: e => {
          if (!alzada) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(tm); return; }
          e.preventDefault();
          const dy = e.clientY - sy; if (Math.abs(dy) > 8) movio = true;
          el.style.transform = `translateY(${dy}px) scale(1.03)`;
          if (!movio) return;
          quitarGuia();
          const otras = hermanas(); if (!otras.length) { destino = null; return; }
          const sobre = otras.find(x => { const r = x.getBoundingClientRect(); return x.dataset.gid && e.clientY > r.top + r.height * .25 && e.clientY < r.bottom - r.height * .25; });
          if (sobre) { sobre.classList.add('guia-dentro'); destino = { id: sobre.dataset.gid, grupo: true }; return; }   // soltar sobre un grupo: entra en él
          const sig = otras.filter(x => x.dataset.lid).find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
          const ref = sig || otras.filter(x => x.dataset.lid).pop();
          if (!ref) { destino = null; return; }
          ref.classList.add(sig ? 'guia-antes' : 'guia-despues');
          destino = { id: ref.dataset.lid, despues: !sig };
        },
        onpointerup: soltarLista, onpointercancel: soltarLista, ontouchmove: e => { if (alzada && e.cancelable) e.preventDefault(); }, onselectstart: e => e.preventDefault(),
        oncontextmenu: e => { e.preventDefault(); if (!alzada && !document.getElementById('agMenuCtx')) { largo = true; menuLista(lista(extra.id), e.clientX, e.clientY); setTimeout(() => { largo = false; }, 120); } },
      };
      return h('button', { class: 'ag-nav' + (!ui.q && v.tipo === tipo && (extra.id ? v.id === extra.id : extra.nombre ? v.nombre === extra.nombre : true) ? ' on' : ''), ...pulsacion,
      onclick: () => { if (largo) return; ui.vista = { tipo, ...extra }; ui.q = ''; refs.buscar.value = ''; ui.verHechas = false; ui.renombrar = false; ui.personalizar = false; ui.sidebar = false; refs.caja.classList.remove('en-menu'); todo(); } },
      extra.icono && ICO['i_' + extra.icono] ? h('span', { class: 'ag-ni', style: `color:${extra.color}` }, ico('i_' + extra.icono)) : extra.color ? h('i', { class: 'ag-punto grande', style: `background:${extra.color}` }) : ico(icono), h('span', { class: 'ag-nav-t' }, nombre), n > 0 && h('em', null, n)); };
    c.textContent = '';
    c.append(...[
      h('div', { class: 'ag-seccion' }, item('hoy', 'Hoy', 'hoy', cu.hoy), item('proximas', 'Próximas', 'prox', cu.proximas), item('todas', 'Todas', 'todas', cu.todas),
        item('rutinas', 'Rutinas', 'rutinas', cu.rutinas), item('historial', 'Historial', 'hechas', 0)),
      h('div', { class: 'ag-seccion' },
        h('div', { class: 'ag-sec-tit' }, 'Listas', h('span', { class: 'ag-sec-bot' }, h('button', { class: 'ag-mini', 'aria-label': 'Nuevo grupo de listas', dataset: { tip: 'Nuevo grupo' }, onclick: nuevoGrupo }, ico('carpetamas')), h('button', { class: 'ag-mini', 'aria-label': 'Nueva lista', onclick: () => {
          if (matchMedia('(max-width: 760px)').matches) {   // teléfono: se crea al instante y el nombre se escribe en Personalizar
            const l = { id: 'l' + Date.now().toString(36), nombre: 'Nueva lista', color: COLORES[E.listas.length % COLORES.length], icono: '', orden: Math.max(0, ...E.listas.map(x => x.orden || 0)) + 1, t: Date.now() };
            E.listas.push(l); guardar(); irALista(l); ui.personalizar = true; ui.enfocarNombre = true; todo(); return;
          }
          ui.nuevaLista = true; lado(); } }, ico('mas')))),
        listasOrdenadas().filter(l => !grupoDe(l)).map(l => item('lista', l.nombre, null, cu.listas[l.id] || 0, { id: l.id, color: l.color, icono: l.icono })),
        gruposOrdenados().map(g => grupoUI(g, cu, item)),
        ui.nuevaLista && h('input', { type: 'text', class: 'ag-input chico', placeholder: 'Nombre de la lista', maxLength: 40, id: 'agNuevaLista',
          onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { ui.nuevaLista = false; lado(); } if (e.key === 'Enter') e.target.blur(); },
          onblur: e => { const n = e.target.value.trim(); ui.nuevaLista = false;
            if (n) { const l = { id: 'l' + Date.now().toString(36), nombre: n, color: COLORES[E.listas.length % COLORES.length], icono: '', orden: Math.max(0, ...E.listas.map(x => x.orden || 0)) + 1, t: Date.now() }; E.listas.push(l); guardar(); ui.vista = { tipo: 'lista', id: l.id }; ui.personalizar = true; todo(); } else lado(); } })),
      Object.keys(cu.etiquetas).length > 0 && h('div', { class: 'ag-seccion' }, h('div', { class: 'ag-sec-tit' }, 'Etiquetas'),
        Object.keys(cu.etiquetas).sort().map(x => item('etiqueta', '#' + x, null, cu.etiquetas[x], { nombre: x, color: 'transparent' }))),
      nubeUI()].filter(Boolean));
    if (ui.nuevaLista) setTimeout(() => { const i = document.getElementById('agNuevaLista'); if (i) i.focus(); }, 0);
  }
  /** Un grupo de listas: carpeta que se pliega; mantenida pulsada abre su menú o se arrastra para cambiar su lugar. */
  function grupoUI(g, cu, item) {
    const mias = listasOrdenadas().filter(l => l.grupo === g.id), cerrado = cerrados.has(g.id);
    const total = mias.reduce((n, l) => n + (cu.listas[l.id] || 0), 0);
    let tm = 0, sx = 0, sy = 0, alzada = false, movio = false, destino = null, largo = false, pid = null, cab = null;
    const quitar = () => refs.lado.querySelectorAll('.guia-antes,.guia-despues').forEach(x => x.classList.remove('guia-antes', 'guia-despues'));
    const soltar = e => {
      clearTimeout(tm); if (!alzada) return;
      alzada = false; quitar(); cab.classList.remove('arrastrando'); cab.style.transform = '';
      try { cab.releasePointerCapture(pid); } catch { /* ya liberada */ }
      setTimeout(() => { largo = false; }, 120);
      if (e && e.type === 'pointercancel') return;
      if (movio && destino) {
        const xs = gruposOrdenados().filter(x => x.id !== g.id), i = xs.findIndex(x => x.id === destino.id);
        if (i >= 0) { xs.splice(destino.despues ? i + 1 : i, 0, g); const ahora = Date.now(); xs.forEach((x, k) => { if ((x.orden || 0) !== k) { x.orden = k; x.t = ahora; } }); guardar(); todo(); }
      } else if (!movio) menuGrupo(g, sx, sy);
    };
    if (ui.renombrarGrupo === g.id) {
      const inp = h('input', { type: 'text', class: 'ag-input chico', value: g.nombre, maxLength: 40, placeholder: 'Nombre del grupo',
        onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = g.nombre; inp.blur(); } },
        onblur: () => { const n = inp.value.trim(); if (n && n !== g.nombre) { g.nombre = n; g.t = Date.now(); guardar(); } ui.renombrarGrupo = null; lado(); listaUI(); } });
      if (ui.enfocarGrupo) { ui.enfocarGrupo = false; setTimeout(() => { inp.focus(); inp.select(); }, 60); }
      else setTimeout(() => { inp.focus(); inp.select(); }, 0);
      return h('div', { class: 'ag-grupo' }, h('div', { class: 'ag-grupo-ren' }, ico('carpeta'), inp));
    }
    const cabecera = cab = h('button', { class: 'ag-nav ag-grupo-cab', dataset: { gid: g.id }, 'aria-expanded': String(!cerrado),
      onpointerdown: e => { largo = false; alzada = false; movio = false; destino = null; pid = e.pointerId; sx = e.clientX; sy = e.clientY; clearTimeout(tm);
        tm = setTimeout(() => { largo = alzada = true; cerrarMenuCtx(); cab.classList.add('arrastrando'); try { cab.setPointerCapture(pid); } catch { /* sin captura */ }
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* sin vibración */ } } }, 450); },
      onpointermove: e => {
        if (!alzada) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(tm); return; }
        e.preventDefault();
        const dy = e.clientY - sy; if (Math.abs(dy) > 8) movio = true;
        cab.style.transform = `translateY(${dy}px) scale(1.03)`;
        if (!movio) return;
        quitar();
        const otras = [...refs.lado.querySelectorAll('.ag-grupo-cab')].filter(x => x !== cab);
        if (!otras.length) { destino = null; return; }
        const sig = otras.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        const ref = sig || otras[otras.length - 1];
        ref.classList.add(sig ? 'guia-antes' : 'guia-despues'); destino = { id: ref.dataset.gid, despues: !sig };
      },
      onpointerup: soltar, onpointercancel: soltar, ontouchmove: e => { if (alzada && e.cancelable) e.preventDefault(); },
      oncontextmenu: e => { e.preventDefault(); if (!alzada && !document.getElementById('agMenuCtx')) { largo = true; menuGrupo(g, e.clientX, e.clientY); setTimeout(() => { largo = false; }, 120); } },
      onclick: () => { if (largo) return; if (cerrados.has(g.id)) cerrados.delete(g.id); else cerrados.add(g.id); guardarCerrados(); lado(); } },
      h('span', { class: 'ag-chev' }, ico('chev')), h('span', { class: 'ag-ni' }, ico('carpeta')), h('span', { class: 'ag-nav-t' }, g.nombre), total > 0 && h('em', null, total));
    return h('div', { class: 'ag-grupo' + (cerrado ? ' cerrado' : '') }, cabecera,
      !cerrado && h('div', { class: 'ag-grupo-lista' },
        mias.map(l => item('lista', l.nombre, null, cu.listas[l.id] || 0, { id: l.id, color: l.color, icono: l.icono })),
        mias.length === 0 && h('div', { class: 'ag-grupo-vacio' }, 'Arrastra listas aquí')));
  }
  function menuGrupo(g, x, y) {
    cerrarMenuCtx();
    const eliminar = h('button', { class: 'ag-ctx-op peligro', role: 'menuitem', onclick: e => {
      e.stopPropagation();
      if (!eliminar.dataset.armado) { eliminar.dataset.armado = '1'; eliminar.lastChild.textContent = '¿Seguro? Sus listas quedan sueltas'; return; }
      cerrarMenuCtx(); eliminarGrupo(g);
    } }, ico('i_limpieza'), h('span', null, 'Eliminar grupo'));
    const m = h('div', { class: 'ag-ctx', id: 'agMenuCtx', role: 'menu' },
      h('div', { class: 'ag-ctx-tit' }, g.nombre),
      h('button', { class: 'ag-ctx-op', role: 'menuitem', onclick: e => { e.stopPropagation(); cerrarMenuCtx(); nuevaListaEn(g); } }, ico('mas'), h('span', null, 'Nueva lista aquí')),
      h('button', { class: 'ag-ctx-op', role: 'menuitem', onclick: e => { e.stopPropagation(); cerrarMenuCtx(); ui.renombrarGrupo = g.id; lado(); } }, ico('i_lapiz'), h('span', null, 'Renombrar')),
      eliminar,
      h('div', { class: 'ag-ctx-pista' }, 'Mantenlo pulsado y arrástralo para cambiar su lugar'));
    refs.raiz.append(m);
    situarMenu(m, x, y);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* sin vibración */ } }
  }
  function hace(ms) { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; }
  /** Copia en la nube: una fila discreta al pie de la barra lateral y, al tocarla, un pequeño menú. */
  function nubeUI() {
    if (!g.Nube || !g.NUBE_ACTIVA) return null;
    const on = Nube.conectada(), est = on ? Nube.estado : 'apagada';
    const FILA = {
      apagada: ['Solo en este dispositivo', 'Activar copia en la nube', 'reposo'],
      sincronizando: ['Actualizando…', Nube.email || 'Copia en Google Drive', 'trabajando'],
      ok: ['Copia al día', Nube.ult ? hace(Nube.ult) : (Nube.email || ''), 'bien'],
      espera: ['Copia en la nube', Nube.email || 'Conectada', 'bien'],
      offline: ['Sin conexión', 'Se subirá al volver internet', 'aviso'],
      auth: ['Hay que reconectar', 'Toca para volver a entrar', 'mal'],
      error: ['No se pudo actualizar', 'Toca para ver opciones', 'mal'],
    }[est] || ['Copia en la nube', '', 'bien'];
    const cerrarMenu = () => { ui.nubeMenu = false; lado(); };
    let menu = null;
    if (ui.nubeMenu) {
      if (!on) {
        menu = h('div', { class: 'ag-nube-menu', role: 'dialog' },
          h('h4', null, 'Copia en tu Google Drive'),
          h('p', null, 'Guarda tus tareas en una carpeta de tu Drive para verlas igual en el celular y en el computador. Solo toca los archivos que crea esta app.'),
          h('button', { class: 'ag-btn', onclick: () => { cerrarMenu(); conectarNube(); } }, 'Conectar con Google'));
      } else {
        menu = h('div', { class: 'ag-nube-menu', role: 'dialog' },
          h('h4', null, Nube.email || 'Cuenta de Google'),
          h('p', null, est === 'ok' && Nube.ult ? `Última copia ${hace(Nube.ult)}.` : { sincronizando: 'Actualizando ahora…', offline: 'Sin conexión: tus cambios se guardan aquí y se suben después.', auth: 'La sesión caducó. Vuelve a entrar para seguir con la copia.', error: 'No se pudo completar la última copia.' }[est] || 'La copia está activa.'),
          est === 'auth' ? h('button', { class: 'ag-btn', onclick: () => { cerrarMenu(); conectarNube(); } }, 'Volver a entrar')
            : h('button', { class: 'ag-btn', disabled: est === 'sincronizando', onclick: () => { sincronizar(true); } }, est === 'sincronizando' ? 'Actualizando…' : 'Actualizar ahora'),
          confirmable('Dejar de usar la copia', 'Tus tareas se quedan aquí. ¿Seguro?', () => { Nube.desconectar(); ui.nubeMenu = false; lado(); }));
      }
    }
    return h('div', { class: 'ag-nube' }, menu,
      h('button', { class: 'ag-nube-fila ' + FILA[2] + (ui.nubeMenu ? ' abierta' : ''), 'aria-expanded': !!ui.nubeMenu, 'aria-label': 'Copia en la nube: ' + FILA[0],
          onclick: e => { e.stopPropagation(); ui.nubeMenu = !ui.nubeMenu; lado(); } },
        h('span', { class: 'ag-nube-ico' }, ico('nube'), h('i', { class: 'ag-nube-punto' })),
        h('span', { class: 'ag-nube-txt' }, h('b', null, FILA[0]), h('small', null, FILA[1]))));
  }

  function seleccionar(id) { ui.sel = ui.sel === id ? null : id; calAbierto = false; iconosAbierto = false; listaUI(); detalle(); refs.caja.classList.toggle('con-detalle', !!ui.sel); }

  const RECORDAR = [[0, 'A la hora'], [5, '5 min antes'], [10, '10 min antes'], [30, '30 min antes'], [60, '1 h antes'], [1440, '1 día antes']];
  const DURACIONES = [15, 25, 30, 45, 60, 90, 120];
  function detalle() {
    const c = refs.detalle; if (!c) return;
    const t = tarea(ui.sel);
    c.textContent = ''; refs.caja.classList.toggle('con-detalle', !!t);
    if (!t) return;
    const hoy = L.hoy();
    const campo = (titulo, ...kids) => h('div', { class: 'ag-campo' }, h('label', null, titulo), ...kids);
    const seccion = (titulo, ...kids) => h('section', { class: 'ag-sec' }, h('h3', null, titulo), ...kids);
    const chipsPrio = h('div', { class: 'ag-chips' }, PRIO.map((n, i) => h('button', { class: 'ag-chip prio' + i + (t.prio === i ? ' on' : ''), onclick: () => { editar(t.id, { prio: i }, 'todo'); } }, n)));
    const chipsLista = h('div', { class: 'ag-chips' }, listasOrdenadas().map(l => h('button', { class: 'ag-chip' + (t.lista === l.id ? ' on' : ''), onclick: () => editar(t.id, { lista: l.id }, 'todo') }, l.icono ? ico('i_' + l.icono) : h('i', { class: 'ag-punto', style: `background:${l.color}` }), l.nombre)));
    const rep = t.rep;
    const setRep = r => editar(t.id, { rep: r, fecha: r && !t.fecha ? hoy : t.fecha }, 'todo');
    const chipsRep = h('div', { class: 'ag-chips' },
      [['Nunca', null], ['Cada día', { t: 'dia' }], ['Cada semana', { t: 'semana', dias: [] }], ['Cada mes', { t: 'mes' }]].map(([n, r]) =>
        h('button', { class: 'ag-chip' + ((!rep && !r) || (rep && r && rep.t === r.t) ? ' on' : ''), onclick: () => setRep(r && rep && rep.t === r.t ? rep : r) }, n)),
      h('button', { class: 'ag-chip' + (rep && rep.t === 'semana' && rep.dias.length === 5 && rep.dias.join() === '1,2,3,4,5' ? ' on' : ''), onclick: () => setRep({ t: 'semana', dias: [1, 2, 3, 4, 5] }) }, 'Lun a vie'));
    const diasRep = rep && rep.t === 'semana' && h('div', { class: 'ag-dias' }, [1, 2, 3, 4, 5, 6, 0].map(d => h('button', { class: 'ag-dia' + (rep.dias.includes(d) ? ' on' : ''),
      onclick: () => setRep({ t: 'semana', dias: rep.dias.includes(d) ? rep.dias.filter(x => x !== d) : [...rep.dias, d].sort() }) }, DIAS[d].charAt(0).toUpperCase())));

    // Día y fecha límite comparten el calendario
    const chipDia = (nombre, valor) => h('div', { class: 'ag-chips' },
      h('button', { class: 'ag-chip' + (valor ? ' on' : ''), onclick: () => { calAbierto = calAbierto === nombre ? false : nombre; detalle(); } }, ico('cal'), valor ? L.etiquetaFecha(valor, hoy) : 'Sin fecha'),
      valor && h('button', { class: 'ag-chip', onclick: () => { calAbierto = false; editar(t.id, { [nombre]: null }, 'todo'); } }, 'Quitar'));
    const ponerHora = hh => editar(t.id, { hora: hh, ...(hh && !t.fecha && !t.limite ? { fecha: hoy } : {}) }, 'todo');
    const controlHora = h('div', { class: 'ag-hora' },
      h('div', { class: 'ag-paso' },
        h('button', { 'aria-label': 'Quitar 15 minutos', onclick: () => ponerHora(t.hora ? sumarHora(t.hora, -15) : '09:00') }, '−'),
        h('output', null, t.hora || 'Sin hora'),
        h('button', { 'aria-label': 'Añadir 15 minutos', onclick: () => ponerHora(t.hora ? sumarHora(t.hora, 15) : '09:00') }, '+')),
      h('div', { class: 'ag-chips' },
        [['Mañana', '09:00'], ['Mediodía', '12:00'], ['Tarde', '15:00'], ['Noche', '20:00']].map(([n, hh]) => h('button', { class: 'ag-chip' + (t.hora === hh ? ' on' : ''), onclick: () => ponerHora(hh) }, `${n} ${hh}`)),
        t.hora && h('button', { class: 'ag-chip', onclick: () => ponerHora(null) }, 'Quitar')));
    const chipsDur = h('div', { class: 'ag-chips' }, [0, ...DURACIONES].map(m => h('button', { class: 'ag-chip' + (t.dur === m ? ' on' : ''), onclick: () => editar(t.id, { dur: m }, 'todo') }, m ? textoDur(m) : 'Sin duración')));
    const activos = !!(g.recordatoriosActivos && g.recordatoriosActivos());
    const alternarRecordar = m => {
      const r = t.recordar.includes(m) ? t.recordar.filter(x => x !== m) : [...t.recordar, m].sort((a, b) => a - b);
      editar(t.id, { recordar: r, ...(r.length && !t.fecha && !t.limite ? { fecha: hoy } : {}) }, 'todo');
    };
    const recordar = h('div', null,
      h('div', { class: 'ag-chips' }, RECORDAR.map(([m, n]) => h('button', { class: 'ag-chip' + (t.recordar.includes(m) ? ' on' : ''), onclick: () => alternarRecordar(m) }, n))),
      !activos && h('p', { class: 'ag-nota' }, 'Los recordatorios están desactivados. ', h('button', { class: 'ag-enlace', onclick: () => { if (g.activarRecordatorios) g.activarRecordatorios(() => detalle()); } }, 'Activarlos')),
      activos && t.recordar.length > 0 && h('p', { class: 'ag-nota' }, `Te aviso mientras esta página esté abierta${t.hora ? '' : '. Sin hora, cuenta como las 9:00'}.`));

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
    const focos = E.registro.filter(r => r.k === 'foco' && r.tarea === t.id), minTotal = focos.reduce((n, r) => n + (r.min || 0), 0);

    c.append(
      h('div', { class: 'ag-det-cab' },
        h('button', { class: 'ag-check p' + t.prio + (t.hecha ? ' on' : ''), 'aria-label': 'Completar tarea', onclick: () => alternarHecha(t.id) }),
        h('input', { type: 'text', class: 'ag-det-titulo', value: t.titulo, maxLength: 200, placeholder: 'Título', oninput: e => { t.titulo = e.target.value; t.t = Date.now(); guardar(); listaUI(); },
          onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); } }),
        h('button', { class: 'ag-mini', 'aria-label': 'Cerrar detalle', onclick: () => seleccionar(t.id) }, ico('cerrar'))),
      seccion('Cuándo',
        campo('Día', chipDia('fecha', t.fecha), calAbierto === 'fecha' && calendario(t.fecha, s => { calAbierto = false; editar(t.id, { fecha: s }, 'todo'); })),
        campo('Hora', controlHora),
        campo('Fecha límite', chipDia('limite', t.limite), calAbierto === 'limite' && calendario(t.limite, s => { calAbierto = false; editar(t.id, { limite: s }, 'todo'); })),
        campo('Duración', chipsDur),
        campo('Repetir (rutina)', chipsRep, diasRep,
          rep && h('p', { class: 'ag-nota' }, `Al completarla pasará sola a: ${L.etiquetaFecha(L.siguiente(t.fecha, rep, hoy), hoy)}.${t.veces ? ` Completada ${t.veces} ${t.veces === 1 ? 'vez' : 'veces'}.` : ''}`)),
        campo('Recordar', recordar)),
      seccion('Detalles',
        campo('Prioridad', chipsPrio),
        campo('Lista', chipsLista),
        campo('Pomodoros', h('div', { class: 'ag-paso' }, h('button', { 'aria-label': 'Menos', onclick: () => editar(t.id, { est: Math.max(0, t.est - 1) }, 'todo') }, '−'),
          h('output', null, t.est ? `${t.pomos} de ${t.est}` : `${t.pomos} hechos`), h('button', { 'aria-label': 'Más', onclick: () => editar(t.id, { est: Math.min(30, t.est + 1) }, 'todo') }, '+'),
          h('span', { class: 'ag-nota' }, 'meta, opcional'))),
        campo('Etiquetas', t.etiquetas.length > 0 && h('div', { class: 'ag-chips' }, t.etiquetas.map(x => h('button', { class: 'ag-chip on', 'aria-label': 'Quitar etiqueta ' + x, onclick: () => editar(t.id, { etiquetas: t.etiquetas.filter(y => y !== x) }, 'todo') }, '#' + x, ico('cerrar', 'chico')))), etqInput),
        campo('Pasos', subs),
        campo('Notas', h('textarea', { class: 'ag-notas', placeholder: 'Detalles, enlaces, ideas…', value: t.notas, rows: 5, oninput: e => { t.notas = e.target.value; t.t = Date.now(); guardar(); },
          onkeydown: e => e.stopPropagation() }))),
      seccion('Apariencia',
        campo('Icono', h('div', { class: 'ag-chips' },
          h('button', { class: 'ag-chip' + (iconosAbierto ? ' on' : ''), onclick: () => { iconosAbierto = !iconosAbierto; detalle(); } }, t.icono ? ico('i_' + t.icono) : ico('mas'), t.icono ? 'Cambiar' : 'Elegir icono'),
          t.icono && h('button', { class: 'ag-chip', onclick: () => editar(t.id, { icono: '' }, 'todo') }, 'Quitar')),
          iconosAbierto && selectorIconos(t.icono, k => editar(t.id, { icono: k }, 'todo'))),
        campo('Color', paleta(t.color, col => editar(t.id, { color: col }, 'todo'), true))),
      (focos.length > 0 || t.veces > 0) && seccion('Actividad', h('p', { class: 'ag-nota' },
        [focos.length > 0 && `${focos.length} ${focos.length === 1 ? 'pomodoro' : 'pomodoros'} · ${minTotal} min enfocados`, t.veces > 0 && `Cumplida ${t.veces} ${t.veces === 1 ? 'vez' : 'veces'}`].filter(Boolean).join(' · '))),
      h('div', { class: 'ag-det-pie' }, h('span', { class: 'ag-nota' }, 'Creada ' + L.etiquetaFecha(L.hoy(new Date(t.creada)), hoy)),
        confirmable('Eliminar tarea', '¿Seguro? Pulsa otra vez', () => eliminarTarea(t.id))));
  }

  function todo() { lado(); listaUI(); detalle(); }

  function nuevaDesdeTexto(texto) {
    const p = L.parsear(texto);
    if (!p.titulo) return;
    const v = ui.vista, datos = { titulo: p.titulo, prio: p.prio, etiquetas: p.etiquetas, fecha: p.fecha, hora: p.hora };
    if (v.tipo === 'lista') datos.lista = v.id;
    if (v.tipo === 'etiqueta' && !datos.etiquetas.includes(v.nombre)) datos.etiquetas = [...datos.etiquetas, v.nombre];
    if (!datos.fecha && v.tipo === 'hoy') datos.fecha = L.hoy();
    if (!datos.fecha && v.tipo === 'proximas') datos.fecha = L.sumar(L.hoy(), 1);
    if (v.tipo === 'rutinas') datos.rep = { t: 'dia' }, datos.fecha = datos.fecha || L.hoy();
    if (datos.hora && !datos.fecha) datos.fecha = L.hoy();
    const t = crear(datos);
    if (!activa) fijarActiva(t.id);
    todo();
  }

  function construir() {
    refs.raiz = document.getElementById('agenda');
    refs.buscar = h('input', { type: 'text', class: 'ag-input', placeholder: 'Buscar…', oninput: e => { ui.q = e.target.value; if (ui.q && refs.caja) refs.caja.classList.remove('en-menu'); listaUI(); }, onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { e.target.value = ''; ui.q = ''; listaUI(); } } });
    refs.lado = h('div', { class: 'ag-lado-cont' });
    refs.titulo = h('h2', { class: 'ag-h' }); refs.cuenta = h('span', { class: 'ag-cuenta' }); refs.acciones = h('div', { class: 'ag-acciones' });
    refs.lista = h('div', { class: 'ag-lista' }); refs.pie = h('div', { class: 'ag-pie' });
    const entrada = h('input', { type: 'text', class: 'ag-input grande', placeholder: matchMedia('(max-width: 760px)').matches ? 'Añadir tarea…' : 'Añadir tarea…  (ej: Estudiar química #clase !alta mañana)', maxLength: 200, onkeydown: e => {
      e.stopPropagation();
      if (e.key === 'Enter') { nuevaDesdeTexto(e.target.value); e.target.value = ''; }
    } });
    refs.entrada = entrada;
    refs.centro = h('section', { class: 'ag-centro' },
      h('div', { class: 'ag-cab' }, h('button', { class: 'ag-mini menu', 'aria-label': 'Volver al menú', onclick: () => { ui.sel = null; refs.caja.classList.add('en-menu'); todo(); } }, ico('prev')), refs.titulo, refs.cuenta, h('span', { style: 'flex:1' }), refs.acciones,
        h('button', { class: 'ag-mini', 'aria-label': 'Cerrar agenda', onclick: cerrar }, ico('cerrar'))),
      refs.nueva = h('div', { class: 'ag-nueva' }, h('span', { class: 'ag-mas' }, ico('mas')), entrada), refs.lista, refs.pie);
    refs.detalle = h('aside', { class: 'ag-detalle' });
    refs.caja = h('div', { class: 'ag-caja', onclick: e => e.stopPropagation() },
      h('aside', { class: 'ag-lado' }, h('div', { class: 'ag-lado-tit' }, 'Mis tareas'), h('div', { class: 'ag-buscar' }, ico('buscar'), refs.buscar), refs.lado), refs.centro, refs.detalle);
    refs.raiz.append(refs.caja);
    refs.raiz.addEventListener('click', cerrar);
    if (g.Nube) Nube.alCambiar = () => { if (abierta) lado(); };
  }

  /** `destino === 'menu'`: en el teléfono se aterriza en el menú (el centro de la app); si no, directo en el espacio de trabajo. */
  function abrir(destino) {
    abierta = true; refs.caja.classList.toggle('en-menu', destino === 'menu'); refs.raiz.classList.add('abierto'); document.body.classList.add('agenda-abierta');
    todo(); sincronizar(false);
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => refs.entrada.focus(), 200);
  }
  function cerrar() {
    abierta = false; refs.raiz.classList.remove('abierto'); document.body.classList.remove('agenda-abierta'); calAbierto = false;
  }

  const Agenda = {
    L,
    iniciar(opciones = {}) {
      alCambiarActiva = opciones.alCambiarActiva || null;
      cargar(); construir();
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#agMenuCtx')) cerrarMenuCtx(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarMenuCtx(); });
      document.addEventListener('click', e => { if (ui.nubeMenu && !e.target.closest('.ag-nube')) { ui.nubeMenu = false; if (abierta) lado(); } });
      refs.hoy = document.getElementById('hoy'); refrescarHoy();
      if (alCambiarActiva) alCambiarActiva(Agenda.activaTitulo());
      addEventListener('keydown', e => { if (abierta && e.key === 'Escape' && !e.defaultPrevented) { if (ui.sel) seleccionar(ui.sel); else cerrar(); } });
      addEventListener('online', () => sincronizar(false));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { refrescarHoy(); revisarRecordatorios(); sincronizar(false); } });
      setInterval(revisarRecordatorios, 20000); revisarRecordatorios();
      setInterval(() => sincronizar(false), 90000);
      sincronizar(false);
    },
    abrir: () => abrir('menu'), cerrar, abierta: () => abierta,
    /** Abre la agenda con el detalle de una tarea. */
    abrirTarea(id) { ui.vista = { tipo: 'hoy' }; ui.q = ''; ui.sel = id; if (refs.buscar) refs.buscar.value = ''; abrir(); },
    fijarActiva, activaId: () => activa,
    /** Abre la agenda directamente en «Hoy». */
    abrirHoy() { ui.vista = { tipo: 'hoy' }; ui.q = ''; ui.sel = null; if (refs.buscar) refs.buscar.value = ''; abrir(); },
    /** Marca como hecha la tarea activa (si es rutina, pasa a su próxima fecha) y la deja de usar como foco. */
    completarActiva() { const t = tarea(activa); if (!t || t.hecha) return; const id = t.id; alternarHecha(id); if (activa === id) fijarActiva(null); },
    activaTitulo() { const t = tarea(activa); return t && !t.hecha ? t.titulo : ''; },
    /** Anota un pomodoro terminado (con o sin tarea) y lo suma a la tarea activa. */
    registrarFoco(min) {
      const t = tarea(activa);
      E.registro.push(L.evento('foco', { tarea: t ? t.id : null, titulo: t ? t.titulo : 'Enfoque libre', min }, Date.now()));
      if (t && !t.hecha) { t.pomos = (t.pomos || 0) + 1; t.t = Date.now(); }
      guardar(); if (abierta) { listaUI(); detalle(); }
    },
    /** Abre la agenda en el historial. */
    abrirHistorial() { ui.vista = { tipo: 'historial' }; ui.q = ''; ui.sel = null; if (refs.buscar) refs.buscar.value = ''; abrir(); },
  };
  g.Agenda = Agenda;
})(typeof window !== 'undefined' ? window : globalThis);
