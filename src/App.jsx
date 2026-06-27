import { useState } from 'react'
import PasswordGate from './components/PasswordGate'
import Home from './components/Home'
import Daily from './components/Daily'
import Progress from './components/Progress'
import Projects from './components/Projects'
import Jobs from './components/Jobs'
import Earning from './components/Earning'
import Motivate from './components/Motivate'

const TABS = [
  { id: 'home', label: 'Home', title: 'Sanjay', sub: 'Everything in one place. Pick a section.' },
  {
    id: 'daily',
    label: 'Daily',
    title: 'Your day, two halves',
    sub: "Left: what to do. Right: when to do it. They don't sync — edit either side freely.",
  },
  {
    id: 'progress',
    label: 'Progress',
    title: 'Progress',
    sub: 'Habit streaks and health trends — log manually, see the pattern over time.',
  },
  { id: 'projects', label: 'Projects', title: 'Projects', sub: 'What you built, what you used, what it covers.' },
  {
    id: 'jobs',
    label: 'Jobs',
    title: 'Jobs',
    sub: 'Dream companies and how to actually reach them. Plus freelancing.',
  },
  {
    id: 'earning',
    label: 'Earning Ideas',
    title: 'Earning Ideas',
    sub: 'Content ideas for your channels, and other business ideas.',
  },
  { id: 'motivate', label: 'Motivate', title: 'Motivate', sub: 'A line to start the day, and your own collection.' },
]

function AppShell() {
  const [activeTab, setActiveTab] = useState('home')
  const [savePillVisible, setSavePillVisible] = useState(false)
  let savePillTimeout = null

  function flashSaved() {
    setSavePillVisible(true)
    clearTimeout(savePillTimeout)
    savePillTimeout = setTimeout(() => setSavePillVisible(false), 1100)
  }

  const meta = TABS.find((t) => t.id === activeTab)

  return (
    <div className="wrap">
      <header>
        <div className="eyebrow">Sanjay</div>
        <h1>{meta.title}</h1>
        <div className="sub">{meta.sub}</div>
      </header>

      <div className="main-tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`main-tab ${t.id === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {activeTab === 'home' && <Home onNavigate={setActiveTab} />}
      {activeTab === 'daily' && <Daily flashSaved={flashSaved} />}
      {activeTab === 'progress' && <Progress flashSaved={flashSaved} />}
      {activeTab === 'projects' && <Projects flashSaved={flashSaved} />}
      {activeTab === 'jobs' && <Jobs flashSaved={flashSaved} />}
      {activeTab === 'earning' && <Earning flashSaved={flashSaved} />}
      {activeTab === 'motivate' && <Motivate flashSaved={flashSaved} />}

      <div className={`save-pill ${savePillVisible ? 'show' : ''}`}>Saved</div>
    </div>
  )
}

export default function App() {
  return (
    <PasswordGate>
      <AppShell />
    </PasswordGate>
  )
}
