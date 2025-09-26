      case "saldo": {
        // devolve { ok:true, saldo: { SKU: quantidade, ... } }
        var mapa = apiGetSaldoMapa();
        return _jsonp_(cb, { ok:true, saldo: mapa });
      }
