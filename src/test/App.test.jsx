import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import App from '../App'
import { installFakeFetch, resetFakeTable, fakeTable } from './testUtils'

beforeEach(() => {
  resetFakeTable()
  installFakeFetch()
  window.sessionStorage.clear()
})

async function unlockApp() {
  render(<App />)
  const input = screen.getByPlaceholderText('Password')
  fireEvent.change(input, { target: { value: 'RoseandSanjay' } })
  fireEvent.click(screen.getByText('Unlock'))
  await waitFor(() => expect(document.querySelector('.main-tabs')).toBeInTheDocument())
}

function clickMainTab(label) {
  const tabs = document.querySelectorAll('.main-tab')
  const tab = [...tabs].find((t) => t.textContent === label)
  if (!tab) throw new Error(`main tab not found: ${label}`)
  fireEvent.click(tab)
}

describe('Password gate', () => {
  it('blocks access with wrong password', () => {
    render(<App />)
    const input = screen.getByPlaceholderText('Password')
    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Unlock'))
    expect(screen.getByText(/not it/)).toBeInTheDocument()
  })

  it('grants access with correct password', async () => {
    await unlockApp()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })
})

describe('Tab navigation', () => {
  it('shows all 7 tabs', async () => {
    await unlockApp()
    const tabLabels = [...document.querySelectorAll('.main-tab')].map((t) => t.textContent)
    expect(tabLabels).toEqual(['Home', 'Daily', 'Progress', 'Projects', 'Jobs', 'Earning Ideas', 'Motivate'])
  })

  it('clicking Daily switches the panel', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => expect(screen.getByText('Timetable')).toBeInTheDocument())
  })

  it('home nav cards navigate to their tab', async () => {
    await unlockApp()
    fireEvent.click(screen.getByText('Progress', { selector: '.nc-title' }))
    await waitFor(() => expect(screen.getByText('Habit Streaks')).toBeInTheDocument())
  })
})

describe('Daily tab', () => {
  it('renders default sections and timetable', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => expect(screen.getByText('Work & Career')).toBeInTheDocument())
    expect(screen.getByText('Health & Rehab')).toBeInTheDocument()
    expect(screen.getByText('5:30')).toBeInTheDocument()
  })

  it('adds a focus task', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => screen.getByPlaceholderText('Add a top priority for today...'))
    const input = screen.getByPlaceholderText('Add a top priority for today...')
    fireEvent.change(input, { target: { value: 'Call the bank' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getByText('Call the bank')).toBeInTheDocument())
  })

  it('switches timetable day tabs', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => screen.getByText('Tue'))
    fireEvent.click(screen.getByText('Tue'))
    expect(screen.getByText('Tue').className).toContain('active')
  })

  it('persists to fake Supabase table', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => {
      const row = fakeTable.find((r) => r.key === 'sanjay_daily_dual_v1')
      expect(row).toBeTruthy()
    })
  })
})

describe('Progress tab', () => {
  it('renders default habits and metrics', async () => {
    await unlockApp()
    clickMainTab('Progress')
    await waitFor(() => expect(screen.getByText('Morning routine')).toBeInTheDocument())
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument()
  })

  it('logs a habit for today', async () => {
    await unlockApp()
    clickMainTab('Progress')
    await waitFor(() => screen.getAllByText('Log today'))
    const btn = screen.getAllByText('Log today')[0]
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getAllByText('✓ Today')[0]).toBeInTheDocument())
  })

  it('undo reverts the habit log', async () => {
    await unlockApp()
    clickMainTab('Progress')
    await waitFor(() => screen.getAllByText('Log today'))
    fireEvent.click(screen.getAllByText('Log today')[0])
    await waitFor(() => screen.getAllByText('✓ Today'))
    fireEvent.click(screen.getByText('↺ Undo'))
    await waitFor(() => expect(screen.getAllByText('Log today')[0]).toBeInTheDocument())
  })

  it('reset restores defaults and clears custom habits', async () => {
    await unlockApp()
    clickMainTab('Progress')
    await waitFor(() => screen.getByPlaceholderText('Add a new habit to track...'))
    const input = screen.getByPlaceholderText('Add a new habit to track...')
    fireEvent.change(input, { target: { value: 'Custom Habit XYZ' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getByText('Custom Habit XYZ')).toBeInTheDocument())
    fireEvent.click(screen.getByText('⟲ Reset to defaults'))
    await waitFor(() => expect(screen.queryByText('Custom Habit XYZ')).not.toBeInTheDocument())
  })
})

describe('Projects tab', () => {
  it('shows alert when saving without a name', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('Save Project'))
    fireEvent.click(screen.getByText('Save Project'))
    expect(global.alert).toHaveBeenCalledWith('Give the project a name first.')
  })

  it('saves a project and shows it as a card', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('New Project'))
    const nameInput = screen.getByPlaceholderText('Project name...')
    fireEvent.change(nameInput, { target: { value: 'Test Project' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => expect(screen.getByText('Test Project')).toBeInTheDocument())
  })

  it('modify then save changes updates the title', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'Original Name' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => screen.getByText('Original Name'))

    fireEvent.click(screen.getByText('✎ Modify'))
    const editInputs = screen.getAllByDisplayValue('Original Name')
    fireEvent.change(editInputs[0], { target: { value: 'Renamed Project' } })
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => expect(screen.getByText('Renamed Project')).toBeInTheDocument())
  })

  it('delete removes the project', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'ToDelete' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => screen.getByText('ToDelete'))
    fireEvent.click(screen.getByText('✕ Delete'))
    await waitFor(() => expect(screen.queryByText('ToDelete')).not.toBeInTheDocument())
  })
})

describe('Jobs tab', () => {
  it('saves a dream company', async () => {
    await unlockApp()
    clickMainTab('Jobs')
    await waitFor(() => screen.getByText('New Dream Company'))
    const companyInputs = screen.getAllByRole('textbox')
    // First text input in the add-zone grid is Company
    fireEvent.change(companyInputs[0], { target: { value: 'Google' } })
    fireEvent.click(screen.getByText('Save Company'))
    await waitFor(() => expect(screen.getByText('Google')).toBeInTheDocument())
  })

  it('adds a freelance lead', async () => {
    await unlockApp()
    clickMainTab('Jobs')
    await waitFor(() => screen.getByPlaceholderText('Platform / lead name...'))
    fireEvent.change(screen.getByPlaceholderText('Platform / lead name...'), { target: { value: 'Upwork' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getByDisplayValue('Upwork')).toBeInTheDocument())
  })
})

describe('Earning Ideas tab', () => {
  it('renders all three idea sections', async () => {
    await unlockApp()
    clickMainTab('Earning Ideas')
    await waitFor(() => expect(screen.getByText('Personal Channel — Content Ideas')).toBeInTheDocument())
    expect(screen.getByText('Study Channel — Content Ideas')).toBeInTheDocument()
    expect(screen.getByText('Other Business Ideas')).toBeInTheDocument()
  })

  it('adds an idea to the personal list', async () => {
    await unlockApp()
    clickMainTab('Earning Ideas')
    await waitFor(() => screen.getAllByText('+ Add Idea'))
    fireEvent.click(screen.getAllByText('+ Add Idea')[0])
    await waitFor(() => {
      const titles = screen.getAllByPlaceholderText('Idea')
      expect(titles.length).toBeGreaterThan(0)
    })
  })
})

describe('Motivate tab', () => {
  it('shows a featured quote from the seeded list', async () => {
    await unlockApp()
    clickMainTab('Motivate')
    await waitFor(() => expect(screen.getByText(/Small steps every day/)).toBeInTheDocument())
  })

  it('clicking a different star changes the featured quote', async () => {
    await unlockApp()
    clickMainTab('Motivate')
    await waitFor(() => screen.getAllByText('★'))
    const stars = screen.getAllByText('★')
    fireEvent.click(stars[1])
    await waitFor(() => {
      const activeStars = document.querySelectorAll('.star-btn.active')
      expect(activeStars.length).toBe(1)
    })
  })

  it('deletes a quote', async () => {
    await unlockApp()
    clickMainTab('Motivate')
    await waitFor(() => screen.getAllByText('✕'))
    const before = document.querySelectorAll('.quote-row').length
    fireEvent.click(screen.getAllByText('✕')[0])
    await waitFor(() => expect(document.querySelectorAll('.quote-row').length).toBe(before - 1))
  })

  it('adds a new quote', async () => {
    await unlockApp()
    clickMainTab('Motivate')
    await waitFor(() => screen.getByPlaceholderText('Add a line that motivates you...'))
    fireEvent.change(screen.getByPlaceholderText('Add a line that motivates you...'), {
      target: { value: 'Test new quote' },
    })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getByText('Test new quote')).toBeInTheDocument())
  })
})

describe('Home reflects Motivate featured quote', () => {
  it('shows the featured quote on Home after visiting Motivate', async () => {
    await unlockApp()
    clickMainTab('Motivate')
    await waitFor(() => screen.getAllByText('★'))
    fireEvent.click(screen.getAllByText('★')[1])
    await waitFor(() => document.querySelectorAll('.star-btn.active').length === 1)

    clickMainTab('Home')
    await waitFor(() => {
      const quoteBox = document.querySelector('.featured-quote .fq-text')
      expect(quoteBox).toBeTruthy()
      expect(quoteBox.textContent.length).toBeGreaterThan(0)
    })
  })
})
