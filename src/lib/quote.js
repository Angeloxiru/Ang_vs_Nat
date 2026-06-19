// =====================================================================
// Integração de cotações (Yahoo Finance) com proxy CORS de fallback.
// O endpoint do Yahoo costuma bloquear CORS no navegador; por isso
// tentamos uma lista de proxies públicos. Há fallback manual no Admin.
// =====================================================================

const PROXIES = [
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => url // tentativa direta (funciona em alguns ambientes)
]

async function fetchViaProxies(url) {
  let lastErr
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(url), { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      return JSON.parse(text)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Falha ao buscar cotação')
}

const yahooSymbol = (ticker) => {
  const t = (ticker || '').toUpperCase().trim()
  return t.endsWith('.SA') ? t : `${t}.SA`
}

// Cotação atual: retorna { price, currency, time }.
export async function fetchCurrentQuote(ticker) {
  const symbol = yahooSymbol(ticker)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`
  const json = await fetchViaProxies(url)
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Cotação indisponível')
  const meta = result.meta || {}
  const price = meta.regularMarketPrice ?? result.indicators?.quote?.[0]?.close?.slice(-1)[0]
  if (price == null) throw new Error('Preço não encontrado')
  return {
    price: Number(price),
    currency: meta.currency || 'BRL',
    time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString()
  }
}

// Histórico diário: retorna array [{ date: 'YYYY-MM-DD', price }].
export async function fetchHistory(ticker, fromISO) {
  const symbol = yahooSymbol(ticker)
  const period1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const period2 = Math.floor(Date.now() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`
  const json = await fetchViaProxies(url)
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Histórico indisponível')
  const timestamps = result.timestamp || []
  const closes = result.indicators?.quote?.[0]?.close || []
  const out = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (close == null) continue
    out.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), price: Number(close) })
  }
  return out
}
