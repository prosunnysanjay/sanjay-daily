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
    expect(tabLabels).toEqual(['Home', 'Daily', 'Study Tracking', 'Projects', 'Jobs', 'Earning Ideas', 'Motivate'])
  })

  it('clicking Daily switches the panel', async () => {
    await unlockApp()
    clickMainTab('Daily')
    await waitFor(() => expect(screen.getByText('Timetable')).toBeInTheDocument())
  })

  it('home nav cards navigate to their tab', async () => {
    await unlockApp()
    fireEvent.click(screen.getByText('Study Tracking', { selector: '.nc-title' }))
    await waitFor(() => expect(screen.getByText('Study Mindmap')).toBeInTheDocument())
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

describe('Study Tracking tab', () => {
  it('renders the default mindmap topics', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => expect(screen.getByText('Linux')).toBeInTheDocument())
    expect(screen.getByText('Docker (alternatives: Podman, containerd, rkt)')).toBeInTheDocument()
    expect(screen.getByText('Multistage builds')).toBeInTheDocument()
    expect(screen.getByText('Docker Compose')).toBeInTheDocument()
    expect(screen.getByText('Volumes')).toBeInTheDocument()
    expect(screen.getAllByText('Networking').length).toBeGreaterThan(0)
    expect(screen.getByText('Images')).toBeInTheDocument()
    expect(screen.getByText('Registries')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes (alternatives: Docker Swarm, Nomad, OpenShift, ECS)')).toBeInTheDocument()
    expect(screen.getByText('Helm (alternatives: Kustomize, Helmfile)')).toBeInTheDocument()
    expect(screen.getByText('Terraform & Terragrunt (alternatives: Pulumi, CloudFormation, Bicep, Ansible)')).toBeInTheDocument()
    expect(screen.getByText('Service Mesh (Istio, Linkerd, Consul)')).toBeInTheDocument()
    expect(screen.getByText('Azure Security (alternatives: AWS Security Hub/GuardDuty)')).toBeInTheDocument()
    expect(screen.getByText('CI/CD & SCM (alternatives: GitLab CI, CircleCI, Flux CD)')).toBeInTheDocument()
    expect(screen.getByText('AI DevOps Tools')).toBeInTheDocument()
    expect(screen.getByText('DevSecOps')).toBeInTheDocument()
    expect(screen.getByText('Scripting (alternative: PowerShell)')).toBeInTheDocument()
    expect(screen.getByText('System Design')).toBeInTheDocument()
    expect(screen.getByText('Azure Solutions Architect')).toBeInTheDocument()
    expect(screen.getByText('Platform Engineering')).toBeInTheDocument()
    expect(screen.getByText('SRE')).toBeInTheDocument()
  })

  it('adds a new top-level topic', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByPlaceholderText('Add a new top-level topic (e.g. Kubernetes)...'))
    const input = screen.getByPlaceholderText('Add a new top-level topic (e.g. Kubernetes)...')
    fireEvent.change(input, { target: { value: 'Kubernetes' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getByText('Kubernetes')).toBeInTheDocument())
  })

  it('adds a sub-topic under an existing topic', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByText('Docker (alternatives: Podman, containerd, rkt)'))
    const dockerRow = screen.getByText('Docker (alternatives: Podman, containerd, rkt)').closest('.study-flow-node')
    fireEvent.click(within(dockerRow).getByTitle('Add sub-topic'))
    const childInput = screen.getByPlaceholderText('New sub-topic...')
    fireEvent.change(childInput, { target: { value: 'Networking Drivers' } })
    fireEvent.click(screen.getByText('Add', { selector: '.study-flow-add-node button' }))
    await waitFor(() => expect(screen.getByText('Networking Drivers')).toBeInTheDocument())
  })

  it('renames a topic', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByText('Linux'))
    const linuxRow = screen.getByText('Linux').closest('.study-flow-node')
    fireEvent.click(within(linuxRow).getByTitle('Rename'))
    const editInput = screen.getByDisplayValue('Linux')
    fireEvent.change(editInput, { target: { value: 'Linux Fundamentals' } })
    fireEvent.click(screen.getByText('✓'))
    await waitFor(() => expect(screen.getByText('Linux Fundamentals')).toBeInTheDocument())
  })

  it('collapses a topic so its children are hidden, then expands it again', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByText('Docker (alternatives: Podman, containerd, rkt)'))
    expect(screen.getByText('Multistage builds')).toBeInTheDocument()
    const dockerRow = screen.getByText('Docker (alternatives: Podman, containerd, rkt)').closest('.study-flow-node')
    fireEvent.click(within(dockerRow).getByText('▾'))
    await waitFor(() => expect(screen.queryByText('Multistage builds')).not.toBeInTheDocument())
    fireEvent.click(within(dockerRow).getByText('▸'))
    await waitFor(() => expect(screen.getByText('Multistage builds')).toBeInTheDocument())
  })

  it('deletes a topic and its sub-topics', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByText('Docker (alternatives: Podman, containerd, rkt)'))
    const dockerRow = screen.getByText('Docker (alternatives: Podman, containerd, rkt)').closest('.study-flow-node')
    fireEvent.click(within(dockerRow).getByTitle('Delete'))
    await waitFor(() =>
      expect(screen.queryByText('Docker (alternatives: Podman, containerd, rkt)')).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Multistage builds')).not.toBeInTheDocument()
  })

  it('reset restores default topics after a custom add', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByPlaceholderText('Add a new top-level topic (e.g. Kubernetes)...'))
    const input = screen.getByPlaceholderText('Add a new top-level topic (e.g. Kubernetes)...')
    fireEvent.change(input, { target: { value: 'Custom Topic XYZ' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getByText('Custom Topic XYZ')).toBeInTheDocument())
    fireEvent.click(screen.getByText('⟲ Reset to defaults'))
    await waitFor(() => expect(screen.queryByText('Custom Topic XYZ')).not.toBeInTheDocument())
    expect(screen.getByText('Linux')).toBeInTheDocument()
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
