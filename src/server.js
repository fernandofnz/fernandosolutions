const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');

const { prepararBanco, PASTA_DADOS, ONLINE } = require('./db');
const { iniciarProspeccao, criarRotasProspeccao } = require('./prospeccao');

// Render (e outras hospedagens) informam a porta em PORT. No computador usa 3001.
const PORTA = Number(process.env.PORT || process.env.PORTA || 3001);
const RAIZ = path.join(__dirname, '..');
const PRODUCAO = process.env.NODE_ENV === 'production';

// Segredo da sessao: variavel de ambiente online; no computador, gerado uma vez e guardado na pasta de dados.
function segredoSessao() {
  if (process.env.SEGREDO_SESSAO) return process.env.SEGREDO_SESSAO;
  if (PRODUCAO) throw new Error('Defina a variável SEGREDO_SESSAO para rodar em produção.');
  const arquivo = path.join(PASTA_DADOS, 'segredo-sessao.txt');
  if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(arquivo, 'utf8').trim();
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(cookieSession({
  name: 'prosp_sessao',
  keys: [segredoSessao()],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'strict',
  secure: PRODUCAO,
}));

// Protecao contra envio de formularios por outros sites: toda chamada que altera dados vem do nosso fetch.
function exigirFetch(req, res, next) {
  if (req.get('X-Requested-With') !== 'fetch') return res.status(400).json({ erro: 'Requisição inválida.' });
  next();
}

// Limite simples de tentativas por IP (login e cadastro).
const tentativas = new Map();
function limiteLogin(req, res, next) {
  const agora = Date.now();
  const reg = tentativas.get(req.ip) || { n: 0, inicio: agora };
  if (agora - reg.inicio > 15 * 60 * 1000) { reg.n = 0; reg.inicio = agora; }
  reg.n++;
  tentativas.set(req.ip, reg);
  if (reg.n > 20) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  next();
}

// Verificacao de saude para a hospedagem (nao consulta o banco).
app.get('/saude', (req, res) => res.json({ ok: true }));

app.get('/', (req, res) => res.sendFile(path.join(RAIZ, 'paginas', 'index.html')));
app.get('/prospeccao', (req, res) => res.redirect('/'));
app.use(criarRotasProspeccao({ exigirFetch, limiteLogin }));
app.use(express.static(path.join(RAIZ, 'public'), { maxAge: 0 }));

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: 'Algo deu errado no servidor. Tente novamente.' });
});

prepararBanco()
  .then(iniciarProspeccao)
  .then(() => {
    const servidor = app.listen(PORTA, () => {
      console.log(`Prospecção Fernando Solutions rodando em http://localhost:${PORTA} (banco ${ONLINE ? 'online (Turso)' : 'local'})`);
    });
    servidor.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`A porta ${PORTA} já está em uso: o site provavelmente já está aberto em outra janela. Acesse http://localhost:${PORTA}`);
        process.exit(1);
      }
      throw e;
    });
  })
  .catch((e) => {
    console.error('Não consegui abrir o banco de dados:', e);
    process.exit(1);
  });
