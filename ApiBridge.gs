    /*******************************************************
 * 🍔 Sabor pra Levar — ApiBridge JSONP (GAS)
 * ÚNICA URL usada pelo site (index.html)
 *******************************************************/

const CFG = {
  SHEET_ID: '1alf7zd4RaIxilAZIdLouJU3T_U_Sn2oH_vZn4OY2eYU', // <-- ID da SUA planilha
  SHEET_NAME_PROD: 'Produtos',
  SHEET_NAME_FUNC: 'Funcionarios',
  SHEET_NAME_MOV:  'MovEstoque',
  SHEET_NAME_VENDAS: 'Vendas',
  TZ: 'America/Sao_Paulo',
  SOMENTE_ATIVOS: false
};

/* ====== Base ====== */
function ss(){ return SpreadsheetApp.openById(CFG.SHEET_ID); }
function sh(name){
  const s = ss().getSheetByName(name);
  if (!s) throw new Error('Aba não encontrada: ' + name);
  return s;
}
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }
function findHeaderIndex_(head, candidates){
  const H = head.map(norm);
  for (const c of candidates){
    const i = H.indexOf(norm(c));
    if (i >= 0) return i;
  }
  return -1;
}
function toNumber_(v){
  if (typeof v === 'number') return v;
  let s = String(v||'').trim();
  if (s === '') return 0;
  if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
  s = s.replace(/\.(?=\d{3}(?:\D|$))/g,'');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
function toBool_(v){
  const s = String(v||'').trim().toLowerCase();
  return v === true || s === 'true' || s === 'verdadeiro' || s === 'sim' || s === '1' || s === 'ativo' || s === 'yes';
}

/* ====== Roteador JSONP ====== */
function doGet(e){
  const action  = (e && e.parameter && (e.parameter.action||'').toLowerCase()) || '';
  const cb      = (e && e.parameter && e.parameter.callback) || 'callback';
  let   payload = null;
  try{ payload = e && e.parameter && e.parameter.payload ? JSON.parse(e.parameter.payload) : null; }catch(_){}

  let out = { ok:false, msg:'Ação inválida' };
  try{
    switch(action){
      case 'products': out = { ok:true, data: apiListarProdutos() }; break;
      case 'saldo':    out = { ok:true, saldo: apiSaldoFromMov_() }; break;     // saldo via MovEstoque
      case 'restock':  out = apiDarEntrada(payload); break;                      // Entrada em MovEstoque
      case 'sale':     out = apiFecharConta(payload); break;                     // Saída em MovEstoque + Vendas
      case 'register': out = apiCadastrarProduto(payload); break;
      case 'diag':     out = apiDiag_(); break;
      case 'ping':     out = { ok:true, now: Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss') }; break;
    }
  }catch(err){
    out = { ok:false, msg:String(err && err.message || err) };
  }

  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ====== Produtos ====== */
function apiListarProdutos(){
  const ws = sh(CFG.SHEET_NAME_PROD);
  const data = ws.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  const head = data[0];
  const iSKU   = findHeaderIndex_(head, ['sku','codigo','código','codigo do produto']);
  const iNome  = findHeaderIndex_(head, ['produto','nome','descricao','descrição']);
  const iPreco = findHeaderIndex_(head, ['preco','preçounit','precounit','preco unit','preco_unit']);
  const iMin   = findHeaderIndex_(head, ['estoquemin','estoque min','estoque minimo','estoque_min','minimo']);
  const iAtv   = findHeaderIndex_(head, ['ativo','status']);

  const out = [];
  for (let r=1;r<data.length;r++){
    const row = data[r];
    const sku = String(row[iSKU]||'').trim();
    if (!sku) continue;
    const nome = String(row[iNome]||'').trim();
    const preco = toNumber_(row[iPreco]);
    const estoqueMin = toNumber_(row[iMin]);
    const ativo = iAtv >= 0 ? toBool_(row[iAtv]) : true;
    out.push({ sku, nome, preco, estoqueMin, ativo });
  }
  return CFG.SOMENTE_ATIVOS ? out.filter(p=>p.ativo) : out;
}

/* ====== Saldo: soma MovEstoque ====== */
function apiSaldoFromMov_(){
  // Base inicial: todos SKUs de Produtos começam em 0 (badges aparecem mesmo sem movimento)
  const base = {};
  apiListarProdutos().forEach(p => base[p.sku] = 0);

  const ws = sh(CFG.SHEET_NAME_MOV);
  const data = ws.getDataRange().getValues();
  if (!data || data.length < 2) return base;

  const head = data[0];
  const iTipo = findHeaderIndex_(head, ['tipo','movimento']);
  const iSKU  = findHeaderIndex_(head, ['sku','codigo']);
  const iQtd  = findHeaderIndex_(head, ['qtd','quantidade','qtde']);

  for (let r=1;r<data.length;r++){
    const row = data[r];
    const sku = String(row[iSKU]||'').trim();
    if (!sku || !(sku in base)) continue; // ignora SKU que não esteja em Produtos
    const tipo = String(row[iTipo]||'').toLowerCase();
    const qtd  = toNumber_(row[iQtd]);
    if (!qtd) continue;

    if (tipo.indexOf('entrada') >= 0) base[sku] += qtd;
    else if (tipo.indexOf('saida') >= 0 || tipo.indexOf('saída') >= 0) base[sku] -= qtd;
  }
  return base;
}

/* ====== Funcionários ====== */
function apiBuscarFuncionarioPorTag(tagUID){
  if (!tagUID) return null;
  const ws = sh(CFG.SHEET_NAME_FUNC);
  const data = ws.getDataRange().getValues();
  if (!data || data.length < 2) return null;
  const head = data[0];
  const iCPF  = findHeaderIndex_(head, ['cpf']);
  const iNome = findHeaderIndex_(head, ['nome','nome completo','nomecompleto']);
  const iTag  = findHeaderIndex_(head, ['taguid','tag','uid']);
  const iAtv  = findHeaderIndex_(head, ['ativo','status']);
  for (let r=1;r<data.length;r++){
    const row = data[r];
    const ativo = iAtv >= 0 ? toBool_(row[iAtv]) : true;
    if (!ativo) continue;
    if (String(row[iTag]||'').trim().toUpperCase() === String(tagUID||'').trim().toUpperCase()){
      return { cpf:String(row[iCPF]||''), nome:String(row[iNome]||''), tag:String(row[iTag]||'') };
    }
  }
  return null;
}

/* ====== Entrada (Reposição) ====== */
function apiDarEntrada(payload){
  if (!payload || !Array.isArray(payload.itens) || !payload.itens.length)
    return { ok:false, msg:'Nenhum item para entrada.' };
  const wsM = sh(CFG.SHEET_NAME_MOV);
  const ts = new Date();
  payload.itens.forEach(it=>{
    const sku = String(it.sku||'').trim();
    const qtd = toNumber_(it.qtd);
    if (!sku || qtd <= 0) return;
    wsM.appendRow([ ts, 'Entrada', sku, qtd, (payload.obs||'Reposição'), 'PDV' ]);
  });
  return { ok:true, msg:'Estoque ajustado' };
}

/* ====== Venda (baixa estoque + Vendas) ====== */
function apiFecharConta(payload){
  if (!payload || !Array.isArray(payload.itens) || !payload.itens.length)
    return { ok:false, msg:'Nenhum item no pedido.' };
  if (!payload.tagUID) return { ok:false, msg:'TagUID não informada.' };

  const func = apiBuscarFuncionarioPorTag(payload.tagUID);
  if (!func) return { ok:false, msg:'Funcionário não encontrado/ativo para esta Tag.' };

  const prods = apiListarProdutos();
  const map = {}; prods.forEach(p => map[p.sku] = p);

  const ts = new Date();
  const pedidoID = Utilities.getUuid();
  const wsV = sh(CFG.SHEET_NAME_VENDAS);
  const wsM = sh(CFG.SHEET_NAME_MOV);

  let total = 0;
  const vendasRows = [];
  const movRows = [];

  payload.itens.forEach(it=>{
    const sku = String(it.sku||'').trim();
    const qtd = toNumber_(it.qtd);
    if (!sku || qtd <= 0) return;
    const p = map[sku]; if (!p) throw new Error('SKU não encontrado: ' + sku);
    const linha = p.preco * qtd; total += linha;

    vendasRows.push([ ts, func.cpf, func.nome, func.tag, sku, p.nome, qtd, p.preco, linha, pedidoID, (payload.operador||'') ]);
    movRows.push([ ts, 'Saída', sku, qtd, 'Venda '+pedidoID, 'PDV' ]);
  });

  if (!vendasRows.length) return { ok:false, msg:'Itens inválidos.' };

  vendasRows.forEach(r => wsV.appendRow(r));
  movRows.forEach(r => wsM.appendRow(r));

  return { ok:true, pedidoID:pedidoID, totalPedido:total, nome:func.nome };
}

/* ====== Diagnóstico rápido ====== */
function apiDiag_(){
  return {
    ok:true,
    produtos: apiListarProdutos().length,
    mov_rows: Math.max(0, sh(CFG.SHEET_NAME_MOV).getLastRow()-1),
    saldo: apiSaldoFromMov_()
  };
}
