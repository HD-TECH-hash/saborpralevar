// ======= CONFIGURE SUA URL DO GAS AQUI (a mesma implantação) =======
const GAS_URL = "https://script.google.com/macros/s/AKfycbyEgh6FXUtdR0YrE-15KqpLMhsSIQT1dj1Cmfwy1Sf8fuhwNlGHObeiOqS9GfMXS4imnA/exec";
// ================================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const toast = (m)=>{ const t=$("#toast"); t.textContent=m; t.style.display="block"; setTimeout(()=>t.style.display="none",2600); };
const loading = (v)=> $("#loading").style.display = v ? "grid" : "none";

let PRODUTOS = [];
let CARRINHO = new Map(); // sku -> {sku,nome,preco,qtd}

// ----- JSONP helper -----
function jsonp(url, callback){
  // adiciona &callback=cbXYZ
  const cbName = "cb_" + Math.random().toString(36).slice(2);
  window[cbName] = (data)=>{ try{ callback(data); } finally { delete window[cbName]; s.remove(); } };
  const s = document.createElement("script");
  s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cbName + "&_=" + Date.now();
  s.onerror = ()=>{ delete window[cbName]; s.remove(); callback({ok:false, msg:"Falha JSONP"}); };
  document.body.appendChild(s);
}

// ----- Produtos -----
function carregarProdutos(){
  loading(true);
  jsonp(GAS_URL + "?action=products", (res)=>{
    loading(false);
    if (!res || !res.ok){ toast(res?.msg || "Não foi possível carregar produtos."); return; }
    PRODUTOS = res.data || [];
    renderProdutos();
  });
}

function renderProdutos(){
  const el = $("#listaProdutos");
  el.innerHTML = "";
  if (!PRODUTOS.length){
    el.innerHTML = '<div class="muted">Nenhum produto ativo.</div>';
    return;
  }
  PRODUTOS.forEach(p=>{
    const row = document.createElement("div");
    row.className = "prod";
    row.innerHTML = `
      <div>
        <div style="font-weight:900">${p.nome}</div>
        <div class="muted">SKU ${p.sku} • R$ ${(Number(p.preco)||0).toFixed(2).replace('.',',')}</div>
      </div>
      <div class="qty">
        <button class="btn" onclick="dec('${p.sku}')">−</button>
        <div id="q_${p.sku}" style="min-width:28px;text-align:center">0</div>
        <button class="btn" onclick="inc('${p.sku}')">+</button>
        <button class="btn primary" onclick="add('${p.sku}')">Adicionar</button>
      </div>
    `;
    el.appendChild(row);
  });
}

function inc(sku){ const e=$("#q_"+sku); e.textContent = (parseInt(e.textContent||"0")||0) + 1; }
function dec(sku){ const e=$("#q_"+sku); e.textContent = Math.max(0,(parseInt(e.textContent||"0")||0) - 1); }
function add(sku){
  const p = PRODUTOS.find(x=>x.sku===sku); if(!p) return;
  const qEl = $("#q_"+sku); const qtd = Number(qEl.textContent||0);
  if (qtd<=0){ toast("Defina a quantidade."); return; }
  const cur = CARRINHO.get(sku) || { sku:p.sku, nome:p.nome, preco:Number(p.preco)||0, qtd:0 };
  cur.qtd += qtd; CARRINHO.set(sku, cur); qEl.textContent="0"; renderCarrinho();
}

function renderCarrinho(){
  const tb = $("#linhas"); tb.innerHTML="";
  let total=0;
  for (const [sku,it] of CARRINHO.entries()){
    const tr = document.createElement("tr");
    const tot = (it.preco||0) * (it.qtd||0); total += tot;
    tr.innerHTML = `<td>${it.nome}</td><td>${it.qtd}</td><td>${(it.preco).toFixed(2).replace('.',',')}</td><td>${tot.toFixed(2).replace('.',',')}</td>
      <td><button class="btn danger" onclick="rem('${sku}')">remover</button></td>`;
    tb.appendChild(tr);
  }
  $("#total").textContent = total.toFixed(2).replace('.',',');
}
function rem(sku){ CARRINHO.delete(sku); renderCarrinho(); }
function limpar(){ CARRINHO.clear(); renderCarrinho(); }

// ----- Reposição / Cadastro -----
function abrirReposicao(){ $("#repModal").style.display="grid"; }
function fecharReposicao(){ $("#repModal").style.display="none"; }
function confirmarReposicao(){
  const sku = $("#rep_sku").value.trim();
  const qtd = Number($("#rep_qtd").value||0);
  if(!sku || qtd<=0){ toast("Informe SKU e quantidade."); return; }
  loading(true);
  const payload = encodeURIComponent(JSON.stringify({ itens:[{sku,qtd}], obs:"Reposição via GitHub" }));
  jsonp(GAS_URL + "?action=restock&payload=" + payload, (res)=>{
    loading(false);
    fecharReposicao();
    if(res && res.ok){ toast("Estoque ajustado 😄"); carregarProdutos(); }
    else { toast(res?.msg || "Erro ao ajustar estoque"); }
  });
}

function abrirCadastro(){ $("#cadModal").style.display="grid"; }
function fecharCadastro(){ $("#cadModal").style.display="none"; }
function salvarProduto(){
  const sku = $("#cad_sku").value.trim();
  const nome = $("#cad_nome").value.trim();
  const preco = parseFloat(($("#cad_preco").value||"").replace(',','.')) || 0;
  const estoqueInicial = Number($("#cad_qtd").value||0);
  const estoqueMin = Number($("#cad_min").value||0);
  if(!sku || !nome){ toast("SKU e Nome obrigatórios."); return; }
  loading(true);
  const payload = encodeURIComponent(JSON.stringify({ sku, nome, preco, estoqueInicial, estoqueMin, ativo:true }));
  jsonp(GAS_URL + "?action=register&payload=" + payload, (res)=>{
    loading(false); fecharCadastro();
    if(res && res.ok){ toast(res.msg || "Produto salvo"); carregarProdutos(); }
    else { toast(res?.msg || "Erro ao cadastrar"); }
  });
}

// ----- Pagamento -----
async function scanNFC(){
  if (!("NDEFReader" in window)){ toast("NFC não suportado neste navegador."); return; }
  try{
    const reader = new NDEFReader();
    await reader.scan();
    reader.onreading = (ev)=>{
      const uid = (ev.serialNumber||"").toUpperCase();
      if(!uid){ toast("Não foi possível ler a TAG."); return; }
      $("#uidManual").value = uid;
      toast("TAG lida: " + uid);
    };
    toast("Aproxime a TAG…");
  }catch(e){
    toast("NFC indisponível/sem permissão.");
  }
}

function fecharConta(){
  if (CARRINHO.size===0){ toast("Adicione itens."); return; }
  const tag = ($("#uidManual").value||"").trim().toUpperCase();
  if (!tag){ toast("Informe o UID (ou use NFC)."); return; }
  const itens = Array.from(CARRINHO.values()).map(i=>({sku:i.sku, qtd:i.qtd}));
  const operador = ($("#operador").value||"").trim();
  loading(true);
  const payload = encodeURIComponent(JSON.stringify({ itens, operador, tagUID: tag }));
  jsonp(GAS_URL + "?action=sale&payload=" + payload, (res)=>{
    loading(false);
    if (res && res.ok){
      toast("Obrigado pela compra 😄");
      CARRINHO.clear(); renderCarrinho();
    } else {
      toast(res?.msg || "Falha ao registrar venda");
    }
  });
}

// ----- Auto-leitura de ?tagUID= na URL (ex.: iPhone abrindo link gravado na TAG)
(function autoTagFromUrl(){
  const p = new URLSearchParams(location.search);
  const uid = (p.get("tagUID") || p.get("uid") || "").toUpperCase();
  if (uid) $("#uidManual").value = uid;
})();

// init
window.onload = ()=>{
  carregarProdutos();
};
