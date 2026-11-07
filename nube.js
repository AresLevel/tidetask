/* Nube: sincronización de la agenda con Google Drive (scope drive.file), mismo enfoque que BitInk.
 * Un solo archivo agenda.json dentro de la carpeta «Pomodoro». La fusión la hace la Agenda; aquí solo está
 * el acceso: token de Google Identity Services, carpeta/archivo, descarga y subida. */
(function (g) {
  'use strict';
  const CLIENT_ID = '1036068437011-tmaousirc25nq980klqiifvjbko1dckl.apps.googleusercontent.com';   // público por diseño (OAuth web)
  const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
  const CARPETA = 'Pomodoro', ARCHIVO = 'agenda.json';
  const K = { tok: 'nube.tok', on: 'nube.on', ids: 'nube.ids', ult: 'nube.ult', email: 'nube.email' };
  const API = 'https://www.googleapis.com/drive/v3/files', SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';

  let cliente = null, pendiente = null, tok = null, exp = 0, enCurso = null;
  try {
    const s = JSON.parse(localStorage.getItem(K.tok) || 'null');
    if (s && s.exp > Date.now() + 60000) { tok = s.t; exp = s.exp; }
  } catch { /* sesión corrupta: se ignora */ }

  const Nube = {
    estado: localStorage.getItem(K.on) ? 'espera' : 'apagada',   // apagada | espera | sincronizando | ok | offline | auth | error
    email: localStorage.getItem(K.email) || '',
    ult: Number(localStorage.getItem(K.ult)) || 0,
    alCambiar: null,
    conectada: () => !!localStorage.getItem(K.on),
  };
  function cambiar(estado) { Nube.estado = estado; if (Nube.alCambiar) Nube.alCambiar(); }
  const valido = () => !!tok && exp - 60000 > Date.now();

  function cargarGsi() {
    if (g.google && g.google.accounts && g.google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, err) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => err(new TypeError('No se pudo cargar Google (¿sin internet?)'));
      document.head.appendChild(s);
    });
  }
  async function asegurarCliente() {
    if (cliente) return;
    await cargarGsi();
    cliente = g.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES,
      callback: r => pendiente && pendiente(r),
      error_callback: e => pendiente && pendiente({ error: (e && e.type) || 'error' }),
    });
  }
  function pedir(opciones, ms) {
    return new Promise(res => {
      const timer = ms ? setTimeout(() => { pendiente = null; res(false); }, ms) : null;
      pendiente = r => {
        clearTimeout(timer); pendiente = null;
        if (r.error || !r.access_token) { res(false); return; }
        tok = r.access_token; exp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        try { localStorage.setItem(K.tok, JSON.stringify({ t: tok, exp })); } catch { /* modo privado */ }
        res(true);
      };
      cliente.requestAccessToken(opciones);
    });
  }
  /** Token vigente; si caducó intenta renovarlo sin ventana (puede fallar sin gesto del usuario). */
  async function token() {
    if (valido()) return tok;
    if (Nube.conectada()) {
      await asegurarCliente();
      if (await pedir({ prompt: '', login_hint: Nube.email || undefined }, 8000)) return tok;
    }
    return null;
  }
  function errAuth() { const e = new Error('sin sesión'); e.status = 401; return e; }
  async function dr(url, op, reintento = true) {
    const t = await token(); if (!t) throw errAuth();
    const r = await fetch(url, { ...op, headers: { Authorization: 'Bearer ' + t, ...((op && op.headers) || {}) } });
    if (r.status === 401 && reintento) { tok = null; exp = 0; return dr(url, op, false); }
    if (!r.ok) { const e = new Error('Drive ' + r.status); e.status = r.status; throw e; }
    return r;
  }
  const json = async r => r.json();

  async function asegurarArchivo() {
    let ids = null;
    try { ids = JSON.parse(localStorage.getItem(K.ids) || 'null'); } catch { /* se recalcula */ }
    if (ids && ids.carpeta) return ids;
    let q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${CARPETA}' and trashed=false`);
    let r = await json(await dr(`${API}?q=${q}&fields=files(id)`));
    let carpeta = r.files[0] && r.files[0].id;
    if (!carpeta) {
      const c = await json(await dr(`${API}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: CARPETA, mimeType: 'application/vnd.google-apps.folder' }) }));
      carpeta = c.id;
    }
    q = encodeURIComponent(`name='${ARCHIVO}' and '${carpeta}' in parents and trashed=false`);
    r = await json(await dr(`${API}?q=${q}&fields=files(id)`));
    ids = { carpeta, archivo: (r.files[0] && r.files[0].id) || null };
    localStorage.setItem(K.ids, JSON.stringify(ids));
    return ids;
  }
  async function subir(ids, contenido) {
    if (ids.archivo) {
      await dr(`${SUBIDA}/${ids.archivo}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: contenido });
      return;
    }
    const f = 'pomo' + Date.now().toString(36);
    const meta = JSON.stringify({ name: ARCHIVO, parents: [ids.carpeta], mimeType: 'application/json' });
    const cuerpo = `--${f}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${f}\r\nContent-Type: application/json\r\n\r\n${contenido}\r\n--${f}--`;
    const r = await json(await dr(`${SUBIDA}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${f}` }, body: cuerpo }));
    ids.archivo = r.id; localStorage.setItem(K.ids, JSON.stringify(ids));
  }

  /** Descarga, fusiona con `local` (función `fusionar(a, b)`), sube si hace falta y devuelve el estado fusionado. */
  Nube.sincronizar = function (local, fusionar, canon) {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      cambiar('sincronizando');
      try {
        let ids = await asegurarArchivo(), remoto = null;
        if (ids.archivo) {
          try { remoto = await json(await dr(`${API}/${ids.archivo}?alt=media`)); }
          catch (e) {
            if (e.status !== 404) throw e;
            localStorage.removeItem(K.ids); ids = await asegurarArchivo();   // alguien borró el archivo: se vuelve a crear
          }
        }
        const fus = remoto ? fusionar(local, remoto) : local;
        if (!remoto || canon(remoto) !== canon(fus)) await subir(ids, JSON.stringify(fus));
        Nube.ult = Date.now(); localStorage.setItem(K.ult, String(Nube.ult));
        cambiar('ok');
        return fus;
      } catch (e) {
        cambiar(e.status === 401 || e.status === 403 ? 'auth' : (e instanceof TypeError ? 'offline' : 'error'));
        throw e;
      } finally { enCurso = null; }
    })();
    return enCurso;
  };

  /** Abre la ventana de Google (requiere un gesto del usuario). */
  Nube.conectar = async function () {
    try {
      await asegurarCliente();
      const ok = await pedir({ prompt: Nube.conectada() ? '' : 'select_account', login_hint: Nube.email || undefined });
      if (!ok) { if (!Nube.conectada()) cambiar('apagada'); return false; }
      localStorage.setItem(K.on, '1');
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok } });
        if (r.ok) { Nube.email = (await r.json()).email || ''; localStorage.setItem(K.email, Nube.email); }
      } catch { /* el correo es solo informativo */ }
      cambiar('espera');
      return true;
    } catch { cambiar('offline'); return false; }
  };
  Nube.desconectar = function () {
    try { if (tok && g.google && g.google.accounts) g.google.accounts.oauth2.revoke(tok, () => {}); } catch { /* mejor esfuerzo */ }
    tok = null; exp = 0;
    Object.values(K).forEach(k => localStorage.removeItem(k));
    Nube.email = ''; Nube.ult = 0; cambiar('apagada');
  };

  g.Nube = Nube;
})(typeof window !== 'undefined' ? window : globalThis);
