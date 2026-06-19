// Dados iniciais / mock para desenvolvimento e primeira carga.
// São mesclados com o que houver em localStorage.

export const SCENARIOS = ['nat', 'ang', 'buffet']

export const SCENARIO_META = {
  nat: { label: 'Nat', color: '#ec4899' },
  ang: { label: 'Ang', color: '#06b6d4' },
  buffet: { label: 'Buffet', color: '#f59e0b' }
}

export const initialState = {
  config: {
    ticker: 'ISAE4',
    initialCapital: 50000,
    rfMonthlyRate: 0.01, // 1% ao mês
    startDate: '2026-01-02',
    initialPrice: 22.5, // preço de ISAE4 na data inicial (usado pelo Buffet)
    adminPassword: 'admin123' // senha simples do painel de configurações
  },
  profiles: {
    nat: {
      name: 'Nat',
      photo: '',
      description: 'Investidora ativa, gosta de aproveitar oscilações do mercado.',
      thesis: 'Acredito que dá pra superar o buy & hold girando a posição nos momentos certos.'
    },
    ang: {
      name: 'Ang',
      photo: '',
      description: 'Investidor metódico, foca em pontos de entrada e saída planejados.',
      thesis: 'ISAE4 tem fundamentos sólidos; vou comprar nas quedas e realizar nas altas.'
    }
  },
  transactions: {
    nat: [
      { id: 'n1', date: '2026-01-02', type: 'buy', qty: 1000, price: 22.5 },
      { id: 'n2', date: '2026-03-10', type: 'sell', qty: 400, price: 25.1 }
    ],
    ang: [
      { id: 'a1', date: '2026-01-02', type: 'buy', qty: 1500, price: 22.5 },
      { id: 'a2', date: '2026-04-15', type: 'buy', qty: 300, price: 21.0 }
    ]
  },
  dividends: [
    { id: 'd1', date: '2026-02-20', type: 'dividendo', value: 0.35 },
    { id: 'd2', date: '2026-05-12', type: 'jcp', value: 0.28 }
  ],
  // Alvos de preço (ordens automáticas) por cenário. Cada ordem:
  // { id, type:'buy'|'sell', qty, target, condition:'lte'|'gte',
  //   createdAt, status:'pending'|'filled'|'canceled', filledAt, filledPrice }
  orders: {
    nat: [],
    ang: []
  },
  quote: null, // { price, currency, time, updatedAt }
  priceHistory: [], // [{ date, price }] mesclado de API + manual
  // Registro de auditoria (backup imutável). Cada entrada:
  // { id, ts, actor, action: 'add'|'remove'|'edit', scenario, kind, data }
  auditLog: [],
  theme: 'dark'
}
