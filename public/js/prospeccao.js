// Prospeccao - Fernando Solutions. Conversa com /api/prosp/* no servidor.
const CITIES = { RP: 'Ribeirão Pires', MA: 'Mauá', PA: 'Paranapiacaba', RG: 'Rio Grande da Serra', OU: 'Outras cidades' };
const PRIO = { A: 'Alta', MA: 'Média-alta', M: 'Média', B: 'Baixa' };
const PORD = { A: 0, MA: 1, M: 2, B: 3 };
let ETAPAS = [];
let DATA = [];
let CUSTOM = [];
const ALL = () => DATA.concat(CUSTOM);

/* ---------- estado ---------- */
let ST = {};   // id -> {e:{i:carimbo}, p:{i:carimbo}, done, del, nota, notaBy, last}
let ME = null;
let USUARIOS = [];
let filterCity = 'all', filterPrio = 'all', showDel = false, openId = null, tab = 'list';
let gateView = 'login', gateMsg = null;
const get = (id) => ST[id] || { e: {}, p: {}, done: null, del: null, nota: '', notaBy: null, last: null };

async function api(url, opcoes = {}) {
  const headers = { 'X-Requested-With': 'fetch' };
  let body;
  if (opcoes.body) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opcoes.body); }
  let r;
  try { r = await fetch(url, { method: opcoes.method || 'GET', headers, body, credentials: 'same-origin' }); }
  catch { throw new Error('Não foi possível falar com o servidor. Verifique sua conexão.'); }
  let dados = {};
  try { dados = await r.json(); } catch { /* sem JSON */ }
  if (r.status === 401 && ME && !url.endsWith('/entrar')) { sessaoExpirou(); }
  if (!r.ok) { const e = new Error(dados.erro || 'Algo deu errado. Tente novamente.'); e.status = r.status; throw e; }
  return dados;
}

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isOn = (v) => !!v;
const safeColor = (c) => (/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/.test(c) || /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#888');
const fmtDate = (t) => {
  const d = typeof t === 'number' ? new Date(t) : new Date(String(t).includes('T') ? t : String(t).replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
function dot(v, lg) {
  if (!v || typeof v !== 'object' || !v.by) return '';
  const when = v.at ? ' · ' + fmtDate(v.at) : '';
  return `<span class="who${lg ? ' lg' : ''}" style="--c:${safeColor(v.c)}" title="${esc(v.by)}${when}" aria-label="Alterado por ${esc(v.by)}"></span>`;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600); }

/* ---------- acoes no servidor ---------- */
// Uma alteracao por vez: evita que duas mudancas seguidas no mesmo estabelecimento se sobrescrevam.
let fila = Promise.resolve();
function acao(id, corpo) {
  fila = fila.then(() => enviarAcao(id, corpo));
  return fila;
}
async function enviarAcao(id, corpo) {
  try {
    const r = await api('/api/prosp/estado/' + encodeURIComponent(id), { method: 'POST', body: corpo });
    ST[r.id] = r.dados;
    setSync(true);
  } catch (e) {
    toast(e.message);
  }
  renderAll();
}
async function carregarEstado() {
  try {
    const r = await api('/api/prosp/estado');
    ST = r.estado || {};
    CUSTOM = (r.custom || []).map(normCustom);
    setSync(true);
    renderAll();
  } catch (e) {
    if (e.status !== 401) setSync(false);
  }
}
function setSync(ok) {
  $('#sync').textContent = ok ? 'Progresso salvo no servidor: todos da equipe veem as mesmas marcações.' : 'Sem conexão com o servidor. Tentando de novo…';
}

/* ---------- lista ---------- */
function total(e) { return ETAPAS.length + e.x.length; }
function doneCount(e) { const s = get(e.id); return Object.values(s.e || {}).filter(isOn).length + Object.values(s.p || {}).filter(isOn).length; }
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function visible(e) {
  const s = get(e.id);
  if (isOn(s.del) !== showDel) return false;
  if (filterCity !== 'all' && e.c !== filterCity) return false;
  if (filterPrio !== 'all' && (filterPrio === 'A' ? !(e.p === 'A' || e.p === 'MA') : e.p !== filterPrio)) return false;
  const q = $('#q').value.trim();
  if (q && !fold(e.n + ' ' + e.s + ' ' + e.a + ' ' + CITIES[e.c]).includes(fold(q))) return false;
  return true;
}
function sorted(list) { return list.slice().sort((a, b) => (isOn(get(a.id).done) - isOn(get(b.id).done)) || (PORD[a.p] - PORD[b.p]) || a.n.localeCompare(b.n, 'pt')); }

function renderStats() {
  const all = ALL(), act = all.filter((e) => !isOn(get(e.id).del)), del = all.length - act.length, done = act.filter((e) => isOn(get(e.id).done)).length;
  $('#sAtivos').textContent = act.length; $('#sDone').textContent = done; $('#sDel').textContent = del;
  $('#bar').style.width = (all.length ? (done + del) / all.length * 100 : 0) + '%';
  $('#showDel').textContent = showDel ? 'Voltar para a lista' : 'Ver excluídos (' + del + ')';
}
function renderChips() {
  const used = new Set(ALL().map((e) => e.c));
  const cc = [['all', 'Todas']].concat(Object.entries(CITIES).filter(([k]) => used.has(k)));
  $('#cityChips').innerHTML = cc.map(([k, v]) => `<button class="chip" data-city="${k}" aria-pressed="${filterCity === k}">${v}</button>`).join('');
  const pc = [['all', 'Toda prioridade'], ['A', 'Alta'], ['M', 'Média'], ['B', 'Baixa']];
  $('#prioChips').innerHTML = pc.map(([k, v]) => `<button class="chip" data-prio="${k}" aria-pressed="${filterPrio === k}">${v}</button>`).join('');
}
function renderMain() {
  if (!DATA.length) return;
  let html = '', toc = '';
  for (const [code, name] of Object.entries(CITIES)) {
    const list = sorted(ALL().filter((e) => e.c === code && visible(e)));
    if (!list.length) continue;
    html += `<section class="city" id="city-${code}"><h2>${name} <small>${list.length} ${list.length === 1 ? 'estabelecimento' : 'estabelecimentos'}</small></h2><div class="grid">`;
    toc += `<details open><summary>${name} (${list.length})</summary><ol>`;
    for (const e of list) {
      const s = get(e.id), d = doneCount(e), t = total(e);
      const status = isOn(s.del) ? '<span class="pill p-B">Excluído</span>' : isOn(s.done) ? '<span class="pill ok">Prospecção concluída</span>' : `<span>${d} de ${t} feitos</span>`;
      html += `<button class="card${isOn(s.done) ? ' is-done' : ''}" data-open="${esc(e.id)}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h3>${esc(e.n)}</h3><span class="pill p-${esc(e.p)}">${PRIO[e.p]}</span></div>
        <div class="seg">${esc(e.s)}${e.by ? ' · incluído pela equipe' : ''}</div>
        <div class="row">${status}<span style="display:flex;gap:8px;align-items:center">${dot(s.last)}<span class="mini" style="width:70px"><i style="width:${t ? d / t * 100 : 0}%"></i></span></span></div>
      </button>`;
      toc += `<li><button data-open="${esc(e.id)}"><span class="dot p-${esc(e.p)}"></span><span class="${isOn(s.done) ? 'ok' : ''}">${esc(e.n)}</span></button></li>`;
    }
    html += '</div></section>'; toc += '</ol></details>';
  }
  $('#main').innerHTML = html || `<p class="empty">${showDel ? 'Nenhum estabelecimento excluído ainda. Quando concluir a prospecção de um, abra o cartão e use “Excluir estabelecimento”.' : 'Nenhum estabelecimento com esses filtros.'}</p>`;
  $('#toc').innerHTML = toc || '<p class="hint">Nada para mostrar.</p>';
}
function renderMe() {
  const box = $('#meBox');
  if (!ME) { box.innerHTML = ''; $('#tabAdmin').hidden = true; return; }
  box.innerHTML = `${dot({ by: ME.login, c: ME.cor }, true)}<span>${esc(ME.login)}</span>${ME.admin ? '<span class="pill p-M">Admin</span>' : ''}<button class="sbtn" id="logout">Sair</button>`;
  $('#tabAdmin').hidden = !ME.admin;
}
function renderTabs() {
  $('#tabList').setAttribute('aria-selected', tab === 'list');
  $('#tabAdmin').setAttribute('aria-selected', tab === 'admin');
  $('#viewList').hidden = tab !== 'list';
  $('#viewAdmin').hidden = tab !== 'admin';
}
function renderAll() {
  renderStats(); renderChips(); renderMain(); renderMe(); renderTabs(); renderAdmin();
  if (openId && $('#dlg').open) {
    const a = document.activeElement, fid = a && a.id;
    if (fid === 'nota') return; // nao interrompe quem esta digitando
    renderDialog(openId, true);
    if (fid) { const el = document.getElementById(fid); if (el) el.focus({ preventScroll: true }); }
  }
}

/* ---------- pop-up do estabelecimento ---------- */
function waLink(p) { const d = String(p).replace(/\D/g, ''); return d.length === 11 && d[2] === '9' ? 'https://wa.me/55' + d : null; }
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : null);
function renderDialog(id, keep) {
  const e = ALL().find((x) => x.id === id); if (!e) return;
  const s = get(id), dlg = $('#dlg');
  const scroll = keep ? (dlg.querySelector('.m-scroll') || {}).scrollTop : 0;
  const nota = keep && document.getElementById('nota') ? document.getElementById('nota').value : (s.nota || '');
  const phones = e.t.length ? e.t.map((p) => { const w = waLink(p); return `<div class="phone"><code>${esc(p)}</code><button class="sbtn" data-copy="${esc(p)}">Copiar</button>${w ? `<a class="sbtn" href="${w}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`; }).join('') : 'Não encontrado';
  const lk = e.l.filter((x) => Array.isArray(x) && safeUrl(x[1]));
  const links = lk.length ? `<div class="links">${lk.map(([lab, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(lab)}</a>`).join('')}</div>` : 'Não encontrado';
  const chk = (grp, i, txt, val) => `<label class="check"><input type="checkbox" id="c-${grp}-${i}" data-grp="${grp}" data-i="${i}" ${isOn(val) ? 'checked' : ''}><span>${esc(txt)}</span>${dot(val)}</label>`;
  dlg.innerHTML = `<div class="m-scroll" style="max-height:calc(100vh - 32px);overflow:auto">
    <div class="m-head"><div style="min-width:0"><h2 id="dName">${esc(e.n)}</h2>
      <div class="meta"><span>${CITIES[e.c] || ''}</span>·<span>${esc(e.s)}</span><span class="pill p-${esc(e.p)}">Prioridade ${PRIO[e.p] || ''}</span>${e.by ? `<span class="who-line">${dot(e.by)} incluído por ${esc(e.by.by)}</span>` : ''}</div></div>
      <button class="x" data-close aria-label="Fechar">×</button></div>
    <div class="m-body">
      <dl class="info">
        <dt>Endereço</dt><dd>${esc(e.a || 'Não informado')}</dd>
        <dt>Telefones</dt><dd>${phones}</dd>
        <dt>Links</dt><dd>${links}</dd>
        <dt>Situação hoje</dt><dd>${esc(e.h || 'Não informado')}</dd>
      </dl>
      <fieldset><legend>Etapas da prospecção</legend>${ETAPAS.map((t, i) => chk('e', i, t, s.e && s.e[i])).join('')}</fieldset>
      <fieldset><legend>Propostas para oferecer</legend>${e.x.length ? e.x.map((t, i) => chk('p', i, t, s.p && s.p[i])).join('') : '<p class="hint">Nenhuma proposta cadastrada.</p>'}</fieldset>
      <div><label for="nota" style="font-family:var(--display);font-weight:700;display:block;margin-bottom:6px">Anotações</label>
      <textarea id="nota" placeholder="Ex.: falei com o dono, pediu retorno sexta à tarde">${esc(nota)}</textarea>
      ${s.notaBy ? `<div class="who-line" style="margin-top:4px">${dot(s.notaBy)} última edição por ${esc(s.notaBy.by)}</div>` : ''}</div>
    </div>
    <div class="m-foot">
      ${isOn(s.del) ? `<span class="who-line">${dot(s.del)} Excluído${s.del.by ? ' por ' + esc(s.del.by) : ''}</span><button class="btn primary" data-restore>Restaurar na lista</button>`
    : `<label class="check"><input type="checkbox" id="c-done" data-done ${isOn(s.done) ? 'checked' : ''}><span>Já fiz a prospecção</span>${dot(s.done)}</label>
      <div id="delZone">${isOn(s.done) ? '<button class="btn danger" data-del>Excluir estabelecimento</button>' : '<button class="btn danger" disabled title="Marque “Já fiz a prospecção” primeiro">Excluir estabelecimento</button>'}</div>`}
    </div></div>`;
  if (keep) dlg.querySelector('.m-scroll').scrollTop = scroll || 0;
}
function openDlg(id) { openId = id; renderDialog(id); const d = $('#dlg'); if (!d.open) d.showModal(); }
function closeDlg() { saveNota(); const d = $('#dlg'); if (d.open) d.close(); openId = null; }

let notaTimer = null;
function saveNota() {
  if (!openId || !ME) return;
  const el = document.getElementById('nota'); if (!el) return;
  clearTimeout(notaTimer);
  if ((get(openId).nota || '') !== el.value) acao(openId, { tipo: 'nota', texto: el.value });
}

/* ---------- novo estabelecimento ---------- */
function openAdd() {
  openId = null;
  const dlg = $('#dlg');
  const opts = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  dlg.innerHTML = `<div class="m-scroll" style="max-height:calc(100vh - 32px);overflow:auto">
    <div class="m-head"><div><h2 id="dName">Novo estabelecimento</h2><div class="meta">Fica visível para toda a equipe, marcado com a sua cor.</div></div><button class="x" data-close aria-label="Fechar">×</button></div>
    <form id="addForm" class="m-body" novalidate>
      <div class="form-grid">
        <div class="field full"><label for="fN">Nome *</label><input id="fN" required maxlength="80"></div>
        <div class="field"><label for="fC">Cidade</label><select id="fC">${opts(CITIES)}</select></div>
        <div class="field"><label for="fP">Prioridade</label><select id="fP">${opts(PRIO)}</select></div>
        <div class="field full"><label for="fS">Segmento</label><input id="fS" maxlength="80" placeholder="Ex.: Pizzaria delivery"></div>
        <div class="field full"><label for="fA">Endereço</label><input id="fA" maxlength="160"></div>
        <div class="field"><label for="fT">Telefones (separe por vírgula)</label><input id="fT" maxlength="160" placeholder="(11) 99999-9999"></div>
        <div class="field"><label for="fI">Instagram (@ ou link)</label><input id="fI" maxlength="120"></div>
        <div class="field full"><label for="fH">Situação hoje</label><textarea id="fH" maxlength="400" placeholder="O que a loja usa hoje e o que falta"></textarea></div>
        <div class="field full"><label for="fX">Propostas para oferecer (uma por linha)</label><textarea id="fX" maxlength="1500" placeholder="Cardápio digital com QR code&#10;Chatbot no WhatsApp"></textarea></div>
      </div>
      <div id="addMsg"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit" id="addSave">Incluir estabelecimento</button></div>
    </form></div>`;
  if (!dlg.open) dlg.showModal();
  $('#fN').focus();
}
async function saveAdd() {
  const v = (id) => document.getElementById(id).value.trim();
  if (!v('fN')) { $('#addMsg').innerHTML = '<div class="msg err">Informe o nome do estabelecimento.</div>'; return; }
  $('#addSave').disabled = true;
  try {
    const r = await api('/api/prosp/estabelecimentos', { method: 'POST', body: { n: v('fN'), c: v('fC'), p: v('fP'), s: v('fS'), a: v('fA'), t: v('fT'), instagram: v('fI'), h: v('fH'), x: document.getElementById('fX').value } });
    CUSTOM.push(normCustom(r.estabelecimento));
    closeDlg(); toast(r.estabelecimento.n + ' foi incluído'); renderAll();
  } catch (e) {
    $('#addMsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
    $('#addSave').disabled = false;
  }
}
function normCustom(o) {
  o = o || {};
  return {
    id: String(o.id), n: String(o.n || 'Sem nome'), c: CITIES[o.c] ? o.c : 'OU', p: PRIO[o.p] ? o.p : 'M', s: String(o.s || ''), a: String(o.a || ''),
    t: Array.isArray(o.t) ? o.t.map(String) : [], l: Array.isArray(o.l) ? o.l.filter(Array.isArray).map((x) => [String(x[0]), String(x[1])]) : [],
    h: String(o.h || ''), x: Array.isArray(o.x) ? o.x.map(String) : [], by: o.by && o.by.by ? o.by : null,
  };
}

/* ---------- administracao ---------- */
async function carregarUsuarios() {
  if (!ME || !ME.admin) return;
  try { USUARIOS = (await api('/api/prosp/usuarios')).usuarios; renderAdmin(); } catch (e) { toast(e.message); }
}
function renderAdmin() {
  if (!ME || !ME.admin) return;
  const pend = USUARIOS.filter((u) => u.status === 'pendente').length;
  const b = $('#pendBadge'); b.textContent = pend; b.hidden = !pend;
  const body = $('#admRows');
  if (!USUARIOS.length) { body.innerHTML = '<tr><td colspan="7" class="hint">Nenhum pedido de cadastro ainda. Quando um funcionário se cadastrar, o pedido aparece aqui para você aprovar.</td></tr>'; return; }
  const ord = { pendente: 0, aprovado: 1, rejeitado: 2 };
  const lista = USUARIOS.slice().sort((x, y) => (ord[x.status] - ord[y.status]) || (y.id - x.id));
  const keepPw = {}; document.querySelectorAll('[data-pwin]').forEach((i) => { keepPw[i.dataset.pwin] = i.value; });
  body.innerHTML = lista.map((u) => {
    const pill = u.status === 'aprovado' ? '<span class="st appr">Aprovado</span>' : u.status === 'rejeitado' ? '<span class="st rej">Rejeitado</span>' : '<span class="st pend">Aguardando</span>';
    const acts = (u.status !== 'aprovado' ? `<button class="btn primary sm" data-appr="${u.id}">Aprovar</button>` : '')
      + (u.status !== 'rejeitado' ? `<button class="btn danger sm" data-rej="${u.id}">${u.status === 'aprovado' ? 'Bloquear' : 'Rejeitar'}</button>` : '');
    return `<tr><td>${dot({ by: u.login, c: u.cor }, true)}</td><td><b>${esc(u.login)}</b></td><td>${esc(u.email)}</td><td style="white-space:nowrap">${fmtDate(u.criado_em)}</td>
      <td><div class="acts"><span class="hint">Criptografada</span><input type="password" data-pwin="${u.id}" id="pw-${u.id}" placeholder="Nova senha" aria-label="Nova senha para ${esc(u.login)}" value="${esc(keepPw[u.id] || '')}"><button class="sbtn" data-reset="${u.id}">Definir</button></div></td>
      <td>${pill}</td><td><div class="acts">${acts}</div></td></tr>`;
  }).join('');
}
async function setStatus(id, status) {
  try {
    await api(`/api/prosp/usuarios/${id}/status`, { method: 'PUT', body: { status } });
    const u = USUARIOS.find((x) => x.id === id);
    toast(u ? `${u.login} foi ${status === 'aprovado' ? 'aprovado' : 'bloqueado'}` : 'Atualizado');
    carregarUsuarios();
  } catch (e) { toast(e.message); }
}
async function resetPw(id) {
  const inp = document.getElementById('pw-' + id); if (!inp) return;
  try {
    await api(`/api/prosp/usuarios/${id}/senha`, { method: 'PUT', body: { senha: inp.value } });
    inp.value = '';
    const u = USUARIOS.find((x) => x.id === id);
    toast('Senha de ' + (u ? u.login : 'usuário') + ' redefinida');
  } catch (e) { toast(e.message); }
}

/* ---------- login e cadastro ---------- */
function renderGate() {
  const g = $('#gate');
  const msg = gateMsg ? `<div class="msg ${gateMsg.type}" role="status">${esc(gateMsg.text)}</div>` : '';
  const brand = `<div class="brand"><div class="logo big"><img class="logo-img" alt="Logo Fernando Solutions"></div><div><div class="eyebrow">Prospecção · ABC e Serra</div><h2 id="gateTitle">${gateView === 'login' ? 'Fernando Solutions' : 'Criar cadastro'}</h2></div></div>`;
  g.innerHTML = gateView === 'login' ? `<div class="gate-card">${brand}
      <p class="sub" style="text-align:center;margin:0">Entre com o seu login para acessar a prospecção.</p>${msg}
      <form id="loginForm" novalidate>
        <div class="field"><label for="lUser">Login</label><input id="lUser" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
        <div class="field"><label for="lPass">Senha</label><input id="lPass" type="password" autocomplete="current-password" required></div>
        <button class="btn primary wide" type="submit" id="lBtn">Entrar</button>
      </form>
      <button class="linkbtn" data-gate="signup">Ainda não tem login? Criar cadastro</button></div>`
    : `<div class="gate-card">${brand}
      <p class="sub" style="text-align:center;margin:0">Depois de enviar, o administrador precisa aprovar o seu acesso.</p>${msg}
      <form id="signupForm" novalidate>
        <div class="field"><label for="sUser">Login desejado</label><input id="sUser" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" required></div>
        <div class="field"><label for="sMail">E-mail profissional</label><input id="sMail" type="email" autocomplete="email" maxlength="120" required></div>
        <div class="field"><label for="sPass">Senha</label><input id="sPass" type="password" autocomplete="new-password" required></div>
        <div class="field"><label for="sPass2">Confirmar senha</label><input id="sPass2" type="password" autocomplete="new-password" required></div>
        <button class="btn primary wide" type="submit" id="sBtn">Enviar solicitação</button>
      </form>
      <button class="linkbtn" data-gate="login">Já tenho login: voltar para entrar</button></div>`;
  paintLogo();
}
function lock() { $('#app').classList.add('locked'); $('#app').setAttribute('aria-hidden', 'true'); $('#gate').hidden = false; renderGate(); }
function unlock() { $('#app').classList.remove('locked'); $('#app').removeAttribute('aria-hidden'); $('#gate').hidden = true; $('#gate').innerHTML = ''; }
function gateFail(text) { gateMsg = { type: 'err', text }; renderGate(); }

let poll = null;
function enter(usuario) {
  ME = usuario; gateMsg = null; unlock();
  carregarEstado(); carregarUsuarios();
  clearInterval(poll);
  poll = setInterval(() => { if (document.visibilityState === 'visible' && ME) { carregarEstado(); carregarUsuarios(); } }, 15000);
  renderAll();
}
async function doLogin() {
  const login = $('#lUser').value.trim(), senha = $('#lPass').value;
  if (!login || !senha) return gateFail('Preencha o login e a senha.');
  $('#lBtn').disabled = true; $('#lBtn').textContent = 'Entrando…';
  try { const r = await api('/api/prosp/entrar', { method: 'POST', body: { login, senha } }); enter(r.usuario); }
  catch (e) { gateFail(e.message); }
}
async function doSignup() {
  const login = $('#sUser').value.trim(), email = $('#sMail').value.trim(), senha = $('#sPass').value, confirmar = $('#sPass2').value;
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(login)) return gateFail('O login precisa ter de 3 a 30 caracteres, só letras, números, ponto, hífen ou sublinhado.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return gateFail('Informe um e-mail profissional válido.');
  if (senha.length < 6) return gateFail('A senha precisa ter pelo menos 6 caracteres.');
  if (senha !== confirmar) return gateFail('As senhas não conferem. Digite a mesma senha nos dois campos.');
  $('#sBtn').disabled = true; $('#sBtn').textContent = 'Enviando…';
  try {
    await api('/api/prosp/cadastro', { method: 'POST', body: { login, email, senha, confirmar } });
    gateView = 'login'; gateMsg = { type: 'ok', text: 'Sua solicitação de criação de conta foi realizada, aguarde a aprovação.' }; renderGate();
  } catch (e) { gateFail(e.message); }
}
async function logout() {
  closeDlg(); clearInterval(poll);
  try { await api('/api/prosp/sair', { method: 'POST' }); } catch { /* sai mesmo assim */ }
  ME = null; ST = {}; USUARIOS = []; tab = 'list'; gateView = 'login'; gateMsg = null; renderAll(); lock();
}
function sessaoExpirou() {
  ME = null; clearInterval(poll); closeDlg(); tab = 'list';
  gateView = 'login'; gateMsg = { type: 'err', text: 'Sua sessão terminou. Entre de novo.' }; lock(); renderAll();
}

/* ---------- logo (remove o fundo cinza) ---------- */
const LOGO_RAW = '/img/logo-fernando.webp';
let LOGO = LOGO_RAW;
function paintLogo() { document.querySelectorAll('.logo-img').forEach((i) => { if (i.getAttribute('src') !== LOGO) i.src = LOGO; }); }
(function () {
  const im = new Image();
  im.onload = () => {
    try {
      const W = im.naturalWidth, H = im.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const x = cv.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H), p = d.data;
      const b0 = p[0], b1 = p[1], b2 = p[2], tol = 38, seen = new Uint8Array(W * H), st = [];
      for (let i = 0; i < W; i++) st.push(i, (H - 1) * W + i);
      for (let j = 0; j < H; j++) st.push(j * W, j * W + W - 1);
      while (st.length) {
        const k = st.pop(); if (seen[k]) continue; seen[k] = 1; const o = k * 4;
        if (Math.abs(p[o] - b0) > tol || Math.abs(p[o + 1] - b1) > tol || Math.abs(p[o + 2] - b2) > tol) continue;
        p[o + 3] = 0; const cx = k % W, cy = (k / W) | 0;
        if (cx > 0) st.push(k - 1); if (cx < W - 1) st.push(k + 1); if (cy > 0) st.push(k - W); if (cy < H - 1) st.push(k + W);
      }
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (p[(y * W + xx) * 4 + 3]) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      x.putImageData(d, 0, 0);
      const S = 360, bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = S / Math.max(bw, bh), out = document.createElement('canvas'); out.width = S; out.height = S;
      out.getContext('2d').drawImage(cv, x0, y0, bw, bh, (S - bw * sc) / 2, (S - bh * sc) / 2, bw * sc, bh * sc);
      LOGO = out.toDataURL('image/png');
    } catch { LOGO = LOGO_RAW; }
    paintLogo();
  };
  im.onerror = paintLogo; im.src = LOGO_RAW;
})();

/* ---------- eventos ---------- */
document.addEventListener('click', (ev) => {
  const gt = ev.target.closest('[data-gate]'); if (gt) { gateView = gt.dataset.gate; gateMsg = null; renderGate(); return; }
  if (!ME) return;
  const o = ev.target.closest('[data-open]'); if (o) { openDlg(o.dataset.open); return; }
  const tb = ev.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab === 'admin' && ME.admin ? 'admin' : 'list'; renderTabs(); if (tab === 'admin') carregarUsuarios(); return; }
  const c = ev.target.closest('[data-city]'); if (c) { filterCity = c.dataset.city; renderAll(); return; }
  const p = ev.target.closest('[data-prio]'); if (p) { filterPrio = p.dataset.prio; renderAll(); return; }
  if (ev.target.closest('#showDel')) { showDel = !showDel; $('#showDel').setAttribute('aria-pressed', showDel); renderAll(); return; }
  if (ev.target.closest('#addBtn')) { openAdd(); return; }
  if (ev.target.closest('#logout')) { logout(); return; }
  if (ev.target.closest('[data-close]')) { closeDlg(); return; }
  const ap = ev.target.closest('[data-appr]'); if (ap && ME.admin) { setStatus(Number(ap.dataset.appr), 'aprovado'); return; }
  const rj = ev.target.closest('[data-rej]'); if (rj && ME.admin) { setStatus(Number(rj.dataset.rej), 'rejeitado'); return; }
  const rs = ev.target.closest('[data-reset]'); if (rs && ME.admin) { resetPw(rs.dataset.reset); return; }
  const cp = ev.target.closest('[data-copy]');
  if (cp) {
    const v = cp.dataset.copy;
    Promise.resolve().then(() => navigator.clipboard.writeText(v)).then(() => toast('Copiado: ' + v)).catch(() => {
      const r = document.createRange(); r.selectNodeContents(cp.previousElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Número selecionado: use Ctrl+C');
    });
    return;
  }
  if (ev.target.closest('[data-del]')) {
    $('#delZone').innerHTML = '<div class="confirm"><span>Tirar da lista?</span><button class="btn danger" data-delok>Confirmar exclusão</button><button class="btn ghost" data-delno>Cancelar</button></div>';
    return;
  }
  if (ev.target.closest('[data-delno]')) { renderDialog(openId, true); return; }
  if (ev.target.closest('[data-delok]')) {
    const id = openId, n = ALL().find((x) => x.id === id).n;
    closeDlg();
    acao(id, { tipo: 'excluir' }).then(() => { if (isOn(get(id).del)) toast(n + ' foi excluído. Veja em “Ver excluídos”.'); });
    return;
  }
  if (ev.target.closest('[data-restore]')) { const id = openId; closeDlg(); acao(id, { tipo: 'restaurar' }).then(() => toast('Restaurado na lista')); }
});
document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (ev.target.id === 'loginForm') doLogin();
  else if (ev.target.id === 'signupForm') doSignup();
  else if (ev.target.id === 'addForm' && ME) saveAdd();
});
document.addEventListener('change', (ev) => {
  const t = ev.target; if (!ME || !openId) return;
  if (t.dataset.grp) { saveNota(); acao(openId, { tipo: t.dataset.grp === 'e' ? 'etapa' : 'proposta', i: Number(t.dataset.i), marcado: t.checked }); }
  else if (t.hasAttribute('data-done')) { saveNota(); acao(openId, { tipo: 'concluida', marcado: t.checked }); }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') { renderMain(); return; }
  if (ev.target.id === 'nota') { clearTimeout(notaTimer); notaTimer = setTimeout(saveNota, 900); }
});
$('#dlg').addEventListener('close', () => { saveNota(); openId = null; });
$('#dlg').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) closeDlg(); });

/* ---------- inicio ---------- */
lock();
fetch('/prospeccao/dados.json').then((r) => r.json()).then((d) => {
  ETAPAS = d.etapas || []; DATA = d.estabelecimentos || []; renderAll();
}).catch(() => { $('#main').innerHTML = '<p class="empty">Não consegui carregar a lista. Recarregue a página.</p>'; });
api('/api/prosp/eu').then((r) => enter(r.usuario)).catch(() => { /* sem sessao: fica na tela de login */ });
