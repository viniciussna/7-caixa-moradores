const CATEGORIAS = ['manutenção', 'limpeza', 'eventos', 'administrativo', 'outros'];

// "Hoje" = data de Brasília (o App Service roda em UTC).
function hojeBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Valor: ponto decimal, até 2 casas, > 0. Nunca converte para float.
function validarValor(v) {
  const s = typeof v === 'number' ? String(v) : v;
  if (typeof s !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(s.trim())) {
    return { erro: 'valor deve ser positivo, com ponto decimal e no máximo 2 casas (ex.: 12.50)' };
  }
  if (Number(s) <= 0) return { erro: 'valor deve ser maior que zero' };
  return { ok: s.trim() };
}

function validarDescricao(d) {
  if (typeof d !== 'string' || d.trim().length < 3 || d.trim().length > 200) {
    return { erro: 'descricao deve ter de 3 a 200 caracteres' };
  }
  return { ok: d.trim() };
}

function validarCategoria(c) {
  if (!CATEGORIAS.includes(c)) {
    return { erro: 'categoria inválida. Use: ' + CATEGORIAS.join(', ') };
  }
  return { ok: c };
}

function validarData(d) {
  if (!dataValida(d)) return { erro: 'data deve estar no formato AAAA-MM-DD e ser válida' };
  if (d > hojeBrasilia()) return { erro: 'data não pode ser futura' };
  return { ok: d };
}

// Junta validações: devolve { dados } ou { erros: [...] }
function validarDespesa(body, { parcial = false } = {}) {
  const b = body || {};
  const campos = parcial
    ? { descricao: validarDescricao, valor: validarValor, categoria: validarCategoria }
    : { descricao: validarDescricao, valor: validarValor, categoria: validarCategoria, data_despesa: validarData };
  const erros = [];
  const dados = {};
  for (const [campo, fn] of Object.entries(campos)) {
    const r = fn(b[campo]);
    if (r.erro) erros.push(r.erro);
    else dados[campo] = r.ok;
  }
  return erros.length ? { erros } : { dados };
}

module.exports = { CATEGORIAS, hojeBrasilia, dataValida, validarDespesa };
