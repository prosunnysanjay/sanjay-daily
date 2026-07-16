import { useEffect, useState } from 'react'
import { storageGet } from '../lib/supabase'
import { STORAGE_KEYS } from '../lib/supabase'
import { exportAllData, importAllData } from '../lib/utils'

const NAV_ITEMS = [
  { id: 'daily', icon: '📋', title: 'Daily', desc: "Today's tasks + your timetable, side by side." },
  { id: 'revision', icon: '⚡', title: 'Revision', desc: 'Quick-dump notes per subject — what it is, why it matters, interview tips.' },
  { id: 'roadmap', icon: '🗺️', title: 'DevOps Roadmap', desc: 'A chronological path to Principal Cloud Architect & DevOps Leader.' },
  { id: 'projects', icon: '🗂️', title: 'Projects', desc: 'Description, tools, concepts, architecture per project.' },
  {
    id: 'jobs',
    icon: '🎯',
    title: 'Jobs',
    desc: 'Dream companies, JD notes, steps to reach there. Plus freelancing.',
  },
  { id: 'earning', icon: '💡', title: 'Earning Ideas', desc: 'Content ideas for your channels, plus business ideas.' },
  { id: 'motivate', icon: '✨', title: 'Motivate', desc: 'A featured line, and your own collection.' },
]

export default function Home({ onNavigate }) {
  const [stats, setStats] = useState({ openTasks: 0, projectCount: 0 })
  const [featuredQuote, setFeaturedQuote] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    let dailyData = null,
      projectsData = null,
      motivateData = null

    try {
      const r = await storageGet(STORAGE_KEYS.daily)
      dailyData = r ? JSON.parse(r.value) : null
    } catch {
      /* no data yet */
    }
    try {
      const r = await storageGet(STORAGE_KEYS.projects)
      projectsData = r ? JSON.parse(r.value) : null
    } catch {
      /* no data yet */
    }
    try {
      const r = await storageGet(STORAGE_KEYS.motivate)
      motivateData = r ? JSON.parse(r.value) : null
    } catch {
      /* no data yet */
    }

    if (motivateData && motivateData.quotes && motivateData.quotes.length) {
      const featured = motivateData.featuredId
        ? motivateData.quotes.find((q) => q.id === motivateData.featuredId)
        : motivateData.quotes[0]
      if (featured) setFeaturedQuote(featured.text)
    }

    const openTasks = dailyData && dailyData.focus ? dailyData.focus.filter((f) => !f.done).length : 0
    const projectCount = projectsData && projectsData.projects ? projectsData.projects.length : 0

    setStats({ openTasks, projectCount })
    setLoading(false)
  }

  async function handleExport() {
    await exportAllData()
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!confirm('This will overwrite all current data in this app with the backup file. Continue?')) return
    await importAllData(file)
  }

  return (
    <div>
      <div className="tab-toolbar">
        <button className="btn-outline" onClick={handleExport}>
          ⬇ Export backup
        </button>
        <label className="btn-outline" style={{ cursor: 'pointer' }}>
          ⬆ Import backup
          <input type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />
        </label>
      </div>

      {featuredQuote && (
        <div className="featured-quote">
          <div className="fq-text">{featuredQuote}</div>
        </div>
      )}

      <div className="home-stats">
        <div className="home-stat">
          <div className="hs-label">Today's Open Tasks</div>
          <div className="hs-value">{loading ? '…' : stats.openTasks}</div>
          <div className="hs-sub">on your Daily list</div>
        </div>
        <div className="home-stat">
          <div className="hs-label">Projects Tracked</div>
          <div className="hs-value">{loading ? '…' : stats.projectCount}</div>
          <div className="hs-sub">on your Projects page</div>
        </div>
      </div>

      <div className="nav-grid">
        {NAV_ITEMS.map((item) => (
          <div key={item.id} className="nav-card" onClick={() => onNavigate(item.id)}>
            <div className="nc-icon">{item.icon}</div>
            <div className="nc-title">{item.title}</div>
            <div className="nc-desc">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
