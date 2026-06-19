import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { brl, pct, fmtDate } from '../lib/format'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const baseOptions = (mode) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 8 } },
    tooltip: {
      callbacks: {
        title: (items) => fmtDate(items[0]?.label),
        label: (item) =>
          `${item.dataset.label}: ${mode === 'pct' ? pct(item.parsed.y) : brl(item.parsed.y)}`
      }
    }
  },
  scales: {
    x: {
      ticks: {
        color: '#94a3b8',
        maxTicksLimit: 7,
        callback(value) {
          return fmtDate(this.getLabelForValue(value)).slice(0, 5)
        }
      },
      grid: { color: 'rgba(148,163,184,0.1)' }
    },
    y: {
      ticks: {
        color: '#94a3b8',
        callback: (v) => (mode === 'pct' ? `${v}%` : brl(v).replace('R$', '').trim())
      },
      grid: { color: 'rgba(148,163,184,0.1)' }
    }
  }
})

// series: [{ label, color, points: [{date, value}] }]
export function LineChart({ series, mode = 'value', labels }) {
  const data = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.points.map((p) => p.value),
      borderColor: s.color,
      backgroundColor: s.color + '22',
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      fill: false
    }))
  }
  return (
    <div className="h-64 sm:h-80">
      <Line data={data} options={baseOptions(mode)} />
    </div>
  )
}
