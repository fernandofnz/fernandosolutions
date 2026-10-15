// Prospeccao de estabelecimentos: contas de funcionarios (com aprovacao do administrador),
// progresso compartilhado e registro de quem fez cada alteracao.
// As contas daqui sao separadas das contas de professores do gerador de planos.
const express = require('express');
const { db } = require('./db');
const { gerarHash, conferirSenha } = require('./senhas');
const { etapas: ETAPAS, estabelecimentos: ESTABELECIMENTOS } = require('./prospeccao-dados.json');

const IDS_FIXOS = new Set(ESTABELECIMENTOS.map((e) => e.id));
const COR_ADMIN = 'hsl(43 90% 46%)';
const CIDADES = ['RP', 'MA', 'PA', 'RG', 'OU'];
const PRIORIDADES = ['A', 'MA', 'M', 'B'];

function paraObjetos(r) {
  return r.rows.map((l) => Object.fromEntries(r.columns.map((c, i) => [c, l[i]])));
}
const todos = async (sql, args = []) => paraObjetos(await db.execute({ sql, args }));
const um = async (sql, args = []) => (await todos(sql, args))[0] ?? null;

async function iniciarProspeccao() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS prosp_usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      cor TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      admin INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS prosp_estado (
      est_id TEXT PRIMARY KEY,
      dados TEXT NOT NULL,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS prosp_custom (
      id TEXT PRIMARY KEY,
      dados TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ], 'write');

  // Conta de administrador: login "Admin". A senha vem de PROSP_ADMIN_SENHA (padrao 1905).
  if (!(await um('SELECT id FROM prosp_usuarios WHERE admin = 1 LIMIT 1'))) {
    await db.execute({
      sql: `INSERT INTO prosp_usuarios (login, email, senha_hash, cor, status, admin) VALUES ('Admin', '', ?, ?, 'aprovado', 1)`,
      args: [gerarHash(process.env.PROSP_ADMIN_SENHA || '1905'), COR_ADMIN],
    });
  }
}

const corAleatoria = () => `hsl(${Math.floor(Math.random() * 360)} 72% 47%)`;
const carimbo = (u) => ({ by: u.login, c: u.cor, at: Date.now() });
const publico = (u) => ({ login: u.login, cor: u.cor, admin: !!u.admin });
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

class ErroPedido extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// Aplica uma acao ao estado de um estabelecimento, sempre carimbando quem fez.
function aplicarAcao(atual, corpo, u) {
  const s = { e: {}, p: {}, done: null, del: null, nota: '', notaBy: null, last: null, ...(atual || {}) };
  const st = carimbo(u);
  switch (corpo?.tipo) {
    case 'etapa':
    case 'proposta': {
      const grupo = corpo.tipo === 'etapa' ? 'e' : 'p';
      const i = Number(corpo.i);
      if (!Number.isInteger(i) || i < 0 || i > 60) throw new ErroPedido(400, 'Item inválido.');
      s[grupo] = { ...s[grupo] };
      if (corpo.marcado) s[grupo][i] = st; else delete s[grupo][i];
      break;
    }
    case 'concluida':
      s.done = corpo.marcado ? st : null;
      break;
    case 'excluir':
      if (!s.done) throw new ErroPedido(400, 'Marque “Já fiz a prospecção” antes de excluir.');
      s.del = st;
      break;
    case 'restaurar':
      s.del = null; s.done = null;
      break;
    case 'nota':
      s.nota = String(corpo.texto ?? '').slice(0, 2000);
      s.notaBy = st;
      break;
    default:
      throw new ErroPedido(400, 'Ação inválida.');
  }
  s.last = st;
  return s;
}

function texto(v, max) { return String(v ?? '').trim().slice(0, max); }

function criarRotasProspeccao({ exigirFetch, limiteLogin }) {
  const r = express.Router();

  async function usuarioProsp(req) {
    if (!req.session?.puid) return null;
    const u = await um('SELECT id, login, cor, status, admin FROM prosp_usuarios WHERE id = ?', [req.session.puid]);
    return u && u.status === 'aprovado' ? u : null;
  }
  async function exigir(req, res, next) {
    const u = await usuarioProsp(req);
    if (!u) return res.status(401).json({ erro: 'Faça login para continuar.' });
    req.prosp = u;
    next();
  }
  function exigirAdm(req, res, next) {
    return exigir(req, res, () => {
      if (!req.prosp.admin) return res.status(403).json({ erro: 'Apenas o administrador pode fazer isso.' });
      next();
    });
  }
  // Erros de validacao viram resposta 400/404; o resto segue para o tratador geral.
  const rota = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (e) {
      if (e instanceof ErroPedido) return res.status(e.status).json({ erro: e.message });
      next(e);
    }
  };

  // Lista publica dos estabelecimentos (dados de divulgacao das proprias lojas), usada no fundo esfumacado.
  r.get('/prospeccao/dados.json', (req, res) => res.json({ etapas: ETAPAS, estabelecimentos: ESTABELECIMENTOS }));

  // ---------- contas ----------
  r.post('/api/prosp/cadastro', exigirFetch, limiteLogin, rota(async (req, res) => {
    const login = texto(req.body?.login, 40);
    const email = texto(req.body?.email, 120);
    const senha = String(req.body?.senha ?? '');
    const confirmar = String(req.body?.confirmar ?? '');
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(login)) throw new ErroPedido(400, 'O login precisa ter de 3 a 30 caracteres, só letras, números, ponto, hífen ou sublinhado.');
    if (login.toLowerCase() === 'admin') throw new ErroPedido(409, 'Esse login é reservado. Escolha outro.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroPedido(400, 'Informe um e-mail profissional válido.');
    if (senha.length < 6) throw new ErroPedido(400, 'A senha precisa ter pelo menos 6 caracteres.');
    if (senha.length > 200) throw new ErroPedido(400, 'A senha é longa demais.');
    if (senha !== confirmar) throw new ErroPedido(400, 'As senhas não conferem. Digite a mesma senha nos dois campos.');
    try {
      await db.execute({
        sql: `INSERT INTO prosp_usuarios (login, email, senha_hash, cor) VALUES (?, ?, ?, ?)`,
        args: [login, email, gerarHash(senha), corAleatoria()],
      });
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) throw new ErroPedido(409, 'Esse login já está em uso. Escolha outro.');
      throw e;
    }
    res.status(201).json({ ok: true });
  }));

  r.post('/api/prosp/entrar', exigirFetch, limiteLogin, rota(async (req, res) => {
    const login = texto(req.body?.login, 40);
    const senha = String(req.body?.senha ?? '');
    const u = login ? await um('SELECT * FROM prosp_usuarios WHERE login = ?', [login]) : null;
    if (!u || !conferirSenha(senha, u.senha_hash)) throw new ErroPedido(401, 'Login ou senha incorretos.');
    if (u.status === 'pendente') throw new ErroPedido(403, 'Seu cadastro ainda está aguardando a aprovação do administrador.');
    if (u.status !== 'aprovado') throw new ErroPedido(403, 'Seu acesso não foi aprovado. Fale com o administrador.');
    req.session.puid = u.id;
    res.json({ usuario: publico(u) });
  }));

  r.post('/api/prosp/sair', exigirFetch, (req, res) => {
    if (req.session) req.session.puid = null;
    res.json({ ok: true });
  });

  r.get('/api/prosp/eu', exigir, (req, res) => res.json({ usuario: publico(req.prosp) }));

  // ---------- progresso ----------
  async function lerCustom() {
    return (await todos('SELECT id, dados FROM prosp_custom ORDER BY criado_em')).map((l) => ({ ...JSON.parse(l.dados), id: l.id }));
  }

  r.get('/api/prosp/estado', exigir, rota(async (req, res) => {
    const estado = {};
    for (const l of await todos('SELECT est_id, dados FROM prosp_estado')) estado[l.est_id] = JSON.parse(l.dados);
    res.json({ estado, custom: await lerCustom() });
  }));

  r.post('/api/prosp/estado/:id', exigirFetch, exigir, rota(async (req, res) => {
    const id = String(req.params.id);
    if (!IDS_FIXOS.has(id) && !(await um('SELECT id FROM prosp_custom WHERE id = ?', [id]))) {
      throw new ErroPedido(404, 'Estabelecimento não encontrado.');
    }
    const atual = await um('SELECT dados FROM prosp_estado WHERE est_id = ?', [id]);
    const novo = aplicarAcao(atual ? JSON.parse(atual.dados) : null, req.body, req.prosp);
    await db.execute({
      sql: `INSERT INTO prosp_estado (est_id, dados) VALUES (?, ?)
        ON CONFLICT(est_id) DO UPDATE SET dados = excluded.dados, atualizado_em = datetime('now')`,
      args: [id, JSON.stringify(novo)],
    });
    res.json({ id, dados: novo });
  }));

  r.post('/api/prosp/estabelecimentos', exigirFetch, exigir, rota(async (req, res) => {
    const b = req.body || {};
    const n = texto(b.n, 80);
    if (!n) throw new ErroPedido(400, 'Informe o nome do estabelecimento.');
    let insta = texto(b.instagram, 120);
    const l = [];
    if (insta) {
      if (!/^https?:\/\//i.test(insta)) insta = 'https://www.instagram.com/' + insta.replace(/^@/, '') + '/';
      l.push(['Instagram', insta]);
    }
    const e = {
      n,
      c: CIDADES.includes(b.c) ? b.c : 'OU',
      p: PRIORIDADES.includes(b.p) ? b.p : 'M',
      s: texto(b.s, 80) || 'Sem segmento',
      a: texto(b.a, 160),
      t: texto(b.t, 160).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5),
      l,
      h: texto(b.h, 400),
      x: texto(b.x, 1500).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 15),
      by: carimbo(req.prosp),
    };
    const id = 'x-' + slug(n).slice(0, 40) + '-' + Date.now().toString(36);
    await db.execute({ sql: 'INSERT INTO prosp_custom (id, dados) VALUES (?, ?)', args: [id, JSON.stringify(e)] });
    res.status(201).json({ estabelecimento: { ...e, id } });
  }));

  // ---------- administracao ----------
  r.get('/api/prosp/usuarios', exigirAdm, rota(async (req, res) => {
    res.json({ usuarios: await todos(`SELECT id, login, email, cor, status, criado_em FROM prosp_usuarios WHERE admin = 0 ORDER BY id DESC`) });
  }));

  async function contaFuncionario(id) {
    const u = await um('SELECT id, login, admin FROM prosp_usuarios WHERE id = ?', [Number(id)]);
    if (!u) throw new ErroPedido(404, 'Cadastro não encontrado.');
    if (u.admin) throw new ErroPedido(400, 'A conta de administrador não pode ser alterada por aqui.');
    return u;
  }

  r.put('/api/prosp/usuarios/:id/status', exigirFetch, exigirAdm, rota(async (req, res) => {
    const u = await contaFuncionario(req.params.id);
    const status = String(req.body?.status ?? '');
    if (!['aprovado', 'rejeitado'].includes(status)) throw new ErroPedido(400, 'Situação inválida.');
    await db.execute({ sql: 'UPDATE prosp_usuarios SET status = ? WHERE id = ?', args: [status, u.id] });
    res.json({ ok: true });
  }));

  r.put('/api/prosp/usuarios/:id/senha', exigirFetch, exigirAdm, rota(async (req, res) => {
    const u = await contaFuncionario(req.params.id);
    const senha = String(req.body?.senha ?? '');
    if (senha.length < 6) throw new ErroPedido(400, 'A nova senha precisa ter pelo menos 6 caracteres.');
    await db.execute({ sql: 'UPDATE prosp_usuarios SET senha_hash = ? WHERE id = ?', args: [gerarHash(senha), u.id] });
    res.json({ ok: true });
  }));

  return r;
}

module.exports = { iniciarProspeccao, criarRotasProspeccao, aplicarAcao };
