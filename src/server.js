const path = require('path');
const express = require('express');
const pool = require('./db');
const { CATEGORIAS, dataValida, validarDespesa } = require('./validacao');

const app = express();
const iniciadoEm = new Date().toISOString();

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const ERROS_DE_CONEXAO = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', '57P01', '28P01', '3D000'];
const ehErroDeConexao = (e) =>
  ERROS_DE_CONEXAO.includes(e.code) || (e.code || '').startsWith('08') || /timeout|terminated/i.test(e.message || '');

const parseId = (s) => (/^\d+$/.test(s) && Number(s) < 2147483647 ? Number(s) : null);

// ---------- GET /health: testa a conexão com o banco ----------
app.get('/health', async (_req, res) => {
  try {
    const r = await pool.query('SELECT now() AS agora');
    res.json({ status: 'ok', banco: 'ok', iniciado_em: iniciadoEm, hora_do_banco: r.rows[0].agora });
  } catch (e) {
    console.error('[health]', e.code || e.message);
    res.status(503).json({ status: 'erro', banco: 'indisponível', iniciado_em: iniciadoEm });
  }
});

// ---------- RF1: cadastrar despesa ----------
app.post('/api/despesas', async (req, res, next) => {
  const v = validarDespesa(req.body);
  if (v.erros) return res.status(400).json({ erro: v.erros.join('; ') });
  const { descricao, valor, categoria, data_despesa } = v.dados;
  try {
    const r = await pool.query(
      `INSERT INTO despesas (descricao, valor, categoria, data_despesa)
       VALUES ($1, $2, $3, $4)
       RETURNING id, descricao, valor::text AS valor, categoria, data_despesa::text AS data_despesa, conferida, criada_em`,
      [descricao, valor, categoria, data_despesa]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// ---------- RF2: listar por período (de/até inclusivos) e categoria ----------
function filtros(q) {
  const where = [];
  const params = [];
  if (q.de !== undefined) {
    if (!dataValida(q.de)) return { erro: 'parâmetro "de" deve ser AAAA-MM-DD' };
    params.push(q.de); where.push(`data_despesa >= $${params.length}`);
  }
  if (q.ate !== undefined) {
    if (!dataValida(q.ate)) return { erro: 'parâmetro "ate" deve ser AAAA-MM-DD' };
    params.push(q.ate); where.push(`data_despesa <= $${params.length}`);
  }
  if (q.categoria !== undefined) {
    if (!CATEGORIAS.includes(q.categoria)) return { erro: 'categoria inválida. Use: ' + CATEGORIAS.join(', ') };
    params.push(q.categoria); where.push(`categoria = $${params.length}`);
  }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

app.get('/api/despesas', async (req, res, next) => {
  const f = filtros(req.query);
  if (f.erro) return res.status(400).json({ erro: f.erro });
  try {
    const r = await pool.query(
      `SELECT id, descricao, valor::text AS valor, categoria, data_despesa::text AS data_despesa, conferida, criada_em
       FROM despesas ${f.where} ORDER BY data_despesa DESC, id DESC`,
      f.params
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// ---------- RF3 (regra central): totais calculados NO BANCO, exatos ao centavo ----------
app.get('/api/relatorio', async (req, res, next) => {
  const f = filtros({ de: req.query.de, ate: req.query.ate });
  if (f.erro) return res.status(400).json({ erro: f.erro });
  try {
    const r = await pool.query(
      `SELECT categoria, SUM(valor)::text AS total, COUNT(*)::int AS quantidade
       FROM despesas ${f.where} GROUP BY categoria ORDER BY categoria`,
      f.params
    );
    const g = await pool.query(
      `SELECT COALESCE(SUM(valor), 0)::text AS total_geral, COUNT(*)::int AS quantidade
       FROM despesas ${f.where}`,
      f.params
    );
    res.json({
      periodo: { de: req.query.de || null, ate: req.query.ate || null },
      por_categoria: r.rows,
      total_geral: g.rows[0].total_geral,
      quantidade: g.rows[0].quantidade,
    });
  } catch (e) { next(e); }
});

// Distingue 404 (não existe) de 409 (existe, mas está conferida)
async function negarConferida(id, res) {
  const r = await pool.query('SELECT conferida FROM despesas WHERE id = $1', [id]);
  if (r.rowCount === 0) return res.status(404).json({ erro: 'despesa não encontrada' });
  return res.status(409).json({ erro: 'despesa já conferida: não pode ser alterada nem excluída' });
}

// ---------- RF4: marcar como conferida ----------
app.patch('/api/despesas/:id/conferir', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ erro: 'id inválido' });
  try {
    const r = await pool.query(
      `UPDATE despesas SET conferida = true WHERE id = $1 AND conferida = false
       RETURNING id, descricao, valor::text AS valor, categoria, data_despesa::text AS data_despesa, conferida`,
      [id]
    );
    if (r.rowCount === 1) return res.json(r.rows[0]);
    const x = await pool.query('SELECT 1 FROM despesas WHERE id = $1', [id]);
    if (x.rowCount === 0) return res.status(404).json({ erro: 'despesa não encontrada' });
    return res.status(409).json({ erro: 'despesa já está conferida' });
  } catch (e) { next(e); }
});

// ---------- RF5: editar descrição, valor e categoria (só não conferida) ----------
app.put('/api/despesas/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ erro: 'id inválido' });
  const v = validarDespesa(req.body, { parcial: true });
  if (v.erros) return res.status(400).json({ erro: v.erros.join('; ') });
  const { descricao, valor, categoria } = v.dados;
  try {
    const r = await pool.query(
      `UPDATE despesas SET descricao = $2, valor = $3, categoria = $4
       WHERE id = $1 AND conferida = false
       RETURNING id, descricao, valor::text AS valor, categoria, data_despesa::text AS data_despesa, conferida`,
      [id, descricao, valor, categoria]
    );
    if (r.rowCount === 1) return res.json(r.rows[0]);
    return negarConferida(id, res);
  } catch (e) { next(e); }
});

// ---------- Excluir (só não conferida) ----------
app.delete('/api/despesas/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ erro: 'id inválido' });
  try {
    const r = await pool.query('DELETE FROM despesas WHERE id = $1 AND conferida = false', [id]);
    if (r.rowCount === 1) return res.status(204).end();
    return negarConferida(id, res);
  } catch (e) { next(e); }
});

// ---------- Erros: nunca expor detalhes internos ----------
app.use('/api', (_req, res) => res.status(404).json({ erro: 'rota não encontrada' }));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error('[erro]', err.code || '', err.message);
  if (ehErroDeConexao(err)) return res.status(503).json({ erro: 'serviço temporariamente indisponível' });
  res.status(500).json({ erro: 'erro interno' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Caixa da Associação rodando na porta ${PORT}`));
}
module.exports = app;
