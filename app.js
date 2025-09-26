// ======= CONFIGURE SEU GAS AQUI =======
const GAS_URL = "https://script.google.com/macros/s/AKfycbyEgh6FXUtdR0YrE-15KqpLMhsSIQT1dj1Cmfwy1Sf8fuhwNlGHObeiOqS9GfMXS4imnA/exec";
// ======================================

const $ = (id)=>document.getElementById(id);
const toast = (m)=>{
  const t=$("toast"); if(!t) return;
  t.textContent=m; t.style.display="block";
  setTimeout(()=>t.style.display="none",2500);
};

// ⚠️ Sem registrar Service Worker por enquanto (para eliminar cache teimoso).
// Se quiser PWA depois que tudo estiver ok, crie sw.js e descomente abaixo:
// if ("serviceWorker" in navigator){ navigator.serviceWorker.register("./sw.js").catch(()=>{}); }

// Botões principais
$("btnAbrir").onclick = ()=> window.location.href = GAS_URL;

$("btnUID").onclick = ()=>{
  const uid = ($("uid").value||"").trim().toUpperCase();
  if(!uid) return toast("Digite o UID.");
  window.location.href = GAS_URL + "?tagUID=" + encodeURIComponent(uid) + "&ts=" + Date.now();
};

// Web NFC (Android/Chrome). No iPhone não aparece (sem erro).
(async function initNFC(){
  if (!("NDEFReader" in window)) return;
  $("nfcBlock").classList.remove("hide");
  $("btnNFC").onclick = async ()=>{
    try{
      const reader = new NDEFReader();
      await reader.scan();
      reader.onreading = (ev)=>{
        const uid = (ev.serialNumber||"").toUpperCase();
        if(!uid){ toast("Não foi possível ler a TAG."); return; }
        window.location.href = GAS_URL + "?tagUID=" + encodeURIComponent(uid) + "&ts=" + Date.now();
      };
      toast("Aproxime a TAG…");
    }catch(_){ /* silencioso */ }
  };
})();

// Pass-through: se vier com ?tagUID=XYZ
(function passThrough(){
  const p = new URLSearchParams(location.search);
  const uid = (p.get("tagUID") || p.get("uid") || "").toUpperCase();
  if (uid){
    window.location.replace(GAS_URL + "?tagUID=" + encodeURIComponent(uid) + "&ts=" + Date.now());
  }
})();
