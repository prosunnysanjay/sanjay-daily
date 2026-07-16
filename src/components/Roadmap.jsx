import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'
import Modal from './Modal'

const undoStack = makeUndoStack(20)
const BLANK_PHASE = { title: '', timeframe: '' }

// Bumped whenever the curated default content changes. On load, a stored roadmap
// with an older version is refreshed to the latest defaults (see load()).
const ROADMAP_VERSION = 2

function step(title, detail) {
  return { id: uid('rms'), title, detail }
}

function phase(title, timeframe, steps) {
  return { id: uid('rmp'), title, timeframe, steps }
}

function defaultData() {
  return {
    version: ROADMAP_VERSION,
    phases: [
      phase('Phase 1 — Foundations & Fundamentals', 'Year 0-2', [
        step('Linux & OS internals', 'Processes, memory, filesystems, permissions, systemd, boot flow.'),
        step('Networking fundamentals', 'OSI/TCP-IP, DNS, HTTP/S, TLS, subnetting, load balancing.'),
        step('Programming', 'Python or Go (alt: Java, Rust, Node.js); clean, testable code.'),
        step('Scripting', 'Bash and Python; PowerShell for Windows/Azure (alt: Perl, Ruby).'),
        step('Version control', 'Git; GitHub / GitLab / Bitbucket; branching, rebasing, PRs.'),
        step('Data structures & algorithms', 'Enough to reason about performance, memory, and cost.'),
        step('CLI mastery', 'grep/sed/awk, jq, pipes, tmux, process and job control, dotfiles.'),
      ]),
      phase('Phase 2 — Core Systems & Web', 'Year 1-3', [
        step('Web servers & proxies', 'Nginx (alt: Apache, Caddy, HAProxy, Envoy, Traefik); reverse proxy, TLS.'),
        step('Relational databases', 'PostgreSQL, MySQL (alt: MariaDB, SQL Server, Oracle); indexes, transactions.'),
        step('NoSQL & caching', 'MongoDB, Redis (alt: Cassandra, DynamoDB, Memcached, Valkey).'),
        step('APIs', 'REST, gRPC, GraphQL; OAuth2 / JWT; rate limiting, versioning.'),
        step('Messaging & streaming', 'Kafka (alt: RabbitMQ, NATS, Pulsar, AWS SQS/SNS); event-driven.'),
        step('CDN & edge caching', 'Cloudflare, CloudFront (alt: Akamai, Fastly); cache invalidation.'),
      ]),
      phase('Phase 3 — Cloud Foundations', 'Year 2-4', [
        step('Cloud models', 'IaaS / PaaS / SaaS, shared responsibility model.'),
        step('Compute', 'VMs, autoscaling, load balancers; serverless (Lambda, Azure Functions, Cloud Run).'),
        step('Storage', 'Object (S3 / Blob / GCS), block, file; tiers, lifecycle, redundancy.'),
        step('Cloud networking', 'VPC / VNet, subnets, security groups, peering, private endpoints.'),
        step('Identity & access', 'IAM, RBAC, managed identities, SSO / federation, least privilege.'),
        step('Pick a primary cloud', 'AWS, Azure, or GCP (alt: OCI, Alibaba Cloud); then add breadth.'),
      ]),
      phase('Phase 4 — Containers & Orchestration', 'Year 3-5', [
        step('Docker', 'Images, layers, multi-stage builds (alt: Podman, containerd, CRI-O, Buildah, nerdctl).'),
        step('Runtime internals', 'Namespaces, cgroups, OCI, runc; rootless containers.'),
        step('Kubernetes core', 'Pods, deployments, services, ingress, config / secrets (alt: Nomad, ECS, Swarm).'),
        step('Kubernetes advanced', 'RBAC, CRDs, operators, network policies, HPA / VPA, scheduling.'),
        step('Packaging & templating', 'Helm, Kustomize (alt: Jsonnet, ytt / Carvel, Timoni, Helmfile).'),
        step('Service mesh', 'Istio, Linkerd (alt: Consul Connect, Cilium, Kuma); mTLS, traffic shaping.'),
      ]),
      phase('Phase 5 — Infrastructure as Code', 'Year 4-6', [
        step('Terraform', 'State, modules, workspaces (alt: OpenTofu, Pulumi, CloudFormation, Bicep, CDK).'),
        step('Terragrunt', 'DRY multi-environment, remote state orchestration (alt: Terramate, Terraspace).'),
        step('Configuration management', 'Ansible (alt: Chef, Puppet, SaltStack); provisioning and config.'),
        step('Policy as code', 'OPA / Gatekeeper, Kyverno, Sentinel, Checkov, tfsec.'),
        step('Immutable infrastructure', 'Packer golden images (alt: EC2 Image Builder); versioned pipelines.'),
        step('IaC in CI', 'Plan / apply gates, review workflows, drift detection.'),
      ]),
      phase('Phase 6 — CI/CD & Delivery', 'Year 5-7', [
        step('CI pipelines', 'GitHub Actions, GitLab CI, Jenkins, Azure DevOps (alt: CircleCI, Drone, Tekton, TeamCity).'),
        step('Build optimization', 'Caching, matrix builds, parallelization, ephemeral runners; Bazel for monorepos.'),
        step('GitOps CD', 'Argo CD, Flux (alt: Jenkins X, Spinnaker); declarative sync, self-heal.'),
        step('Release strategies', 'Blue-green, canary, rolling; feature flags (LaunchDarkly, Unleash, Flagsmith).'),
        step('Artifact management', 'Artifactory, Nexus, Harbor, ECR / GAR / ACR; semver, promotion.'),
        step('Supply chain security', 'SLSA, cosign / Sigstore, SBOM (Syft), build provenance.'),
      ]),
      phase('Phase 7 — Observability & SRE', 'Year 6-9', [
        step('Metrics', 'Prometheus, PromQL (alt: VictoriaMetrics, Thanos, Datadog, New Relic).'),
        step('Dashboards & alerting', 'Grafana, Alertmanager (alt: Kibana, Datadog); PagerDuty / Opsgenie on-call.'),
        step('Logging', 'ELK / EFK, Loki (alt: Splunk, Datadog, Graylog, OpenSearch); structured logs.'),
        step('Tracing', 'OpenTelemetry, Jaeger (alt: Tempo, Zipkin, Datadog APM, Honeycomb).'),
        step('SRE practice', 'SLI / SLO / SLA, error budgets, toil reduction.'),
        step('Incident response', 'On-call, blameless postmortems; chaos engineering (Gremlin, Litmus, Chaos Mesh).'),
      ]),
      phase('Phase 8 — Security & DevSecOps', 'Year 7-10', [
        step('SAST & DAST', 'SonarQube, Semgrep, Snyk Code (SAST); OWASP ZAP, Burp Suite (DAST).'),
        step('SCA & dependencies', 'Snyk, Dependabot, Trivy, Grype; SBOM, license compliance.'),
        step('Container & K8s security', 'Trivy, Clair, Falco, Pod Security Standards, Kube-bench.'),
        step('Secrets management', 'HashiCorp Vault (alt: cloud KMS, CyberArk, Sealed Secrets, SOPS); rotation.'),
        step('Cloud security posture', 'Wiz, Prisma Cloud, Defender for Cloud, GuardDuty; CSPM, CIS benchmarks.'),
        step('Zero trust & compliance', 'Least privilege, mTLS; SOC 2, ISO 27001, PCI-DSS, policy enforcement.'),
      ]),
      phase('Phase 9 — Architecture & Scale', 'Year 8-12', [
        step('Distributed systems', 'CAP / PACELC, consensus (Raft / Paxos), replication, sharding.'),
        step('System design at scale', 'Caching, queues, rate limiting, resilience patterns.'),
        step('Multi-cloud & hybrid', 'Portability, connectivity, cross-region DR (alt: Anthos, Azure Arc).'),
        step('Well-Architected frameworks', 'AWS / Azure / GCP pillars: reliability, security, cost, ops, performance.'),
        step('FinOps', 'Cost visibility (CloudHealth, Kubecost, Infracost); rightsizing, reserved / spot.'),
        step('Data-intensive systems', 'Kafka, Flink, Spark; Snowflake, Databricks, BigQuery.'),
      ]),
      phase('Phase 10 — Platform Engineering & Modern Ops', 'Year 9-13', [
        step('Internal Developer Platforms', 'Self-service, golden paths, paved roads.'),
        step('Developer portals', 'Backstage (alt: Port, Cortex, OpsLevel); catalog, scaffolding, TechDocs.'),
        step('Platform APIs', 'Crossplane (alt: Kubernetes operators, Terraform Cloud); infra as CRDs.'),
        step('Developer experience', 'DORA metrics, SPACE framework, cognitive load reduction.'),
        step('Edge & serverless', 'WASM, Cloudflare Workers, Fastly Compute, Knative, KEDA.'),
        step('Progressive delivery', 'Argo Rollouts, Flagger; automated canary analysis.'),
      ]),
      phase('Phase 11 — AI, ML & GenAI Engineering', 'Year 10-14', [
        step('ML fundamentals', 'Supervised / unsupervised / RL, training vs inference, evaluation, overfitting.'),
        step('MLOps platforms', 'MLflow, Kubeflow, W&B (alt: SageMaker, Vertex AI, Azure ML); DVC, model registry.'),
        step('Feature stores & data', 'Feast, Tecton; feature engineering, training / serving skew, drift detection.'),
        step('Model serving & inference', 'KServe, Triton, Seldon, vLLM, Ray Serve; GPU autoscaling, quantization.'),
        step('LLMs & foundation models', 'Transformers, tokens, context windows; fine-tuning vs RAG vs prompting.'),
        step('RAG & vector databases', 'Embeddings; pgvector, Pinecone, Weaviate, Qdrant, Milvus; hybrid search.'),
        step('LLMOps & AI agents', 'LangChain, LlamaIndex; prompt versioning, evals, tool-calling, guardrails.'),
        step('AI infrastructure', 'GPU clusters, CUDA, Kubeflow / Ray, distributed training, inference cost.'),
        step('Responsible AI & AI security', 'Bias / fairness, hallucination mitigation, prompt injection, model poisoning, governance (model cards, EU AI Act).'),
      ]),
      phase('Phase 12 — Leadership & Strategy', 'Year 12-15+', [
        step('Technical leadership', 'Direction-setting, decision frameworks, trade-off analysis.'),
        step('Architecture governance', 'Standards, review boards, tech radar.'),
        step('Team building', 'Hiring, mentoring, career growth, healthy culture.'),
        step('Stakeholder management', 'Translating technology into business value.'),
        step('Technology strategy', 'Roadmaps, build-vs-buy, vendor management.'),
        step('Transformation', 'Driving DevOps / cloud / AI cultural change org-wide.'),
      ]),
    ],
  }
}

export function countRoadmapSteps(phases) {
  return (phases || []).reduce((sum, p) => sum + (p.steps ? p.steps.length : 0), 0)
}

function normalizePhase(p) {
  return {
    id: p.id,
    title: p.title,
    timeframe: p.timeframe || '',
    steps: Array.isArray(p.steps) ? p.steps : [],
  }
}

export default function Roadmap({ flashSaved }) {
  const [data, setData] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [scrollTarget, setScrollTarget] = useState(null)
  const [editingStep, setEditingStep] = useState(null) // { phaseId, stepId }
  const [showPhaseModal, setShowPhaseModal] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState(null)
  const [phaseForm, setPhaseForm] = useState({ ...BLANK_PHASE })
  const [stepInputs, setStepInputs] = useState({}) // phaseId -> string

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!scrollTarget) return
    const el = document.getElementById(`roadmap-phase-${scrollTarget}`)
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setScrollTarget(null)
  }, [scrollTarget])

  async function load() {
    let loaded = defaultData()
    let needsPersist = false
    try {
      const result = await storageGet(STORAGE_KEYS.roadmap)
      if (result && result.value) {
        const parsed = JSON.parse(result.value)
        if ((parsed.version || 1) < ROADMAP_VERSION) {
          // Refresh a roadmap seeded before the current curated content existed.
          loaded = defaultData()
          needsPersist = true
        } else {
          loaded = parsed
        }
      } else {
        needsPersist = true
      }
    } catch {
      needsPersist = true
    }
    loaded.phases = (loaded.phases || []).map(normalizePhase)
    if (needsPersist) await persist(loaded)
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.roadmap, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Roadmap save failed', e)
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
    setEditingStep(null)
    setData(prev)
    persist(prev)
  }

  if (!data) return <div className="empty-state-sm">Loading…</div>

  function toggleCollapse(id) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }))
  }

  function jumpToPhase(id) {
    setCollapsed((c) => ({ ...c, [id]: false }))
    setScrollTarget(id)
  }

  function openAddPhaseModal() {
    setEditingPhaseId(null)
    setPhaseForm({ ...BLANK_PHASE })
    setShowPhaseModal(true)
  }

  function openEditPhaseModal(p) {
    setEditingPhaseId(p.id)
    setPhaseForm({ title: p.title, timeframe: p.timeframe })
    setShowPhaseModal(true)
  }

  function savePhaseForm() {
    if (!phaseForm.title.trim()) {
      alert('Give the phase a title first.')
      return
    }
    if (editingPhaseId) {
      update((d) => {
        const p = d.phases.find((x) => x.id === editingPhaseId)
        Object.assign(p, { title: phaseForm.title, timeframe: phaseForm.timeframe })
      })
    } else {
      update((d) => {
        d.phases.push({ id: uid('rmp'), title: phaseForm.title, timeframe: phaseForm.timeframe, steps: [] })
      })
    }
    setShowPhaseModal(false)
  }

  function deletePhase(id, title) {
    if (!confirm(`Delete "${title || 'this phase'}" and all its steps?`)) return
    update((d) => {
      d.phases = d.phases.filter((p) => p.id !== id)
    })
  }

  function reorderPhases(fromIdx, toIdx) {
    update((d) => {
      d.phases = reorderArray(d.phases, fromIdx, toIdx)
    })
  }

  function addStep(phaseId) {
    const title = (stepInputs[phaseId] || '').trim()
    if (!title) return
    update((d) => {
      const p = d.phases.find((x) => x.id === phaseId)
      p.steps.push({ id: uid('rms'), title, detail: '' })
    })
    setStepInputs((s) => ({ ...s, [phaseId]: '' }))
  }

  function deleteStep(phaseId, stepId) {
    update((d) => {
      const p = d.phases.find((x) => x.id === phaseId)
      p.steps = p.steps.filter((s) => s.id !== stepId)
    })
  }

  function reorderSteps(phaseId, fromIdx, toIdx) {
    update((d) => {
      const p = d.phases.find((x) => x.id === phaseId)
      p.steps = reorderArray(p.steps, fromIdx, toIdx)
    })
  }

  function startEditStep(phaseId, stepId) {
    undoStack.push(data)
    setEditingStep({ phaseId, stepId })
  }

  function cancelEditStep() {
    setEditingStep(null)
    load() // discard unsaved edits by reloading from storage
  }

  function saveEditStep() {
    setEditingStep(null)
    persist(data)
  }

  function patchStep(phaseId, stepId, patch) {
    setData((prev) => {
      const next = structuredClone(prev)
      const p = next.phases.find((x) => x.id === phaseId)
      const s = p.steps.find((x) => x.id === stepId)
      Object.assign(s, patch)
      return next
    })
  }

  const totalSteps = countRoadmapSteps(data.phases)

  return (
    <div>
      <div className="roadmap-intro">
        A chronological path from fundamentals to Principal Cloud Architect &amp; DevOps Leader — {data.phases.length} phases,{' '}
        {totalSteps} steps. Jump from the list on the left, expand a phase, drag to reorder, and edit anything.
      </div>

      {showPhaseModal && (
        <Modal title={editingPhaseId ? 'Edit Phase' : 'New Phase'} onClose={() => setShowPhaseModal(false)}>
          <div className="project-field">
            <label className="field-label">Phase Title</label>
            <input
              type="text"
              className="text-input"
              value={phaseForm.title}
              onChange={(e) => setPhaseForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Phase 13 — Emerging Tech"
            />
          </div>
          <div className="project-field">
            <label className="field-label">Timeframe (optional)</label>
            <input
              type="text"
              className="text-input"
              value={phaseForm.timeframe}
              onChange={(e) => setPhaseForm((f) => ({ ...f, timeframe: e.target.value }))}
              placeholder="e.g. Year 15+"
            />
          </div>
          <div className="add-zone-save-row">
            <button className="btn-outline" onClick={() => setShowPhaseModal(false)}>
              Cancel
            </button>
            <button className="btn" onClick={savePhaseForm}>
              Save
            </button>
          </div>
        </Modal>
      )}

      <div className="roadmap-layout">
        <aside className="roadmap-sidebar">
          <div className="roadmap-sidebar-toolbar">
            <button className="btn-outline" onClick={handleUndo}>
              ↺ Undo
            </button>
            <button className="add-trigger-btn" onClick={openAddPhaseModal}>
              + Add Phase
            </button>
          </div>
          <div className="roadmap-nav">
            {data.phases.map((p) => (
              <div key={p.id} className="roadmap-nav-item" onClick={() => jumpToPhase(p.id)} title={p.title}>
                <span className="roadmap-nav-title">{p.title}</span>
                {p.timeframe && <span className="roadmap-nav-timeframe">{p.timeframe}</span>}
              </div>
            ))}
          </div>
        </aside>

        <div className="roadmap-main">
          {data.phases.length === 0 && (
            <div className="empty-state-sm">No phases yet — tap "+ Add Phase" on the left.</div>
          )}

          {data.phases.map((p, idx) => {
            const isOpen = !collapsed[p.id]
            return (
              <div key={p.id} id={`roadmap-phase-${p.id}`} className="roadmap-phase">
                <div className="roadmap-phase-head" {...dragHandlers(idx, reorderPhases)}>
                  <span className="drag-handle" onClick={(e) => e.stopPropagation()}>
                    ⠿
                  </span>
                  <div className="roadmap-phase-head-main" onClick={() => toggleCollapse(p.id)}>
                    <span className={`roadmap-phase-caret ${isOpen ? 'open' : ''}`}>▸</span>
                    <span className="roadmap-phase-title">{p.title}</span>
                    {p.timeframe && <span className="roadmap-phase-timeframe">{p.timeframe}</span>}
                    <span className="roadmap-phase-count">
                      {p.steps.length} step{p.steps.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="roadmap-phase-actions" onClick={(e) => e.stopPropagation()}>
                    <button title="Edit phase" onClick={() => openEditPhaseModal(p)}>
                      ✎
                    </button>
                    <button className="danger" title="Delete phase" onClick={() => deletePhase(p.id, p.title)}>
                      ✕
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="roadmap-phase-body">
                    {p.steps.length === 0 && <div className="empty-state-sm">No steps yet — add one below.</div>}
                    {p.steps.map((s, sIdx) =>
                      editingStep && editingStep.phaseId === p.id && editingStep.stepId === s.id ? (
                        <div className="roadmap-item" key={s.id}>
                          <div className="roadmap-item-edit">
                            <input
                              className="text-input"
                              style={{ fontWeight: 600 }}
                              value={s.title}
                              placeholder="Step title"
                              onChange={(e) => patchStep(p.id, s.id, { title: e.target.value })}
                            />
                            <textarea
                              className="ginput"
                              rows={2}
                              value={s.detail}
                              placeholder="One-line detail (optional)"
                              onChange={(e) => patchStep(p.id, s.id, { detail: e.target.value })}
                            />
                            <div className="roadmap-item-edit-actions">
                              <button className="btn-outline" onClick={cancelEditStep}>
                                Cancel
                              </button>
                              <button className="btn" onClick={saveEditStep}>
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="roadmap-item"
                          key={s.id}
                          {...dragHandlers(sIdx, (from, to) => reorderSteps(p.id, from, to))}
                        >
                          <span className="drag-handle">⠿</span>
                          <span className="roadmap-item-marker">◆</span>
                          <div className="roadmap-item-body">
                            <div className="roadmap-item-title">{s.title}</div>
                            {s.detail && <div className="roadmap-item-detail">{s.detail}</div>}
                          </div>
                          <div className="roadmap-item-actions">
                            <button title="Edit" onClick={() => startEditStep(p.id, s.id)}>
                              ✎
                            </button>
                            <button className="danger" title="Delete" onClick={() => deleteStep(p.id, s.id)}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ),
                    )}

                    <div className="roadmap-add-item">
                      <input
                        type="text"
                        className="text-input"
                        placeholder="Add a step..."
                        value={stepInputs[p.id] || ''}
                        onChange={(e) => setStepInputs((si) => ({ ...si, [p.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addStep(p.id)
                        }}
                      />
                      <button className="btn" onClick={() => addStep(p.id)}>
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
