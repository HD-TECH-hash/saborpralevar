// +++ ADICIONE ESTE CASE NO doGet +++
case "stock": {
  var det = apiGetSaldoAtual();         // { SKU: saldo }
  return _jsonp_(cb, { ok:true, data: det });
}
