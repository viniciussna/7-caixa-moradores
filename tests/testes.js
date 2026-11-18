// Testes de aceitação (CA1 a CA5) contra a API em execução.
// Uso: npm start (em um terminal) e npm test (em outro).
// Outra URL: BASE_URL=https://app-cloud-gXX-ab.azurewebsites.net npm test
const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Data antiga aleatória: isola o teste de dados existentes e permite filtrar por ela.
const dia = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
const mes = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
const ANO = 2000 + Math.floor(Math.random() * 20);
const D = `${ANO}-${mes}-${dia}`;
const dMais = (n) => { const d = new Date(D + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function req(metodo, caminho, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch {}
  return { status: r.status, json };
}

const casos = [];
async function caso(nome, esperado, fn) {
  let obtido, ok;
  try { obtido = await fn(); ok = obtido.ok; obtido = obtido.texto; }
  catch (e) { ok = false; obtido = 'exceção: ' + e.message; }
  casos.push({ nome, esperado, obtido, ok });
}

const base = { descricao: 'Teste automatizado', categoria: 'limpeza', data_despesa: D };
const ids = [];

(async () => {
  const h = await req('GET', '/health');
  if (h.status !== 200) { console.error('API/banco indisponível em', BASE, '->', h.status); process.exit(2); }

  await caso('CA1a valor 0 -> 400', '400', async () => {
    const r = await req('POST', '/api/despesas', { ...base, valor: 0 });
    return { ok: r.status === 400, texto: String(r.status) };
  });
  await caso('CA1b valor -5 -> 400', '400', async () => {
    const r = await req('POST', '/api/despesas', { ...base, valor: -5 });
    return { ok: r.status === 400, texto: String(r.status) };
  });
  await caso('CA1c valor 12.345 -> 400 (3 casas)', '400', async () => {
    const r = await req('POST', '/api/despesas', { ...base, valor: '12.345' });
    return { ok: r.status === 400, texto: String(r.status) };
  });
  await caso('CA2 data futura -> 400', '400', async () => {
    const r = await req('POST', '/api/despesas', { ...base, valor: '10.00', data_despesa: '2999-01-01' });
    return { ok: r.status === 400, texto: String(r.status) };
  });

  await caso('CA3 10,10 + 20,20 + 0,70 = 31.00 exato', '31.00', async () => {
    for (const v of ['10.10', '20.20', '0.70']) {
      const r = await req('POST', '/api/despesas', { ...base, valor: v });
      if (r.status !== 201) return { ok: false, texto: 'cadastro falhou: ' + r.status };
      ids.push(r.json.id);
    }
    const rel = await req('GET', `/api/relatorio?de=${D}&ate=${D}`);
    const linha = rel.json.por_categoria.find((c) => c.categoria === 'limpeza');
    return { ok: linha.total === '31.00' && rel.json.total_geral === '31.00', texto: `${linha.total} (geral ${rel.json.total_geral})` };
  });

  await caso('CA4 período inclusivo e ignora fora das datas', 'total 31.00; dia anterior/seguinte ignorados', async () => {
    const antes = await req('POST', '/api/despesas', { ...base, valor: '100.00', data_despesa: dMais(-1) });
    const depois = await req('POST', '/api/despesas', { ...base, valor: '200.00', data_despesa: dMais(1) });
    ids.push(antes.json.id, depois.json.id);
    const rel = await req('GET', `/api/relatorio?de=${D}&ate=${D}`);
    const larg = await req('GET', `/api/relatorio?de=${dMais(-1)}&ate=${dMais(1)}`);
    return {
      ok: rel.json.total_geral === '31.00' && larg.json.total_geral === '331.00',
      texto: `dia=${rel.json.total_geral}; 3 dias=${larg.json.total_geral}`,
    };
  });

  await caso('CA5 editar despesa conferida -> 409', '409 (e 409 ao excluir)', async () => {
    const id = ids[0];
    const c = await req('PATCH', `/api/despesas/${id}/conferir`);
    const e = await req('PUT', `/api/despesas/${id}`, { descricao: 'Alterada', valor: '1.00', categoria: 'outros' });
    const x = await req('DELETE', `/api/despesas/${id}`);
    const c2 = await req('PATCH', `/api/despesas/${id}/conferir`);
    return { ok: c.status === 200 && e.status === 409 && x.status === 409 && c2.status === 409, texto: `conferir ${c.status}, editar ${e.status}, excluir ${x.status}, reconferir ${c2.status}` };
  });

  await caso('Extra: id inexistente -> 404', '404', async () => {
    const r = await req('DELETE', '/api/despesas/999999999');
    return { ok: r.status === 404, texto: String(r.status) };
  });

  await caso('Extra: SQL injection no filtro não vaza erro interno', '400', async () => {
    const r = await req('GET', "/api/despesas?categoria=x';DROP TABLE despesas;--");
    return { ok: r.status === 400 && !/syntax|pg|sql/i.test(JSON.stringify(r.json)), texto: String(r.status) };
  });

  // Limpeza: remove o que não foi conferido (o conferido fica de evidência)
  for (const id of ids.slice(1)) await req('DELETE', `/api/despesas/${id}`);

  console.log(`\nBASE_URL: ${BASE}   (data de isolamento: ${D})\n`);
  console.log('| Caso | Esperado | Obtido | Resultado |');
  console.log('|---|---|---|---|');
  for (const c of casos) console.log(`| ${c.nome} | ${c.esperado} | ${c.obtido} | ${c.ok ? 'PASSOU' : 'FALHOU'} |`);
  const falhas = casos.filter((c) => !c.ok).length;
  console.log(`\n${casos.length - falhas}/${casos.length} passaram`);
  process.exit(falhas ? 1 : 0);
})();
