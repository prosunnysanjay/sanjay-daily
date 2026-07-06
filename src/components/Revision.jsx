import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'
import Modal from './Modal'

const undoStack = makeUndoStack(20)
const BLANK_SUBJECT = { name: '', icon: '🗂️' }
const BLANK_MODULE = { title: '' }

function kw(term, desc) {
  return { id: uid('kw'), term, desc }
}

function qaPair(q, a) {
  return { id: uid('qa'), q, a }
}

function blankModule(title) {
  return { id: uid('mod'), title, keywords: [], qa: [] }
}

function fullModule(title, keywords, qaList) {
  return { id: uid('mod'), title, keywords, qa: qaList }
}

function subject(icon, name, moduleTitles) {
  return { id: uid('subj'), icon, name, modules: moduleTitles.map(blankModule) }
}

function dockerSubject() {
  return {
    id: uid('subj'),
    icon: '🐳',
    name: 'Docker',
    modules: [
      fullModule(
        'Docker Architecture',
        [
          kw('Docker Client', 'CLI, talks to dockerd via REST over unix socket/TCP'),
          kw('Docker Daemon (dockerd)', "manages images/containers/networks/volumes, exposes REST API"),
          kw('containerd', 'container lifecycle manager (pull, unpack, start/stop); CRI-compliant'),
          kw('runc', 'OCI runtime; creates namespaces/cgroups and execs the process'),
          kw('containerd-shim', 'parent of container process; survives dockerd restart'),
          kw('Namespaces', 'pid, net, mnt, uts, ipc, user — process isolation'),
          kw('cgroups', 'CPU/memory/IO limits & accounting'),
          kw('OCI', 'image-spec + runtime-spec standard; enables Docker/Podman/containerd interop'),
          kw('Image', 'read-only layers + config, immutable, content-addressable'),
          kw('Container', 'image + writable layer + runtime state'),
        ],
        [
          qaPair('What talks to what on `docker run`?', 'CLI → dockerd → containerd → runc (via shim).'),
          qaPair('Why was dockershim removed from k8s?', "Docker isn't CRI-native, redundant layer, no functional benefit."),
          qaPair('Container vs VM isolation?', 'Shared kernel (namespaces/cgroups) vs separate kernel (hypervisor).'),
          qaPair('Image vs container?', 'Image = immutable layers; container = image + writable layer + runtime state.'),
        ],
      ),
      fullModule(
        'Dockerfile',
        [
          kw('Layer per instruction', 'cached, invalidated by any earlier change'),
          kw('Cache order', 'stable steps (deps) before volatile ones (COPY src)'),
          kw('Multistage', 'FROM x AS build → COPY --from=build, keep only runtime artifacts'),
          kw('non-root', 'USER appuser, never root in prod'),
          kw('distroless / scratch', 'minimal final image, no shell/package manager, smaller CVE surface'),
          kw('BuildKit cache mount', '--mount=type=cache for dep caches'),
          kw('BuildKit secret mount', '--mount=type=secret, never persisted to a layer'),
          kw('COPY vs ADD', 'COPY explicit only; ADD auto-extracts tar/fetches URLs (avoid)'),
          kw('--target', 'build/debug a specific stage'),
          kw('HEALTHCHECK', 'container-level liveness instruction'),
        ],
        [
          qaPair('2-line change, 10-min rebuild — why?', 'Invalidated an early cache layer.'),
          qaPair('Keep secrets out of image history?', 'BuildKit secret mount, not ARG/ENV.'),
          qaPair('Multistage vs `rm -rf` cleanup?', "rm doesn't shrink image, bytes stay in earlier layer."),
        ],
      ),
      fullModule(
        'Volumes',
        [
          kw('Named volume', 'Docker-managed, /var/lib/docker/volumes, survives container removal'),
          kw('Bind mount', 'host path → container path, exact host permissions/UID'),
          kw('tmpfs', 'RAM-only, gone on stop, for secrets/scratch'),
          kw('--mount', 'preferred over -v (explicit, fails loudly on typos)'),
          kw('docker volume prune', 'removes unreferenced volumes, real data-loss risk'),
          kw('Anonymous volumes', 'VOLUME in Dockerfile, easy to orphan'),
        ],
        [
          qaPair('"Permission denied" on a bind mount?', 'Host file UID ≠ container process UID.'),
          qaPair('When use tmpfs?', 'Data that must never touch disk.'),
          qaPair('Does `docker rm` delete a named volume?', 'No, only -v flag or explicit `volume rm`.'),
        ],
      ),
      fullModule(
        'Networking',
        [
          kw('bridge (default)', 'private subnet + NAT via iptables'),
          kw('Default bridge', 'no name-based DNS; always use a user-defined bridge'),
          kw('host', 'shares host netns, no isolation, max perf'),
          kw('none', 'fully isolated'),
          kw('overlay', 'multi-host (Swarm), VXLAN'),
          kw('macvlan', 'container gets own MAC/IP on physical LAN'),
          kw('-p host:container', 'binds 0.0.0.0 by default if host IP omitted'),
          kw('Embedded DNS', '127.0.0.11 inside container, resolves names on user-defined nets'),
        ],
        [
          qaPair("Container can't reach another by name?", 'Likely default bridge (no DNS) — use a user-defined network.'),
          qaPair('Risk of `host` mode?', 'No port isolation, compromised container sees all host interfaces.'),
          qaPair('Why did `-p 8080:80` expose to the internet?', 'No host IP = binds 0.0.0.0, all interfaces.'),
        ],
      ),
      fullModule(
        'Storage Drivers',
        [
          kw('overlay2', 'default driver, union mount of image layers'),
          kw('lowerdir/upperdir/workdir', 'read-only layers / writable layer / overlay bookkeeping'),
          kw('Copy-on-write', 'write to a file in a lower layer copies it up to upperdir first'),
          kw('Whiteout files', "mark 'deleted' files without removing lower-layer bytes"),
          kw('Write-heavy workloads (DBs)', 'use volumes, not container fs'),
        ],
        [
          qaPair('Why is writing a large file in-container slow the first time?', 'Copy-on-write copies the whole file up first.'),
          qaPair('Does deleting a file in-container shrink the image?', 'No, whiteout hides it, bytes remain in the layer.'),
        ],
      ),
      fullModule(
        'Docker Compose',
        [
          kw('Compose V2', 'docker compose (Go plugin), replaced old Python docker-compose'),
          kw('depends_on', 'start order only, NOT readiness'),
          kw('condition: service_healthy', 'real readiness gate, needs a healthcheck'),
          kw('Auto network', 'one user-defined bridge per project, free DNS by service name'),
          kw('--profile', 'start subsets of services'),
          kw('Multiple files merge', '-f base.yml -f prod.yml'),
          kw('Not for prod at scale', 'single host, no rolling deploys/failover'),
        ],
        [
          qaPair('App crashes on start despite `depends_on: db`?', 'depends_on ≠ readiness; add a healthcheck.'),
          qaPair('Compose in production?', 'Fine for single host/low scale only.'),
          qaPair('Edited Dockerfile, `up` shows old image?', "up doesn't rebuild automatically, needs --build."),
        ],
      ),
      fullModule(
        'Registries',
        [
          kw('Tag vs digest', 'tag = mutable pointer; digest (sha256:...) = immutable, pin for reproducibility'),
          kw('Docker Hub', 'rate-limits anonymous/free pulls per IP'),
          kw('Private registries', 'ECR, GCR, ACR, Harbor, GHCR'),
          kw('Image signing', 'cosign/Sigstore (modern, keyless) vs Docker Content Trust (older)'),
          kw('Scanning', 'Trivy/Grype/Snyk in CI, or registry-native scan-on-push'),
          kw('Multi-arch', 'manifest list via buildx --platform ... --push'),
        ],
        [
          qaPair("Why isn't a version tag fully reproducible?", 'Tags are mutable, can be re-pushed; pin by digest.'),
          qaPair('Stop a vulnerable image reaching prod?', 'CI scan gate + registry scan + admission policy.'),
          qaPair('Cosign vs Content Trust?', 'Cosign — registry-agnostic, keyless, modern standard.'),
        ],
      ),
      fullModule(
        'Resource Limits & Security',
        [
          kw('--memory, --cpus', 'map to cgroups limits'),
          kw('Exceed memory limit', 'OOM killer SIGKILLs process → exit code 137'),
          kw('Hardening', 'non-root USER, --cap-drop=ALL + add back only what\'s needed, --read-only rootfs, keep default seccomp'),
          kw('--privileged', 'avoid, near-full host access; use --device/--cap-add instead'),
          kw('Rootless Docker', 'daemon itself unprivileged, smaller blast radius'),
          kw('cgroups v2', 'unified hierarchy, better memory pressure accounting (PSI), now default'),
        ],
        [
          qaPair('Exit code 137?', 'OOM killer SIGKILL for exceeding the memory limit.'),
          qaPair('Harden a container beyond non-root?', 'cap-drop=ALL, read-only rootfs, seccomp on, no --privileged.'),
          qaPair('Why avoid `--privileged`?', 'Removes almost all isolation.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('docker build -t name:tag .', 'build image'),
          kw('docker run -d --name x -p 8080:80 image', 'run detached, mapped port'),
          kw('docker exec -it x sh', 'shell into running container'),
          kw('docker logs -f x', 'follow logs'),
          kw('docker ps -a', 'list all containers (incl. stopped)'),
          kw('docker images / image prune -a', 'list / clean unused images'),
          kw('docker inspect x', 'full JSON metadata (mounts, network, env)'),
          kw('docker system df / prune -a --volumes', 'disk usage / full cleanup'),
          kw('docker network ls / inspect', 'networks'),
          kw('docker volume ls / prune', 'volumes'),
          kw('docker stats', 'live resource usage'),
          kw('docker history image', 'layer breakdown'),
          kw('docker buildx build --platform ... --push', 'multi-arch build + push'),
          kw('docker save / load', 'export/import image as tarball'),
          kw('docker compose up -d --build', 'build & run stack'),
        ],
        [],
      ),
      fullModule(
        'Docker Alternatives',
        [
          kw('Podman', 'daemonless, rootless-by-default, Docker-CLI-compatible, has a pod concept'),
          kw('containerd', 'lower-level runtime, what k8s CRI actually talks to'),
          kw('CRI-O', 'minimal, k8s-only runtime'),
          kw('Buildah', 'build-only, no daemon, scriptable builds without a Dockerfile'),
          kw('nerdctl', 'Docker-CLI-compatible frontend for containerd'),
          kw('LXC/LXD', 'OS-level (full-system) containers, different use case'),
          kw('gVisor / Kata / Firecracker', 'sandboxed/microVM isolation for hostile multi-tenant workloads'),
        ],
        [
          qaPair('Podman vs Docker, key difference?', 'Daemonless & rootless by default.'),
          qaPair('What does k8s actually use today?', 'containerd or CRI-O, not Docker.'),
          qaPair('When use gVisor/Kata?', 'Untrusted multi-tenant workloads needing stronger isolation.'),
        ],
      ),
    ],
  }
}

function defaultData() {
  return {
    subjects: [
      subject('🐧', 'Linux', [
        'Overview',
        'Boot process',
        'Filesystem & permissions',
        'Process management',
        'Networking (ip, netstat, ss)',
        'Systemd & services',
        'Package management',
        'Shell scripting basics',
        'Performance troubleshooting (top, iostat, vmstat)',
        'Logs (journalctl, /var/log)',
        'SSH & security hardening',
      ]),
      dockerSubject(),
      subject('☸️', 'Kubernetes', [
        'Overview',
        'Pods',
        'Deployments',
        'StatefulSets',
        'DaemonSets',
        'Services',
        'Ingress',
        'ConfigMaps & Secrets',
        'RBAC',
        'NetworkPolicies',
        'HPA/VPA',
        'CRDs & Operators',
        'Scheduling & affinity',
        'Troubleshooting',
      ]),
      subject('⎈', 'Helm', [
        'Overview',
        'Charts',
        'Values',
        'Templates',
        'Hooks',
        'Repositories',
        'Alternatives (Kustomize, Helmfile)',
      ]),
      subject('🌍', 'Terraform & Terragrunt', [
        'Overview',
        'State management',
        'Modules',
        'Providers',
        'Workspaces',
        'DRY patterns (Terragrunt)',
        'Import & drift detection',
      ]),
      subject('🕸️', 'Service Mesh', ['Overview', 'Sidecars', 'Traffic management', 'mTLS', 'Observability integration']),
      subject('📊', 'Observability', [
        'Overview',
        'Metrics (Prometheus)',
        'Logs (ELK/EFK)',
        'Traces',
        'Alerting',
        'SLOs & dashboards (Grafana)',
      ]),
      subject('☁️', 'Azure', ['Overview', 'Compute', 'Networking', 'Identity (Entra ID)', 'Storage', 'Governance (CAF/ALZ)']),
      subject('🛡️', 'Azure Security', [
        'Overview',
        'Defender for Cloud',
        'Sentinel',
        'Key Vault',
        'Policy',
        'RBAC',
        'Conditional Access',
      ]),
      subject('🔁', 'CI/CD & SCM', ['Overview', 'Git', 'GitHub Actions', 'Jenkins', 'Azure DevOps', 'ArgoCD/GitOps']),
      subject('🤖', 'AI DevOps Tools', ['Overview', 'Coding assistants', 'AI infra/ops tools', 'Vector DBs']),
      subject('🔐', 'DevSecOps', [
        'Overview',
        'OWASP Top 10',
        'SAST (SonarQube, Semgrep)',
        'SCA (Snyk, Dependabot)',
        'DAST (OWASP ZAP)',
        'Container scanning (Trivy)',
        'IaC scanning (Checkov, tfsec)',
        'K8s security (Kube-bench, Falco)',
      ]),
      subject('📜', 'Scripting', ['Overview', 'Bash', 'Python', 'PowerShell']),
      subject('🏗️', 'System Design', ['Overview', 'Scalability', 'Load balancing', 'Caching', 'CAP theorem', 'Database sharding']),
      subject('🏛️', 'Azure Solutions Architect', [
        'Overview',
        'Well-architected framework',
        'Landing zones',
        'DR/HA design',
      ]),
      subject('🛠️', 'Platform Engineering', ['Overview', 'Internal developer platforms', 'Golden paths', 'Backstage']),
      subject('🚨', 'SRE', ['Overview', 'SLI/SLO/SLA', 'Error budgets', 'Incident management', 'Chaos engineering']),
    ],
  }
}

function normalizeModule(m) {
  return {
    id: m.id,
    title: m.title,
    keywords: Array.isArray(m.keywords) ? m.keywords : [],
    qa: Array.isArray(m.qa) ? m.qa : [],
  }
}

export function countModules(subjects) {
  return (subjects || []).reduce((sum, s) => sum + (s.modules ? s.modules.length : 0), 0)
}

export default function Revision({ flashSaved }) {
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sidebarExpanded, setSidebarExpanded] = useState({})
  const [expanded, setExpanded] = useState({})
  const [scrollTarget, setScrollTarget] = useState(null)
  const [search, setSearch] = useState('')
  const [editingModuleId, setEditingModuleId] = useState(null)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [editingSubjectId, setEditingSubjectId] = useState(null)
  const [subjectForm, setSubjectForm] = useState({ ...BLANK_SUBJECT })
  const [showAddModuleModal, setShowAddModuleModal] = useState(false)
  const [moduleForm, setModuleForm] = useState({ ...BLANK_MODULE })

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!scrollTarget) return
    const el = document.getElementById(`revision-module-${scrollTarget}`)
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setScrollTarget(null)
  }, [scrollTarget])

  async function load() {
    let loaded = defaultData()
    let needsPersist = false
    try {
      const result = await storageGet(STORAGE_KEYS.revision)
      if (result && result.value) loaded = JSON.parse(result.value)
      else needsPersist = true
    } catch {
      needsPersist = true
    }

    // One-time migration: subjects seeded before the keyword/Q&A format existed
    // (or before a subject's content was rewritten, like Docker) still carry the
    // old module list — swap in the current content for any subject we recognize.
    const dockerIdx = loaded.subjects.findIndex((s) => s.name === 'Docker')
    if (dockerIdx !== -1 && !loaded.subjects[dockerIdx].modules.some((m) => m.title === 'Docker Architecture')) {
      loaded.subjects[dockerIdx] = { ...loaded.subjects[dockerIdx], modules: dockerSubject().modules }
      needsPersist = true
    }

    loaded.subjects.forEach((s) => {
      s.modules = s.modules.map(normalizeModule)
    })

    if (needsPersist) await persist(loaded)
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.revision, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Revision save failed', e)
    }
  }

  function update(mutator, { snapshot = true } = {}) {
    setData((prev) => {
      if (snapshot) undoStack.push(prev)
      const next = structuredClone(prev)
      mutator(next)
      persist(next)
      return next
    })
  }

  function handleUndo() {
    if (!undoStack.canUndo()) {
      alert('Nothing to undo yet.')
      return
    }
    const prev = undoStack.pop()
    setEditingModuleId(null)
    setData(prev)
    persist(prev)
  }

  if (!data) return <div className="empty-state-sm">Loading…</div>

  const selectedSubject = data.subjects.find((s) => s.id === selectedId) || null

  function openAddSubjectModal() {
    setEditingSubjectId(null)
    setSubjectForm({ ...BLANK_SUBJECT })
    setShowSubjectModal(true)
  }

  function openEditSubjectModal(s) {
    setEditingSubjectId(s.id)
    setSubjectForm({ name: s.name, icon: s.icon })
    setShowSubjectModal(true)
  }

  function closeSubjectModal() {
    setShowSubjectModal(false)
  }

  function saveSubjectForm() {
    if (!subjectForm.name.trim()) {
      alert('Give the subject a name first.')
      return
    }
    if (editingSubjectId) {
      update((d) => {
        const s = d.subjects.find((x) => x.id === editingSubjectId)
        Object.assign(s, subjectForm)
      })
    } else {
      update((d) => {
        d.subjects.push({ id: uid('subj'), ...subjectForm, modules: [] })
      })
    }
    setShowSubjectModal(false)
  }

  function deleteSubject(id, name) {
    if (!confirm(`Delete "${name || 'this subject'}" and all its modules?`)) return
    update((d) => {
      d.subjects = d.subjects.filter((s) => s.id !== id)
    })
    if (selectedId === id) setSelectedId(null)
  }

  function reorderSubjects(fromIdx, toIdx) {
    update((d) => {
      d.subjects = reorderArray(d.subjects, fromIdx, toIdx)
    })
  }

  function toggleSidebarSubject(id) {
    setSidebarExpanded((e) => ({ ...e, [id]: !e[id] }))
  }

  function selectSubject(id) {
    setSelectedId(id)
    setSearch('')
    setSidebarExpanded((e) => ({ ...e, [id]: true }))
  }

  function jumpToModule(subjectId, moduleId) {
    setSelectedId(subjectId)
    setSearch('')
    setSidebarExpanded((e) => ({ ...e, [subjectId]: true }))
    setExpanded((e) => ({ ...e, [moduleId]: true }))
    setScrollTarget(moduleId)
  }

  function openAddModuleModal() {
    setModuleForm({ ...BLANK_MODULE })
    setShowAddModuleModal(true)
  }

  function closeAddModuleModal() {
    setShowAddModuleModal(false)
  }

  function saveNewModule() {
    if (!moduleForm.title.trim()) {
      alert('Give the module a title first.')
      return
    }
    update((d) => {
      const s = d.subjects.find((x) => x.id === selectedId)
      s.modules.push({ id: uid('mod'), title: moduleForm.title, keywords: [], qa: [] })
    })
    setShowAddModuleModal(false)
  }

  function startEditModule(id) {
    undoStack.push(data)
    setEditingModuleId(id)
    setExpanded((e) => ({ ...e, [id]: true }))
  }

  function cancelEditModule() {
    setEditingModuleId(null)
    load() // discard unsaved edits by reloading from storage
  }

  function saveEditModule() {
    setEditingModuleId(null)
    persist(data)
  }

  function patchModule(moduleId, patch) {
    setData((prev) => {
      const next = structuredClone(prev)
      const s = next.subjects.find((x) => x.id === selectedId)
      const m = s.modules.find((x) => x.id === moduleId)
      Object.assign(m, patch)
      return next
    })
  }

  function deleteModule(id, title) {
    if (!confirm(`Delete "${title || 'this module'}"?`)) return
    update((d) => {
      const s = d.subjects.find((x) => x.id === selectedId)
      s.modules = s.modules.filter((m) => m.id !== id)
    })
  }

  function reorderModules(fromIdx, toIdx) {
    update((d) => {
      const s = d.subjects.find((x) => x.id === selectedId)
      s.modules = reorderArray(s.modules, fromIdx, toIdx)
    })
  }

  function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }))
  }

  const filteredModules = selectedSubject
    ? selectedSubject.modules
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => !search.trim() || m.title.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  return (
    <div className="revision-layout">
      {showSubjectModal && (
        <Modal title={editingSubjectId ? 'Rename Subject' : 'New Subject'} onClose={closeSubjectModal}>
          <div className="project-field">
            <label className="field-label">Icon (emoji)</label>
            <input
              type="text"
              className="text-input"
              style={{ maxWidth: 80 }}
              value={subjectForm.icon}
              onChange={(e) => setSubjectForm((f) => ({ ...f, icon: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Subject Name</label>
            <input
              type="text"
              className="text-input"
              value={subjectForm.name}
              onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ansible"
            />
          </div>
          <div className="add-zone-save-row">
            <button className="btn-outline" onClick={closeSubjectModal}>
              Cancel
            </button>
            <button className="btn" onClick={saveSubjectForm}>
              Save
            </button>
          </div>
        </Modal>
      )}

      <aside className="revision-sidebar">
        <div className="revision-sidebar-toolbar">
          <button className="btn-outline" onClick={handleUndo}>
            ↺ Undo
          </button>
          <button className="add-trigger-btn" onClick={openAddSubjectModal}>
            + Add Subject
          </button>
        </div>

        {data.subjects.length === 0 && <div className="empty-state-sm">No subjects yet.</div>}

        <div className="revision-tree">
          {data.subjects.map((s, idx) => (
            <div key={s.id} {...dragHandlers(idx, reorderSubjects)}>
              <div className={`revision-tree-subject ${s.id === selectedId ? 'active' : ''}`}>
                <div className="revision-tree-subject-main" onClick={() => selectSubject(s.id)}>
                  <span
                    className="revision-tree-caret"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSidebarSubject(s.id)
                    }}
                  >
                    {sidebarExpanded[s.id] ? '▾' : '▸'}
                  </span>
                  <span className="revision-tree-icon">{s.icon}</span>
                  <span className="revision-tree-name">{s.name}</span>
                </div>
                <div className="revision-tree-actions">
                  <span className="drag-handle">⠿</span>
                  <button
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditSubjectModal(s)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="danger"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSubject(s.id, s.name)
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {sidebarExpanded[s.id] && (
                <div className="revision-tree-modules">
                  {s.modules.length === 0 && <div className="revision-tree-module-empty">No modules</div>}
                  {s.modules.map((m) => (
                    <div
                      key={m.id}
                      className={`revision-tree-module ${s.id === selectedId && expanded[m.id] ? 'active' : ''}`}
                      onClick={() => jumpToModule(s.id, m.id)}
                    >
                      {m.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="revision-main">
        {!selectedSubject && (
          <div className="empty-state-sm">Pick a subject on the left to start revising.</div>
        )}

        {selectedSubject && (
          <>
            <div className="revision-header">
              <div className="revision-subject-title">
                <span>{selectedSubject.icon}</span>
                <span>{selectedSubject.name}</span>
              </div>
              <input
                type="text"
                className="text-input revision-search"
                placeholder="Filter modules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="add-trigger-btn" onClick={openAddModuleModal}>
                + Add Module
              </button>
            </div>

            {showAddModuleModal && (
              <Modal title="New Module" onClose={closeAddModuleModal}>
                <div className="project-field">
                  <label className="field-label">Title</label>
                  <input
                    type="text"
                    className="text-input"
                    value={moduleForm.title}
                    onChange={(e) => setModuleForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Ingress"
                  />
                </div>
                <div className="add-zone-save-row">
                  <button className="btn-outline" onClick={closeAddModuleModal}>
                    Cancel
                  </button>
                  <button className="btn" onClick={saveNewModule}>
                    Save Module
                  </button>
                </div>
              </Modal>
            )}

            {selectedSubject.modules.length === 0 && (
              <div className="empty-state-sm">No modules yet — tap "+ Add Module" above.</div>
            )}
            {selectedSubject.modules.length > 0 && filteredModules.length === 0 && (
              <div className="empty-state-sm">No modules match "{search}".</div>
            )}

            {filteredModules.map(({ m, idx }) =>
              editingModuleId === m.id ? (
                <ModuleEditCard
                  key={m.id}
                  mod={m}
                  onPatch={(patch) => patchModule(m.id, patch)}
                  onCancel={cancelEditModule}
                  onSave={saveEditModule}
                />
              ) : (
                <ModuleCard
                  key={m.id}
                  mod={m}
                  index={idx}
                  expanded={!!expanded[m.id]}
                  onToggle={() => toggleExpand(m.id)}
                  onModify={() => startEditModule(m.id)}
                  onDelete={() => deleteModule(m.id, m.title)}
                  onReorder={reorderModules}
                />
              ),
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ModuleCard({ mod, index, expanded, onToggle, onModify, onDelete, onReorder }) {
  const keywords = mod.keywords || []
  const qaList = mod.qa || []
  const hasContent = keywords.length > 0 || qaList.length > 0
  return (
    <div id={`revision-module-${mod.id}`} className="revision-module" {...dragHandlers(index, onReorder)}>
      <div className="revision-module-head" onClick={onToggle}>
        <span className="drag-handle" onClick={(e) => e.stopPropagation()}>
          ⠿
        </span>
        <span className={`revision-module-chevron ${expanded ? 'open' : ''}`}>▸</span>
        <span className="revision-module-title">{mod.title}</span>
        <div className="revision-module-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={onModify}>✎</button>
          <button className="danger" onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>
      {expanded && (
        <div className="revision-module-body">
          {!hasContent && <div className="empty-state-sm">No notes yet — tap ✎ to add some.</div>}
          {keywords.length > 0 && (
            <div className="revision-kw-list">
              {keywords.map((k) => (
                <div key={k.id} className="revision-kw-row">
                  <span className="revision-kw-term">{k.term}</span>
                  <span className="revision-kw-desc">{k.desc}</span>
                </div>
              ))}
            </div>
          )}
          {qaList.length > 0 && (
            <div className="revision-qa-block">
              <div className="revision-qa-label">Interview Q&amp;A</div>
              {qaList.map((item) => (
                <div key={item.id} className="revision-qa-row">
                  <span className="revision-qa-q">Q:</span> {item.q} <span className="revision-qa-arrow">→</span>{' '}
                  <span className="revision-qa-a">{item.a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModuleEditCard({ mod, onPatch, onCancel, onSave }) {
  const keywords = mod.keywords || []
  const qaList = mod.qa || []

  function updateKeyword(idx, field, value) {
    onPatch({ keywords: keywords.map((k, i) => (i === idx ? { ...k, [field]: value } : k)) })
  }
  function addKeyword() {
    onPatch({ keywords: [...keywords, { id: uid('kw'), term: '', desc: '' }] })
  }
  function removeKeyword(idx) {
    onPatch({ keywords: keywords.filter((_, i) => i !== idx) })
  }

  function updateQa(idx, field, value) {
    onPatch({ qa: qaList.map((item, i) => (i === idx ? { ...item, [field]: value } : item)) })
  }
  function addQa() {
    onPatch({ qa: [...qaList, { id: uid('qa'), q: '', a: '' }] })
  }
  function removeQa(idx) {
    onPatch({ qa: qaList.filter((_, i) => i !== idx) })
  }

  return (
    <div className="revision-module" style={{ border: '1.5px solid var(--accent)', padding: '14px' }}>
      <div className="project-field">
        <label className="field-label">Title</label>
        <input className="text-input" style={{ fontWeight: 700 }} value={mod.title || ''} onChange={(e) => onPatch({ title: e.target.value })} />
      </div>

      <div className="project-field">
        <label className="field-label">Keywords</label>
        {keywords.map((k, idx) => (
          <div key={k.id} className="revision-kw-edit-row">
            <input
              className="text-input revision-kw-term-input"
              placeholder="Term"
              value={k.term}
              onChange={(e) => updateKeyword(idx, 'term', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="One-line description"
              value={k.desc}
              onChange={(e) => updateKeyword(idx, 'desc', e.target.value)}
            />
            <button className="del-x" onClick={() => removeKeyword(idx)}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn-outline revision-add-row-btn" onClick={addKeyword}>
          + Add keyword
        </button>
      </div>

      <div className="project-field">
        <label className="field-label">Interview Q&amp;A</label>
        {qaList.map((item, idx) => (
          <div key={item.id} className="revision-qa-edit-row">
            <input className="text-input" placeholder="Question" value={item.q} onChange={(e) => updateQa(idx, 'q', e.target.value)} />
            <input className="text-input" placeholder="One-line answer" value={item.a} onChange={(e) => updateQa(idx, 'a', e.target.value)} />
            <button className="del-x" onClick={() => removeQa(idx)}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn-outline revision-add-row-btn" onClick={addQa}>
          + Add Q&amp;A
        </button>
      </div>

      <div className="add-zone-save-row">
        <button className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" onClick={onSave}>
          Save Changes
        </button>
      </div>
    </div>
  )
}
