import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../lib/supabaseClient', async () => {
  const { fakeSupabase } = await import('./testUtils')
  return { supabase: fakeSupabase }
})

import App from '../App'
import { resetFakeTable, resetFakeAuth, fakeTable, TEST_EMAIL, TEST_PASSWORD } from './testUtils'

beforeEach(() => {
  resetFakeTable()
  resetFakeAuth()
  window.sessionStorage.clear()
})

async function unlockApp() {
  render(<App />)
  const emailInput = await screen.findByPlaceholderText('Email')
  fireEvent.change(emailInput, { target: { value: TEST_EMAIL } })
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: TEST_PASSWORD } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(document.querySelector('.main-tabs')).toBeInTheDocument())
}

function clickMainTab(label) {
  const tabs = document.querySelectorAll('.main-tab')
  const tab = [...tabs].find((t) => t.textContent === label)
  if (!tab) throw new Error(`main tab not found: ${label}`)
  fireEvent.click(tab)
}

describe('Password gate', () => {
  it('blocks access with wrong credentials', async () => {
    render(<App />)
    const emailInput = await screen.findByPlaceholderText('Email')
    fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText(/Invalid login credentials/)).toBeInTheDocument())
  })

  it('grants access with correct credentials', async () => {
    await unlockApp()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })
})

describe('Tab navigation', () => {
  it('shows all 10 tabs', async () => {
    await unlockApp()
    const tabLabels = [...document.querySelectorAll('.main-tab')].map((t) => t.textContent)
    expect(tabLabels).toEqual([
      'Home',
      'Daily',
      'Things I Have',
      'Tracking',
      'Revision',
      'DevOps Roadmap',
      'Projects',
      'Jobs',
      'Earning Ideas',
      'Motivate',
    ])
  })

  it('clicking Daily switches the panel', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => expect(screen.getByText('Timetable')).toBeInTheDocument())
  })

  it('home nav cards navigate to their tab', async () => {
    await unlockApp()
    fireEvent.click(screen.getByText('Revision', { selector: '.nc-title' }))
    await waitFor(() => expect(screen.getByText('+ Add Subject')).toBeInTheDocument())
  })
})

describe('Daily tab', () => {
  it('renders default sections and timetable', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => expect(screen.getByText('Work & Career', { selector: 'h2' })).toBeInTheDocument())
    expect(screen.getByText('Health & Rehab', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('5:30')).toBeInTheDocument()
  })

  it('adds a focus task', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => screen.getByPlaceholderText('Add a top priority for today...'))
    const input = screen.getByPlaceholderText('Add a top priority for today...')
    fireEvent.change(input, { target: { value: 'Call the bank' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    // The new task is pinned into Today AND lives in its owning section below,
    // so it renders twice — once in each place, kept in sync.
    await waitFor(() => {
      const focusZone = document.querySelector('.focus-zone')
      expect(within(focusZone).getByText('Call the bank')).toBeInTheDocument()
    })
  })

  it('editing a pinned task from Today updates it in its owning section too', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => screen.getByPlaceholderText('Add a top priority for today...'))
    fireEvent.change(screen.getByPlaceholderText('Add a top priority for today...'), {
      target: { value: 'Ping the recruiter' },
    })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))

    const focusZone = document.querySelector('.focus-zone')
    await waitFor(() => within(focusZone).getByText('Ping the recruiter'))
    fireEvent.click(within(focusZone).getByTitle('Edit'))
    const editable = within(focusZone).getByText('Ping the recruiter')
    editable.textContent = 'Ping the recruiter today'
    fireEvent.blur(editable)

    await waitFor(() => {
      const section = document.querySelector('.section')
      expect(within(section).getByText('Ping the recruiter today')).toBeInTheDocument()
    })
  })

  it('renames the Today ribbon and a section heading in place', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => screen.getByText('TODAY'))

    const ribbon = screen.getByText('TODAY')
    ribbon.textContent = 'THIS WEEK'
    fireEvent.blur(ribbon)
    await waitFor(() => expect(screen.getByText('THIS WEEK')).toBeInTheDocument())

    const heading = screen.getByText('Work & Career', { selector: 'h2' })
    heading.textContent = 'Career Goals'
    fireEvent.blur(heading)
    await waitFor(() => expect(screen.getByText('Career Goals', { selector: 'h2' })).toBeInTheDocument())
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

  it('repairs a corrupted null task entry instead of crashing', async () => {
    fakeTable.push({
      key: 'sanjay_daily_dual_v1',
      user_id: 'test-user-id',
      value: {
        focusLabel: 'TODAY',
        timetableLabel: 'Timetable',
        focus: [],
        sections: [
          {
            id: 'work',
            label: 'Work & Career',
            color: '#5C7A99',
            tasks: [
              { id: 't1', text: 'Real task one', done: false, starred: false },
              null,
              { id: 't2', text: 'Real task two', done: false, starred: false },
            ],
          },
        ],
        timetable: { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] },
        activeDay: 'Mon',
      },
    })

    await unlockApp()
    clickMainTab('Daily')

    await waitFor(() => expect(screen.getByText('Real task one')).toBeInTheDocument())
    expect(screen.getByText('Real task two')).toBeInTheDocument()
    expect(document.querySelectorAll('.task-list li').length).toBe(2)

    const row = fakeTable.find((r) => r.key === 'sanjay_daily_dual_v1')
    expect(row.value.sections[0].tasks.every((t) => t && t.id)).toBe(true)
  })
})

describe('Things I Have tab', () => {
  it('renders the seeded notebook sections and cell values', async () => {
    await unlockApp()
    clickMainTab('Things I Have')
    await waitFor(() => expect(screen.getByDisplayValue('Official Certificates')).toBeInTheDocument())
    expect(screen.getByDisplayValue('AZ-900 — Azure Fundamentals')).toBeInTheDocument()
    expect(screen.getByDisplayValue('HashiCorp Terraform Associate')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Completed Projects')).toBeInTheDocument()
  })

  it('adds a row to a table section', async () => {
    await unlockApp()
    clickMainTab('Things I Have')
    await waitFor(() => screen.getByDisplayValue('Official Certificates'))
    const section = screen.getByDisplayValue('Official Certificates').closest('.things-section')
    const before = section.querySelectorAll('.things-row').length
    fireEvent.click(within(section).getByText('+ Add row'))
    await waitFor(() => expect(section.querySelectorAll('.things-row').length).toBe(before + 1))
  })

  it('edits a cell value and it sticks', async () => {
    await unlockApp()
    clickMainTab('Things I Have')
    await waitFor(() => screen.getByDisplayValue('HashiCorp Terraform Associate'))
    const cell = screen.getByDisplayValue('HashiCorp Terraform Associate')
    fireEvent.change(cell, { target: { value: 'Terraform Associate (003)' } })
    fireEvent.blur(cell)
    await waitFor(() => expect(screen.getByDisplayValue('Terraform Associate (003)')).toBeInTheDocument())
  })

  it('adds a new table section', async () => {
    await unlockApp()
    clickMainTab('Things I Have')
    await waitFor(() => screen.getByText('+ Table'))
    fireEvent.click(screen.getByText('+ Table'))
    await waitFor(() => expect(screen.getByDisplayValue('New Section')).toBeInTheDocument())
  })

  it('adds a text note section', async () => {
    await unlockApp()
    clickMainTab('Things I Have')
    await waitFor(() => screen.getByText('+ Note'))
    fireEvent.click(screen.getByText('+ Note'))
    await waitFor(() => expect(screen.getByDisplayValue('New Note')).toBeInTheDocument())
  })

  it('deletes a section', async () => {
    await unlockApp()
    clickMainTab('Things I Have')
    await waitFor(() => screen.getByDisplayValue('Completed Projects'))
    const section = screen.getByDisplayValue('Completed Projects').closest('.things-section')
    fireEvent.click(within(section).getByTitle('Delete section'))
    await waitFor(() => expect(screen.queryByDisplayValue('Completed Projects')).not.toBeInTheDocument())
  })
})

describe('Tracking tab', () => {
  function trackMain() {
    return document.querySelector('.projects-main')
  }
  function trackSidebar() {
    return document.querySelector('.projects-sidebar')
  }

  it('defaults to the first category, shown in the sidebar and opened', async () => {
    await unlockApp()
    clickMainTab('Tracking')
    await waitFor(() => expect(within(trackSidebar()).getByText(/Notes — Subject & Location/)).toBeInTheDocument())
    expect(within(trackSidebar()).getByText(/Money Management/)).toBeInTheDocument()
    expect(within(trackSidebar()).getByText(/Important Documents Backup/)).toBeInTheDocument()
    expect(within(trackMain()).getByDisplayValue('Notes Location')).toBeInTheDocument()
  })

  it('selecting Money Management shows all six sub-tables', async () => {
    await unlockApp()
    clickMainTab('Tracking')
    await waitFor(() => within(trackSidebar()).getByText(/Money Management/))
    fireEvent.click(within(trackSidebar()).getByText(/Money Management/))
    await waitFor(() =>
      expect(trackMain().querySelectorAll('.things-section-title').length).toBeGreaterThanOrEqual(6),
    )
    const titles = [...trackMain().querySelectorAll('.things-section-title')].map((el) => el.value)
    expect(titles).toEqual(
      expect.arrayContaining([
        'Balance Tracking',
        'Insurance & Recharge Tracking',
        'Investment',
        'Growing',
        'Liabilities',
        'Assets',
      ]),
    )
  })

  it('adds a row to a table without affecting other tables', async () => {
    await unlockApp()
    clickMainTab('Tracking')
    await waitFor(() => within(trackSidebar()).getByText(/Money Management/))
    fireEvent.click(within(trackSidebar()).getByText(/Money Management/))
    await waitFor(() => within(trackMain()).getByDisplayValue('Assets'))
    const assetsTable = within(trackMain()).getByDisplayValue('Assets').closest('.things-section')
    const before = assetsTable.querySelectorAll('.things-row').length
    fireEvent.click(within(assetsTable).getByText('+ Add row'))
    await waitFor(() => expect(assetsTable.querySelectorAll('.things-row').length).toBe(before + 1))
    const liabilitiesTable = within(trackMain()).getByDisplayValue('Liabilities').closest('.things-section')
    expect(liabilitiesTable.querySelectorAll('.things-row').length).toBe(1)
  })

  it('edits a cell and it sticks', async () => {
    await unlockApp()
    clickMainTab('Tracking')
    await waitFor(() => within(trackMain()).getByDisplayValue('Notes Location'))
    const cell = trackMain().querySelector('.things-cell-input')
    fireEvent.change(cell, { target: { value: 'Docker notes' } })
    fireEvent.blur(cell)
    await waitFor(() => expect(screen.getByDisplayValue('Docker notes')).toBeInTheDocument())
  })

  it('adds a new category and selects it', async () => {
    await unlockApp()
    clickMainTab('Tracking')
    await waitFor(() => screen.getByText('+ Category'))
    fireEvent.click(screen.getByText('+ Category'))
    await waitFor(() => expect(within(trackMain()).getByDisplayValue('New Category')).toBeInTheDocument())
  })

  it('persists to fake Supabase table under its own key', async () => {
    await unlockApp()
    clickMainTab('Tracking')
    await waitFor(() => {
      const row = fakeTable.find((r) => r.key === 'sanjay_tracking_v1')
      expect(row).toBeTruthy()
    })
  })
})

describe('Revision tab', () => {
  function revMain() {
    return document.querySelector('.revision-main')
  }

  function revSidebar() {
    return document.querySelector('.revision-sidebar')
  }

  it('renders the seeded subject list in the sidebar', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => expect(within(revSidebar()).getByText('Linux')).toBeInTheDocument())
    expect(within(revSidebar()).getByText('Docker')).toBeInTheDocument()
    expect(within(revSidebar()).getByText('Kubernetes')).toBeInTheDocument()
    expect(within(revSidebar()).getByText('Helm')).toBeInTheDocument()
    expect(within(revSidebar()).getByText('Terraform & Terragrunt')).toBeInTheDocument()
  })

  it('selecting a subject from the sidebar opens it, modules collapsed by default', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Docker'))
    fireEvent.click(screen.getByText('Docker'))
    await waitFor(() => expect(within(revMain()).getByText('Dockerfile')).toBeInTheDocument())
    expect(within(revMain()).queryByText('BuildKit secret mount')).not.toBeInTheDocument()
  })

  it('jumping to a module from the sidebar tree expands it in the main panel with its seeded keywords and Q&A', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Docker'))
    fireEvent.click(screen.getByText('Docker'))
    await waitFor(() => within(revSidebar()).getByText('Volumes'))
    fireEvent.click(within(revSidebar()).getByText('Volumes'))
    await waitFor(() => expect(revMain().textContent).toContain('Named volume'))
    expect(revMain().textContent).toContain('Interview Q&A')
    expect(revMain().textContent).toContain('tmpfs')
  })

  it('creates a new blank module, adds a keyword and a Q&A pair via edit mode, and shows them in the read view', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('+ Add Subject'))
    fireEvent.click(screen.getByText('+ Add Subject'))
    await waitFor(() => screen.getByText('New Subject'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Ansible'), { target: { value: 'Ansible' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => screen.getByText('Ansible'))
    fireEvent.click(screen.getByText('Ansible'))

    await waitFor(() => screen.getByText('+ Add Module'))
    fireEvent.click(screen.getByText('+ Add Module'))
    await waitFor(() => screen.getByText('New Module'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Ingress'), { target: { value: 'Playbooks' } })
    fireEvent.click(screen.getByText('Save Module'))
    await waitFor(() => within(revMain()).getByText('Playbooks'))

    fireEvent.click(within(revMain()).getByText('Playbooks'))
    await waitFor(() => expect(within(revMain()).getByText('No notes yet — tap ✎ to add some.')).toBeInTheDocument())

    const moduleRow = within(revMain()).getByText('Playbooks').closest('.revision-module')
    fireEvent.click(within(moduleRow).getByText('✎'))

    await waitFor(() => screen.getByText('Save Changes'))
    const editRow = screen.getByText('Save Changes').closest('.revision-module')

    fireEvent.click(within(editRow).getByText('+ Add keyword'))
    fireEvent.change(within(editRow).getByPlaceholderText('Term'), { target: { value: 'idempotent' } })
    fireEvent.change(within(editRow).getByPlaceholderText('One-line description'), {
      target: { value: 'running twice produces the same result' },
    })

    fireEvent.click(within(editRow).getByText('+ Add Q&A'))
    fireEvent.change(within(editRow).getByPlaceholderText('Question'), { target: { value: 'Why idempotent?' } })
    fireEvent.change(within(editRow).getByPlaceholderText('One-line answer'), {
      target: { value: 'Safe to rerun without side effects.' },
    })

    fireEvent.click(within(editRow).getByText('Save Changes'))

    await waitFor(() => expect(revMain().textContent).toContain('idempotent'))
    expect(revMain().textContent).toContain('Why idempotent?')
    expect(revMain().textContent).toContain('Safe to rerun without side effects.')
  })

  it('adds a new subject via the modal', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('+ Add Subject'))
    fireEvent.click(screen.getByText('+ Add Subject'))
    await waitFor(() => screen.getByText('New Subject'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Ansible'), { target: { value: 'Ansible' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByText('Ansible')).toBeInTheDocument())
  })

  it('adds a module inside a subject', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Helm'))
    fireEvent.click(screen.getByText('Helm'))
    await waitFor(() => screen.getByText('+ Add Module'))
    fireEvent.click(screen.getByText('+ Add Module'))
    await waitFor(() => screen.getByText('New Module'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Ingress'), { target: { value: 'Library charts' } })
    fireEvent.click(screen.getByText('Save Module'))
    await waitFor(() => expect(within(revMain()).getByText('Library charts')).toBeInTheDocument())
  })

  it('deletes a module', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Scripting'))
    fireEvent.click(screen.getByText('Scripting'))
    await waitFor(() => within(revMain()).getByText('Bash Fundamentals'))
    const moduleRow = within(revMain()).getByText('Bash Fundamentals').closest('.revision-module')
    fireEvent.click(within(moduleRow).getByText('✕'))
    await waitFor(() => expect(within(revMain()).queryByText('Bash Fundamentals')).not.toBeInTheDocument())
  })

  it('filters modules in the main panel by search text, sidebar keeps the full list', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Kubernetes'))
    fireEvent.click(screen.getByText('Kubernetes'))
    await waitFor(() => within(revMain()).getByText('Storage'))
    fireEvent.change(screen.getByPlaceholderText('Filter modules...'), { target: { value: 'storage' } })
    await waitFor(() => expect(within(revMain()).queryByText('Pods & Multi-Container Patterns')).not.toBeInTheDocument())
    expect(within(revMain()).getByText('Storage')).toBeInTheDocument()
    // The sidebar tree stays a full, unfiltered index for navigation.
    expect(within(revSidebar()).getByText('Pods & Multi-Container Patterns')).toBeInTheDocument()
  })
})

describe('DevOps Roadmap tab', () => {
  function rmMain() {
    return document.querySelector('.roadmap-main')
  }
  function rmSidebar() {
    return document.querySelector('.roadmap-sidebar')
  }

  it('renders the seeded chronological phases plus a left-hand nav list', async () => {
    await unlockApp()
    clickMainTab('DevOps Roadmap')
    await waitFor(() => expect(within(rmMain()).getByText('Phase 1 — Foundations & Fundamentals')).toBeInTheDocument())
    // AI phase inserted before Leadership, which is now Phase 12.
    expect(within(rmMain()).getByText('Phase 11 — AI, ML & GenAI Engineering')).toBeInTheDocument()
    expect(within(rmMain()).getByText('Phase 12 — Leadership & Strategy')).toBeInTheDocument()
    // The left nav mirrors the phase titles.
    expect(within(rmSidebar()).getByText('Phase 1 — Foundations & Fundamentals')).toBeInTheDocument()
    // A phase is expanded by default, so its steps show. PowerShell now covered.
    expect(within(rmMain()).getByText('Scripting')).toBeInTheDocument()
    expect(screen.getByText(/PowerShell/)).toBeInTheDocument()
  })

  it('collapses a phase to hide its steps, then expands it again', async () => {
    await unlockApp()
    clickMainTab('DevOps Roadmap')
    await waitFor(() => within(rmMain()).getByText('Linux & OS internals'))
    const head = within(rmMain()).getByText('Phase 1 — Foundations & Fundamentals').closest('.roadmap-phase-head')
    fireEvent.click(within(head).getByText('Phase 1 — Foundations & Fundamentals'))
    await waitFor(() => expect(within(rmMain()).queryByText('Linux & OS internals')).not.toBeInTheDocument())
    fireEvent.click(within(head).getByText('Phase 1 — Foundations & Fundamentals'))
    await waitFor(() => expect(within(rmMain()).getByText('Linux & OS internals')).toBeInTheDocument())
  })

  it('adds a new phase via the modal', async () => {
    await unlockApp()
    clickMainTab('DevOps Roadmap')
    await waitFor(() => screen.getByText('+ Add Phase'))
    fireEvent.click(screen.getByText('+ Add Phase'))
    await waitFor(() => screen.getByText('New Phase'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Phase 13 — Emerging Tech'), {
      target: { value: 'Phase 13 — Quantum Ops' },
    })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(within(rmMain()).getByText('Phase 13 — Quantum Ops')).toBeInTheDocument())
  })

  it('adds a step to a phase', async () => {
    await unlockApp()
    clickMainTab('DevOps Roadmap')
    await waitFor(() => within(rmMain()).getByText('Linux & OS internals'))
    const phaseBody = within(rmMain()).getByText('Linux & OS internals').closest('.roadmap-phase-body')
    const input = within(phaseBody).getByPlaceholderText('Add a step...')
    fireEvent.change(input, { target: { value: 'Text editors (vim, tmux)' } })
    fireEvent.click(within(phaseBody).getByText('Add'))
    await waitFor(() => expect(within(rmMain()).getByText('Text editors (vim, tmux)')).toBeInTheDocument())
  })

  it('edits a step title inline and shows the new text', async () => {
    await unlockApp()
    clickMainTab('DevOps Roadmap')
    await waitFor(() => within(rmMain()).getByText('Linux & OS internals'))
    const row = within(rmMain()).getByText('Linux & OS internals').closest('.roadmap-item')
    fireEvent.click(within(row).getByTitle('Edit'))
    const titleInput = screen.getByDisplayValue('Linux & OS internals')
    fireEvent.change(titleInput, { target: { value: 'Linux internals & kernel' } })
    fireEvent.click(screen.getByText('Save', { selector: '.roadmap-item-edit-actions .btn' }))
    await waitFor(() => expect(within(rmMain()).getByText('Linux internals & kernel')).toBeInTheDocument())
  })

  it('deletes a step', async () => {
    await unlockApp()
    clickMainTab('DevOps Roadmap')
    await waitFor(() => within(rmMain()).getByText('CLI mastery'))
    const row = within(rmMain()).getByText('CLI mastery').closest('.roadmap-item')
    fireEvent.click(within(row).getByTitle('Delete'))
    await waitFor(() => expect(within(rmMain()).queryByText('CLI mastery')).not.toBeInTheDocument())
  })
})

describe('Projects tab', () => {
  function projMain() {
    return document.querySelector('.projects-main')
  }
  function projSidebar() {
    return document.querySelector('.projects-sidebar')
  }

  it('opens the first seeded project by default in a readable detail view', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() =>
      expect(within(projMain()).getByText('MindBridge AI Auditor — KPMG Clara Analytics (KCA AITS)')).toBeInTheDocument(),
    )
    // Tools render as chips, and "What I've Done" renders as a labelled block.
    expect(within(projMain()).getByText('Overview')).toBeInTheDocument()
    expect(within(projMain()).getByText("What I've Done")).toBeInTheDocument()
    // The sidebar lists every project for selection.
    expect(within(projSidebar()).getByText('Cloud-Native E-Commerce Platform (100+ Microservices)')).toBeInTheDocument()
  })

  it('shows alert when saving without a name', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByText('New Project'))
    fireEvent.click(screen.getByText('Save Project'))
    expect(global.alert).toHaveBeenCalledWith('Give the project a name first.')
  })

  it('saves a project via the add modal and selects it in the detail view', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByText('New Project'))
    const nameInput = screen.getByPlaceholderText('Project name...')
    fireEvent.change(nameInput, { target: { value: 'Test Project' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => expect(within(projMain()).getByText('Test Project')).toBeInTheDocument())
    expect(screen.queryByText('New Project')).not.toBeInTheDocument()
  })

  it('captures architecture detail as readable text', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'Arch Project' } })
    // Modal field order: Name, Description, Tools Used, Concepts Covered, What I've Done, Notes.
    const fields = screen.getAllByRole('textbox')
    fireEvent.change(fields[4], { target: { value: 'Client -> API -> DB' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => within(projMain()).getByText('Arch Project'))
    expect(within(projMain()).getByText(/Client -> API -> DB/)).toBeInTheDocument()
  })

  it('modify then save changes updates the title', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'Original Name' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => within(projMain()).getByText('Original Name'))

    fireEvent.click(within(projMain()).getByText('✎ Modify'))
    const editInput = screen.getByDisplayValue('Original Name')
    fireEvent.change(editInput, { target: { value: 'Renamed Project' } })
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => expect(within(projMain()).getByText('Renamed Project')).toBeInTheDocument())
  })

  it('delete removes the project', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'ToDelete' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => within(projMain()).getByText('ToDelete'))
    fireEvent.click(within(projMain()).getByText('✕ Delete'))
    await waitFor(() => expect(screen.queryByText('ToDelete')).not.toBeInTheDocument())
  })
})

describe('Jobs tab', () => {
  it('saves a dream company via the add modal', async () => {
    await unlockApp()
    clickMainTab('Jobs')
    await waitFor(() => screen.getByText('+ Add Company'))
    fireEvent.click(screen.getByText('+ Add Company'))
    await waitFor(() => screen.getByText('New Dream Company'))
    const companyInputs = screen.getAllByRole('textbox')
    // First text input in the modal's company grid is Company
    fireEvent.change(companyInputs[0], { target: { value: 'Google' } })
    fireEvent.click(screen.getByText('Save Company'))
    await waitFor(() => expect(screen.getByText('Google')).toBeInTheDocument())
    expect(screen.queryByText('New Dream Company')).not.toBeInTheDocument()
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
