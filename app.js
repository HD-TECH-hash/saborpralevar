// ========= CONFIG =========
const API_BRIDGE_URL = "https://script.google.com/macros/s/AKfycbxalx7Sli3V-iNtth_ikypQd_Ix5u6Lp0zDniTIYWfREsAD0Jk0_KHR3cbe0cm3FCyFaw/exec";
// =========================

// helpers básicos
const $ = (id)=>document.getElementById(id);
const show = (el)=>el.classList.remove('hide');
const hide = (el)=>el.classList.add('hide');
const money = (n)=> (Number(n)||0).toFixed(2).replace('.',',');

function toast(msg){
  const t = $('toast'); if(!t) return;
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(window.__t); window.__t = setTimeout(()=> t.style.display='none', 2600);
}
function loading(v){ $('loading').style.display = v ? 'grid' : 'none'; }

// JSONP caller (elimina CORS)
function jsonp(action, payload, cb){
  const cbName = 'cb_' + Math.random().toString(36).slice(2);
  window[cbName] = (res)=>{ try{ cb(res); } finally { delete window[cbName]; s.remove(); } };
  const s = document.createElement('script');
  const p = new URLSearchParams({ action, callback: cbName, _: Date.now() });
  if (payload) p.set('payload', encodeURIComponent(JSON.stringify(payload)));
  s.src = API_BRIDGE_URL + '?' + p.toString();
  s.onerror = ()=>{ delete window[cbName]; s.remove(); cb({ok:false,msg:'Falha de rede'}); };
  document.body.appendChild(s);
}

// estado
let PRODUTOS = [];
let CARRINHO = new Map();

// UI bind
$('btnNovo').onclick = ()=> abrirCadastro();
$('btnReposicao').onclick = ()=> abrirReposicao();
$('btnLimpar').onclick = ()=> { CARRINHO.clear(); renderPedido(); };
$('btnFechar').onclick = ()=> abrirPagamento();

// fechar modais por data-close
document.addEventListener('click', (e)=>{
  const id = e.target?.getAttribute?.('data-close');
  if (id) $(id).style.display = 'none';
});

// ====== Cardápio ======
function carregarProdutos(){
  loading(true);
  jsonp('products', null, (res)=>{
    loading(false);
    if(!res?.ok){ toast(res?.msg||'Erro ao listar produtos'); return; }
    PRODUTOS = res.data || [];
    renderProdutos();
  });
}

function renderProdutos(){
  const root = $('listaProdutos');
  root.innerHTML = '';
  if(!PRODUTOS.length){
    root.innerHTML = '<div class="muted" style="padding:6px">Nenhum produto ativo encontrado</div>';
    return;
  }
  for (const p of PRODUTOS){
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div>
        <div class="title">${p.nome}</div>
        <div class="muted">SKU ${p.sku} • R$ ${money(p.preco)} ${p.estoqueMin ? ('• Mín: '+p.estoqueMin):''}</div>
      </div>
      <div class="qty">
        <button class="btn small" data-dec="${p.sku}">−</button>
        <div id="q_${p.sku}" style="min-width:28px;text-align:center">0</div>
        <button class="btn small" data-inc="${p.sku}">+</button>
        <button class="btn primary small" data-add="${p.sku}">Adicionar</button>
      </div>
    `;
    root.appendChild(div);
  }
}

// eventos de quantidade/adicionar (delegação)
document.addEventListener('click',(e)=>{
  const inc = e.target?.getAttribute?.('data-inc');
  const dec = e.target?.getAttribute?.('data-dec');
  const add = e.target?.getAttribute?.('data-add');
  if (inc) incQty(inc);
  if (dec) decQty(dec);
  if (add) addToCart(add);
});

function incQty(sku){
  const el = $('q_'+sku); el.textContent = (parseInt(el.textContent||'0')||0)+1;
}
function decQty(sku){
  const el = $('q_'+sku); el.textContent = Math.max(0,(parseInt(el.textContent||'0')||0)-1);
}
function addToCart(sku){
  const p = PRODUTOS.find(x=>x.sku===sku); if(!p) return;
  const qEl = $('q_'+sku); const qtd = Number(qEl.textContent||0);
  if (qtd<=0){ toast('Defina a quantidade.'); return; }
  const cur = CARRINHO.get(sku) || { sku, nome:p.nome, preco:p.preco, qtd:0 };
  cur.qtd += qtd; CARRINHO.set(sku, cur);
  qEl.textContent = '0';
  renderPedido();
}

function renderPedido(){
  const tbody = $('linhas'); tbody.innerHTML = '';
  let total = 0;
  for (const [sku,it] of CARRINHO.entries()){
    const tr = document.createElement('tr');
    const tot = it.preco * it.qtd; total += tot;
    tr.innerHTML = `
      <td>${it.nome}</td>
      <td>${it.qtd}</td>
      <td>${money(it.preco)}</td>
      <td>${money(tot)}</td>
      <td><button class="btn danger small" data-rem="${sku}">remover</button></td>
    `;
    tbody.appendChild(tr);
  }
  $('total').textContent = money(total);
}

// remover item (delegado)
document.addEventListener('click',(e)=>{
  const rem = e.target?.getAttribute?.('data-rem');
  if (rem){ CARRINHO.delete(rem); renderPedido(); }
});

// ====== Reposição ======
function abrirReposicao(){
  $('rep_sku').value=''; $('rep_qtd').value='';
  $('modalReposicao').style.display='grid';
}
$('btnConfirmaReposicao').onclick = ()=>{
  const sku = $('rep_sku').value.trim();
  const qtd = Number($('rep_qtd').value||0);
  if(!sku || qtd<=0){ toast('Informe SKU e quantidade.'); return; }
  loading(true);
  jsonp('restock', { itens:[{sku,qtd}], obs:'Reposição PDV mobile' }, (res)=>{
    loading(false); $('modalReposicao').style.display='none';
    if(res?.ok){ toast('Estoque ajustado 😄'); carregarProdutos(); }
    else { toast(res?.msg||'Erro ao ajustar estoque'); }
  });
};

// ====== Pagamento (NFC só aqui) ======
function abrirPagamento(){
  if (CARRINHO.size===0){ toast('Adicione itens primeiro.'); return; }
  $('tagManual').value='';
  // botão NFC só em Android/Chrome (Web NFC)
  if ('NDEFReader' in window){ show($('nfcRow')); } else { hide($('nfcRow')); }
  $('modalPagamento').style.display='grid';
}
$('btnPagar').onclick = ()=>{
  const manual = $('tagManual').value.trim().toUpperCase();
  if (!manual && !('NDEFReader' in window)){ toast('Digite o UID no iPhone.'); return; }
  pagar(manual || null);
};

$('btnNFC').onclick = async ()=>{
  if (!('NDEFReader' in window)) return;
  try{
    const reader = new NDEFReader();
    await reader.scan();
    toast('Aproxime a TAG…');
    reader.onreading = (ev)=>{
      const uid = (ev.serialNumber||'').toUpperCase();
      if(!uid){ toast('Não foi possível ler a TAG.'); return; }
      pagar(uid);
    };
  }catch(_){ /* silencioso */ }
};

function pagar(tagUID){
  // monta payload
  const itens = Array.from(CART_TO_ARRAY());
  if (!itens.length){ toast('Carrinho vazio.'); return; }
  const operador = ($('operador').value||'').trim();

  loading(true);
  jsonp('sale', { itens, operador, tagUID }, (res)=>{
    loading(false);
    if(res?.ok){
      $('modalPagamento').style.display='none';
      CARRINHO.clear(); renderPedido();
      toast('Obrigado pela compra 😄');
      carregarProdutos();
    }else{
      toast(res?.msg||'Falha ao fechar pedido');
    }
  });
}

function* CART_TO_ARRAY(){
  for (const it of CARRINHO.values()){
    yield { sku: it.sku, qtd: it.qtd };
  }
}

// ====== Cadastro de produto ======
function abrirCadastro(){
  const sku = prompt('SKU do produto:'); if(!sku) return;
  const nome = prompt('Nome do produto:'); if(!nome) return;
  const preco = Number(prompt('Preço unitário (ex: 8.50):')||0);
  const estoqueInicial = Number(prompt('Estoque inicial (opcional):')||0);
  const estoqueMin = Number(prompt('Estoque mínimo (opcional):')||0);

  loading(true);
  jsonp('register', { sku, nome, preco, estoqueInicial, estoqueMin, ativo:true }, (res)=>{
    loading(false);
    if(res?.ok){ toast(res.msg || 'Produto salvo'); carregarProdutos(); }
    else { toast(res?.msg || 'Erro ao salvar produto'); }
  });
}

// start
window.addEventListener('load', ()=>{
  carregarProdutos();
  // pass-through: se abriu com ?tagUID=XYZ, mantém só para preencher campo manual
  const p = new URLSearchParams(location.search);
  const uid = (p.get('tagUID')||p.get('uid')||'').toUpperCase();
  if (uid){ $('tagManual').value = uid; }
});
