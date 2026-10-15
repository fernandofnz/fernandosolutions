// Hash de senhas com scrypt (nativo do Node.js).
const crypto = require('crypto');

function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function conferirSenha(senha, armazenado) {
  const [tipo, salHex, hashHex] = String(armazenado).split('$');
  if (tipo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

module.exports = { gerarHash, conferirSenha };
