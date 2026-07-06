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
  it('shows all 8 tabs', async () => {
    await unlockApp()
    const tabLabels = [...document.querySelectorAll('.main-tab')].map((t) => t.textContent)
    expect(tabLabels).toEqual([
      'Home',
      'Daily',
      'Study Tracking',
      'Revision',
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
    fireEvent.click(screen.getByText('Study Tracking', { selector: '.nc-title' }))
    await waitFor(() => expect(screen.getByText('Study Mindmap')).toBeInTheDocument())
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
})

describe('Study Tracking tab', () => {
  it('renders one mindmap section per top-level topic', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    // Each top-level topic renders as both a card heading and an interactive root
    // node inside its own canvas — assert the section heading (h2) for those, and
    // plain text for leaf sub-topics (which only appear once).
    await waitFor(() => expect(screen.getAllByText('Linux', { selector: 'h2' }).length).toBe(1))
    expect(screen.getAllByText('Docker (alternatives: Podman, containerd, rkt)', { selector: 'h2' }).length).toBe(1)
    expect(screen.getByText('Multistage builds')).toBeInTheDocument()
    expect(screen.getByText('Docker Compose')).toBeInTheDocument()
    expect(screen.getByText('Volumes')).toBeInTheDocument()
    expect(screen.getAllByText('Networking').length).toBeGreaterThan(0)
    expect(screen.getByText('Images')).toBeInTheDocument()
    expect(screen.getByText('Registries')).toBeInTheDocument()
    expect(screen.getAllByText('Kubernetes (alternatives: Docker Swarm, Nomad, OpenShift, ECS)', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('Helm (alternatives: Kustomize, Helmfile)', { selector: 'h2' }).length).toBe(1)
    expect(
      screen.getAllByText('Terraform & Terragrunt (alternatives: Pulumi, CloudFormation, Bicep, Ansible)', {
        selector: 'h2',
      }).length,
    ).toBe(1)
    expect(screen.getAllByText('Service Mesh (Istio, Linkerd, Consul)', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('Azure Security (alternatives: AWS Security Hub/GuardDuty)', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('CI/CD & SCM (alternatives: GitLab CI, CircleCI, Flux CD)', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('AI DevOps Tools', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('DevSecOps', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('Scripting (alternative: PowerShell)', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('System Design', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('Azure Solutions Architect', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('Platform Engineering', { selector: 'h2' }).length).toBe(1)
    expect(screen.getAllByText('SRE', { selector: 'h2' }).length).toBe(1)
  })

  it('adds a new section (top-level topic)', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByPlaceholderText('Add a new section (e.g. Kubernetes)...'))
    const input = screen.getByPlaceholderText('Add a new section (e.g. Kubernetes)...')
    fireEvent.change(input, { target: { value: 'New Section XYZ' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getAllByText('New Section XYZ', { selector: 'h2' }).length).toBe(1))
  })

  it('adds a sub-topic under an existing topic', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByTitle('Docker (alternatives: Podman, containerd, rkt)'))
    const dockerRow = screen.getByTitle('Docker (alternatives: Podman, containerd, rkt)').closest('.study-flow-node')
    fireEvent.click(within(dockerRow).getByTitle('Add sub-topic'))
    const childInput = screen.getByPlaceholderText('New sub-topic...')
    fireEvent.change(childInput, { target: { value: 'Networking Drivers' } })
    fireEvent.click(screen.getByText('Add', { selector: '.study-flow-add-node button' }))
    await waitFor(() => expect(screen.getByText('Networking Drivers')).toBeInTheDocument())
  })

  it('renames a topic', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByTitle('Linux'))
    const linuxRow = screen.getByTitle('Linux').closest('.study-flow-node')
    fireEvent.click(within(linuxRow).getByTitle('Rename'))
    const editInput = screen.getByDisplayValue('Linux')
    fireEvent.change(editInput, { target: { value: 'Linux Fundamentals' } })
    fireEvent.click(screen.getByText('✓'))
    await waitFor(() => expect(screen.getByTitle('Linux Fundamentals')).toBeInTheDocument())
  })

  it('collapses a topic so its children are hidden, then expands it again', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByTitle('Docker (alternatives: Podman, containerd, rkt)'))
    expect(screen.getByText('Multistage builds')).toBeInTheDocument()
    const dockerRow = screen.getByTitle('Docker (alternatives: Podman, containerd, rkt)').closest('.study-flow-node')
    fireEvent.click(within(dockerRow).getByText('▾'))
    await waitFor(() => expect(screen.queryByText('Multistage builds')).not.toBeInTheDocument())
    fireEvent.click(within(dockerRow).getByText('▸'))
    await waitFor(() => expect(screen.getByText('Multistage builds')).toBeInTheDocument())
  })

  it('deletes a topic and its sub-topics', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByTitle('Docker (alternatives: Podman, containerd, rkt)'))
    const dockerRow = screen.getByTitle('Docker (alternatives: Podman, containerd, rkt)').closest('.study-flow-node')
    fireEvent.click(within(dockerRow).getByTitle('Delete'))
    await waitFor(() =>
      expect(screen.queryByTitle('Docker (alternatives: Podman, containerd, rkt)')).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Multistage builds')).not.toBeInTheDocument()
  })

  it('reset restores default topics after a custom add', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByPlaceholderText('Add a new section (e.g. Kubernetes)...'))
    const input = screen.getByPlaceholderText('Add a new section (e.g. Kubernetes)...')
    fireEvent.change(input, { target: { value: 'Custom Topic XYZ' } })
    fireEvent.click(screen.getByText('Add', { selector: '.add-row button' }))
    await waitFor(() => expect(screen.getAllByText('Custom Topic XYZ', { selector: 'h2' }).length).toBe(1))
    fireEvent.click(screen.getByText('⟲ Reset to defaults'))
    await waitFor(() => expect(screen.queryByText('Custom Topic XYZ')).not.toBeInTheDocument())
    expect(screen.getByTitle('Linux')).toBeInTheDocument()
  })

  it('selecting a section chip filters to just that mindmap, and multiple chips filter to a subset', async () => {
    await unlockApp()
    clickMainTab('Study Tracking')
    await waitFor(() => screen.getByText('Jump to a Section'))

    // Select just Linux -> only Linux section renders
    fireEvent.click(screen.getByText('Linux', { selector: '.study-topic-chip' }))
    await waitFor(() => expect(screen.getAllByText('Linux', { selector: 'h2' }).length).toBe(1))
    expect(screen.queryByText('Kubernetes (alternatives: Docker Swarm, Nomad, OpenShift, ECS)', { selector: 'h2' })).not.toBeInTheDocument()

    // Also select Kubernetes -> both sections render, others stay hidden
    fireEvent.click(
      screen.getByText('Kubernetes (alternatives: Docker Swarm, Nomad, OpenShift, ECS)', { selector: '.study-topic-chip' }),
    )
    await waitFor(() =>
      expect(
        screen.getAllByText('Kubernetes (alternatives: Docker Swarm, Nomad, OpenShift, ECS)', { selector: 'h2' }).length,
      ).toBe(1),
    )
    expect(screen.getAllByText('Linux', { selector: 'h2' }).length).toBe(1)
    expect(screen.queryByText('SRE', { selector: 'h2' })).not.toBeInTheDocument()

    // "Show all" clears the filter
    fireEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.getAllByText('SRE', { selector: 'h2' }).length).toBe(1))
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

  it('expands an empty module, adds a keyword and a Q&A pair via edit mode, and shows them in the read view', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Scripting'))
    fireEvent.click(screen.getByText('Scripting'))
    await waitFor(() => within(revMain()).getByText('Bash'))

    fireEvent.click(within(revMain()).getByText('Bash'))
    await waitFor(() => expect(within(revMain()).getByText('No notes yet — tap ✎ to add some.')).toBeInTheDocument())

    const moduleRow = within(revMain()).getByText('Bash').closest('.revision-module')
    fireEvent.click(within(moduleRow).getByText('✎'))

    await waitFor(() => screen.getByText('Save Changes'))
    const editRow = screen.getByText('Save Changes').closest('.revision-module')

    fireEvent.click(within(editRow).getByText('+ Add keyword'))
    fireEvent.change(within(editRow).getByPlaceholderText('Term'), { target: { value: 'set -euo pipefail' } })
    fireEvent.change(within(editRow).getByPlaceholderText('One-line description'), {
      target: { value: 'fail fast on errors, unset vars, and pipe failures' },
    })

    fireEvent.click(within(editRow).getByText('+ Add Q&A'))
    fireEvent.change(within(editRow).getByPlaceholderText('Question'), { target: { value: 'Why set -euo pipefail?' } })
    fireEvent.change(within(editRow).getByPlaceholderText('One-line answer'), {
      target: { value: 'Stops silent failures in scripts.' },
    })

    fireEvent.click(within(editRow).getByText('Save Changes'))

    await waitFor(() => expect(revMain().textContent).toContain('set -euo pipefail'))
    expect(revMain().textContent).toContain('Why set -euo pipefail?')
    expect(revMain().textContent).toContain('Stops silent failures in scripts.')
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
    await waitFor(() => within(revMain()).getByText('Bash'))
    const moduleRow = within(revMain()).getByText('Bash').closest('.revision-module')
    fireEvent.click(within(moduleRow).getByText('✕'))
    await waitFor(() => expect(within(revMain()).queryByText('Bash')).not.toBeInTheDocument())
  })

  it('filters modules in the main panel by search text, sidebar keeps the full list', async () => {
    await unlockApp()
    clickMainTab('Revision')
    await waitFor(() => screen.getByText('Kubernetes'))
    fireEvent.click(screen.getByText('Kubernetes'))
    await waitFor(() => within(revMain()).getByText('Ingress'))
    fireEvent.change(screen.getByPlaceholderText('Filter modules...'), { target: { value: 'ingress' } })
    await waitFor(() => expect(within(revMain()).queryByText('Pods')).not.toBeInTheDocument())
    expect(within(revMain()).getByText('Ingress')).toBeInTheDocument()
    // The sidebar tree stays a full, unfiltered index for navigation.
    expect(within(revSidebar()).getByText('Pods')).toBeInTheDocument()
  })
})

describe('Projects tab', () => {
  it('shows alert when saving without a name', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByText('New Project'))
    fireEvent.click(screen.getByText('Save Project'))
    expect(global.alert).toHaveBeenCalledWith('Give the project a name first.')
  })

  it('saves a project via the add modal and shows it as a card', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByText('New Project'))
    const nameInput = screen.getByPlaceholderText('Project name...')
    fireEvent.change(nameInput, { target: { value: 'Test Project' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => expect(screen.getByText('Test Project')).toBeInTheDocument())
    expect(screen.queryByText('New Project')).not.toBeInTheDocument()
  })

  it('captures architecture detail as plain text', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'Arch Project' } })
    // Modal field order: Name, Description, Tools Used, Concepts Covered, Architecture Detail.
    const fields = screen.getAllByRole('textbox')
    fireEvent.change(fields[4], { target: { value: 'Client -> API -> DB' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => screen.getByText('Arch Project'))
    expect(screen.getByText(/Client -> API -> DB/)).toBeInTheDocument()
  })

  it('modify then save changes updates the title', async () => {
    await unlockApp()
    clickMainTab('Projects')
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
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
    await waitFor(() => screen.getByText('+ Add Project'))
    fireEvent.click(screen.getByText('+ Add Project'))
    await waitFor(() => screen.getByPlaceholderText('Project name...'))
    fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'ToDelete' } })
    fireEvent.click(screen.getByText('Save Project'))
    await waitFor(() => screen.getByText('ToDelete'))
    fireEvent.click(screen.getByText('✕ Delete'))
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
