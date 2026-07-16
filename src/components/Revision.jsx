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

function kubernetesSubject() {
  return {
    id: uid('subj'),
    icon: '☸️',
    name: 'Kubernetes',
    modules: [
      fullModule(
        'Cluster Architecture',
        [
          kw('kube-apiserver', 'front door to cluster state, validates/authenticates/mutates, only component talking to etcd'),
          kw('etcd', 'distributed key-value store, raft consensus, single source of truth for cluster state'),
          kw('kube-scheduler', 'assigns pods to nodes via filtering (predicates) + scoring (priorities)'),
          kw('kube-controller-manager', 'runs reconciliation loops (node, replication, endpoint, service-account controllers)'),
          kw('cloud-controller-manager', 'cloud-specific logic (LB provisioning, node lifecycle, routes), decouples core k8s from vendor code'),
          kw('kubelet', 'node agent, ensures containers in PodSpecs are running, talks to CRI/CNI/CSI'),
          kw('kube-proxy', 'implements Service abstraction via iptables/IPVS rules on each node'),
          kw('Container runtime', 'containerd/CRI-O, implements CRI to actually run containers'),
          kw('watch mechanism', 'apiserver long-poll/stream pattern controllers use instead of polling'),
          kw('Reconciliation loop', 'observe-diff-act pattern, desired state vs actual state, core control theory of k8s'),
        ],
        [
          qaPair('Why does only apiserver talk to etcd?', 'Single write path avoids split-brain and lets apiserver enforce admission/auth consistently.'),
          qaPair('What happens if etcd quorum is lost?', 'Cluster becomes read-only for state changes; existing pods keep running but nothing schedules or updates.'),
          qaPair('IPVS vs iptables mode for kube-proxy, which do you run and why?', "IPVS at scale — O(1) lookup vs iptables' linear chain scan past a few thousand Services."),
          qaPair("What's the blast radius of losing kube-scheduler?", 'Zero impact on running workloads, only new/unscheduled pods stay Pending.'),
          qaPair('Why is cloud-controller-manager a separate binary from controller-manager?', 'Keeps vendor cloud SDKs out of core k8s release cadence and CVE surface.'),
        ],
      ),
      fullModule(
        'Installation & Cluster Admin',
        [
          kw('kubeadm init', 'bootstraps control plane, generates certs, writes static pod manifests'),
          kw('kubeadm join', 'bootstraps worker/control-plane node using bootstrap token + discovery hash'),
          kw('Static pods', 'kubelet-managed manifests in /etc/kubernetes/manifests, no apiserver needed to run'),
          kw('kubeadm upgrade plan/apply', 'sequences control plane upgrade, one minor version at a time'),
          kw('drain', 'evicts pods respecting PodDisruptionBudgets, cordons node first'),
          kw('cordon/uncordon', 'marks node unschedulable without touching existing pods'),
          kw('kubeadm token', 'manages bootstrap tokens for node join (TTL, create, list)'),
          kw('Certificate rotation', "kubelet client/serving certs auto-rotate; control plane certs need kubeadm certs renew"),
          kw('--upload-certs', 'shares control-plane certs via secret for HA control-plane joins'),
          kw('Version skew policy', 'kubelet can be up to 3 minor versions older than apiserver (per current policy)'),
        ],
        [
          qaPair("Why can't you skip minor versions during upgrade?", 'Skipping breaks version-skew guarantees between apiserver and kubelet/controllers, upgrades are strictly N to N+1.'),
          qaPair("What's the real difference between cordon and drain?", 'Cordon only blocks new scheduling, drain additionally evicts existing pods gracefully.'),
          qaPair("Static pod vs DaemonSet for control plane components, why static?", "No chicken-and-egg — apiserver itself can't depend on apiserver being up to be scheduled."),
          qaPair('How do you recover a node whose kubelet cert expired?', 'Bounce kubelet to trigger rotation, or manually delete the stale cert and restart if rotation is disabled.'),
          qaPair('What breaks if you forget --upload-certs on a stacked HA join?', "New control-plane node joins but can't decrypt shared CA material, join fails at cert phase."),
        ],
      ),
      fullModule(
        'Workloads & Scheduling',
        [
          kw('Deployment', 'manages ReplicaSets, provides rolling update/rollback via revision history'),
          kw('ReplicaSet', 'maintains N pod replicas via label selector, rarely managed directly'),
          kw('StatefulSet', 'stable network identity + ordered deploy/scale + per-replica PVC via volumeClaimTemplates'),
          kw('DaemonSet', 'one pod per (matching) node, used for node agents (log shippers, CNI, monitoring)'),
          kw('Job', 'runs pod(s) to completion, supports parallelism and completions count'),
          kw('CronJob', 'schedules Jobs on cron syntax, has concurrencyPolicy (Allow/Forbid/Replace)'),
          kw('Taints/Tolerations', 'node repels pods unless pod tolerates (NoSchedule/PreferNoSchedule/NoExecute)'),
          kw('Node affinity', 'pod-to-node attraction via requiredDuringScheduling/preferredDuringScheduling'),
          kw('Pod anti-affinity', 'spreads pods apart, commonly by topology.kubernetes.io/zone or hostname'),
          kw('topologySpreadConstraints', 'even distribution across topology domains with maxSkew and whenUnsatisfiable'),
        ],
        [
          qaPair('StatefulSet vs Deployment for a database?', 'StatefulSet — stable pod identity/DNS and per-pod PVCs are non-negotiable for quorum-based storage.'),
          qaPair('Why did your DaemonSet pod fail to schedule on a tainted node?', "DaemonSet needs an explicit toleration for that taint, it doesn't bypass scheduling like people assume."),
          qaPair('requiredDuringScheduling vs preferredDuringScheduling in production?', "Prefer 'preferred' for anti-affinity at scale, 'required' can leave pods Pending when the cluster is tight on zones."),
          qaPair('CronJob missed its schedule during a control-plane outage, what happens?', 'Missed runs beyond startingDeadlineSeconds are just skipped, not queued/backfilled.'),
          qaPair('maxSkew=1 topology spread constraint, what\'s the tradeoff?', 'Tight balance across zones but can block scheduling entirely if a zone runs out of capacity.'),
        ],
      ),
      fullModule(
        'Pods & Multi-Container Patterns',
        [
          kw('Init containers', 'run sequentially to completion before app containers start, for setup/wait-for-dependency'),
          kw('Sidecar container', 'co-located helper (proxy, log shipper), shares network/IPC namespace with main container'),
          kw('Native sidecars', 'restartPolicy: Always on init container — sidecar semantics inside initContainers since 1.28+'),
          kw('livenessProbe', 'restarts container if failing, for deadlock/hang detection'),
          kw('readinessProbe', "removes pod from Service endpoints if failing, doesn't restart"),
          kw('startupProbe', 'gates liveness/readiness until slow-starting app is up, prevents premature kill'),
          kw('Pod phases', 'Pending, Running, Succeeded, Failed, Unknown'),
          kw('postStart/preStop hooks', 'lifecycle hooks, preStop commonly used for graceful shutdown draining'),
          kw('terminationGracePeriodSeconds', 'window between SIGTERM and SIGKILL, default 30s'),
          kw('Container states', 'Waiting, Running, Terminated (with reason/exitCode)'),
        ],
        [
          qaPair('Why did adding a livenessProbe make an already-slow-starting app worse?', 'Probe fired before the app was warm and caused a restart loop, needed a startupProbe instead.'),
          qaPair('Sidecar vs init container for a one-time DB migration?', "Init container — it needs to run-to-completion before the app starts, not persist alongside it."),
          qaPair('readinessProbe failing but livenessProbe passing, what\'s the pod behavior?', 'Pod stays Running but gets pulled from Service endpoints, no restart happens.'),
          qaPair('Why does your app get killed mid-request during rolling update?', 'No preStop hook/grace period tuned for connection draining behind the LB.'),
          qaPair('What changed with native sidecars in 1.28+?', 'Sidecars declared as init containers with restartPolicy Always now start before app containers and stop last, fixing ordering races.'),
        ],
      ),
      fullModule(
        'Services & Networking',
        [
          kw('ClusterIP', 'default, internal-only virtual IP load-balanced via kube-proxy'),
          kw('NodePort', 'exposes a port on every node (30000-32767), backed by ClusterIP'),
          kw('LoadBalancer', 'cloud provider provisions external LB, wraps NodePort/ClusterIP'),
          kw('Ingress', 'L7 HTTP(S) routing, host/path rules, needs an Ingress controller to do anything'),
          kw('CNI', 'plugin interface for pod networking (Calico, Cilium, Flannel), assigns pod IPs and enforces routing'),
          kw('CoreDNS', 'cluster DNS, resolves service.namespace.svc.cluster.local, runs as Deployment'),
          kw('NetworkPolicy', 'namespace-scoped firewall rules for pod ingress/egress, requires CNI support'),
          kw('Endpoints/EndpointSlices', 'tracks actual pod IPs backing a Service, EndpointSlices scale better at high pod counts'),
          kw('headless Service', 'clusterIP: None — direct pod DNS records, used by StatefulSets for stable identity'),
          kw('Service selector', 'label-based binding of Service to backing pods, no selector means manually-managed Endpoints'),
        ],
        [
          qaPair("Why doesn't a NetworkPolicy do anything on your cluster?", 'CNI plugin doesn\'t enforce NetworkPolicy (e.g. plain Flannel), silently a no-op.'),
          qaPair("ClusterIP Service traffic isn't load balancing evenly, why?", 'Long-lived connections get pinned to one backend by iptables/conntrack, doesn\'t rebalance mid-connection.'),
          qaPair("What's the actual difference between Ingress and a Gateway API?", 'Ingress is a narrow, frozen v1 API; Gateway API is the newer, extensible, role-split replacement (Gateway/HTTPRoute/etc.).'),
          qaPair('Pod can\'t resolve DNS intermittently under load, first thing you check?', 'CoreDNS pod CPU throttling/replica count and the ndots:5 search-domain amplification.'),
          qaPair('Default NetworkPolicy behavior with none defined?', 'Fully open — all ingress/egress allowed until a policy selects the pod, then default-deny applies to that pod.'),
        ],
      ),
      fullModule(
        'Storage',
        [
          kw('Volume', 'pod-scoped storage abstraction, lifecycle tied to pod (emptyDir, hostPath, configMap, etc.)'),
          kw('PersistentVolume (PV)', 'cluster-scoped storage resource, provisioned statically or dynamically'),
          kw('PersistentVolumeClaim (PVC)', 'namespace-scoped request for storage, binds to a matching PV'),
          kw('StorageClass', 'defines provisioner + parameters for dynamic PV provisioning, sets default via annotation'),
          kw('CSI', 'Container Storage Interface, out-of-tree plugin model replacing in-tree cloud volume plugins'),
          kw('Access modes', 'ReadWriteOnce, ReadOnlyMany, ReadWriteMany, ReadWriteOncePod (single-pod exclusivity)'),
          kw('reclaimPolicy', 'Retain, Delete, (Recycle deprecated) — what happens to PV after PVC deletion'),
          kw('volumeBindingMode', 'Immediate vs WaitForFirstConsumer, latter avoids AZ mismatch scheduling failures'),
          kw('emptyDir', 'ephemeral, node-local, deleted with pod, optionally memory-backed (sizeLimit)'),
          kw('volumeClaimTemplates', 'per-replica PVC generation in StatefulSets'),
        ],
        [
          qaPair('Pod stuck Pending with a PVC bound, why?', 'Classic AZ mismatch — PV provisioned in a different zone than the scheduled node, fix with WaitForFirstConsumer.'),
          qaPair('ReadWriteOnce PVC but two pods on the same node both mount it, does that work?', 'Yes below 1.22 semantics — RWO is enforced per-node not per-pod, use ReadWriteOncePod if you need true single-pod exclusivity.'),
          qaPair('reclaimPolicy Delete vs Retain for prod databases?', 'Always Retain in prod — Delete on PVC deletion means data loss on a fat-fingered kubectl delete.'),
          qaPair('Why migrate from in-tree volume plugins to CSI?', 'In-tree plugins were frozen and shipped with k8s core, CSI decouples vendor driver release cycles entirely.'),
          qaPair('StatefulSet scaled down then up, does it get the same PV back?', "Yes — volumeClaimTemplates PVCs aren't deleted on scale-down, same ordinal reattaches its PVC."),
        ],
      ),
      fullModule(
        'ConfigMaps & Secrets',
        [
          kw('ConfigMap', 'non-confidential key-value config, injected as env vars, files, or command args'),
          kw('Secret', 'base64-encoded (not encrypted by default) sensitive data, same consumption model as ConfigMap'),
          kw('envFrom/valueFrom', 'bulk vs selective injection of ConfigMap/Secret keys as env vars'),
          kw('Volume mount projection', "ConfigMap/Secret as files, auto-updates on change (env vars don't)"),
          kw('immutable: true', 'locks ConfigMap/Secret from updates, improves apiserver watch performance at scale'),
          kw('EncryptionConfiguration', 'enables encryption at rest for Secrets in etcd (aescbc, kms provider)'),
          kw('KMS provider v2', 'envelope encryption via external KMS, recommended over static aescbc keys'),
          kw('Secret types', 'Opaque, kubernetes.io/tls, kubernetes.io/dockerconfigjson, kubernetes.io/service-account-token'),
          kw('imagePullSecrets', 'Secret referenced by pod/serviceaccount to auth against private registries'),
          kw('etcd at rest', 'without EncryptionConfiguration, Secrets sit as plaintext-equivalent base64 in etcd'),
        ],
        [
          qaPair('Is a Kubernetes Secret actually secret?', "No — base64 is encoding not encryption, it's only \"secret\" via RBAC unless you enable encryption at rest."),
          qaPair("Why didn't my app pick up an updated ConfigMap?", 'It was mounted as env vars, which are snapshotted at pod start — only volume-mounted files auto-update.'),
          qaPair('When do you mark a ConfigMap immutable?', 'High-churn clusters with thousands of ConfigMaps — immutability drops apiserver/kubelet watch load significantly.'),
          qaPair('aescbc vs KMS v2 for encryption at rest?', 'KMS v2 — envelope encryption with external key management and no static key sitting in a config file on disk.'),
          qaPair('How do you rotate a Secret without restarting pods?', 'Volume-mounted Secrets update in place (kubelet sync interval), but the app must watch/reload the file itself.'),
        ],
      ),
      fullModule(
        'RBAC & Security',
        [
          kw('Role/ClusterRole', 'namespace-scoped vs cluster-scoped permission sets (verbs on resources)'),
          kw('RoleBinding/ClusterRoleBinding', 'binds subjects (user/group/SA) to a Role/ClusterRole'),
          kw('ServiceAccount', 'pod identity for API access, auto-mounted token unless automountServiceAccountToken: false'),
          kw('Pod Security Admission (PSA)', 'namespace-labeled enforcement of Pod Security Standards, replaced PodSecurityPolicy'),
          kw('Pod Security Standards', 'Privileged, Baseline, Restricted profile levels'),
          kw('Admission controllers', 'in-tree plugins (e.g. NodeRestriction, LimitRanger) mutating/validating requests pre-persist'),
          kw('Validating/Mutating webhooks', 'external webhook-based admission, e.g. OPA Gatekeeper, Kyverno'),
          kw('Image scanning', 'Trivy/Grype in CI + admission-time policy blocking unscanned/CVE-flagged images'),
          kw('seccompProfile/AppArmor/SELinux', 'syscall/MAC-based runtime confinement at pod/container level'),
          kw('Least privilege', 'no cluster-admin bindings for workloads, scoped Roles per namespace, avoid wildcard verbs/resources'),
        ],
        [
          qaPair('PodSecurityPolicy is gone, what replaced it?', 'Pod Security Admission with namespace labels enforcing Privileged/Baseline/Restricted standards.'),
          qaPair('How do you stop every default ServiceAccount token from being a lateral-movement risk?', 'automountServiceAccountToken: false by default, only mount where the workload actually calls the API.'),
          qaPair('Validating vs mutating webhook ordering?', 'All mutating webhooks run first and can modify the object, then validating webhooks run against the final object.'),
          qaPair('How do you catch a CVE-laden image before it ever reaches a node?', 'Shift-left scanning in CI plus an admission-time policy (Kyverno/Gatekeeper) blocking unscanned or high-severity images.'),
          qaPair('ClusterRoleBinding to system:masters, why is this an incident?', 'Grants unauditable, unrestricted superuser — bypasses all RBAC checks entirely, treat as a critical finding.'),
        ],
      ),
      fullModule(
        'Observability & Troubleshooting',
        [
          kw('kubectl describe', 'shows events, conditions, resource requests, last state — first stop for any pod issue'),
          kw('kubectl logs -p/--previous', 'logs from last terminated container, essential for crash loops'),
          kw('kubectl exec', 'shell into running container for live debugging'),
          kw('metrics-server', 'in-cluster resource metrics (CPU/mem) API, powers kubectl top and HPA'),
          kw('CrashLoopBackOff', 'container repeatedly exiting, check exit code + previous logs, exponential backoff between restarts'),
          kw('ImagePullBackOff/ErrImagePull', 'bad image name/tag, registry auth failure, or missing imagePullSecret'),
          kw('OOMKilled', 'container exceeded memory limit, exit code 137, check requests/limits vs actual usage'),
          kw('Pending pod', 'unschedulable: insufficient resources, taints, affinity mismatch, or no PV bound'),
          kw('kubectl events / --sort-by', 'cluster-wide event stream, filter by involvedObject for root cause'),
          kw('ephemeral containers', 'kubectl debug injects a debug container into a running pod without restart'),
        ],
        [
          qaPair('Pod shows Running but app is unreachable, next step?', "Check readinessProbe status and Endpoints/EndpointSlice — Running doesn't mean In-Service."),
          qaPair('CrashLoopBackOff with exit code 1 vs 137, how do you triage differently?', '137 means OOMKilled or SIGKILL — check memory limits first; other codes mean check application logs.'),
          qaPair('Pod Pending with no events at all, what\'s your hypothesis?', "Scheduler hasn't even tried — likely no nodes match resource requests or nodeSelector, verify with describe on the node pool."),
          qaPair('How do you debug a distroless container with no shell?', "kubectl debug with an ephemeral container sharing the target's process namespace."),
          qaPair('kubectl top shows nothing, why?', "metrics-server isn't installed or its pod can't reach kubelets (cert/network issue), it's not part of core k8s by default."),
        ],
      ),
      fullModule(
        'Cluster Maintenance',
        [
          kw('etcdctl snapshot save', 'point-in-time backup of etcd data directory'),
          kw('etcdctl snapshot restore', 'rebuilds data-dir from snapshot, requires updating static pod manifest paths'),
          kw('--endpoints/--cacert/--cert/--key', 'required etcdctl TLS flags against a secured etcd cluster'),
          kw('kubeadm upgrade node', 'applies control-plane/kubelet config updates on secondary nodes after first upgrade'),
          kw('PodDisruptionBudget (PDB)', 'caps voluntary disruptions (minAvailable/maxUnavailable) during drain/upgrade'),
          kw('Node maintenance sequence', 'cordon, drain, patch/reboot, uncordon'),
          kw('etcd quorum', '(n/2)+1 members must be healthy, tolerates floor((n-1)/2) failures'),
          kw('Backup cadence/off-cluster storage', 'etcd snapshots must be stored off the node itself to survive node loss'),
          kw('Velero', 'application-level backup (PVs + object manifests), complements etcd snapshots'),
          kw('Control plane HA', 'odd-numbered etcd member count (3/5), stacked vs external etcd topology'),
        ],
        [
          qaPair('Why must etcd member count be odd?', 'Quorum math — odd counts maximize fault tolerance per additional node versus even counts.'),
          qaPair("etcd snapshot restore succeeded but cluster is still broken, what did you miss?", "Forgot to update the static pod manifest's --data-dir and initial-cluster flags to point at the restored directory."),
          qaPair('Full disaster recovery plan for losing all control-plane nodes?', 'Restore etcd from off-node snapshot onto fresh nodes, reissue certs if needed, rejoin/rebuild control plane, then verify node/workload reconciliation.'),
          qaPair('PDB set to minAvailable: 100%, what happens during a node drain?', 'Drain blocks indefinitely — eviction API refuses to violate the budget, requires manual override or PDB adjustment.'),
          qaPair('Why back up etcd separately from Velero?', "Velero captures k8s objects/PVs, not raw consensus state — etcd snapshot is the only true control-plane disaster recovery path."),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('kubectl get <res> -o wide', 'list with extra columns (node, IP) without full describe'),
          kw('kubectl describe <res> <name>', 'full detail including events, for root-cause triage'),
          kw('kubectl apply -f <file>', 'declarative create/update, tracks last-applied-configuration annotation'),
          kw('kubectl delete <res> <name> --grace-period=0 --force', 'force-remove stuck terminating resource'),
          kw('kubectl logs <pod> -c <container> -f --previous', 'stream/tail logs, specific container, prior crash'),
          kw('kubectl exec -it <pod> -- sh', 'interactive shell into container'),
          kw('kubectl port-forward <pod> 8080:80', 'tunnel local port to pod port for direct debugging'),
          kw('kubectl rollout status/undo/history deployment/<name>', 'track, revert, or inspect rollout revisions'),
          kw('kubectl scale deployment/<name> --replicas=N', 'imperative scale, bypasses HPA temporarily'),
          kw('kubectl cordon/drain <node>', 'mark unschedulable / evict for maintenance'),
          kw('kubectl top pod/node', 'live resource usage via metrics-server'),
          kw('--dry-run=client -o yaml', 'generate manifest boilerplate without applying, standard exam speed-hack'),
        ],
        [],
      ),
      fullModule(
        'Kubernetes Alternatives',
        [
          kw('Docker Swarm', 'Docker-native orchestrator, simple but effectively deprecated/unmaintained vs k8s'),
          kw('HashiCorp Nomad', 'single-binary orchestrator, schedules containers/VMs/binaries, simpler ops model'),
          kw('OpenShift', "Red Hat's opinionated k8s distro, built-in CI/CD, stricter security defaults (SCCs)"),
          kw('Rancher', 'multi-cluster k8s management layer, not a competing orchestrator'),
          kw('Amazon EKS', 'managed control plane on AWS, deep IAM/VPC integration'),
          kw('Azure AKS', 'managed control plane on Azure, tight AD/Azure Policy integration'),
          kw('Google GKE', 'managed k8s, most mature/hands-off (Autopilot mode), Google-authored upstream features land first'),
          kw('Self-managed (kubeadm/kOps)', 'full control plane ownership, highest ops burden, needed for air-gapped/on-prem'),
        ],
        [
          qaPair('When would you pick Nomad over Kubernetes?', "Mixed workload (VMs + containers + batch) with a small ops team that can't absorb k8s's operational complexity."),
          qaPair('Why choose OpenShift over vanilla k8s for an enterprise?', 'Built-in security defaults, support contract, and integrated CI/CD outweigh the extra licensing cost for regulated environments.'),
          qaPair('EKS vs GKE for a team with zero cloud lock-in yet, which and why?', 'GKE if pure k8s velocity matters most — Google upstreams features first and Autopilot removes node management entirely.'),
        ],
      ),
    ],
  }
}

function helmSubject() {
  return {
    id: uid('subj'),
    icon: '⎈',
    name: 'Helm',
    modules: [
      fullModule(
        'Helm Architecture',
        [
          kw('Helm 3 client-only', 'no Tiller, no cluster-side daemon, CLI talks straight to kube-apiserver'),
          kw('Tiller', 'Helm 2 server-side component, removed in Helm 3, was the RBAC nightmare'),
          kw('Release', 'a named, versioned deployment of a chart+values into a namespace'),
          kw('Release object', 'release state stored as a Secret (default) in the target namespace, one per revision'),
          kw('helm.sh/release.v1', 'the storage driver type, Secrets by default, ConfigMaps or SQL possible'),
          kw('Kubeconfig/context', 'Helm reuses your existing kubectl auth, no separate service account needed'),
          kw('Namespace scoping', 'releases and their Secrets live in a namespace, --namespace matters'),
          kw('Client-side rendering', 'templates rendered locally into manifests, then applied via k8s API'),
          kw('3-way merge', 'upgrade diffs live state, last-applied, and new manifest to compute patch'),
        ],
        [
          qaPair('Why was Tiller removed in Helm 3?', 'It ran cluster-admin-ish in-cluster with weak RBAC, a privilege-escalation vector.'),
          qaPair('Where does Helm store release history?', 'In Secrets named sh.helm.release.v1.<release>.v<rev> in the release namespace.'),
          qaPair('How does Helm 3 authenticate to the cluster?', 'Directly via your kubeconfig context, same as kubectl.'),
          qaPair("Can two teams see each other's releases?", 'Only if they share a namespace, since release Secrets are namespace-scoped.'),
          qaPair('What happens if the release Secret is deleted?', 'Helm loses history/rollback capability even though workloads keep running.'),
        ],
      ),
      fullModule(
        'Chart Structure',
        [
          kw('Chart.yaml', 'metadata: name, version, appVersion, apiVersion (v2 for Helm 3), dependencies'),
          kw('templates/', 'directory of Go-templated Kubernetes manifests rendered per release'),
          kw('values.yaml', 'default configuration values consumed by templates'),
          kw('charts/', 'vendored subchart tarballs/dirs, populated by dependency update'),
          kw('_helpers.tpl', 'file convention (leading underscore) for named templates, not rendered directly'),
          kw('NOTES.txt', 'post-install/upgrade usage text rendered and templated like any other file'),
          kw('templates/tests/', 'hook-annotated pods used by helm test'),
          kw('.helmignore', 'patterns excluded from the packaged chart, like .dockerignore'),
          kw('apiVersion v2 vs v1', 'v2 required for Helm 3 native dependency management'),
        ],
        [
          qaPair('Why prefix helper files with underscore?', 'Helm skips underscore-prefixed files for direct manifest rendering.'),
          qaPair("What's the difference between Chart.yaml apiVersion v1 and v2?", 'v2 supports the dependencies block natively instead of requirements.yaml.'),
          qaPair('Where do vendored dependency charts land?', 'In the charts/ subdirectory as .tgz or extracted dirs after dependency update.'),
          qaPair('Is NOTES.txt templated?', 'Yes, it goes through the same Go template engine with full .Values/.Release access.'),
          qaPair('What does .helmignore actually affect?', 'Only helm package/lint file inclusion, not runtime behavior.'),
        ],
      ),
      fullModule(
        'Templating',
        [
          kw('Go templates', '{{ }} actions, text/template engine with Sprig functions added'),
          kw('.Values', 'merged values from values.yaml, -f files, and --set, in precedence order'),
          kw('.Release', 'release name, namespace, revision, IsUpgrade/IsInstall booleans'),
          kw('.Chart', 'Chart.yaml fields like .Chart.Name, .Chart.Version, .Chart.AppVersion'),
          kw('.Files', 'access to non-template files in the chart for configmaps/certs'),
          kw('Pipelines', 'value | default "x" | quote, left-to-right function chaining'),
          kw('default', 'fallback when a value is empty/nil, {{ .Values.tag | default "latest" }}'),
          kw('include vs template', "include returns a string (pipeable), template is a statement (can't pipe)"),
          kw('toYaml/nindent', 'dump a map/list as YAML, reindent for correct nesting in manifests'),
          kw('Named templates', 'define "chartname.labels" blocks, invoked via include'),
        ],
        [
          qaPair('Why use include over template?', "include's output can be piped into nindent for correct indentation, template's can't."),
          qaPair("What's the classic toYaml indentation bug?", "Forgetting nindent, producing YAML that's misaligned and fails to parse."),
          qaPair("How do you access a subchart's own Chart.Name from a parent?", "You can't directly, each template only sees its own chart's context unless passed explicitly."),
          qaPair('When would you use required instead of default?', 'When a missing value should hard-fail the render instead of silently defaulting.'),
          qaPair('What\'s the risk of heavy logic in templates?', "Charts become unreadable and untestable, push complex logic into values structure instead."),
        ],
      ),
      fullModule(
        'Values & Overrides',
        [
          kw('values.yaml precedence', 'chart defaults < parent values < -f files (in order) < --set/--set-string'),
          kw('-f/--values', 'merges a YAML file into values, later files win on conflicting keys'),
          kw('--set', 'CLI key=value overrides, highest precedence, dot notation for nested keys'),
          kw('--set-string', 'forces string type, avoids YAML type coercion (e.g. "1.0" becoming a float)'),
          kw('global values', '.Values.global, visible to parent and all subcharts uniformly'),
          kw('values schema', 'values.schema.json, JSON Schema validation run at template/install time'),
          kw('Array override caveat', '--set on lists replaces the whole array, not a merge'),
          kw('--set-file', "load a value's content from a file, useful for multi-line secrets/certs"),
          kw('-f values precedence order', 'rightmost -f flag wins over earlier ones'),
        ],
        [
          qaPair('--set vs -f, which wins?', "--set always wins, it's applied after all -f files."),
          qaPair('Why did my --set list override wipe unrelated items?', "--set replaces arrays wholesale, no index-merge semantics."),
          qaPair('How do you share a registry credential across all subcharts?', 'Put it under .Values.global so every subchart context inherits it.'),
          qaPair('Why validate with values.schema.json?', 'Catches malformed consumer overrides at render time instead of a cryptic template panic mid-apply.'),
          qaPair('--set foo=1.0 stored as int instead of string, why?', 'YAML/Go type inference, fix with --set-string.'),
        ],
      ),
      fullModule(
        'Releases & Rollbacks',
        [
          kw('helm install', 'first deployment of a chart under a release name'),
          kw('helm upgrade --install', 'idempotent apply, install if absent else upgrade, standard in CI/CD'),
          kw('helm rollback <release> <rev>', "revert to a prior stored revision's manifests"),
          kw('helm history', 'list revisions, status, and chart/app versions per release'),
          kw('--atomic', 'auto-rollback on failed upgrade/install, waits for resources to be ready'),
          kw('--wait', 'blocks until Deployments/Services/PVCs report ready before returning'),
          kw('--timeout', 'bounds how long --wait/--atomic will wait before failing'),
          kw('Revision', 'monotonically increasing integer per release, each stored as its own Secret'),
          kw('helm uninstall --keep-history', 'removes workloads but retains release Secrets for rollback/audit'),
        ],
        [
          qaPair('--atomic vs --wait, why use both?', '--wait blocks for readiness, --atomic adds automatic rollback if that readiness check fails.'),
          qaPair('Rollback restores the chart templates too, not just replicas?', 'Correct, it reapplies the exact stored manifest set from that revision.'),
          qaPair('Can you rollback past a helm uninstall?', 'Only if you uninstalled with --keep-history, otherwise the revision Secrets are gone.'),
          qaPair('Why did helm upgrade hang for 5 minutes then fail?', '--wait was set with a readiness probe that never passed, hit --timeout.'),
          qaPair('What\'s the danger of skipping --atomic in production CD?', 'A half-applied upgrade leaves mixed old/new pods with no auto-recovery.'),
        ],
      ),
      fullModule(
        'Hooks',
        [
          kw('helm.sh/hook annotation', 'marks a manifest as a hook instead of a normal release resource'),
          kw('pre-install/post-install', 'run before/after all resources are created on first install'),
          kw('pre-upgrade/post-upgrade', 'run before/after resources are updated on upgrade'),
          kw('pre-delete/post-delete', 'run before/after resource deletion on uninstall'),
          kw('pre-rollback/post-rollback', 'run around a rollback operation'),
          kw('helm.sh/hook-weight', 'sort order among hooks in the same phase, lower runs first'),
          kw('helm.sh/hook-delete-policy', 'before-hook-creation, hook-succeeded, hook-failed cleanup rules'),
          kw('Hook resource', 'usually a Job/Pod, not tracked as part of normal release ownership'),
          kw('hook-failed behavior', 'by default a failed hook does not auto-rollback the release'),
        ],
        [
          qaPair('Are hooks rolled back with helm rollback?', "No, hooks aren't part of release revision tracking, they just fire again on the operation."),
          qaPair('Why did my pre-upgrade migration Job fail to rerun?', 'Leftover completed Job from last time, missing before-hook-creation delete policy.'),
          qaPair('Do hook resources show up in helm get manifest?', 'No, hooks are rendered and applied separately, not stored as part of the release manifest.'),
          qaPair('How do you order a DB migration before a schema-check Job in the same phase?', 'Set hook-weight lower on the migration so it runs first.'),
          qaPair('A pre-install hook Job failed but helm reported install failed cleanly, why no orphan?', 'hook-failed delete policy cleaned it up if configured, otherwise it\'s still sitting there.'),
        ],
      ),
      fullModule(
        'Dependencies & Subcharts',
        [
          kw('dependencies block', 'Chart.yaml list of name/version/repository per subchart'),
          kw('helm dependency update', 'resolves and downloads deps into charts/, writes Chart.lock'),
          kw('Chart.lock', 'pinned resolved versions, analogous to a lockfile, commit it'),
          kw('helm dependency build', 'reinstalls from Chart.lock without re-resolving versions'),
          kw('condition', 'Chart.yaml field pointing to a boolean values path to enable/disable a subchart'),
          kw('tags', 'grouped boolean switches shared across multiple subcharts'),
          kw('Subchart value scoping', "parent sets subchart values under a top-level key matching subchart name"),
          kw('global values passthrough', '.Values.global reaches every subchart regardless of nesting'),
          kw('alias', 'deploy the same subchart twice under different names with different value scopes'),
        ],
        [
          qaPair('condition vs tags, when do you use which?', 'condition toggles one subchart, tags toggle a group of subcharts sharing a flag.'),
          qaPair('Why commit Chart.lock?', 'Reproducible builds, dependency update alone can silently pick up a newer matching semver.'),
          qaPair("How do you override a subchart's value from the parent?", "Nest it under the subchart's name key in the parent's values.yaml."),
          qaPair('Why deploy redis twice in one chart?', 'Use alias to instantiate the subchart under two names with independent value blocks.'),
          qaPair('dependency update vs dependency build, which is safe for CI?', 'build, it trusts Chart.lock and won\'t drift to a new version mid-pipeline.'),
        ],
      ),
      fullModule(
        'Repositories & OCI Registries',
        [
          kw('helm repo add', 'registers a classic HTTP(S) chart repo with an index.yaml'),
          kw('helm repo update', 'refreshes local cache of index.yaml from all added repos'),
          kw('index.yaml', 'repo manifest listing chart versions and their download URLs'),
          kw('OCI registry', 'charts pushed/pulled as OCI artifacts, oci:// scheme, no index.yaml needed'),
          kw('helm push', 'publishes a packaged chart to an OCI registry'),
          kw('helm pull / helm pull oci://', 'fetches a chart tarball from a classic repo or OCI ref'),
          kw('Artifact Hub', 'public discovery index aggregating chart repos and OCI charts across vendors'),
          kw('helm registry login', 'authenticates to an OCI registry, same creds model as docker login'),
          kw('ChartMuseum', 'self-hosted classic chart repo server, largely being displaced by OCI'),
        ],
        [
          qaPair('Why is the industry moving off classic repos to OCI?', 'One registry serves both container images and charts, less infra to run and secure.'),
          qaPair('Do OCI-based charts need helm repo add?', 'No, you reference oci:// directly, no index.yaml step involved.'),
          qaPair('How do you pin exact reproducible chart pulls in CI?', 'Reference the chart by explicit version and digest, not a floating tag.'),
          qaPair('Is Artifact Hub itself a registry?', "No, it's a discovery index, the actual chart still lives in someone's repo or registry."),
          qaPair('helm repo update didn\'t pick up a new chart version, why?', "Stale local cache or repo index not regenerated after publish, force update or check the source repo's index.yaml."),
        ],
      ),
      fullModule(
        'Testing & Linting',
        [
          kw('helm lint', 'static checks on chart structure, YAML validity, and required fields'),
          kw('helm template', 'fully renders manifests locally without touching the cluster'),
          kw('helm install --dry-run', 'server-side validation via API without persisting the release'),
          kw('helm test', 'runs helm.sh/hook: test annotated Pods/Jobs against a live release'),
          kw('--debug', 'verbose output, prints rendered manifests alongside lint/install errors'),
          kw('--strict', 'helm lint treats warnings as errors, good for CI gating'),
          kw('Kubeconform/kubeval', 'external schema validators often piped after helm template'),
          kw('Golden file testing', 'diffing helm template output against committed expected manifests'),
        ],
        [
          qaPair('helm lint passed but install failed, why?', 'lint checks chart hygiene, not live cluster admission/CRD/RBAC constraints.'),
          qaPair('helm template vs install --dry-run, which catches more?', "--dry-run --server, it validates against the live API server's admission chain, template is purely local."),
          qaPair('How do you test a chart change in CI without a cluster?', 'helm template piped into kubeconform for schema validation.'),
          qaPair('What does helm test actually verify?', "Whatever your test hook Pods assert, Helm just runs them and reports pass/fail, it has no built-in assertions."),
          qaPair('How do you catch silent template regressions?', 'Golden-file diff of helm template output committed to the repo.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('helm install <rel> <chart>', 'deploy a new release under the given name'),
          kw('helm upgrade --install <rel> <chart> -f values.yaml', 'upgrade or install idempotently'),
          kw('helm rollback <rel> <rev>', 'revert release to a specific prior revision'),
          kw('helm uninstall <rel>', 'delete release and its resources'),
          kw('helm list -A', 'list releases across all namespaces'),
          kw('helm status <rel>', 'show current release state and last deployed info'),
          kw('helm get values <rel>', 'show effective values used for a deployed release'),
          kw('helm get manifest <rel>', 'dump the exact rendered manifests currently tracked for the release'),
          kw('helm template <chart> -f values.yaml', 'render manifests locally without installing'),
          kw('helm lint <chart>', 'static validation of chart structure and syntax'),
          kw('helm repo add/update', 'register and refresh a chart repository'),
          kw('helm dependency update', 'resolve and download subchart dependencies'),
          kw('helm show values <chart>', "print a chart's default values.yaml without installing"),
          kw('--dry-run --debug', 'simulate an operation and print verbose rendered output'),
        ],
        [],
      ),
      fullModule(
        'Helm Alternatives',
        [
          kw('Kustomize', 'patch-based, template-free overlays on plain YAML, built into kubectl'),
          kw('Helmfile', 'declarative wrapper orchestrating many Helm releases as one desired-state file'),
          kw('Carvel (ytt/kapp)', 'schema-aware YAML templating plus apply-and-prune deployment tool'),
          kw('ytt', "Carvel's templating layer, uses Starlark instead of Go templates/string interpolation"),
          kw('Plain kubectl apply -k/-f', 'raw or Kustomize-generated manifests, zero templating engine'),
          kw('Jsonnet/Tanka', 'code-as-config templating for large multi-environment manifest sets'),
          kw('GitOps overlay pattern', 'Kustomize bases/overlays per environment, often paired with Argo CD'),
        ],
        [
          qaPair('Kustomize or Helm for a single app with no packaging need?', 'Kustomize, no templating engine or chart repo overhead required.'),
          qaPair('When do you reach for Helmfile over raw Helm?', "Managing dozens of releases with interdependencies as one apply, Helm alone has no multi-release orchestration."),
          qaPair('Why would a security-conscious team pick ytt over Go templates?', 'Starlark is a real typed language, less stringly-typed footguns than text/template string munging.'),
          qaPair('Argo CD with Helm charts, do you still need Helmfile?', "No, Argo CD's Application CRD replaces Helmfile's orchestration role in that setup."),
          qaPair('Biggest operational gripe with Helm vs Kustomize in practice?', "Helm's templating hides the final YAML until render time, Kustomize's patches stay closer to plain manifests you can eyeball."),
        ],
      ),
    ],
  }
}

function terraformSubject() {
  return {
    id: uid('subj'),
    icon: '🌍',
    name: 'Terraform & Terragrunt',
    modules: [
      fullModule(
        'IaC Concepts',
        [
          kw('Declarative vs imperative', 'Terraform declares desired end state; Chef/scripts specify step-by-step actions'),
          kw('Idempotency', 'applying same config repeatedly converges to same state, no duplicate side effects'),
          kw('Desired state reconciliation', 'Terraform diffs state vs config vs real infra each run'),
          kw('ClickOps drift', 'manual console changes cause state/reality divergence, undetected until next plan'),
          kw('Plan/apply lifecycle', 'plan computes diff, apply executes, no auto-apply by default'),
          kw('Immutable infrastructure', 'replace resources instead of in-place mutation where possible'),
          kw('Version control for infra', 'config in git enables review, rollback, audit trail'),
          kw('Blast radius', 'scope of impact from a bad apply, minimized via workspaces/modules/state splitting'),
        ],
        [
          qaPair('Why prefer Terraform over ClickOps at scale?', 'Reviewable diffs and drift detection beat tribal knowledge and undocumented console changes.'),
          qaPair('Is Terraform truly idempotent?', 'Mostly, but provider bugs and non-idempotent APIs (e.g. null_resource triggers) can break it.'),
          qaPair('How do you catch drift before it bites you?', 'Scheduled terraform plan in CI with alerting on non-empty diffs.'),
          qaPair('Biggest real-world IaC risk?', 'Blast radius — one bad apply on a monolithic state file taking down prod.'),
        ],
      ),
      fullModule(
        'HCL Syntax & Providers',
        [
          kw('resource block', 'resource "type" "name" { } declares a managed infrastructure object'),
          kw('data block', 'data "type" "name" { } reads existing infra without managing it'),
          kw('variable block', 'typed input parameter with optional default/validation'),
          kw('output block', 'exposes values to parent module or CLI'),
          kw('provider block', 'configures auth/region/alias for a provider plugin'),
          kw('required_providers', 'version constraints in terraform { } block, pinned per provider'),
          kw('Provider plugin architecture', 'separate binaries via gRPC, downloaded to .terraform/providers'),
          kw('Meta-arguments', 'count, for_each, depends_on, lifecycle, provider (alias selection)'),
          kw('Version constraint operators', '~>, >=, != control allowed provider/module versions'),
        ],
        [
          qaPair('Why pin provider versions with ~>?', 'Prevents surprise breaking changes from minor/patch upgrades mid-pipeline.'),
          qaPair('When do you need a provider alias?', 'Multi-region or multi-account resources in one config, e.g. us-east-1 vs us-west-2.'),
          qaPair('resource vs data source?', 'resource manages lifecycle; data source only reads, no create/update/destroy.'),
          qaPair('How does Terraform actually talk to AWS?', 'Core calls the provider plugin over gRPC, which wraps the AWS SDK/API.'),
        ],
      ),
      fullModule(
        'Terraform Workflow',
        [
          kw('terraform init', 'downloads providers/modules, configures backend'),
          kw('terraform validate', 'syntax/internal consistency check, no state or API calls'),
          kw('terraform plan', 'builds execution plan against refreshed state'),
          kw('terraform apply', 'executes plan, updates state'),
          kw('terraform destroy', 'plan with all resources marked for deletion'),
          kw('.terraform.lock.hcl', 'records exact provider versions/hashes, commit to VCS'),
          kw('Dependency graph', 'DAG built from references and depends_on, drives parallelism'),
          kw('Refresh', 'reconciles state with real infra before diffing (now part of plan)'),
          kw('Parallelism', 'default 10 concurrent resource operations, tunable via -parallelism'),
        ],
        [
          qaPair('Why commit .terraform.lock.hcl?', 'Guarantees identical provider versions across every teammate and CI run.'),
          qaPair('What determines apply ordering?', 'The dependency graph from implicit refs and explicit depends_on, not file order.'),
          qaPair('init succeeds but plan fails on provider auth — why?', "init only fetches plugins, doesn't validate credentials or connectivity."),
          qaPair('How do you speed up a slow apply on 500 resources?', 'Raise -parallelism cautiously, or split state via modules/workspaces to shrink blast radius.'),
        ],
      ),
      fullModule(
        'State Management',
        [
          kw('terraform.tfstate', 'JSON mapping resource addresses to real-world IDs and attributes'),
          kw('Remote backend', 'S3, Azure Blob, GCS, Terraform Cloud store state outside local disk'),
          kw('State locking', 'DynamoDB (S3 backend) or native TFC locking prevents concurrent writes'),
          kw('terraform state mv', 'rename/move resource in state without destroy/recreate'),
          kw('terraform state rm', 'remove resource from state, leaves real infra untouched'),
          kw('terraform import', 'bind existing infra to a resource address in state'),
          kw('Sensitive state data', 'secrets/passwords stored in plaintext in state, must encrypt at rest'),
          kw('State file corruption', 'partial writes/manual edits can desync state from reality'),
          kw('terraform refresh / plan -refresh-only', 'sync state with real infra without changing config'),
        ],
        [
          qaPair('Why remote state over local?', 'Team collaboration, locking, and encryption at rest instead of a laptop-only tfstate.'),
          qaPair('You lost the DynamoDB lock table — what now?', 'Recreate it and, if a stale lock persists, force-unlock only after confirming no other apply is running.'),
          qaPair('How do you rename a resource without downtime?', 'terraform state mv to remap the address, avoiding destroy/recreate.'),
          qaPair('State file leaked in a git commit — impact?', 'Treat all embedded secrets as compromised and rotate them immediately, then scrub history.'),
          qaPair('import vs writing the resource block first?', 'Write the config first, then import, to avoid plan showing a destroy/recreate diff.'),
        ],
      ),
      fullModule(
        'Modules',
        [
          kw('module block', 'module "name" { source = ... } instantiates reusable config'),
          kw('source types', 'local path, Git URL, Terraform Registry, S3, HTTP'),
          kw('Module versioning', 'version constraint pinned for registry/Git tag sources'),
          kw('Root module', 'the working directory Terraform is run from'),
          kw('Child module', 'any module called from root or another module'),
          kw('Terraform Registry', 'public/private hub for versioned, discoverable modules'),
          kw('count/for_each on modules', 'instantiate N copies of a module from a list/map'),
          kw('Module composition', "outputs of one module feeding inputs of another"),
          kw('Nested modules', 'depth adds complexity, generally keep to 1-2 levels'),
        ],
        [
          qaPair('Why version-pin modules?', 'An unpinned Git ref can silently change behavior on the next init.'),
          qaPair('When do you split a monolith config into modules?', 'When blast radius or team ownership boundaries demand independent state/plan cycles.'),
          qaPair('for_each vs count for multiple module instances?', 'for_each avoids index-shift issues when the list order/membership changes.'),
          qaPair('Local path vs registry module source?', 'Local for tightly-coupled, unreleased internal logic; registry for shared, versioned reuse.'),
        ],
      ),
      fullModule(
        'Variables & Outputs',
        [
          kw('Variable types', 'string, number, bool, list, map, set, object, tuple'),
          kw('validation block', 'custom condition + error_message enforced at plan time'),
          kw('sensitive = true', 'redacts value from CLI output, still stored plaintext in state'),
          kw('Output values', 'expose child module or root data, consumed by -json or remote_state'),
          kw('locals block', 'named expressions for DRY, computed once per run'),
          kw('Variable precedence', 'CLI -var > tfvars file > TF_VAR_ env > default'),
          kw('terraform.tfvars', 'auto-loaded variable definitions file'),
          kw('Type constraints', 'optional() for object attributes with defaults'),
        ],
        [
          qaPair('sensitive = true fully protects a secret?', 'No, it only masks CLI/plan output; the state file still holds it in plaintext.'),
          qaPair('Why use locals over repeating expressions?', 'Single source of truth, easier refactors, avoids drift between duplicated logic.'),
          qaPair('Variable precedence gotcha you\'ve hit?', 'A stray TF_VAR_ env var in CI silently overriding an intended tfvars value.'),
          qaPair('What does a validation block actually prevent?', 'Bad input caught at plan time instead of a cryptic provider API error mid-apply.'),
        ],
      ),
      fullModule(
        'Workspaces',
        [
          kw('terraform workspace new/select/list', 'manage multiple named state files per config'),
          kw('default workspace', 'always exists, used if none created'),
          kw('terraform.workspace', 'interpolate current workspace name into config'),
          kw('State isolation', 'each workspace gets its own state, same backend/config'),
          kw('Use case', 'quick ephemeral environments (PR previews) from identical config'),
          kw('Limitation', 'no separate variable values or provider creds per workspace natively'),
          kw('Directory-per-environment alternative', 'separate root modules/tfvars per env, more explicit'),
          kw('Anti-pattern', 'using workspaces for prod vs dev with materially different configs'),
        ],
        [
          qaPair('Why avoid workspaces for prod/dev separation?', 'Same config forces identical resource shape, and one blast radius mistake can cross environments.'),
          qaPair('When are workspaces actually useful?', 'Short-lived, identical-shape environments like per-PR ephemeral stacks.'),
          qaPair('How do teams usually isolate prod safely instead?', 'Separate state files/backends per environment via directories or separate root modules.'),
        ],
      ),
      fullModule(
        'Provisioners & Data Sources',
        [
          kw('local-exec', 'runs a command on the machine running Terraform'),
          kw('remote-exec', 'runs a command on the provisioned resource via SSH/WinRM'),
          kw('"Last resort" guidance', 'HashiCorp docs explicitly discourage provisioners, prefer native resources/cloud-init'),
          kw('null_resource', 'resource with no infra, used to trigger provisioners via triggers map'),
          kw('terraform_data', 'modern replacement for null_resource (1.4+)'),
          kw('data source', 'reads existing infra, e.g. data "aws_ami" "this" for latest AMI lookup'),
          kw('Provisioner failure behavior', 'on_failure = continue/fail controls apply outcome'),
          kw('Push vs pull config', 'provisioners push; tools like Ansible/cloud-init pull/bootstrap instead'),
        ],
        [
          qaPair('Why are provisioners discouraged?', 'No idempotency guarantee and failures leave resources tainted with no clean rollback.'),
          qaPair('Real alternative to remote-exec for bootstrapping?', 'Bake config into user_data/cloud-init or a pre-built AMI instead.'),
          qaPair('When is null_resource/terraform_data still justified?', 'Triggering one-off actions with no direct resource mapping, e.g. invalidating a CDN cache.'),
          qaPair('data source returns stale results — why?', "It's only evaluated at plan/apply time, not continuously refreshed like a live query."),
        ],
      ),
      fullModule(
        'Terraform Cloud/Enterprise',
        [
          kw('Remote execution', "plan/apply runs in TFC's environment, not local laptop/CI runner"),
          kw('Sentinel', 'policy-as-code, enforces guardrails before apply (cost, tagging, security)'),
          kw('Run triggers', 'chain runs across workspaces on upstream state changes'),
          kw('VCS-driven workflow', 'auto-plan on PR, apply on merge, tied to a repo branch'),
          kw('Workspaces (TFC)', 'distinct from CLI workspaces, each maps to its own state/variables/VCS repo'),
          kw('Private module registry', 'internal versioned module sharing within an org'),
          kw('Cost estimation', 'TFC/E shows projected cost delta in plan output'),
          kw('State versioning/audit', "every apply's state snapshot retained with run history"),
        ],
        [
          qaPair('Sentinel vs OPA for policy?', 'Sentinel is native/tightly integrated with TFC; OPA is open-source and used broadly outside HashiCorp\'s stack.'),
          qaPair('Why remote execution over local apply?', "Consistent environment, audit trail, and no one's laptop holding prod credentials."),
          qaPair('How do run triggers help multi-stack setups?', "Automatically kick off a downstream workspace plan when an upstream workspace's state changes."),
          qaPair('TFC workspace vs CLI workspace — same thing?', 'No, TFC workspaces are fully isolated with their own variables and VCS binding, unlike lightweight CLI workspaces.'),
        ],
      ),
      fullModule(
        'Terragrunt',
        [
          kw('terragrunt.hcl', 'wrapper config per environment, keeps root Terraform modules DRY'),
          kw('remote_state block', 'auto-generates backend config, avoids copy-pasted backend blocks'),
          kw('generate block', 'writes provider.tf/backend.tf boilerplate into each module at runtime'),
          kw('dependency block', "pulls outputs from another Terragrunt stack, builds cross-stack graph"),
          kw('dependencies block', 'simpler ordering-only declaration vs full output passing'),
          kw('include block', 'inherit parent terragrunt.hcl config down a directory tree'),
          kw('run-all', 'apply/plan/destroy across multiple stacks in dependency order'),
          kw('Environment sync pattern', 'one module source, many thin env folders with only var overrides'),
        ],
        [
          qaPair('Why Terragrunt on top of plain Terraform?', 'Eliminates repeated backend/provider boilerplate across dozens of environment folders.'),
          qaPair('dependency vs data source for cross-stack refs?', "dependency block reads another Terragrunt stack's outputs directly, no remote_state data source wiring needed."),
          qaPair('Risk of run-all apply?', "Broad blast radius if the dependency graph is wrong or a shared module changes unexpectedly."),
          qaPair('How does Terragrunt keep 20 environments in sync?', 'Single source module referenced by version, with only tfvars/inputs differing per environment folder.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('terraform init', 'initialize backend, download providers/modules'),
          kw('terraform plan -out=plan.tfplan', 'save plan for guaranteed-consistent apply'),
          kw('terraform apply plan.tfplan', 'apply an exact saved plan, no re-diff surprises'),
          kw('terraform destroy -target=resource', 'targeted destroy, use sparingly'),
          kw('terraform fmt -recursive', 'canonical formatting across all .tf files'),
          kw('terraform validate', 'config syntax/type check without touching state'),
          kw('terraform state list', 'enumerate all resources tracked in state'),
          kw('terraform state show <addr>', 'dump attributes of one resource in state'),
          kw('terraform import <addr> <id>', 'bring existing infra under management'),
          kw('terraform taint / -replace=<addr>', 'force resource recreation on next apply'),
          kw('terraform output -json', 'machine-readable outputs for scripting/chaining'),
          kw('terraform graph', 'emit DAG in DOT format for visualization'),
          kw('-var-file=prod.tfvars', 'load environment-specific variable values'),
        ],
        [],
      ),
      fullModule(
        'Terraform Alternatives',
        [
          kw('Pulumi', 'general-purpose languages (TS/Python/Go) instead of HCL, same declarative state model'),
          kw('AWS CloudFormation', 'native AWS IaC, no state file (AWS manages it), AWS-only'),
          kw('Azure Bicep', 'DSL transpiling to ARM JSON, Azure-only, no separate state file'),
          kw('Ansible', 'imperative/procedural config management, agentless via SSH, great for post-provision config'),
          kw('Provisioning vs configuration', 'Terraform/Pulumi provision infra; Ansible/Chef configure it after'),
          kw('CDK (AWS/Terraform CDK)', 'imperative code generating CloudFormation or HCL/JSON under the hood'),
          kw('State ownership model', 'Terraform/Pulumi need explicit state; CloudFormation/Bicep delegate state to the cloud provider'),
        ],
        [
          qaPair('When would you pick Pulumi over Terraform?', 'Team already fluent in TypeScript/Python and wants real loops/testing frameworks, not HCL.'),
          qaPair('CloudFormation over Terraform — when?', 'Pure AWS shop wanting zero external state management and tight native service support.'),
          qaPair('Terraform vs Ansible — competing or complementary?', 'Complementary — Terraform provisions the VM/cluster, Ansible configures what runs on it.'),
        ],
      ),
    ],
  }
}

function serviceMeshSubject() {
  return {
    id: uid('subj'),
    icon: '🕸️',
    name: 'Service Mesh',
    modules: [
      fullModule(
        'Service Mesh Architecture',
        [
          kw('Data plane', 'proxies (Envoy) intercepting every pod\'s inbound/outbound traffic'),
          kw('Control plane', 'istiod: config distribution, service discovery, cert issuance'),
          kw('Sidecar pattern', 'proxy injected as second container in the same pod, shares netns'),
          kw('iptables redirect', 'init container rewrites routing so all traffic hits the sidecar transparently'),
          kw('xDS protocol', 'istiod pushes config to Envoy over gRPC (LDS/RDS/CDS/EDS)'),
          kw('Ambient mesh', 'sidecar-less mode using ztunnel (L4) + waypoint proxies (L7)'),
          kw('Library-based mesh (old style)', 'Hystrix/Ribbon baked into app code, language-locked'),
          kw('East-west traffic', "service-to-service inside cluster, the mesh's primary job"),
          kw('North-south traffic', 'ingress/egress at cluster edge, handled by gateways not sidecars'),
        ],
        [
          qaPair('Why a mesh instead of a shared library like Hystrix?', 'Library couples retry/circuit-break logic to app language and redeploy cycle, sidecar decouples it entirely.'),
          qaPair('What\'s the real cost of the sidecar model?', 'Doubled hop latency and per-pod memory overhead, which is why ambient mode exists now.'),
          qaPair('How does traffic actually get into the sidecar?', 'An init container writes iptables rules that transparently redirect the pod\'s traffic through the proxy.'),
          qaPair('When would you NOT recommend a mesh?', "Small team, <20 services, no compliance mandate for mTLS — the ops overhead isn't worth it yet."),
          qaPair('What\'s the single biggest architectural risk of Istio?', "istiod as a control-plane SPOF — if it's down, running proxies survive on cached config but nothing new gets pushed."),
        ],
      ),
      fullModule(
        'Istio Components',
        [
          kw('istiod', 'unified control plane: Pilot (config), Citadel (certs), Galley (validation) merged'),
          kw('Envoy sidecar', 'data-plane proxy handling mTLS, routing, retries, telemetry'),
          kw('istio-proxy', 'the actual container name of the injected Envoy sidecar'),
          kw('Ingress gateway', 'Envoy at the edge for traffic entering the mesh'),
          kw('Egress gateway', 'controls/audits traffic leaving the mesh to external services'),
          kw('Automatic injection', 'istio-injection=enabled namespace label triggers webhook'),
          kw('Manual injection', 'istioctl kube-inject for one-off or CI-rendered manifests'),
          kw('MutatingWebhookConfiguration', 'admission webhook that actually inserts the sidecar'),
          kw('Gateway resource', 'L4-L6 config for gateway proxies (ports, TLS), pairs with VirtualService'),
        ],
        [
          qaPair("Sidecar didn't get injected, why?", 'Namespace missing the istio-injection=enabled label or injection webhook is down/misconfigured.'),
          qaPair('Difference between Istio Gateway and Kubernetes Ingress?', 'Gateway is pure L4-L6 (ports/TLS), routing rules live separately in VirtualService — cleaner separation of concerns.'),
          qaPair('Why use an egress gateway instead of direct outbound calls?', 'Centralizes TLS origination, policy, and audit logging for external calls instead of scattering it per-pod.'),
          qaPair("What broke after upgrading istiod but not sidecars?", 'Version skew — always keep proxy versions within N-1 of control plane or xDS negotiation gets flaky.'),
        ],
      ),
      fullModule(
        'Traffic Management',
        [
          kw('VirtualService', 'L7 routing rules: match, weight-based split, retries, timeouts, fault injection'),
          kw('DestinationRule', 'subsets, load balancing policy, connection pool, outlier detection'),
          kw('Canary/traffic splitting', 'weighted routing across subsets defined in DestinationRule'),
          kw('Subset', 'named group of endpoints filtered by pod labels (e.g., version: v2)'),
          kw('Retries', 'configurable attempts + perTryTimeout, retryOn conditions (5xx, gateway-error)'),
          kw('Circuit breaking', 'outlierDetection: consecutive5xxErrors ejects unhealthy endpoints from LB pool'),
          kw('Timeout', 'request-level deadline in VirtualService, independent of retry budget'),
          kw('Fault injection', 'abort/delay injected at proxy for chaos testing without touching app code'),
          kw('Traffic mirroring', 'mirror field shadows live traffic to a test subset, response discarded'),
        ],
        [
          qaPair('Canary rollout works but instantly floods v2 with errors?', 'Missing outlierDetection in DestinationRule — no ejection means one bad pod tanks the whole subset.'),
          qaPair('Retries made an outage worse, why?', 'Retry storm — no perTryTimeout/retry budget, so retries multiplied load on an already-failing backend.'),
          qaPair('VirtualService changes not taking effect?', 'Usually a host mismatch between VirtualService and DestinationRule, or config stuck in a conflicting subset.'),
          qaPair('How do you test a new version safely against prod traffic?', "Mirror traffic to it via the mirror field, evaluate metrics, and never rely on its response."),
          qaPair('Client sees connection resets under load?', 'Connection pool limits (maxConnections/http1MaxPendingRequests) in DestinationRule are too tight for the traffic burst.'),
        ],
      ),
      fullModule(
        'Security',
        [
          kw('mTLS', 'automatic mutual TLS between sidecars using SPIFFE-based workload identity'),
          kw('PERMISSIVE mode', 'accepts both plaintext and mTLS, used for incremental migration'),
          kw('STRICT mode', 'mTLS only, rejects plaintext, needed for compliance-grade isolation'),
          kw('PeerAuthentication', 'sets mTLS mode at mesh/namespace/workload level'),
          kw('AuthorizationPolicy', 'allow/deny rules by source identity, namespace, or JWT claims'),
          kw('RequestAuthentication', 'validates JWT (issuer, JWKS) before AuthorizationPolicy evaluates'),
          kw('SPIFFE identity', 'spiffe://cluster.local/ns/<ns>/sa/<sa> encoded in workload cert'),
          kw('Citadel (in istiod)', 'issues and rotates workload certs automatically'),
          kw('DENY-by-default', 'AuthorizationPolicy with no rules + action DENY locks down a namespace'),
        ],
        [
          qaPair('Migrating a legacy app to mTLS broke it, why?', 'Jumped straight to STRICT — should stage through PERMISSIVE first while non-meshed clients catch up.'),
          qaPair('JWT valid but request still 403s?', 'RequestAuthentication only validates the token, AuthorizationPolicy still needs an explicit rule to allow the claim.'),
          qaPair('How do you actually prove mTLS is enforced, not just configured?', 'Check PeerAuthentication STRICT plus tcpdump/istioctl proxy-config to confirm no plaintext listener exists.'),
          qaPair("Namespace-wide deny policy locked out even the ingress gateway?", "Forgot to scope an allow rule for the gateway's own identity before applying default-deny."),
          qaPair('Cert rotation caused a brief mTLS outage?', 'Workload cert TTL misaligned with istiod restart/rotation window — monitor cert expiry via istioctl proxy-config secret.'),
        ],
      ),
      fullModule(
        'Observability',
        [
          kw('Envoy access logs', 'per-request L7 logs enabled via meshConfig accessLogFile'),
          kw('Prometheus metrics', 'istio_requests_total, istio_request_duration_milliseconds from sidecars'),
          kw('Distributed tracing', 'trace context (B3/W3C traceparent) propagated hop-to-hop via Envoy'),
          kw('Trace header propagation', 'app must forward incoming trace headers or spans break'),
          kw('Kiali', 'service graph, config validation, and traffic visualization UI'),
          kw('Jaeger/Zipkin', 'tracing backends Istio exports spans to'),
          kw('Grafana dashboards', 'prebuilt Istio dashboards for mesh/service/workload views'),
          kw('Telemetry API', 'mesh-wide config for metrics/tracing/access-log providers (replaces old Mixer)'),
          kw('Golden signals', 'latency, traffic, errors, saturation all derivable from Envoy stats'),
        ],
        [
          qaPair('Traces show gaps between services, why?', "App isn't forwarding the incoming traceparent header, so Envoy can't stitch the span chain."),
          qaPair("Kiali shows a service as unhealthy but app team says it's fine?", "Usually mTLS/policy mismatch reported as connection errors, not an app-level failure."),
          qaPair('How do you get per-request logs without killing performance?', 'Sample access logs or filter by status code instead of logging 100% of traffic mesh-wide.'),
          qaPair('Prometheus cardinality exploded after a release?', 'New high-cardinality labels (e.g., per-user paths) leaking into istio_requests_total dimensions.'),
          qaPair('Someone asks "prove this call actually happened," what do you check first?', 'Envoy access logs on both source and destination sidecars, not app logs.'),
        ],
      ),
      fullModule(
        'Installation & Upgrade',
        [
          kw('istioctl install', 'applies an IstioOperator profile to the cluster'),
          kw('Profiles', 'default, minimal, demo, ambient — predefine component sets'),
          kw('IstioOperator CR', 'declarative spec for control plane customization'),
          kw('Revision-based upgrade', 'install istiod as istiod-1-20 alongside istiod-1-19, canary style'),
          kw('istio.io/rev label', 'namespace/pod label pins which istiod revision injects its sidecar'),
          kw('In-place upgrade', 'replaces control plane directly, riskier, no coexistence period'),
          kw('Canary control plane', 'run two istiod revisions, shift namespaces gradually, then revoke old'),
          kw('Data plane upgrade', 'sidecars must be individually restarted to pick up new Envoy version'),
          kw('istioctl x precheck', 'validates compatibility before upgrading'),
        ],
        [
          qaPair('Why prefer revision-based over in-place upgrades?', 'Lets you canary the control plane per-namespace and roll back instantly by relabeling.'),
          qaPair('Upgraded istiod but workloads still behave old?', "Sidecars need explicit rollout restart, they don't hot-swap Envoy binaries on their own."),
          qaPair("What's the biggest gotcha in a revision upgrade?", 'Forgetting to also update the injection label on namespaces, leaving new pods pinned to the old revision.'),
          qaPair('How do you validate before touching prod?', 'istioctl x precheck plus istioctl analyze against a staging cluster on the same K8s version.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('istioctl install -f <profile.yaml>', 'installs/updates control plane from an IstioOperator file'),
          kw('istioctl proxy-status', 'shows xDS sync state (SYNCED/STALE) for all sidecars vs istiod'),
          kw('istioctl proxy-config cluster <pod>', "dumps Envoy's CDS (cluster/upstream) config"),
          kw('istioctl proxy-config listener <pod>', "dumps Envoy's LDS (listener) config"),
          kw('istioctl proxy-config route <pod>', "dumps Envoy's RDS (route) config"),
          kw('istioctl proxy-config secret <pod>', 'inspects mTLS certs loaded into the sidecar'),
          kw('istioctl analyze', 'static validation of mesh config for common misconfigurations'),
          kw('istioctl dashboard kiali/grafana/jaeger', 'port-forwards and opens the respective UI'),
          kw('kubectl label namespace <ns> istio-injection=enabled', 'enables auto sidecar injection'),
          kw('istioctl x precheck', 'pre-upgrade compatibility check against the target version'),
        ],
        [],
      ),
      fullModule(
        'Service Mesh Alternatives',
        [
          kw('Linkerd', 'Rust-based micro-proxy, simpler UX, lower resource footprint than Istio'),
          kw('Consul Connect', 'HashiCorp mesh, strong multi-platform/VM support beyond just K8s'),
          kw('Cilium Service Mesh', 'eBPF-based, sidecar-less by design, kernel-level enforcement'),
          kw('eBPF', 'programs run in kernel, bypasses per-pod proxy hop for L3/L4 policy'),
          kw('Ambient mode (Istio)', "Istio's own answer to sidecar tax: ztunnel + waypoint"),
          kw('Sidecar tax', 'latency/memory overhead common criticism driving eBPF/ambient adoption'),
          kw('Multi-cluster mesh', 'Istio/Consul support it natively, Linkerd needs more manual wiring'),
          kw('No-mesh alternative', 'mTLS via cert-manager + NetworkPolicy for basic needs without a mesh'),
        ],
        [
          qaPair('When would you pick Linkerd over Istio?', "Small-to-mid platform team wanting mTLS and observability without Istio's operational complexity."),
          qaPair("When does Cilium's eBPF approach win over sidecars?", 'Latency-sensitive, high-density clusters where sidecar CPU/memory tax across thousands of pods is unacceptable.'),
          qaPair('When do you tell a team to skip a mesh entirely?', 'Handful of services, no strict compliance driver — NetworkPolicy plus cert-manager mTLS covers 80% of the need for 20% of the cost.'),
        ],
      ),
    ],
  }
}

function observabilitySubject() {
  return {
    id: uid('subj'),
    icon: '📊',
    name: 'Observability',
    modules: [
      fullModule(
        'Observability Pillars',
        [
          kw('Three pillars', 'metrics (aggregated numeric), logs (discrete events), traces (request flow across services)'),
          kw('Cardinality', 'number of unique label/tag combinations; explodes cost and memory in TSDB'),
          kw('Structured logging', 'JSON/key-value fields, machine-parseable, enables field-level queries'),
          kw('Unstructured logging', 'free-text lines, needs regex/grok parsing, harder to index cheaply'),
          kw('Correlation ID', 'trace_id/request_id threaded through logs/traces to tie signals together'),
          kw('Exemplars', 'links from a metric bucket to a sample trace for that data point'),
          kw('USE method', 'utilization, saturation, errors — for resource-oriented monitoring'),
          kw('RED method', 'rate, errors, duration — for request-oriented service monitoring'),
          kw('Push vs pull', 'Prometheus pulls (scrape), StatsD/CloudWatch pushes; affects failure detection'),
        ],
        [
          qaPair('When do logs beat metrics for debugging?', "Metrics tell you something's wrong, logs tell you why, at the cost of storage."),
          qaPair("Biggest cardinality mistake you've seen?", 'Putting user_id or raw URL path as a label, blew up Prometheus memory overnight.'),
          qaPair('RED vs USE, when do you use which?', 'RED for services/APIs, USE for infrastructure like CPU/disk/network.'),
          qaPair('Why structured logging in production?', 'Enables field queries and correlation without regex parsing at 2am.'),
        ],
      ),
      fullModule(
        'Prometheus Architecture',
        [
          kw('Pull-based scraping', 'Prometheus scrapes /metrics over HTTP on an interval, no agent push required'),
          kw('TSDB', 'custom time-series storage engine, 2-hour blocks compacted, WAL for crash recovery'),
          kw('Service discovery', 'Kubernetes SD, Consul SD, EC2/file SD to dynamically find scrape targets'),
          kw('Exporters', 'node_exporter, blackbox_exporter, kube-state-metrics translate third-party metrics to Prometheus format'),
          kw('Pushgateway', "for short-lived batch jobs that can't be scraped, use sparingly"),
          kw('remote_write/remote_read', 'ships samples to long-term stores like Thanos, Mimir, Cortex'),
          kw('Federation', 'a Prometheus server scrapes aggregated metrics from other Prometheus servers'),
          kw('Scrape_interval/scrape_timeout', 'per-job config controlling frequency and staleness'),
          kw('Staleness handling', 'series marked stale (NaN) if not scraped within 5min window'),
        ],
        [
          qaPair('Why pull instead of push?', 'Simpler service discovery, target health = scrape success, avoids thundering herd on ingest.'),
          qaPair('How do you scale Prometheus beyond one server?', 'Federation for aggregation, or remote_write to Thanos/Mimir for global query and long retention.'),
          qaPair('When do you actually need Pushgateway?', 'Only for ephemeral batch/cron jobs, never as a general push replacement, it becomes a stale-metric graveyard otherwise.'),
          qaPair('How does Prometheus survive a crash mid-write?', 'WAL replay on startup before the block is compacted into TSDB.'),
          qaPair('How do you monitor multi-cluster without one giant Prometheus?', 'Per-cluster Prometheus plus remote_write to a central Thanos/Cortex for global view.'),
        ],
      ),
      fullModule(
        'PromQL',
        [
          kw('Instant vector', 'single sample per series at one timestamp'),
          kw('Range vector', 'series of samples over a time window, e.g. http_requests_total[5m]'),
          kw('rate()', 'per-second average increase for counters, handles resets, needs >=2 points in range'),
          kw('irate()', 'instantaneous rate from last two points, spiky, avoid in alert rules'),
          kw('histogram_quantile()', 'computes quantile from _bucket series, requires le label'),
          kw('increase()', 'rate() * range duration, extrapolated total increase'),
          kw('Aggregation operators', 'sum, avg, max, min, count by (label) / without (label)'),
          kw('Recording rules', 'precompute expensive PromQL into new series for faster dashboards/alerts'),
          kw('offset', 'shifts a query back in time for comparison, e.g. rate(x[5m] offset 1d)'),
        ],
        [
          qaPair('Why does rate() sometimes look flat wrong after a pod restart?', 'Counter resets are handled by rate(), but too short a window with few scrapes gives noisy estimates.'),
          qaPair('Why avoid irate() in alerts?', "It's based on just two samples so it's too noisy, causes flapping alerts."),
          qaPair('How do you get p99 latency from Prometheus histograms?', 'histogram_quantile(0.99, sum(rate(bucket[5m])) by (le)).'),
          qaPair('Why use recording rules at all?', 'Push expensive aggregations to scrape-time cost instead of query-time, keeps dashboards and alerts fast.'),
          qaPair("Counter vs gauge query mistake you've seen?", "Someone ran rate() on a gauge, meaningless output, rate/irate/increase are counter-only."),
        ],
      ),
      fullModule(
        'Alerting',
        [
          kw('Alertmanager', 'separate component handling routing, grouping, silencing, inhibition of firing alerts'),
          kw('Routing tree', 'route blocks match on labels, route to receivers (Slack, PagerDuty, email)'),
          kw('Grouping', 'group_by/group_wait/group_interval batch related alerts into one notification'),
          kw('Inhibition', 'suppress downstream alerts when a higher-severity one is already firing'),
          kw('Silences', 'time-boxed manual mute, used during planned maintenance'),
          kw('for: duration', 'alert must stay true this long before firing, avoids flapping on blips'),
          kw('Alert fatigue', 'too many low-value alerts causes real ones to get ignored'),
          kw('Repeat_interval', "how often a still-firing alert re-notifies"),
          kw('Severity labels', 'page vs ticket vs info, drives routing and on-call urgency'),
        ],
        [
          qaPair('How do you stop a single outage from paging the whole team 50 times?', 'Inhibition rules plus group_by on cluster/service so Alertmanager batches into one notification.'),
          qaPair('Why set for: 5m instead of firing instantly?', 'Filters transient blips, only pages on sustained problems, biggest lever against alert fatigue.'),
          qaPair('How do you handle planned maintenance without losing real alerts?', 'Time-boxed silence scoped tightly by label matchers, not a blanket mute.'),
          qaPair('Symptom of alert fatigue you\'ve actually fixed?', 'On-call muting PagerDuty entirely, root cause was noisy disk-usage alerts with no for: duration.'),
          qaPair('Routing design for multi-team org?', 'Route tree keyed on team/service labels with a catch-all default receiver as safety net.'),
        ],
      ),
      fullModule(
        'Grafana Dashboards',
        [
          kw('Data sources', 'Prometheus, Loki, Tempo, CloudWatch, Elasticsearch as pluggable backends'),
          kw('Variables/templating', '$var dropdowns driven by label_values() queries for reusable dashboards'),
          kw('Panel types', 'time series, stat, gauge, heatmap, table, logs panel'),
          kw('Dashboard JSON model', 'provisioned as code, versioned in git, imported via API/provisioning'),
          kw('Alerting in Grafana', 'unified alerting evaluates queries directly, routes via contact points'),
          kw('Alertmanager vs Grafana alerting', 'Grafana alerts good for multi-datasource, Alertmanager better for Prometheus-native routing maturity'),
          kw('Annotations', 'event markers (deploys, incidents) overlaid on graphs'),
          kw('Folder/permissions', 'RBAC on dashboards and data sources per team'),
          kw('Explore mode', 'ad-hoc query/log exploration outside saved dashboards'),
        ],
        [
          qaPair('Why provision dashboards as code instead of clicking in UI?', 'Git history, review, and reproducibility across environments, UI edits get lost or drift.'),
          qaPair('When would you use Grafana alerting over Alertmanager?', 'When alerting needs to span multiple data sources like Loki and CloudWatch, not just Prometheus.'),
          qaPair("Templating gotcha you've hit?", 'Multi-value variables silently break PromQL regex matching if you don\'t wrap with label=~"$var".'),
          qaPair('How do you correlate a spike with a deploy?', 'Annotations pushed from CI/CD pipeline onto the dashboard timeline.'),
        ],
      ),
      fullModule(
        'Logging Stack',
        [
          kw('ELK/EFK', 'Elasticsearch/Fluentd or Filebeat/Kibana, full-text indexed log pipeline'),
          kw('Loki', 'label-based indexing only, log content stored compressed and unindexed'),
          kw('LogQL', "Loki's query language, similar syntax to PromQL but for log streams"),
          kw('Index cardinality', 'ELK indexes every field, expensive; Loki indexes only labels, cheap'),
          kw('Retention/cost tradeoff', 'hot/warm/cold tiers, ILM policies, or object storage lifecycle rules'),
          kw('Fluentd/Fluent Bit/Vector', 'log shippers/agents, Fluent Bit lighter footprint for edge nodes'),
          kw('Full-text search', "ELK's core strength, expensive at scale vs Loki's grep-like approach"),
          kw('Log sampling/dropping', 'reduce volume by dropping debug-level or repetitive logs before shipping'),
        ],
        [
          qaPair('Why did you move from ELK to Loki?', "Elasticsearch indexing cost scaled with log volume, Loki's label-only index cut storage cost by an order of magnitude."),
          qaPair('When does Loki fall short vs ELK?', "Heavy ad-hoc full-text search across unstructured fields, Loki's grep-based scan gets slow at high volume."),
          qaPair('How do you control logging costs long-term?', 'Aggressive retention tiers, drop debug logs at the agent, and enforce structured logging to keep cardinality of indexed fields low.'),
          qaPair('Fluent Bit vs Fluentd choice?', 'Fluent Bit as lightweight DaemonSet shipper, Fluentd for heavier central aggregation/routing.'),
        ],
      ),
      fullModule(
        'Distributed Tracing',
        [
          kw('OpenTelemetry SDK', 'instruments app code to emit spans, vendor-neutral, replaced OpenTracing/OpenCensus'),
          kw('OTel Collector', 'receives/processes/exports telemetry, decouples app from backend (Tempo, Jaeger, Datadog)'),
          kw('Trace context propagation', 'W3C traceparent header carries trace_id/span_id across service hops'),
          kw('Span', 'single unit of work with start/end time, attributes, and parent reference'),
          kw('Trace', 'full tree of spans representing one end-to-end request'),
          kw('Sampling strategies', 'head-based (decide at start, cheap) vs tail-based (decide after seeing full trace, catches errors)'),
          kw('Baggage', 'key-value context propagated alongside trace for cross-service metadata'),
          kw('Context propagation loss', 'async boundaries/queues often drop trace context if not manually re-injected'),
        ],
        [
          qaPair('Head-based vs tail-based sampling tradeoff?', 'Head-based is cheap but can miss rare errors, tail-based catches every error trace but needs buffering at the collector.'),
          qaPair('Common tracing gap in production?', "Trace breaks at a message queue hop because context wasn't propagated into the message headers."),
          qaPair('Why standardize on OpenTelemetry?', 'Vendor-neutral instrumentation means swapping backends like Jaeger to Tempo doesn\'t require re-instrumenting code.'),
          qaPair('How do you keep tracing cost sane at high traffic?', 'Sample aggressively at head, but always keep 100% of error/slow traces via tail-based rules.'),
        ],
      ),
      fullModule(
        'SLOs & Error Budgets',
        [
          kw('SLI', 'service level indicator, the measured signal, e.g. successful request ratio'),
          kw('SLO', 'target threshold on an SLI over a window, e.g. 99.9% success over 30d'),
          kw('Error budget', '1 - SLO, the allowed amount of failure before policy kicks in'),
          kw('Burn rate', 'how fast the error budget is being consumed relative to the window'),
          kw('Multi-window multi-burn-rate alert', 'combines short+long windows to catch fast and slow burns with fewer false positives'),
          kw('Error budget policy', 'predefined actions (freeze releases, prioritize reliability work) when budget is exhausted'),
          kw('Toil', 'manual repetitive ops work SLOs help justify reducing via automation'),
          kw('Availability vs latency SLO', 'different SLIs need different measurement approaches (ratio vs percentile)'),
        ],
        [
          qaPair('Why multi-window multi-burn-rate instead of a simple threshold alert?', 'Catches both fast burns needing a page and slow burns needing a ticket, without paging on noise.'),
          qaPair('What happens when the error budget is exhausted?', 'Feature freeze, all engineering effort shifts to reliability per the pre-agreed error budget policy.'),
          qaPair('How do you pick a good SLI?', 'Measure what the user actually experiences, like request success ratio, not an internal proxy like CPU usage.'),
          qaPair('Pushback you\'ve gotten on SLOs?', 'Product wanting 99.99% everywhere, had to show the cost/complexity curve to negotiate a realistic target.'),
          qaPair('Common mistake teams make with error budgets?', 'Setting the SLO then never actually enforcing the policy when it\'s burned, makes the whole exercise theater.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('promtool check config prometheus.yml', 'validates scrape config syntax before reload'),
          kw('promtool check rules rules.yml', 'validates recording/alerting rule syntax and PromQL'),
          kw('promtool query instant <url> <query>', 'runs an instant PromQL query against a live server via API'),
          kw('promtool query range <url> <query> --start --end --step', 'runs a range query from CLI'),
          kw('curl -s localhost:9090/-/reload', 'triggers config reload via HTTP (needs --web.enable-lifecycle)'),
          kw('curl -s localhost:9100/metrics', "hits an exporter's metrics endpoint directly to debug scrape issues"),
          kw('amtool alert query', 'lists current alerts known to Alertmanager'),
          kw('amtool silence add', 'creates a silence from the CLI, scriptable for maintenance windows'),
          kw('amtool check-config alertmanager.yml', 'validates Alertmanager config'),
          kw('kubectl port-forward svc/prometheus 9090:9090', 'quick local access to a cluster Prometheus for debugging'),
        ],
        [],
      ),
      fullModule(
        'Observability Alternatives',
        [
          kw('Datadog', 'SaaS all-in-one, best-in-class UX, expensive at scale, fast time-to-value'),
          kw('New Relic', 'strong APM heritage, usage-based pricing, good for app-centric teams'),
          kw('Dynatrace', 'heavy automatic instrumentation/AI-driven root cause, best for large complex enterprise estates'),
          kw('Splunk', 'dominant for log-heavy security/compliance use cases, very expensive per GB ingested'),
          kw('Open-source stack', 'Prometheus/Grafana/Loki/Tempo, lowest direct cost, highest operational ownership burden'),
          kw('Vendor lock-in', 'proprietary query languages/agents make migrating off SaaS observability costly'),
          kw('Total cost of ownership', 'SaaS trades engineer-hours for licensing spend, self-hosted is the reverse'),
        ],
        [
          qaPair('When would you pick Datadog over self-hosted Prometheus/Grafana?', 'Small platform team without bandwidth to run HA TSDB, willing to pay for speed to value.'),
          qaPair('When does Splunk still win despite the cost?', 'Regulated environments needing strong compliance/security search tooling and audit trail out of the box.'),
          qaPair('Why did you migrate off a SaaS vendor to open-source?', 'Ingest-based pricing scaled faster than the business, self-hosting cut cost even after accounting for headcount to run it.'),
        ],
      ),
    ],
  }
}

function azureSubject() {
  return {
    id: uid('subj'),
    icon: '☁️',
    name: 'Azure',
    modules: [
      fullModule(
        'Identity & Governance',
        [
          kw('Entra ID (Azure AD)', 'cloud identity provider; tenant is the security boundary'),
          kw('RBAC', 'role assigned at scope (MG/Sub/RG/Resource), inherits downward'),
          kw('Owner/Contributor/Reader', 'full control / manage-not-grant-access / view-only'),
          kw('User Access Administrator', 'can assign roles but not manage resources'),
          kw('Management Group', 'groups subscriptions for policy/RBAC inheritance at scale'),
          kw('Azure Policy', 'enforces/audits config (e.g., allowed locations, SKUs); deny/audit/append effects'),
          kw('Initiative (Policy Set)', 'bundles related policies (e.g., CIS benchmark)'),
          kw('Tags', 'key-value metadata for cost allocation and automation, not inherited by default'),
          kw('PIM (Privileged Identity Management)', 'just-in-time elevation for privileged roles'),
          kw('Conditional Access', 'policy engine gating sign-in on device/location/risk'),
        ],
        [
          qaPair('Dev says RBAC role assigned but access still denied — why?', 'Check for a Deny-effect Azure Policy or a more specific Deny assignment overriding the RBAC grant.'),
          qaPair('Where do you assign RBAC for least-privilege at scale?', "At the resource group or resource level, not the subscription, unless it's genuinely a cross-cutting role like network admin."),
          qaPair("Tags not showing up on cost reports for a VM's disk?", "Tags aren't inherited automatically — you need policy-based tag inheritance or explicit tagging per resource."),
          qaPair('How do you stop everyone from using Owner role day-to-day?', 'PIM with time-bound eligible assignments and approval workflow instead of standing Owner.'),
          qaPair('Client wants policy enforced across 200 subscriptions instantly?', 'Assign the initiative at the Management Group level, not per-subscription.'),
        ],
      ),
      fullModule(
        'Compute',
        [
          kw('Availability Set', 'FD/UD grouping, protects against rack/host failure, single datacenter'),
          kw('Availability Zone', 'physically separate DC within a region, protects against DC-level failure'),
          kw('VM Scale Set (VMSS)', 'autoscaling identical VM fleet, supports zones + Flexible orchestration'),
          kw('Proximity Placement Group', 'forces low-latency co-location, conflicts with zone-spread'),
          kw('App Service Plan', 'SKU tier determines scale-out/up limits for Web Apps'),
          kw('Deployment Slots', 'swap staging/production with warm-up, near-zero downtime'),
          kw('Azure Functions', 'Consumption (cold start) vs Premium (VNet, no cold start) vs Dedicated plans'),
          kw('AKS', 'managed control plane free, you pay for/manage node pools'),
          kw('Node Pool', 'separate VMSS per AKS pool, enables mixed VM sizes/spot nodes'),
          kw('Spot VM / Spot Instance', 'deep discount, evicted on capacity reclaim, no SLA'),
        ],
        [
          qaPair('VMSS won\'t spread across zones as expected?', 'You\'re on Uniform orchestration with an old SKU list — switch to Flexible orchestration for real zone-aware placement.'),
          qaPair('Function app has 10s cold starts hurting latency SLA?', 'Move off Consumption to Premium plan for pre-warmed instances, or keep it always-on with App Service.'),
          qaPair('AKS upgrade caused pod evictions mid-business-hours?', "Should've used a surge upgrade strategy and PodDisruptionBudgets — nodes were cordoned/drained without respecting min-available."),
          qaPair('Why did an Availability Set not save us during the regional outage?', 'Availability Sets only protect against rack/host failure in one datacenter — you needed Availability Zones for that.'),
          qaPair('Team wants cheap batch compute for a nightly job?', 'Spot VMSS with a fallback regular pool — accept eviction, checkpoint the job.'),
        ],
      ),
      fullModule(
        'Containers',
        [
          kw('Azure Container Registry (ACR)', 'private image registry; geo-replication, ACR Tasks build/patch, content trust'),
          kw('Azure Container Instances (ACI)', 'serverless single containers, per-second billing, no orchestration'),
          kw('Azure Container Apps', 'serverless containers on managed K8s + KEDA + Dapr, scale-to-zero'),
          kw('AKS', 'managed Kubernetes control plane; you own node pools, upgrades, scaling'),
          kw('ACR Tasks', 'cloud-side image build on push, base-image update triggers, no local Docker'),
          kw('AcrPull + managed identity', 'nodes/apps pull from ACR without stored registry creds'),
          kw('KEDA (Container Apps)', 'event-driven autoscale, scale to zero on no traffic'),
          kw('Dapr (Container Apps)', 'sidecar building blocks: state, pub/sub, service invocation'),
        ],
        [
          qaPair('Run one container with no cluster, billed per second?', 'Azure Container Instances (ACI) — serverless, no orchestration to manage.'),
          qaPair('Microservices needing scale-to-zero + event scaling but not full K8s ops?', 'Azure Container Apps (KEDA/Dapr) — much lighter operational burden than AKS.'),
          qaPair('When do you pick AKS over Container Apps?', 'When you need full Kubernetes control — custom CNI, operators, node tuning — and can own the ops.'),
          qaPair('AKS image pull from ACR fails with unauthorized?', 'Attach ACR to the cluster (AcrPull via managed identity) instead of managing imagePullSecrets.'),
        ],
      ),
      fullModule(
        'Storage',
        [
          kw('Blob Storage', 'Block/Append/Page blobs; Block for general objects'),
          kw('Azure Files', 'SMB/NFS shares, backs Azure File Sync for hybrid caching'),
          kw('Queue Storage', 'simple async messaging, at-least-once, 7-day max TTL'),
          kw('Table Storage', 'NoSQL key-value, now under Cosmos DB Table API umbrella'),
          kw('LRS', '3 copies, single datacenter, cheapest, no DC-level protection'),
          kw('ZRS', '3 copies across zones in-region, survives DC loss'),
          kw('GRS', 'LRS + async replica in paired region, RA-GRS adds readable secondary'),
          kw('Access Tiers', 'Hot/Cool/Cold/Archive, tradeoff is storage cost vs retrieval cost+latency'),
          kw('Lifecycle Management', 'policy-based auto-tiering/deletion by blob age/access'),
          kw('SAS Token', 'scoped, time-limited access without sharing account keys'),
        ],
        [
          qaPair('App went down when primary region failed despite GRS?', 'GRS replication is async and not auto-failover — you must trigger account failover yourself (or use RA-GRS and read from secondary).'),
          qaPair('Restore from Archive tier took hours during an incident?', 'Archive is offline storage, rehydration takes hours — Archive is for compliance retention, never for anything on the recovery critical path.'),
          qaPair('Storage costs crept up over a year with no usage growth?', 'No lifecycle policy — cold blobs sat in Hot tier; added a rule to auto-tier to Cool/Archive by last-modified age.'),
          qaPair('Why not just share the storage account key with the reporting team?', 'Account keys grant full control — issue a scoped, time-limited SAS or use Entra ID RBAC on the data plane instead.'),
          qaPair('Which redundancy for a compliance-mandated DR posture across regions?', 'RA-GRS or GZRS depending on whether you also need zone resilience in the primary region.'),
        ],
      ),
      fullModule(
        'Databases',
        [
          kw('Azure SQL Database', 'PaaS SQL; DTU vs vCore, serverless, elastic pools, auto-failover groups'),
          kw('SQL Managed Instance', 'near-full SQL Server compat (SQL Agent, cross-db, CLR) for lift-and-shift'),
          kw('Cosmos DB', 'globally distributed multi-model; 5 consistency levels, RU throughput, partition key'),
          kw('PostgreSQL / MySQL Flexible Server', 'managed OSS DBs, zone-redundant HA, burstable tiers'),
          kw('Azure Cache for Redis', 'managed Redis for caching/session/pub-sub; Basic/Standard/Premium/Enterprise'),
          kw('Elastic Pool', 'share DTU/vCore across many databases with uncorrelated load'),
          kw('Auto-failover group', 'cross-region read-write listener failover for Azure SQL'),
          kw('Partition key (Cosmos)', 'high-cardinality, even distribution, avoids hot partitions'),
          kw('Consistency levels (Cosmos)', 'strong / bounded staleness / session / consistent prefix / eventual'),
        ],
        [
          qaPair('Lift-and-shift SQL Server using SQL Agent + cross-database queries?', 'SQL Managed Instance — Azure SQL DB lacks those instance-level features.'),
          qaPair('Global app needing single-digit-ms reads worldwide with tunable consistency?', 'Cosmos DB with a good partition key; Session consistency by default.'),
          qaPair('Why Session consistency as the Cosmos default?', 'Read-your-writes for the client without paying strong-consistency latency.'),
          qaPair('Many small DBs with spiky, uncorrelated load — cost control?', 'Elastic Pool, sharing capacity instead of over-provisioning each database.'),
          qaPair('Cheapest way to cut read load on a hot product catalog?', 'Azure Cache for Redis in front (cache-aside), not scaling up the database.'),
        ],
      ),
      fullModule(
        'Networking',
        [
          kw('VNet', 'isolated network space, regional, non-transitive peering by default'),
          kw('Subnet', 'carves VNet CIDR; some subnets reserved (GatewaySubnet, AzureFirewallSubnet)'),
          kw('NSG', 'stateful L3/L4 filter, applied at subnet and/or NIC level, priority-ordered rules'),
          kw('Load Balancer', 'L4, distributes TCP/UDP, Basic vs Standard SKU (zone redundancy differs)'),
          kw('Application Gateway', 'L7, path-based routing, WAF integration, SSL offload'),
          kw('VPN Gateway', 'IPsec over internet, SKU determines throughput/tunnel count'),
          kw('ExpressRoute', 'private MPLS/direct circuit, no internet transit, SLA-backed bandwidth'),
          kw('Private Endpoint', 'NIC with private IP into your VNet for a PaaS resource, kills public exposure'),
          kw('Service Endpoint', 'extends VNet identity to PaaS over Microsoft backbone, still public IP path'),
          kw('NAT Gateway', 'outbound-only SNAT at scale, avoids SNAT port exhaustion on LB'),
          kw('Azure Firewall', 'managed stateful L3-L7 firewall; FQDN filtering, threat intel, forced tunneling'),
          kw('Azure Bastion', 'RDP/SSH over TLS in the portal, no public IP on the VM'),
          kw('DDoS Protection', 'Standard tier adds adaptive tuning + cost-protection SLA vs free Basic'),
          kw('Azure DNS / Private DNS', 'public DNS hosting; Private DNS zones for VNet name resolution'),
          kw('Private Link', 'platform behind Private Endpoints; also publish your own service privately'),
          kw('Virtual WAN', 'managed global hub-and-spoke transit network at scale'),
          kw('Route Table / UDR', 'user-defined routes to force traffic through an NVA/firewall'),
        ],
        [
          qaPair("Two peered VNets, but a third VNet peered to both can't reach across?", 'Peering is non-transitive — you need a hub-spoke with a firewall/NVA or direct peering, not implicit transitivity.'),
          qaPair('Intermittent outbound connection failures under load?', 'SNAT port exhaustion behind a Standard LB — add a NAT Gateway for scalable outbound.'),
          qaPair('When do you pick ExpressRoute over VPN Gateway?', "When you need guaranteed bandwidth/SLA and can't tolerate internet-path latency/jitter, e.g., real-time replication."),
          qaPair('Storage account still reachable from the internet after adding a Private Endpoint?', "Public network access wasn't disabled on the resource — Private Endpoint adds a path, it doesn't block the old one automatically."),
          qaPair('App Gateway backend pool shows unhealthy but VMs are fine?', 'Usually an NSG or health probe path/port mismatch — check the probe config before touching compute.'),
          qaPair('Give ops RDP/SSH to VMs without any public IPs?', 'Azure Bastion — brokered RDP/SSH over TLS from the portal; VMs stay private.'),
          qaPair('Force all spoke egress through a central firewall?', 'UDR (route table) with 0.0.0.0/0 next-hop set to the Azure Firewall/NVA in the hub.'),
        ],
      ),
      fullModule(
        'Load Balancing & Traffic',
        [
          kw('Azure Load Balancer', 'L4 (TCP/UDP), regional, ultra-low latency; Basic vs Standard (zones, SLA)'),
          kw('Application Gateway', 'L7 (HTTP/S), regional; path/host routing, SSL offload, WAF, autoscaling v2'),
          kw('Azure Front Door', 'L7 global, anycast edge; CDN + caching + WAF + global HTTP load balancing'),
          kw('Traffic Manager', 'DNS-based global routing; returns an endpoint, no data path, health probes'),
          kw('Cross-region Load Balancer', 'global L4, single anycast frontend across regional load balancers'),
          kw('WAF', 'OWASP CRS on App Gateway or Front Door; detection vs prevention mode'),
          kw('TM routing methods', 'priority, weighted, performance, geographic, multivalue, subnet'),
          kw('Session affinity', 'cookie-based sticky backend on App Gateway'),
          kw('Health probes', 'per-service backend checks; eject unhealthy nodes from rotation'),
          kw('L4 vs L7', 'L4 routes on IP/port (fast, any protocol); L7 inspects HTTP (routing, WAF, TLS)'),
        ],
        [
          qaPair('Global HTTP entry with CDN + WAF + fast multi-region failover — which?', 'Azure Front Door (global L7, anycast edge, built-in CDN and WAF).'),
          qaPair('Regional L7 path-based routing to microservices with WAF?', 'Application Gateway (regional L7 + WAF).'),
          qaPair('Balance non-HTTP TCP traffic within one region at lowest latency?', 'Azure Load Balancer (L4).'),
          qaPair('Traffic Manager vs Front Door — the key difference?', 'Traffic Manager is DNS-only (client connects directly); Front Door proxies at the edge with caching, WAF, and TLS.'),
          qaPair('Why did Traffic Manager failover feel slow to users?', 'DNS TTL caching holds the old IP until it expires; Front Door failover is near-instant since it is at the edge.'),
          qaPair('App Gateway or Front Door for a single-region app?', 'App Gateway — Front Door is for global/multi-region; App Gateway covers regional L7 + WAF without the global overhead.'),
        ],
      ),
      fullModule(
        'API Management',
        [
          kw('API Management (APIM)', 'managed API gateway fronting backend APIs behind one facade'),
          kw('Gateway', 'enforces policies, routes to backends, terminates TLS'),
          kw('Products', 'bundle of APIs with access rules; consumers need a subscription'),
          kw('Subscriptions & keys', 'consumer access via subscription key, or OAuth2/JWT validation'),
          kw('Policies', 'inbound/backend/outbound pipeline: rate-limit, quota, transform, cache, validate-jwt, rewrite-uri'),
          kw('Self-hosted gateway', 'containerized gateway near on-prem/other-cloud backends, managed from Azure'),
          kw('Tiers', 'Consumption (serverless), Developer, Basic, Standard, Premium (VNet, multi-region, SLA)'),
          kw('Developer portal', 'auto-generated docs, try-it console, consumer onboarding'),
          kw('Versions & revisions', 'non-breaking revisions vs breaking versions'),
          kw('Named values / Key Vault', 'reusable config and secrets backed by Key Vault'),
        ],
        [
          qaPair('Expose 30 microservice APIs under one domain with keys, throttling, and docs?', 'API Management — one gateway with Products, subscription keys, and the developer portal.'),
          qaPair('APIM must route to APIs on-prem/AKS behind a firewall?', 'Deploy a self-hosted gateway container near the backend, managed from the Azure APIM instance.'),
          qaPair('APIM in front but the backend is still directly reachable — risk?', 'Consumers bypass the gateway; lock the backend to APIM only (VNet/Private Endpoint or IP allowlist).'),
          qaPair('Which tier for VNet integration + multi-region + 99.99% SLA?', 'Premium — Consumption/Developer lack VNet, multi-region, and SLA.'),
          qaPair('Turn a legacy SOAP/XML backend into clean REST/JSON for consumers?', 'APIM inbound/outbound policies (rewrite, XML-to-JSON, set-body) without changing the backend.'),
          qaPair('Rate-limit free consumers but not enterprise ones?', 'Separate Products with different rate-limit/quota policies, gated by subscription.'),
        ],
      ),
      fullModule(
        'Messaging & Integration',
        [
          kw('Service Bus', 'enterprise broker; queues + topics/subscriptions, sessions (FIFO), DLQ, transactions'),
          kw('Event Grid', 'reactive event routing (pub/sub) for discrete events, push delivery, near-real-time'),
          kw('Event Hubs', 'high-throughput streaming ingestion (millions/sec), Kafka-compatible, partitions'),
          kw('Storage Queue', 'simple, cheap queue; at-least-once, 7-day TTL, no advanced features'),
          kw('Logic Apps', 'low-code workflow/integration, 400+ connectors, orchestration'),
          kw('Topics & Subscriptions', 'Service Bus pub/sub with per-subscription filters'),
          kw('Dead-letter queue (DLQ)', 'captures poison/expired messages for inspection'),
          kw('Sessions', 'Service Bus FIFO + stateful ordered processing per session id'),
        ],
        [
          qaPair('Millions of IoT telemetry events/sec for stream processing?', 'Event Hubs — high-throughput streaming ingestion, partitions, Kafka-compatible.'),
          qaPair('Order processing needs guaranteed FIFO + transactions + dead-lettering?', 'Service Bus queues with sessions and a DLQ.'),
          qaPair('Trigger a function whenever a blob is uploaded?', 'Event Grid — reactive discrete-event pub/sub with push delivery.'),
          qaPair('Service Bus vs Storage Queue — when Storage Queue?', 'Simple, high-volume, cost-sensitive queueing with no need for FIFO/topics/transactions.'),
          qaPair('Event Grid vs Event Hubs vs Service Bus in one line?', 'Events to react to vs a telemetry stream to ingest vs commands/transactions to process reliably.'),
        ],
      ),
      fullModule(
        'Monitoring & Backup',
        [
          kw('Azure Monitor', 'umbrella for metrics, logs, alerts across resources'),
          kw('Log Analytics Workspace', 'KQL query store, region-bound, retention configurable'),
          kw('Diagnostic Settings', 'routes resource logs/metrics to LAW/Storage/Event Hub'),
          kw('Application Insights', 'APM for app-level traces, dependencies, live metrics'),
          kw('Action Group', 'reusable notification/automation target for alerts (email, webhook, Logic App, runbook)'),
          kw('Alert Rule', 'metric/log/activity-log based, has severity and evaluation frequency'),
          kw('Azure Backup (RSV)', 'Recovery Services Vault, policy-based VM/SQL/Files backup'),
          kw('Azure Site Recovery', 'replicates VMs for DR, RPO/RTO driven, supports failback'),
          kw('Soft Delete', 'protects backup data from accidental/malicious deletion for a retention window'),
          kw('Workbook', 'customizable visualization/report layer on top of Monitor data'),
        ],
        [
          qaPair('Alerts firing but nobody got notified?', "Action Group's email/webhook was misconfigured or the alert rule wasn't linked to it — always test-fire the action group after creating it."),
          qaPair('Backup vault ransomware-hit alongside production?', "That's why soft delete and cross-region/immutable vaults matter — enable soft delete and consider a separate subscription for backup isolation."),
          qaPair('ASR failover completed but app was broken?', 'Never tested failover — ASR recovery plans need scripted app-consistency steps and regular DR drills, not just replication.'),
          qaPair('Log Analytics costs spiked after onboarding a new app?', 'Verbose diagnostic categories (e.g., AllLogs) were enabled — scope diagnostic settings to needed categories and set retention/archive tiers.'),
          qaPair('RTO of 15 minutes demanded for a tier-1 VM — what\'s the design?', "ASR with frequent replication and a pre-tested recovery plan; Backup alone won't meet that RTO since restores aren't instant."),
        ],
      ),
      fullModule(
        'Cost Management & Governance',
        [
          kw('Cost Management + Billing', 'cost analysis, budgets, exports, scoped by MG/Sub/RG'),
          kw('Budget', "threshold-based alert, doesn't block spend, only notifies via action group"),
          kw('Azure Advisor', 'recommendations across cost/reliability/security/performance/operational excellence'),
          kw('Reserved Instance (RI)', '1/3-year commitment on specific VM SKU/region, up to ~70% discount'),
          kw('Savings Plan', 'hourly $ commitment, flexible across VM families/regions, less discount than RI'),
          kw('Azure Hybrid Benefit', 'reuse on-prem Windows Server/SQL licenses to cut VM cost'),
          kw('Cost Allocation', 'via tags/subscriptions, needed for chargeback to business units'),
          kw('Exports', 'scheduled cost data dumps to Storage for custom BI/Power BI'),
          kw('Spot pricing', 'variable, market-driven discount for interruptible workloads'),
          kw('Anomaly Detection', 'Cost Management alerts on unexpected spend spikes'),
        ],
        [
          qaPair('Finance says a budget alert should have stopped the overspend?', 'Budgets only alert, they don\'t cap usage — enforce hard limits via Azure Policy or subscription spending caps instead.'),
          qaPair('RI purchased but not applying discount to new VMs?', 'Scope mismatch or wrong instance size flexibility group — RIs apply automatically only within matching scope/SKU family.'),
          qaPair('Team ignored Advisor for a year, now over budget?', 'Advisor cost recommendations (idle resources, right-sizing) go stale if nobody triages them — needs a recurring ownership cadence, not a one-time review.'),
          qaPair('RI vs Savings Plan for a fleet with shifting VM sizes?', 'Savings Plan — you get flexibility across families/regions at the cost of a few points of discount versus a rigid RI.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('az login', 'interactive/device-code/service-principal auth to Azure CLI'),
          kw('az account set --subscription <id>', 'switch active subscription context'),
          kw('az group create -n <rg> -l <region>', 'create a resource group'),
          kw('az vm create -g <rg> -n <vm> --image <img> --generate-ssh-keys', 'provision a VM'),
          kw('az resource list --resource-group <rg> -o table', 'enumerate resources, tabular output'),
          kw('az deployment group create -g <rg> --template-file main.bicep', 'deploy ARM/Bicep template'),
          kw('--query "[].{Name:name}"', 'JMESPath filter/reshape of CLI JSON output'),
          kw('-o table / -o json / -o tsv', 'output format switch, tsv useful for scripting'),
          kw('az vm list-sizes / az vm list-skus -l <region>', 'check SKU availability per region'),
          kw('az monitor activity-log list --resource-group <rg>', 'audit recent control-plane actions'),
          kw('az network vnet/subnet create', 'create virtual networks and subnets'),
          kw('az network nsg rule create', 'add an NSG security rule'),
          kw('az network application-gateway create', 'provision an Application Gateway'),
          kw('az afd profile / endpoint create', 'provision Azure Front Door (afd)'),
          kw('az apim create', 'provision an API Management instance'),
        ],
        [],
      ),
      fullModule(
        'Azure Alternatives',
        [
          kw('Azure VM ↔ AWS EC2 ↔ GCP Compute Engine', 'IaaS virtual machines'),
          kw('AKS ↔ AWS EKS ↔ GCP GKE', 'managed Kubernetes control plane'),
          kw('Blob Storage ↔ AWS S3 ↔ GCP Cloud Storage', 'object storage'),
          kw('VNet ↔ AWS VPC ↔ GCP VPC', 'isolated virtual network'),
          kw('Azure Functions ↔ AWS Lambda ↔ GCP Cloud Functions', 'serverless compute'),
          kw('Entra ID ↔ AWS IAM Identity Center ↔ GCP Cloud Identity', 'identity/access management'),
          kw('Azure SQL Database ↔ AWS RDS ↔ GCP Cloud SQL', 'managed relational DB'),
          kw('Load Balancer/App Gateway ↔ AWS ALB/NLB ↔ GCP Cloud Load Balancing', 'traffic distribution'),
          kw('Azure Monitor ↔ AWS CloudWatch ↔ GCP Cloud Monitoring', 'observability stack'),
          kw('ExpressRoute ↔ AWS Direct Connect ↔ GCP Cloud Interconnect', 'private dedicated connectivity'),
        ],
        [
          qaPair('When does multi-cloud actually pay off?', 'When a specific workload needs a best-of-breed service (e.g., BigQuery for analytics) or a contractual/regulatory requirement forces it, not "avoiding lock-in" as a blanket policy.'),
          qaPair('When is multi-cloud pure overhead?', 'When you\'re just running the same stateless app on two clouds "for resilience" — you\'ve doubled ops/tooling/skills cost without a real failure domain that justifies it.'),
          qaPair('CFO wants cost comparison across providers for the same workload?', 'Map service-to-service equivalents first (this list), then compare on egress, reserved pricing, and support tier — sticker VM price alone is misleading.'),
        ],
      ),
    ],
  }
}

function azureSecuritySubject() {
  return {
    id: uid('subj'),
    icon: '🛡️',
    name: 'Azure Security',
    modules: [
      fullModule(
        'Identity & Access',
        [
          kw('Conditional Access', 'if-then policy engine gating sign-in on user/location/device/risk signals'),
          kw('Named Locations + trusted IPs', 'reduce false positives on location-based CA rules'),
          kw('Privileged Identity Management (PIM)', 'just-in-time eligible role activation with approval + time-bound assignment'),
          kw('PIM for Groups', 'extends JIT activation to Azure AD groups, not just directory roles'),
          kw('Azure AD roles vs Azure RBAC', 'AAD roles control identity/tenant objects, Azure RBAC controls ARM resource access — separate planes'),
          kw('Managed identity', 'system-assigned (1:1, lifecycle tied to resource) vs user-assigned (many:1, reusable) — no secrets in code'),
          kw('Azure AD Identity Protection', 'risk-based sign-in/user risk scoring feeding CA policies'),
          kw('MFA', 'Authenticator app/FIDO2/CBA preferred over SMS; security defaults vs CA-driven MFA'),
          kw('Break-glass accounts', 'cloud-only, excluded from all CA policies, monitored heavily — required to avoid tenant lockout'),
          kw('Access reviews', 'periodic recertification of role assignments and group/app access, closes privilege creep'),
        ],
        [
          qaPair('Why prefer managed identities over service principals with secrets?', 'Eliminates secret rotation/leak risk entirely — the platform manages the credential.'),
          qaPair('How do you stop yourself from ever getting locked out of a tenant?', 'At least two cloud-only break-glass accounts excluded from every CA policy, alerted on any sign-in.'),
          qaPair('PIM vs standing Owner assignment on a subscription?', 'PIM makes Owner eligible-only with time-bound activation and approval, cutting the standing blast radius to zero.'),
          qaPair('Difference between Azure AD roles and Azure RBAC in practice?', "I've seen teams grant Global Admin to fix a resource lock issue — wrong plane, should've been Owner/User Access Administrator in Azure RBAC."),
          qaPair('Why do access reviews matter at scale?', 'Without them, contractor and cross-team access silently accumulates and nobody notices until an audit or breach.'),
        ],
      ),
      fullModule(
        'Platform Protection',
        [
          kw('NSG', "stateful L3/L4 filtering on subnet/NIC, 5-tuple rules, default rules can't be deleted"),
          kw('Azure Firewall', 'stateful L3-L7 PaaS firewall, FQDN filtering, threat intelligence feed, forced tunneling'),
          kw('Azure Firewall Premium', 'TLS inspection, IDPS, URL filtering beyond FQDN'),
          kw('DDoS Protection Standard', 'per-resource telemetry, adaptive tuning, cost protection SLA vs free Basic tier'),
          kw('Azure Bastion', 'RDP/SSH over TLS via portal, no public IP on the VM, host-scaled SKUs'),
          kw('Web Application Firewall (WAF)', 'OWASP CRS on App Gateway/Front Door, detection vs prevention mode'),
          kw('Service endpoint', 'extends VNet identity to PaaS over Azure backbone, traffic still uses public IP of the service'),
          kw('Private endpoint', 'NIC with private IP into your VNet, real network isolation, supports Private DNS zones'),
          kw('Application Security Groups (ASGs)', 'group VMs by role for rule reuse instead of IP lists'),
          kw('NVA + UDR', 'route table forcing traffic through a firewall/NVA appliance for east-west inspection'),
        ],
        [
          qaPair('Service endpoint or private endpoint for a storage account holding PII?', "Private endpoint — service endpoints still traverse the public IP and don't stop data exfiltration to other tenants' same-service resources."),
          qaPair("WAF detection mode left on in prod — what's the real risk?", "It logs but doesn't block, so you've got the illusion of protection while attacks pass through unimpeded."),
          qaPair('Why Azure Bastion over a jumpbox with a public IP?', 'Removes the public attack surface entirely and centralizes session auditing without managing another VM.'),
          qaPair('When do you reach for an NVA instead of Azure Firewall?', 'Multi-vendor policy parity requirements or existing on-prem firewall vendor licensing/skillset.'),
          qaPair('NSG vs Azure Firewall — pick one?', 'Not either/or — NSGs for cheap stateful segmentation at the subnet, Firewall for centralized egress/FQDN/threat-intel control.'),
        ],
      ),
      fullModule(
        'Security Operations',
        [
          kw('Microsoft Defender for Cloud', 'CSPM + CWPP, per-resource-type plans (servers, storage, containers, Key Vault, etc.)'),
          kw('Secure score', 'weighted percentage across recommendations, prioritizes remediation effort vs impact'),
          kw('Microsoft Sentinel', 'cloud-native SIEM/SOAR, KQL-based analytics rules, playbooks via Logic Apps'),
          kw('Log Analytics workspace', 'central store backing Sentinel/Defender/diagnostic settings, table-level RBAC and retention'),
          kw('Regulatory compliance dashboard', 'maps Defender assessments to standards (ISO 27001, NIST, PCI-DSS) with pass/fail per control'),
          kw('Just-in-time VM access', 'Defender for Cloud feature that locks NSG mgmt ports until an approved time-boxed request'),
          kw('Analytics rules', 'scheduled/near-real-time/fusion rules generating Sentinel incidents from raw logs'),
          kw('Workbooks', 'Sentinel/Defender visualization layer for hunting and reporting, built on KQL'),
          kw('Data connectors', 'ingestion pipelines (Azure activity, AAD sign-ins, Defender alerts, third-party via CEF/Syslog)'),
          kw('Continuous export', 'streams Defender secure score/recommendations to Log Analytics or Event Hub for custom pipelines'),
        ],
        [
          qaPair('Secure score dropped 15 points overnight — first move?', 'Diff the recommendations list by timestamp — almost always a new resource deployed without the baseline policy applied.'),
          qaPair('Why Sentinel over a third-party SIEM for an all-Azure shop?', 'Native data connectors and per-GB pricing beat the ingestion tax you pay piping Azure logs into an external SIEM.'),
          qaPair('JIT VM access vs just closing RDP entirely?', "JIT keeps the port closed by default and only opens it per-request with an approval and auto-expiry, so ops isn't blocked."),
          qaPair('How do you keep compliance dashboard numbers meaningful instead of vanity metrics?', 'Map only the standards actually in scope for the workload, otherwise teams chase irrelevant controls to move the needle.'),
          qaPair('Fusion rules — what do they actually add?', 'Correlate low-fidelity signals across multiple sources into a single high-confidence incident, cutting analyst noise.'),
        ],
      ),
      fullModule(
        'Data & Application Security',
        [
          kw('Azure Key Vault', 'secrets/keys/certificates, soft-delete + purge protection mandatory for prod'),
          kw('Managed HSM', 'FIPS 140-2 Level 3 dedicated HSM pool, tenant-isolated, for regulatory key custody requirements'),
          kw('Encryption at rest', 'platform-managed keys (PMK) default vs customer-managed keys (CMK) in Key Vault for control/revocation'),
          kw('Encryption in transit', 'TLS 1.2+ enforced via minimumTlsVersion, App Service/Storage account settings'),
          kw('Always Encrypted', 'client-driver-side column encryption in SQL, keys never seen by the database engine'),
          kw('App Service authentication (Easy Auth)', 'built-in auth gateway in front of the app, offloads OIDC token validation'),
          kw('SAS token', 'account/service/user-delegation scoped, always prefer short-lived user-delegation SAS backed by Azure AD'),
          kw('Customer-Managed Keys (CMK)', 'bring key from Key Vault for storage/SQL/disk encryption, enables key rotation/revocation control'),
          kw('Double encryption', 'infrastructure-level + service-level encryption layering for defense in depth on Storage/Cosmos DB'),
          kw('Key rotation policy', 'Key Vault auto-rotation for keys/certs, reduces manual rotation drift'),
        ],
        [
          qaPair('When do you actually need CMK over platform-managed keys?', "Only when compliance mandates customer control/revocation of the key — otherwise it's operational overhead with no real security gain."),
          qaPair('SAS token found hardcoded in a repo — what\'s the fix beyond rotating it?', "Move to user-delegation SAS with Azure AD-backed short expiry, and add secret scanning to the pipeline so it can't recur."),
          qaPair('Why Always Encrypted over TDE for a PII column?', 'TDE protects data at rest from disk theft, but Always Encrypted keeps the data encrypted even from DBAs and the engine itself.'),
          qaPair('Purge protection on Key Vault — why is it non-negotiable in prod?', "Without it, someone with delete rights can purge the vault and destroy keys irrecoverably, which for CMK-encrypted data means permanent data loss."),
          qaPair('Easy Auth vs rolling your own OIDC middleware?', 'Easy Auth removes an entire class of token-validation bugs from app code, at the cost of some flexibility in claims handling.'),
        ],
      ),
      fullModule(
        'Governance & Compliance',
        [
          kw('Azure Policy', 'effect-based evaluation (deny, audit, append, modify, deployIfNotExists) against resource properties'),
          kw('Initiative (Policy Set)', 'grouped policies assigned together, basis for regulatory compliance mapping'),
          kw('Azure Blueprints', 'deprecated in favor of Landing Zones/Template Specs, but still tested on AZ-500'),
          kw('Landing Zones (Cloud Adoption Framework)', 'standardized subscription vending with policy/RBAC/network baked in at creation'),
          kw('Resource locks', "CanNotDelete vs ReadOnly, inherited down the hierarchy, independent of RBAC"),
          kw('Management groups', 'policy/RBAC inheritance scope above subscriptions for enterprise-wide guardrails'),
          kw('deployIfNotExists', 'remediation-capable policy effect requiring a managed identity with write permissions'),
          kw('Compliance standards mapping', 'built-in initiatives aligning to ISO 27001, NIST 800-53, PCI-DSS, CIS benchmarks'),
          kw('Policy exemption', 'scoped, time-bound waiver instead of disabling or weakening the policy definition'),
          kw('Tag governance', 'enforced via Azure Policy (append/modify) for cost allocation and ownership traceability'),
        ],
        [
          qaPair("DeployIfNotExists policy isn't remediating — most common cause?", "The policy's managed identity lacks the role assignment needed to actually perform the remediation action."),
          qaPair('Resource lock vs RBAC deny assignment — when does lock still bite an Owner?', 'Locks apply regardless of RBAC role, so even subscription Owners get blocked from deleting a locked resource.'),
          qaPair('Why exemptions instead of just excluding the resource from policy scope?', 'Exemptions are logged, scoped, and time-bound, so you keep an audit trail instead of silently eroding coverage.'),
          qaPair('Landing Zones vs Blueprints for new subscription provisioning today?', 'Blueprints is deprecated — Landing Zones via Bicep/Terraform plus Policy is the current recommended path.'),
          qaPair('How do you enforce tagging without blocking every deployment?', "Use append/modify effects to auto-inject missing tags rather than deny, so pipelines don't break while still getting consistent metadata."),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('az keyvault create / az keyvault secret set', 'provision vault and manage secrets from CLI'),
          kw('az keyvault set-policy vs az role assignment create', 'legacy access policy model vs Azure RBAC permission model for vaults'),
          kw('az role assignment create --assignee --role --scope', 'core RBAC grant pattern at management group/sub/RG/resource scope'),
          kw('az role definition create', "custom role from a JSON definition when built-ins don't fit least privilege"),
          kw('az policy assignment create --policy --scope --params', 'attach a policy/initiative to a scope with parameters'),
          kw('az policy definition create / az policy set-definition create', 'author custom policy or initiative definitions'),
          kw('az security assessment list', 'pull Defender for Cloud recommendations/assessments for a subscription'),
          kw('az security pricing create', 'toggle Defender for Cloud plans (Standard/Free) per resource type via CLI'),
          kw('az ad sp create-for-rbac', 'create a service principal with scoped role (legacy pattern, prefer managed identity where possible)'),
          kw('az lock create --lock-type CanNotDelete', 'apply a resource lock from CLI for pipeline-driven governance'),
        ],
        [],
      ),
    ],
  }
}

function azureSolutionsArchitectSubject() {
  return {
    id: uid('subj'),
    icon: '🏛️',
    name: 'Azure Solutions Architect',
    modules: [
      fullModule(
        'Design Identity, Governance & Monitoring',
        [
          kw('Entra ID tenant', "single control plane per org, but multi-tenant needed for M&A/subsidiaries"),
          kw('Hybrid identity', 'Entra Connect (password hash sync, PTA, or federation) — PHS is default recommend unless compliance mandates federation'),
          kw('Entra Connect Cloud Sync', 'lightweight, multi-AD-forest, agent-based, no full sync engine on-prem'),
          kw('Management groups', 'hierarchy above subscriptions for policy/RBAC inheritance, max 6 levels deep'),
          kw('Azure Policy vs RBAC', 'Policy governs resource properties/compliance, RBAC governs who can act'),
          kw('Conditional Access', 'identity-based zero trust gate, MFA/device compliance/location conditions'),
          kw('Privileged Identity Management (PIM)', 'just-in-time elevation, no standing admin roles'),
          kw('Log Analytics workspace design', 'centralized vs per-subscription, drives RBAC and data residency'),
          kw('Azure Monitor + diagnostic settings', 'resource-level export to LAW/Storage/Event Hub, not on by default'),
          kw('Management group vs subscription for policy scope', 'assign at MG for org-wide, subscription for exceptions'),
        ],
        [
          qaPair('PHS or federation for hybrid identity?', "PHS unless there's a hard compliance reason to keep auth on-prem, one less thing to operate."),
          qaPair('Where do you assign Azure Policy for PCI workloads?', 'At a dedicated management group, not scattered across subscriptions, so scope is auditable.'),
          qaPair('Standing Global Admins or PIM?', 'PIM with time-bound activation and approval, zero standing privileged accounts.'),
          qaPair('One Log Analytics workspace or many?', 'Centralize for security/ops correlation, split only when data sovereignty or chargeback forces it.'),
          qaPair('How do you stop policy sprawl in a large landing zone?', 'Inherit from management groups, only override at subscription level with documented exceptions.'),
        ],
      ),
      fullModule(
        'Design Data Storage',
        [
          kw('Relational vs NoSQL', "schema/ACID needs vs scale/flexible schema, don't default to SQL out of habit"),
          kw('Cosmos DB consistency levels', 'strong, bounded staleness, session, consistent prefix, eventual — session is the default sweet spot'),
          kw('Partition key design', 'high cardinality, even distribution, avoid hot partitions, aligns to query pattern'),
          kw('RU/s provisioning', 'manual, autoscale, or serverless — autoscale for spiky, serverless for low/intermittent'),
          kw('Blob storage tiers', 'hot/cool/cold/archive, lifecycle management policies for automatic tiering'),
          kw('Storage redundancy', 'LRS/ZRS/GRS/GZRS/RA-GZRS — trade cost vs durability vs read access on failover'),
          kw('Azure SQL DB vs Managed Instance vs SQL on VM', 'PaaS features vs instance-level compat vs full control'),
          kw('Data Lake Storage Gen2', 'hierarchical namespace over Blob for big data/analytics workloads'),
          kw('Synapse/Fabric analytical store', 'separates OLTP from OLAP to avoid contention'),
        ],
        [
          qaPair('Which Cosmos consistency level by default?', "Session, it gives read-your-writes for the issuing client without the latency cost of strong."),
          qaPair('Symptoms of a bad partition key choice?', 'Hot partitions throttling RU/s while overall throughput looks fine in aggregate.'),
          qaPair('GRS or ZRS for a regulated workload needing HA?', "ZRS if the region has availability zones and cross-region isn't mandated, cheaper and lower latency than GRS."),
          qaPair('When do you pick Managed Instance over Azure SQL DB?', "When there's cross-database queries, SQL Agent, or linked servers the app can't give up."),
          qaPair('Lift-and-shift file server vs redesign to Blob?', "Only lift-and-shift if the app can't be touched, otherwise Blob plus lifecycle policy is cheaper to run forever."),
        ],
      ),
      fullModule(
        'Design Business Continuity',
        [
          kw('RTO/RPO', 'recovery time objective vs recovery point objective, drives every BC/DR design decision'),
          kw('Azure Site Recovery', 'VM/on-prem replication and orchestrated failover, RPO in seconds-to-minutes'),
          kw('Backup vs DR', 'Azure Backup for data/point-in-time recovery, ASR for infrastructure/site failover'),
          kw('Recovery Services vault', 'backend for both Backup and ASR, region-scoped'),
          kw('Active-active multi-region', 'both regions serve traffic, needs conflict resolution/data sync, higher cost'),
          kw('Active-passive multi-region', 'standby region, cheaper, but failover time and data lag matter'),
          kw('Paired regions', "Azure's built-in region pairing for platform-level DR sequencing, not a substitute for app DR"),
          kw('Availability Zones vs regions', 'AZ for datacenter failure, region pair for regional disaster'),
          kw('Backup retention/GFS policy', 'grandfather-father-son for compliance-driven long-term retention'),
        ],
        [
          qaPair('Client wants RPO zero.', 'Tell them the cost/complexity of synchronous replication first, near-zero is realistic, true zero rarely justifies the price.'),
          qaPair('ASR or Backup for a ransomware scenario?', 'Backup with immutable/soft-delete vaults, ASR replicates the encryption too.'),
          qaPair('When do you justify active-active over active-passive?', "Only when the business actually needs sub-minute RTO and can afford the data-consistency engineering, most workloads don't."),
          qaPair('How do you test DR without disrupting prod?', 'ASR test failover into an isolated network, do it on a schedule, not just on paper.'),
          qaPair('Single-region app, board wants "DR."', 'Start with AZ-level resilience and backup, multi-region is a cost/complexity jump many don\'t need yet.'),
        ],
      ),
      fullModule(
        'Design Infrastructure Solutions',
        [
          kw('VM vs containers vs serverless', 'control/legacy needs vs packaging/portability vs event-driven scale-to-zero'),
          kw('AKS', 'orchestration at scale, node pool separation, cluster autoscaler, use when team owns k8s ops overhead'),
          kw('Azure Container Apps', 'serverless containers on KEDA/Dapr, less ops burden than AKS'),
          kw('Functions', 'consumption vs premium vs dedicated plans, cold start tradeoffs'),
          kw("5 R's migration strategy", 'rehost, refactor, rearchitect, rebuild, replace (retire/retain also counted)'),
          kw('Azure Migrate', 'assessment + dependency mapping before choosing a migration path'),
          kw('ExpressRoute vs Site-to-Site VPN', 'private dedicated circuit/SLA vs IPsec over internet, cost vs guarantees'),
          kw('Virtual WAN', 'hub-spoke at global scale, simplifies branch/multi-region connectivity'),
          kw('Landing zone compute baseline', 'golden images, policy-enforced SKUs, tagging for cost allocation'),
        ],
        [
          qaPair('Rehost or refactor for a legacy app under deadline pressure?', "Rehost first to hit the deadline, refactor after, don't let re-architecture block the migration date."),
          qaPair('AKS or Container Apps for a small platform team?', "Container Apps, they don't want to own control-plane upgrades and node patching."),
          qaPair('ExpressRoute or VPN for a new hybrid connection?', "VPN to start if there's no committed bandwidth need, upgrade to ExpressRoute once traffic/SLA demands it."),
          qaPair('Functions Consumption plan for a latency-sensitive API?', 'No, cold starts kill it, use Premium or move to Container Apps.'),
          qaPair('How do you pick compute for a new workload?', 'Start from the operational model the team can sustain, not the "coolest" PaaS option.'),
        ],
      ),
      fullModule(
        'Well-Architected Framework',
        [
          kw('Reliability', 'resiliency, redundancy, self-healing, target SLA vs composite SLA of dependencies'),
          kw('Security', 'zero trust, defense in depth, least privilege, encryption at rest/in transit by default'),
          kw('Cost optimization', 'right-sizing, reserved instances/savings plans, showback/chargeback, waste elimination'),
          kw('Operational excellence', 'IaC, CI/CD, observability, safe deployment practices (blue-green/canary)'),
          kw('Performance efficiency', 'scale-out vs scale-up, caching, load testing, capacity planning'),
          kw('Composite SLA math', 'multiplying dependent service SLAs, often the real ceiling on reliability'),
          kw('Well-Architected Review', 'structured assessment tool, produces prioritized remediation backlog'),
          kw('Trade-off tension', 'pillars conflict (e.g., cost vs reliability), architect must make the trade-off explicit'),
          kw('Design principles vs checklist', 'WAF is a lens for decisions, not a compliance checkbox exercise'),
        ],
        [
          qaPair('Two pillars in direct conflict, which wins?', "Depends on the workload's business criticality, state the trade-off explicitly rather than defaulting to one pillar."),
          qaPair('How do you compute composite SLA for a 3-tier app?', "Multiply each dependency's SLA, the result is usually lower than any single component's number."),
          qaPair('Client says they want "five nines."', "Cost that out first, most businesses don't actually need or want to pay for it once they see the number."),
          qaPair('Cost optimization request on a critical workload.', "Right-size and reserve capacity, don't cut redundancy to save spend."),
          qaPair('What\'s the first thing you check in a WAF review?', "Whether there's actually a single point of failure hiding behind an assumed-redundant design."),
        ],
      ),
      fullModule(
        'Landing Zones',
        [
          kw('Cloud Adoption Framework', "Microsoft's methodology: strategy, plan, ready, adopt, govern, manage"),
          kw('Azure Landing Zone', 'opinionated reference architecture implementing CAF at the platform level'),
          kw('Platform landing zone', 'shared services: identity, connectivity, management subscriptions'),
          kw('Application landing zone', 'where workloads land, online (internet-facing) vs corp (internal-only)'),
          kw('Hub-spoke topology', 'central hub for shared services (firewall, DNS, gateway), spokes isolate workloads'),
          kw('Virtual WAN hub', "Microsoft-managed alternative to self-built hub for global-scale connectivity"),
          kw('Policy-driven governance', 'Azure Policy initiatives enforce guardrails at scale, not manual review'),
          kw('Subscription vesting/democratization', 'self-service subscription provisioning within guardrails'),
          kw('Management group hierarchy', 'root, platform, landing zones, sandbox, decommissioned as top-level structure'),
        ],
        [
          qaPair('Build the ALZ hub yourself or use Virtual WAN?', 'Virtual WAN once you\'re past a handful of regions/spokes, self-built hub gets operationally expensive at scale.'),
          qaPair('How many landing zone subscriptions is "too many"?', "There's no fixed number, the real signal is whether policy and network design scale without manual per-subscription work."),
          qaPair('Online vs corp-connected landing zone, how do you decide?', 'Whether the workload needs to be internet-facing at all, corp-connected by default, online only when justified.'),
          qaPair('New team wants their own subscription today.', "Fine, if subscription vending is policy-driven so they can't drift from guardrails on day one."),
          qaPair("Biggest landing zone mistake you've seen?", 'Treating it as a one-time setup instead of a living structure that gets revisited as the estate grows.'),
        ],
      ),
    ],
  }
}

function aiDevOpsToolsSubject() {
  return {
    id: uid('subj'),
    icon: '🤖',
    name: 'AI DevOps Tools',
    modules: [
      fullModule(
        'Coding Assistants',
        [
          kw('GitHub Copilot', 'inline autocomplete plus Copilot Chat/Workspace, deepest IDE/GitHub integration, weakest whole-repo reasoning'),
          kw('Cursor', 'VS Code fork, agentic multi-file edits, strong codebase indexing via embeddings, fast iteration loop'),
          kw('Claude Code', 'terminal-native agentic coding, runs shell/tests/git itself, best for large autonomous multi-step tasks'),
          kw('Windsurf', 'IDE with "Cascade" agent flows, deep contextual awareness, positioned between Copilot and full agents'),
          kw('Autocomplete vs agentic', 'autocomplete predicts next tokens/lines, agentic tools plan, edit multiple files, and execute commands'),
          kw('Context window', 'bigger window lets a model reason over more of the repo at once, but retrieval quality matters more than raw size'),
          kw('Codebase indexing', 'embeddings/AST-based retrieval used to pull relevant files into context instead of dumping the whole repo'),
          kw('Terminal/IDE integration', 'determines whether the tool can run builds/tests/linters itself or only suggests text'),
          kw('Hallucinated APIs', 'all assistants still invent nonexistent methods/flags, worse on obscure or internal libraries'),
          kw('Guardrails/review', 'PR-level diff review and CI gating remain mandatory regardless of which assistant generated the code'),
        ],
        [
          qaPair('Copilot vs Cursor vs Claude Code, how do you pick?', 'Copilot for inline speed in existing IDEs, Cursor for agentic multi-file refactors in-editor, Claude Code when I want autonomous terminal-level task execution including tests and git.'),
          qaPair('Biggest limitation of autocomplete-style assistants?', 'No execution loop — they guess plausible code but never verify it compiles or passes tests.'),
          qaPair('How do you handle hallucinated APIs in generated code?', 'Treat AI output like a junior PR — compile/test it before trusting it, never merge on faith.'),
          qaPair('Does a larger context window solve codebase awareness?', 'No, retrieval quality and indexing matter more than raw token count, otherwise you just get diluted attention.'),
          qaPair('Would you let an agentic tool auto-commit and push in CI?', "Only behind human-approved gates — autonomy in generation is fine, autonomy in deployment isn't yet."),
        ],
      ),
      fullModule(
        'AI Infra/Ops Tools',
        [
          kw('AIOps', 'umbrella term for ML-driven anomaly detection, correlation, and noise reduction in monitoring'),
          kw('Datadog Watchdog / Bit AI', 'vendor AIOps features doing automatic anomaly detection and root-cause hints'),
          kw('Anomaly detection', 'statistical/ML baselining to flag deviations, still prone to alert fatigue if thresholds are loose'),
          kw('Incident summarization', 'LLMs condensing Slack/PagerDuty timelines into a readable narrative for stakeholders'),
          kw('AI-generated runbooks', 'LLM drafts remediation steps from past incidents/docs, must be human-validated before trust'),
          kw('AI-generated postmortems', 'speeds up first-draft writing, but root-cause attribution still needs a human owner'),
          kw('Hallucinated remediation steps', 'the core risk: a confident-sounding but wrong "restart X" can escalate an outage'),
          kw('Human-in-the-loop gating', 'mandatory approval step before any AI-suggested remediation runs against production'),
          kw('Root cause correlation', 'AIOps tools linking metrics/logs/traces across services faster than manual dashboards'),
          kw('Feedback loop', 'incident outcomes fed back to tune models/runbooks, otherwise suggestions go stale'),
        ],
        [
          qaPair('Would you let an AI agent auto-remediate a production incident?', 'Only for pre-approved, reversible playbook actions, never open-ended remediation.'),
          qaPair('What\'s the real risk with AI-generated runbooks?', 'A hallucinated step executed under pressure during an actual outage, so they need dry-run validation first.'),
          qaPair('Where does AIOps genuinely help today?', 'Cutting alert noise and correlating signals faster than a human staring at five dashboards.'),
          qaPair('How do you use LLMs in postmortems?', 'For first-draft timeline summarization, never for final root-cause sign-off.'),
          qaPair('Biggest failure mode of anomaly detection models?', 'Alert fatigue from poorly tuned baselines, which erodes trust faster than no alerting at all.'),
        ],
      ),
      fullModule(
        'Vector DBs & RAG',
        [
          kw('pgvector', "Postgres extension for vector similarity search, lowest-friction choice if you're already on Postgres"),
          kw('Pinecone', "managed, fully hosted vector DB, easiest ops story, usage-based cost at scale"),
          kw('Weaviate', 'open-source, hybrid search (vector + keyword/BM25) built in, self-host or managed'),
          kw('Qdrant', 'open-source, Rust-based, strong filtering performance, popular for self-hosted RAG'),
          kw('RAG (Retrieval-Augmented Generation)', 'retrieve relevant chunks then feed them into the prompt instead of relying on model memory'),
          kw('Embedding freshness', 'stale embeddings return outdated runbook/doc content, biggest silent failure mode in internal RAG'),
          kw('Re-indexing strategy', 'incremental vs full re-embed on doc change, incremental is cheaper but needs reliable change-detection'),
          kw('Chunking strategy', 'how docs are split for embedding, directly drives retrieval relevance more than model choice'),
          kw('Hybrid search', 'combining vector similarity with keyword/BM25 to catch exact terms (error codes, service names) embeddings miss'),
          kw('Metadata filtering', 'tagging chunks (team, service, date) so retrieval can scope results before semantic ranking'),
        ],
        [
          qaPair('pgvector vs Pinecone, when do you choose which?', "pgvector if you're already running Postgres and scale is moderate, Pinecone when you want zero ops and know you'll scale hard."),
          qaPair('Why do RAG-based runbook bots go stale?', 'Nobody wired re-indexing into the doc-publish pipeline, so embeddings drift from source of truth.'),
          qaPair('Vector-only search enough for internal docs?', 'No, hybrid search is needed because exact error codes and service names get lost in pure semantic similarity.'),
          qaPair('How do you keep re-indexing costs sane?', 'Incremental embedding on change-detection, not full corpus re-embeds on a cron.'),
          qaPair("Biggest RAG failure mode you've seen in practice?", 'Bad chunking, not model choice, garbage retrieval means garbage generation regardless of LLM quality.'),
        ],
      ),
      fullModule(
        'LLMOps Basics',
        [
          kw('Prompt versioning', 'treating prompts as versioned artifacts in git/config, not hardcoded strings, to enable rollback'),
          kw('Prompt evals', 'regression test suites that score prompt/model output against expected criteria before shipping changes'),
          kw('Golden datasets', 'curated input/output pairs used as the ground truth for eval regression testing'),
          kw('LLM-as-judge', "using a second model to score output quality at scale when human review doesn't scale"),
          kw('Model tiering', 'routing cheap/fast models (Haiku-class) for simple tasks, reserving frontier models (Opus-class) for hard reasoning'),
          kw('Cost/latency tradeoffs', 'bigger models cost more and add latency, so tiering and caching directly hit SLA and budget'),
          kw('Prompt caching', 'reusing cached context (system prompts, docs) to cut repeated token cost/latency in high-volume pipelines'),
          kw('Guardrails', 'schema validation, allowlisted tools, and approval gates around agentic tool-calling to bound blast radius'),
          kw('Tool-calling in CI/CD', 'agents invoking pipeline actions must be scoped to least-privilege, auditable, reversible actions'),
          kw('Observability/tracing', 'logging prompts, tool calls, and outputs end-to-end for debugging and drift detection'),
        ],
        [
          qaPair('How do you prevent prompt changes from silently regressing production?', 'Version prompts and gate every change behind an eval suite, exactly like code review.'),
          qaPair('How do you decide which model tier to use?', 'Cheapest model that clears the eval bar for that task, reserve frontier models for genuinely hard reasoning steps.'),
          qaPair('Would you let an agent call arbitrary CI/CD actions?', 'No, only an allowlisted, least-privilege tool set with human approval on anything irreversible.'),
          qaPair('How do you catch quality drift in an LLM pipeline?', 'Continuous eval runs plus tracing/logging of real prompts and outputs, not one-time testing at launch.'),
          qaPair('LLM-as-judge, do you trust it?', 'For scale and directional signal yes, for final sign-off on high-stakes output no.'),
        ],
      ),
      fullModule(
        'Important Tools',
        [
          kw('GitHub Copilot', 'inline code autocomplete and chat assistant integrated across major IDEs and GitHub'),
          kw('Cursor', 'AI-native IDE (VS Code fork) with agentic multi-file editing and codebase indexing'),
          kw('Claude Code', 'terminal-native agentic coding tool that plans, edits, runs commands, and iterates autonomously'),
          kw('Windsurf', 'AI IDE with agentic "Cascade" workflows for contextual multi-file changes'),
          kw('LangChain', 'framework for chaining LLM calls, tools, and memory into agent/RAG pipelines'),
          kw('LlamaIndex', 'data framework focused on ingesting, indexing, and querying documents for RAG'),
          kw('pgvector', 'Postgres extension adding vector similarity search to an existing relational database'),
          kw('Pinecone', 'fully managed, hosted vector database for production-scale similarity search'),
          kw('Weaviate', 'open-source vector database with built-in hybrid (vector + keyword) search'),
        ],
        [],
      ),
    ],
  }
}

function sreSubject() {
  return {
    id: uid('subj'),
    icon: '🚨',
    name: 'SRE',
    modules: [
      fullModule(
        'SLI/SLO/SLA Fundamentals',
        [
          kw('SLI', 'quantifiable measure of service behavior (latency, availability, correctness, freshness, throughput)'),
          kw('SLO', 'internal target on an SLI over a window, e.g. 99.9% requests <300ms over 28 days'),
          kw('SLA', "SLO's contractual sibling with financial/legal penalties, set looser than the real SLO to buy margin"),
          kw('Request-based vs windows-based SLI', 'ratio of good/total events vs. fraction of good time buckets'),
          kw('Choosing user-facing SLIs', 'measure at the point closest to user experience (client-side/LB, not internal service hop)'),
          kw('100% is the wrong target', 'always the wrong reliability target, creates false expectations and kills velocity'),
          kw('Long-window vs short-window', '28/30-day rolling for target-setting, shorter windows for alerting sensitivity'),
          kw('Multi-window multi-burn-rate', 'combine short and long windows to catch fast and slow burns without noise'),
        ],
        [
          qaPair('How do you pick an SLI for a checkout API?', 'Ratio of HTTP 5xx-free, sub-p99-latency responses measured at the load balancer, not app server.'),
          qaPair('Why is SLA looser than SLO?', 'SLA breach costs money/reputation, so you need buffer before contractual pain hits.'),
          qaPair('Client library times out but server logs success — which SLI wins?', "Client-observed, because that's the user's actual experience."),
          qaPair('Team wants 99.99% for an internal batch job.', "Push back — internal, latency-tolerant workloads don't need five-nines, that's wasted engineering spend."),
          qaPair('One SLI or several per service?', 'Several — availability, latency, and correctness rarely degrade together, so one SLI hides failure modes.'),
        ],
      ),
      fullModule(
        'Error Budgets & Policy',
        [
          kw('Error budget', '1 minus SLO, the allowed unreliability over the window, spent by both outages and risky launches'),
          kw('Burn rate', 'speed of budget consumption relative to uniform depletion, 1.0x = exactly on pace'),
          kw('Fast-burn alert', 'high burn rate over short window, pages immediately (e.g. 14.4x over 1h)'),
          kw('Slow-burn alert', 'low burn rate over long window, ticket not page (e.g. 1x over 3 days)'),
          kw('Budget exhaustion policy', 'pre-agreed consequence, typically freeze feature launches until budget recovers'),
          kw('Error budget as currency', 'spent on deploys, experiments, and infra risk, not just incidents'),
          kw('Budget reset cadence', 'tied to rolling window, not calendar month, avoids gaming near period boundaries'),
          kw('Negotiated exceptions', 'even with budget exhausted, security/compliance fixes still ship'),
        ],
        [
          qaPair("Budget's exhausted, PM wants a launch.", "Freeze non-critical launches per policy, but the freeze must be pre-negotiated or it's just a fight, not an SRE decision."),
          qaPair('Why multi-window burn rate over a flat threshold?', 'Single window either pages too late on fast burns or floods on noisy blips.'),
          qaPair('Team keeps blowing budget every quarter with no consequence.', "Policy without enforcement is theater — budget exhaustion needs teeth, like blocking merges via CI gate."),
          qaPair('Is a burn from a single big outage treated differently than gradual burn?', "Same budget, but postmortem-driven action items differ — one's a bug fix, other's a systemic trend needing capacity or design review."),
          qaPair('How do you avoid error budget becoming a blame weapon?', 'Frame it as a shared release-velocity dial, not a scoreboard against on-call.'),
        ],
      ),
      fullModule(
        'Monitoring & Alerting Philosophy',
        [
          kw('Symptom-based alerting', 'alert on user-visible pain (latency, errors), not internal causes'),
          kw('Cause-based alerting', 'reserved for known precursors to symptoms, feeds dashboards/tickets not pages'),
          kw('Four golden signals', 'latency, traffic, errors, saturation'),
          kw('Alert fatigue', 'excessive/noisy paging erodes response quality, root cause of missed real incidents'),
          kw('Actionable alert', 'page implies a human must act now; anything else demotes to ticket or dashboard'),
          kw('Playbook-linked alerts', 'every page links to a runbook with diagnostic steps, not tribal knowledge'),
          kw('Multi-signal correlation', 'combine saturation + error rate before paging to cut false positives'),
          kw('Alert review cadence', 'periodic pruning of alerts with no action taken, kill or downgrade them'),
        ],
        [
          qaPair('CPU at 90% — page or ticket?', "Ticket — saturation alone isn't a symptom unless it's already degrading latency or errors."),
          qaPair('How do you fight alert fatigue on a noisy service?', "Audit last quarter's pages, cut anything non-actionable, and demote cause-based noise to dashboards."),
          qaPair('Why symptom-based over cause-based as the default?', "Causes multiply faster than symptoms, so cause-based alerting doesn't scale and duplicates pages for one real problem."),
          qaPair('On-call ignores a page reflexively.', "That's an alert-quality failure, not a people failure — fix the signal-to-noise, don't blame the responder."),
          qaPair("What's your golden-signal priority when triaging blind?", 'Errors and saturation first, they narrow the failure domain fastest; latency and traffic confirm blast radius.'),
        ],
      ),
      fullModule(
        'Incident Management & Postmortems',
        [
          kw('Incident Commander', 'single decision-maker coordinating response, not necessarily the fixer'),
          kw('Blameless postmortem', 'focus on systemic/process causes, psychological safety to surface real timeline'),
          kw('Severity levels', 'SEV1-4 or similar, driven by user impact and blast radius, not internal embarrassment'),
          kw('Postmortem timeline', 'factual, timestamped sequence from detection to resolution to root cause'),
          kw('Action item follow-through', 'tracked to closure with owner and deadline, or postmortems become theater'),
          kw('Communications lead', 'separate role from IC, manages stakeholder updates so IC stays focused on mitigation'),
          kw('Mitigate vs fix', 'stop the bleeding first (rollback, failover), root-cause after stability restored'),
          kw('COE / postmortem review board', 'cross-team review catching recurring systemic patterns'),
        ],
        [
          qaPair('IC and the engineer who caused the outage are the same person — problem?', "Yes, split it, IC needs to make dispassionate calls without being heads-down debugging their own change."),
          qaPair('Postmortem action items keep slipping.', "Tie them to sprint planning with an owner and deadline, or track budget-exhaustion policy against unclosed criticals."),
          qaPair('Team wants to skip a postmortem because "it was just a flaky test."', "Any user-facing SEV gets one — flaky tests hiding real prod gaps is exactly what postmortems catch."),
          qaPair('How do you keep a postmortem blameless when a bad deploy caused it?', 'Interrogate the pipeline that allowed the bad deploy through, not the person who clicked deploy.'),
          qaPair('Mitigation vs root cause — which comes first at 3am?', 'Mitigate always — rollback or failover to restore users, root-cause with a clear head afterward.'),
        ],
      ),
      fullModule(
        'Capacity Planning',
        [
          kw('Demand forecasting', 'organic growth trend plus known marketing/launch events, revisited quarterly'),
          kw('Load testing', 'synthetic traffic validating capacity assumptions before they\'re needed in prod'),
          kw('Headroom planning', 'reserve capacity for N+1/N+2 failure domains and traffic spikes, not just steady state'),
          kw('Autoscaling limits', 'scale-up lag versus instant traffic spikes, cold-start and quota ceilings'),
          kw('Correlated failure', 'capacity math breaks when scaling out concentrates load on a shared dependency (DB, cache)'),
          kw('Resource quotas', 'cloud provider/account limits that silently cap autoscaling ceilings'),
          kw('Global vs regional capacity', 'failover capacity must be pre-provisioned, not assumed available on demand'),
          kw('Capacity as SLO input', 'insufficient headroom directly degrades latency/error SLIs under load'),
        ],
        [
          qaPair("Autoscaler didn't save you during a spike, why?", "Scale-up lag versus a step-function spike, plus the DB behind it doesn't autoscale at all."),
          qaPair('How much headroom do you plan for?', 'Enough to absorb loss of your largest failure domain plus expected peak, typically N+1 at minimum, N+2 for critical tiers.'),
          qaPair('Load test passed, prod still fell over.', "Load test didn't model the correlated dependency (cache miss storm, connection pool exhaustion) that only shows up at real traffic shape."),
          qaPair('Regional failover capacity — pre-provisioned or scale on failover?', "Pre-provisioned, standby capacity that scales on-demand during an actual regional outage is a guess you can't afford."),
          qaPair("Biggest capacity planning mistake you've seen?", 'Assuming linear scaling when a shared stateful dependency becomes the real bottleneck at 3x traffic.'),
        ],
      ),
      fullModule(
        'Toil Reduction & Automation',
        [
          kw('Toil', 'manual, repetitive, automatable work with no enduring value, scales linearly with service growth'),
          kw('Toil budget', 'cap toil at <50% of SRE time, rest goes to engineering/eng-value work'),
          kw('Automation ROI', 'build cost vs. frequency x manual time saved, not automate-everything reflexively'),
          kw('Eliminate vs tolerate', 'redesign the system to remove the need for the task, not just script around it'),
          kw('Toil measurement', 'track via time surveys/ticket tagging to make the case for investment'),
          kw('Generalized automation', 'solve the class of problem, not the one-off instance, to avoid automation sprawl'),
          kw('Overhead vs toil', 'meetings/admin work is overhead, not toil, different problem with different fix'),
          kw('Automation risk', 'badly-scoped automation becomes its own outage vector, needs the same rigor as prod code'),
        ],
        [
          qaPair('Team spends 70% of time on manual ticket work.', "That's over toil budget, escalate for headcount relief or a hard stop on new feature work until it's automated down."),
          qaPair('When do you not automate a manual task?', 'When frequency is low enough that build cost exceeds years of manual effort, or the task itself should be eliminated by redesign.'),
          qaPair('Automated a task and it caused an outage.', 'Automation is production code, it needs review, testing, and rollback like anything else, treat it seriously.'),
          qaPair('Eliminate vs automate the toil?', "Always ask why the manual step exists first, automating a step that shouldn't exist just hides the design flaw."),
          qaPair('How do you sell toil reduction investment to leadership?', 'Quantify hours/week lost, tie it to on-call burnout and slower feature velocity, not just "engineers don\'t like it."'),
        ],
      ),
      fullModule(
        'Release Engineering',
        [
          kw('Canary release', 'small percentage of traffic/instances first, automated health-check gate before full rollout'),
          kw('Progressive rollout', 'staged expansion (canary → 10% → 50% → 100%) with bake time at each stage'),
          kw('Rollback readiness', 'one-command/automated rollback, tested regularly, not just theoretically possible'),
          kw('Release velocity vs stability', 'error budget governs the dial, not gut feel or launch pressure'),
          kw('Feature flags', 'decouple deploy from release, enabling kill-switch without a rollback/redeploy'),
          kw('Hermetic builds', 'reproducible artifacts, same binary promoted through stages, not rebuilt per environment'),
          kw('Automated canary analysis', 'statistical comparison of canary vs baseline metrics, not eyeballing dashboards'),
          kw('Blast radius containment', 'cell-based/sharded deploys so a bad release can\'t take down 100% at once'),
        ],
        [
          qaPair('Canary looked fine, full rollout broke prod.', 'Canary sample was too small or too short a bake time to catch a low-frequency edge case, widen the cohort and duration.'),
          qaPair('How fast can you roll back a bad release?', "Should be single command/automated in under five minutes, if it's not tested regularly, it doesn't count as ready."),
          qaPair('Feature flag vs rollback for a bad launch?', "Flag first, it's instant and scoped, rollback is the fallback when the flag itself doesn't isolate the failure."),
          qaPair('Who decides release velocity, product or SRE?', 'Neither unilaterally, the error budget is the objective arbiter, burn rate dictates whether we ship or slow down.'),
          qaPair('Why cell-based deployment over one big rollout?', 'Caps blast radius to a shard instead of the whole fleet when a release goes bad.'),
        ],
      ),
      fullModule(
        'Chaos Engineering',
        [
          kw('Fault injection', 'deliberately introduce failures (latency, errors, resource exhaustion) to test resilience'),
          kw('Steady-state hypothesis', 'define normal behavior metrics first, chaos experiment proves deviation from it'),
          kw('Game day', 'scheduled, cross-team simulated incident exercising real response processes, not just tooling'),
          kw('Blast radius control', 'start in staging/small prod cohort, kill switch ready, never uncontrolled in prod'),
          kw('GameDay vs continuous chaos', 'scheduled exercises build muscle memory, continuous tooling (e.g. Chaos Monkey) finds drift'),
          kw('Failure domain isolation testing', "validate that a zone/region/dependency failure doesn't cascade"),
          kw('Hypothesis-driven experiments', "each chaos test has a specific prediction, not random breakage for its own sake"),
          kw('Abort criteria', 'pre-defined automatic stop conditions if the experiment causes real user impact'),
        ],
        [
          qaPair('How do you justify chaos engineering to a skeptical VP?', 'Frame it as finding failure modes on your schedule with a kill switch, instead of discovering them at 3am during a real incident.'),
          qaPair('First chaos experiment on a new service?', 'Kill a single non-critical replica in staging first, confirm steady-state holds, before touching prod blast radius.'),
          qaPair('Chaos test caused a real customer-facing incident.', 'Abort criteria failed or blast radius was scoped too wide, that\'s a postmortem on the experiment design itself.'),
          qaPair('Game day vs automated fault injection tooling?', 'Game days validate human response and runbooks, automated tooling validates the system continuously, you need both.'),
          qaPair('What\'s your steady-state metric before injecting a fault?', "Whatever the SLI is for that service, latency/error rate baseline, so the experiment has an objective pass/fail."),
        ],
      ),
    ],
  }
}

function linuxSubject() {
  return {
    id: uid('subj'),
    icon: '🐧',
    name: 'Linux',
    modules: [
      fullModule(
        'Linux Architecture',
        [
          kw('Kernel space vs user space', 'kernel runs privileged (ring 0), processes run unprivileged (ring 3), syscall is the only gate between them'),
          kw('FHS', 'Filesystem Hierarchy Standard — defines /etc, /var, /usr, /bin, /opt, /proc, /sys layout for interop across distros'),
          kw('/proc', 'virtual filesystem exposing live kernel/process state, nothing on disk (procfs)'),
          kw('/sys', 'sysfs, exposes kernel objects/device tree, many files writable to tune drivers at runtime'),
          kw('System call (syscall)', 'controlled entry point (e.g. read, write, fork, execve) from user space into kernel'),
          kw('Shell', 'user-space program (bash/zsh/dash) that parses commands and issues syscalls/forks processes, not part of the kernel'),
          kw('Kernel modules (LKM)', 'insmod/rmmod/modprobe, loaded/unloaded at runtime without reboot'),
          kw('Monolithic kernel', 'Linux design; all core services (drivers, FS, networking) run in kernel space for performance'),
        ],
        [
          qaPair('Why does a fork() bomb take down a box even with plenty of RAM free?', "PID table/ulimit exhaustion, not memory — check `ulimit -u` and cgroup pids controller."),
          qaPair('How do you find what syscalls a hung process is stuck in?', '`strace -p <pid>` and look at the last syscall before it blocks.'),
          qaPair("What's actually in /proc/<pid>?", "Live view into that process's fd table, maps, status, cgroup, cmdline — no disk I/O involved."),
          qaPair('Difference between a shell builtin and an external command?', "Builtins run in the shell's own process (no fork/exec), matters for `cd`, `export`, performance in tight loops."),
          qaPair("Why can't a user-space process just write directly to a disk sector?", 'No syscall for it without CAP_SYS_RAWIO/root and going through the block layer — isolation by design.'),
        ],
      ),
      fullModule(
        'Filesystem & Permissions',
        [
          kw('ext4', 'journaling FS, default on most distros, mature, good for general workloads'),
          kw('XFS', 'default on RHEL/CentOS, better for large files/high concurrency, cannot shrink (only grow)'),
          kw('inode', 'metadata structure (owner, perms, timestamps, block pointers) — filename lives in the directory entry, not the inode'),
          kw('chmod', 'octal (chmod 750 file) or symbolic (chmod u+x,g-w file) permission changes'),
          kw('chown / chgrp', 'change owner / group (chown user:group file)'),
          kw('setfacl / getfacl', 'fine-grained ACLs beyond owner/group/other (setfacl -m u:bob:rwx file)'),
          kw('umask', 'default permission mask subtracted at creation time (022 → 755 dirs, 644 files)'),
          kw('SUID/SGID/sticky bit', 'run-as-owner (4000) / run-as-group or inherit group on dirs (2000) / restrict delete to owner (1000, used on /tmp)'),
        ],
        [
          qaPair("`df` shows disk full but `du` shows space free — what's going on?", "Deleted-but-open file handles holding inodes, check `lsof +L1` or `lsof | grep deleted`."),
          qaPair("Why would `rm -rf` on a huge directory not free space immediately?", 'A process still has the file open; space reclaims on last close, kill/restart the holder.'),
          qaPair('When do you reach for ACLs instead of group perms?', 'Need per-user exceptions on a shared dir without creating a new group for every combination.'),
          qaPair('Why does XFS get picked over ext4 for a database volume?', "Better parallel I/O and extent-based allocation for large files, but remember it can't shrink."),
          qaPair('SGID on a directory — what does it actually do?', "New files/subdirs inherit the directory's group instead of the creating user's primary group — used for team shared dirs."),
        ],
      ),
      fullModule(
        'User & Group Management',
        [
          kw('useradd / usermod / userdel', 'create/modify/delete accounts (-aG to append supplementary groups, never plain -G)'),
          kw('/etc/passwd', 'username:x:UID:GID:GECOS:home:shell, world-readable, no password hash'),
          kw('/etc/shadow', 'hashed password, aging fields (last change, min/max/warn), root-only readable'),
          kw('/etc/group', 'group name, GID, member list for supplementary membership'),
          kw('visudo', 'safe editor for /etc/sudoers, validates syntax before saving, prevents lockout'),
          kw('Primary vs secondary group', 'one primary (in passwd, owns new files) vs many supplementary (in group, grant access)'),
          kw('passwd -l / chage', 'lock account / manage password expiry policy'),
          kw('id / groups', 'inspect effective UID/GID and group membership for a user'),
        ],
        [
          qaPair("New sysadmin ran `usermod -G devops bob` and broke his access — why?", 'Plain -G replaces all supplementary groups instead of appending, wiped his other memberships; always use -aG.'),
          qaPair('How do you lock out a compromised account without deleting their data?', "`passwd -l user` or `usermod -L`, plus `chage -E 0` to expire it immediately, keep home dir intact for forensics."),
          qaPair('Why put a service account in /etc/passwd with /sbin/nologin?', 'Allows ownership of files/processes without permitting interactive login.'),
          qaPair('Someone edited /etc/sudoers directly and now sudo is broken everywhere — fix?', "Boot to single-user/rescue, fix syntax, or use `visudo -c` on file to validate; that's exactly why visudo exists."),
          qaPair('Two users need identical access to a project directory — group or ACL?', "Group with SGID bit on the directory if it's a clean one-to-one mapping; ACL only if it's an ad-hoc exception."),
        ],
      ),
      fullModule(
        'Process Management',
        [
          kw('ps aux / ps -ef', 'snapshot of process table, BSD vs UNIX syntax for full args and PPID'),
          kw('top / htop', 'live resource view, htop adds tree view and easier kill/renice UI'),
          kw('SIGTERM (15)', 'default kill signal, asks process to clean up and exit'),
          kw('SIGKILL (9)', 'un-catchable, un-ignorable, immediate termination by kernel, no cleanup'),
          kw('SIGHUP (1)', 'historically terminal hangup, now widely used to trigger config reload (nginx, sshd)'),
          kw('nice / renice', 'set/adjust scheduling priority, -20 (highest) to 19 (lowest), only root lowers niceness'),
          kw('Job control', '&, jobs, fg, bg, disown, nohup for surviving terminal disconnect'),
          kw('Zombie vs orphan', "zombie: exited but parent hasn't reaped via wait() (state Z); orphan: parent died first, reparented to init/systemd (PID 1)"),
        ],
        [
          qaPair('Box has hundreds of Z-state processes, how do you actually clear them?', "You can't kill a zombie, you fix or kill its parent so it reaps them."),
          qaPair("`kill -9` didn't remove the process — why?", 'Stuck in uninterruptible sleep (D state), usually a hung NFS mount or failing disk, SIGKILL can\'t touch it either.'),
          qaPair('Why `nohup cmd &` and not just `cmd &`?', "Plain background jobs still die on SIGHUP when the shell exits; nohup detaches from the controlling terminal's hangup signal."),
          qaPair('Load average is 40 on a 8-core box but CPU% looks idle — what\'s happening?', 'Load counts D-state (uninterruptible I/O wait) processes too, points to disk/NFS bottleneck, not CPU.'),
          qaPair('How do you gracefully restart a daemon that ignores SIGTERM?', 'Check if it traps SIGHUP for reload first; if truly hung, escalate SIGTERM → wait → SIGKILL, standard systemd stop sequence.'),
        ],
      ),
      fullModule(
        'Package Management',
        [
          kw('dpkg', 'low-level Debian package tool, installs/removes .deb, no dependency resolution'),
          kw('apt / apt-get', 'high-level frontend, resolves dependencies, manages /etc/apt/sources.list repos'),
          kw('rpm', 'low-level RPM package tool (RHEL/Fedora/SUSE), same role as dpkg'),
          kw('yum / dnf', 'high-level frontend for rpm, dnf is the modern successor (better dependency solver, RHEL8+)'),
          kw('Repository (repo)', 'metadata-indexed package source, defined in sources.list.d/*.list or yum.repos.d/*.repo'),
          kw('Dependency resolution', 'solver ensures required libs/packages installed together, blocks conflicting versions'),
          kw('apt-cache / dnf provides', 'query which package provides a file/command'),
          kw('rpm -qa / dpkg -l', 'list installed packages; rpm -qf / dpkg -S to find owning package of a file'),
        ],
        [
          qaPair("`apt install` fails with dependency hell after a partial upgrade — first move?", '`apt --fix-broken install` (or `apt-get -f install`), then check for held/pinned packages.'),
          qaPair('dnf vs yum in practice — does it matter which you use on RHEL8+?', 'dnf is the actual engine now, yum is a compat symlink to it, prefer dnf directly and its faster/better solver.'),
          qaPair('How do you find which package owns a mystery binary already on disk?', '`dpkg -S /path/to/file` or `rpm -qf /path/to/file`.'),
          qaPair('Production repo mirror updated a shared lib version overnight and broke an app — how do you prevent recurrence?', 'Pin package versions (apt pin priorities or dnf versionlock), use a local/immutable repo snapshot instead of pointing straight at upstream.'),
          qaPair('Difference between rpm and dnf when something goes wrong mid-install?', 'rpm does the actual file install/scriptlets with no dependency awareness; dnf orchestrates resolution and calls rpm underneath, so rpm -e can leave dependents broken.'),
        ],
      ),
      fullModule(
        'Systemd & Services',
        [
          kw('Unit file', '/etc/systemd/system/*.service, declarative [Unit]/[Service]/[Install] sections'),
          kw('systemctl enable/start/status', 'enable creates symlink for boot-time start, start is immediate, independent of each other'),
          kw('Target', 'replaces runlevels (multi-user.target ~ runlevel 3, graphical.target ~ runlevel 5)'),
          kw('journalctl', 'query systemd journal (binary log), -u unit, -f follow, --since, -p priority'),
          kw('systemd timer', '.timer unit paired with .service, supports monotonic/calendar schedules, logs via journal unlike cron'),
          kw('systemctl daemon-reload', 'required after editing unit files so systemd re-reads them'),
          kw('WantedBy / Requires / After', 'dependency and ordering directives, ordering != dependency'),
          kw('systemd-analyze', 'boot time breakdown, blame for slowest units, verify unit file syntax'),
        ],
        [
          qaPair('Cron job silently stopped logging output after migrating to a timer unit — why prefer timers anyway?', "Timers log to journalctl automatically and integrate with systemd dependencies/ordering, cron output only goes where you redirect it."),
          qaPair("You edited a unit file and `systemctl restart` still runs the old config — why?", '`systemctl daemon-reload` was forgotten, systemd caches the parsed unit until reloaded.'),
          qaPair('Service is enabled but not running after boot — how do you debug?', '`systemctl status`, then `journalctl -u <unit> -b` for this boot\'s logs, check ExecStartPre failures and target ordering.'),
          qaPair('`After=` vs `Requires=` in a unit file — real difference?', 'After only orders startup sequence, Requires enforces the dependency must be active or this unit fails/stops too.'),
          qaPair("How do you find what's slowing down boot?", '`systemd-analyze blame` and `systemd-analyze critical-chain` to see the serialized dependency chain.'),
        ],
      ),
      fullModule(
        'Storage & LVM',
        [
          kw('fdisk / parted', 'partition table editors, fdisk for MBR/simple, parted for GPT/scripted/large disks'),
          kw('Physical Volume (PV)', 'pvcreate, raw disk/partition initialized for LVM use'),
          kw('Volume Group (VG)', 'vgcreate, pool of PVs, storage capacity aggregated from underlying disks'),
          kw('Logical Volume (LV)', 'lvcreate, carved out of VG, the actual thing you format and mount'),
          kw('lvextend / resize2fs / xfs_growfs', 'grow LV then grow the filesystem on top (order matters, XFS can\'t shrink)'),
          kw('/etc/fstab', 'persistent mount definitions (device/UUID, mountpoint, fstype, options, dump, fsck order)'),
          kw('mount / umount', 'attach/detach filesystem; umount fails with "target busy" if a process has an open fd/cwd there'),
          kw('blkid / lsblk', 'show UUIDs/filesystem types / block device tree with mountpoints'),
        ],
        [
          qaPair("VG has free space but the LV won't grow further — what's missing?", "Extended the LV with lvextend but forgot resize2fs/xfs_growfs, the filesystem doesn't auto-follow the block device size."),
          qaPair('`umount` says device busy — how do you find the culprit fast?', "`lsof +f -- /mountpoint` or `fuser -vm /mountpoint`, kill or cd out of the offending process."),
          qaPair('Why UUID in fstab instead of /dev/sdb1?', 'Device names shift on reboot/disk reorder (especially with hot-swap or added disks), UUID is stable.'),
          qaPair('LV snapshot filled up and got dropped automatically — what happened?', 'Copy-on-write snapshot exhausted its allocated space (its own separate extent pool), always size snapshots for expected write churn during their lifetime.'),
          qaPair("fstab entry typo and the server won't come back up after reboot — recovery path?", 'Boot into rescue/emergency mode, fix fstab, or mount with `mount -a` skip via emergency.target giving you a shell to correct it.'),
        ],
      ),
      fullModule(
        'Networking',
        [
          kw('ip addr / ip route', 'modern replacement for ifconfig/route, part of iproute2, shows/sets addresses and routing table'),
          kw('ifconfig / route', 'deprecated (net-tools), still around on older systems, avoid in scripts going forward'),
          kw('NetworkManager / nmcli', 'connection-profile-based network management, default on RHEL/Fedora/Ubuntu desktop'),
          kw('firewalld', 'zone-based dynamic firewall frontend (RHEL default), firewall-cmd to manage'),
          kw('nftables', 'modern packet filtering framework, successor to iptables, unified IPv4/IPv6 syntax'),
          kw('iptables', "legacy netfilter frontend, still common in older configs/Docker's default backend"),
          kw('/etc/resolv.conf', 'nameserver entries for DNS resolution, often now managed dynamically (systemd-resolved/NetworkManager overwrites it)'),
          kw('ss', 'modern socket statistics tool (replaces netstat), ss -tulpn for listening ports+PIDs'),
        ],
        [
          qaPair('You edited /etc/resolv.conf by hand and it reverted after reboot — why?', 'systemd-resolved or NetworkManager manages it dynamically, edit the NM connection profile or resolved.conf instead of the symlinked file.'),
          qaPair("`firewall-cmd --add-port` worked but didn't survive reboot — what's missing?", "Forgot `--permanent`, runtime and permanent configs are separate in firewalld, need both or a reload after --permanent."),
          qaPair("Service isn't reachable — netstat isn't installed, what now?", "`ss -tulpn` gives the same listening-port-to-PID mapping, it's the modern replacement."),
          qaPair('Two firewall layers, iptables rules and firewalld both configured — what breaks?', 'They fight over the same nftables/netfilter backend, conflicting rule ordering, pick one and purge the other.'),
          qaPair("How do you prove it's a DNS problem and not connectivity?", "`dig`/`getent hosts` to resolve vs `curl -v --resolve` or raw IP connection test, isolates resolution from routing/firewall."),
        ],
      ),
      fullModule(
        'Shell Scripting',
        [
          kw('Shebang (#!/bin/bash)', 'tells the kernel which interpreter execs the script, must be first line'),
          kw('Variable quoting', '"$var" prevents word-splitting/globbing, unquoted $var is a classic bug source'),
          kw('set -euo pipefail', 'fail fast on error, unset var, or failed pipeline stage — standard production script header'),
          kw('Conditionals', '[ ] (test) vs [[ ]] (bash builtin, supports regex/pattern matching, safer)'),
          kw('Loops', 'for/while/until, `while read -r line` for line-safe file processing'),
          kw('Exit codes', '$? holds last command\'s status, 0 = success, scripts should `exit N` explicitly for calling code'),
          kw('Command substitution', '$(cmd) preferred over legacy backticks, nests cleanly'),
          kw('cron syntax', 'minute hour dom month dow command, crontab -e per-user, /etc/cron.d for system-wide'),
        ],
        [
          qaPair('Script worked interactively but silently did nothing under cron — most common cause?', 'Minimal cron environment (no PATH, no login shell vars), hardcode PATH or use absolute paths in the script.'),
          qaPair('Why `[[ ]]` over `[ ]` in bash scripts you\'re writing today?', "Safer word-splitting behavior, supports && / || / regex =~ natively, no quoting landmines with empty variables."),
          qaPair("A script deleted more than intended because of `rm -rf $DIR` — root cause?", "Unquoted variable that was empty/unset expanded to nothing, turning it into `rm -rf /` semantics with globs; always quote and validate."),
          qaPair('What does `set -e` NOT protect you from?', 'Failures inside a pipeline (only exit code of last command counts) unless you also add `pipefail`, and failures inside `if` conditions are intentionally exempt.'),
          qaPair("How do you debug a cron job that \"isn't running\"?", 'Check /var/log/cron or journalctl -u cron/crond, verify syntax with correct field count, and redirect script output to a log file since cron mail is often disabled.'),
        ],
      ),
      fullModule(
        'Security Hardening',
        [
          kw('SELinux modes', 'Enforcing/Permissive/Disabled, `getenforce`/`setenforce`, mandatory access control via labels/context'),
          kw('SELinux context', 'user:role:type:level, `ls -Z`/`ps -Z`, restorecon/chcon to fix mislabeled files'),
          kw('AppArmor', 'path-based MAC (Ubuntu/Debian default), simpler profiles than SELinux\'s label model'),
          kw('SSH hardening', 'PermitRootLogin no, PasswordAuthentication no, key-only auth in sshd_config'),
          kw('fail2ban', 'watches logs (auth.log/secure), bans IPs after repeated failed attempts via firewall rule injection'),
          kw('sudo least privilege', 'scoped Cmnd_Alias in sudoers instead of blanket NOPASSWD:ALL'),
          kw('ssh-keygen / authorized_keys', 'generate keypair, public key deployed to ~/.ssh/authorized_keys, correct perms (700/600) mandatory'),
          kw('AIDE / auditd', 'file integrity monitoring and kernel-level audit trail for compliance (PCI/CIS benchmarks)'),
        ],
        [
          qaPair('App works fine with SELinux disabled but denies access enforcing — what\'s the real fix?', 'Never leave it disabled, use `audit2allow`/proper `semanage fcontext` + restorecon to label correctly, disabling is a compliance red flag in prod.'),
          qaPair('SSH key auth configured but users still get password prompts — usual culprit?', 'Wrong permissions on ~/.ssh or authorized_keys (must not be group/world-writable) or PasswordAuthentication still yes as fallback.'),
          qaPair('SELinux vs AppArmor — why does RHEL shops standardize on SELinux and Ubuntu on AppArmor?', "SELinux gives finer label-based control but steeper learning curve; AppArmor's path-based profiles are simpler to reason about for typical app confinement."),
          qaPair('fail2ban banned your own CI/CD IP - how do you prevent that going forward?', 'Whitelist known CIDR ranges in jail.local ignoreip, and rate-limit rather than blanket-ban trusted automation sources.'),
          qaPair('Give a real example of least-privilege sudo instead of NOPASSWD:ALL.', '`Cmnd_Alias DEPLOY = /usr/bin/systemctl restart myapp` scoped to a deploy group, not full root shell access.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw("grep -rniE 'pattern'", 'recursive, case-insensitive, extended regex search across files'),
          kw("sed -i 's/old/new/g' file", 'in-place stream editing/substitution, -i.bak for safety backup'),
          kw("awk '{print $1,$3}'", 'field-based text processing, great for column extraction from logs/ps output'),
          kw('find /path -mtime -1 -exec cmd {} \\;', 'locate by age/size/perm and act on results, -exec vs xargs for batching'),
          kw('tar -czvf archive.tar.gz dir/', 'create compressed archive (c=create, x=extract, z=gzip, v=verbose, f=file)'),
          kw('df -h / du -sh *', 'filesystem-level free space vs actual directory/file space usage'),
          kw('lsblk / blkid', 'block device tree view and filesystem UUID/type lookup'),
          kw('journalctl -u svc --since "1 hour ago" -p err', 'filtered systemd log query by unit, time, and priority'),
          kw('chmod 640 file / chown app:app file', 'common production ownership/permission pattern for config files'),
        ],
        [],
      ),
      fullModule(
        'Linux Alternatives',
        [
          kw('Debian/Ubuntu family', 'apt/dpkg, .deb packages, predictable LTS cadence, huge community package pool'),
          kw('RHEL/Fedora family', 'dnf/rpm, .rpm packages, RHEL for enterprise support contracts, Fedora as its upstream testbed'),
          kw('Arch Linux', 'rolling release, pacman, bleeding-edge packages, minimal opinionated base, AUR for community packages'),
          kw('Alpine Linux', 'musl libc + busybox, extremely small footprint, default for minimal container base images'),
          kw('systemd', 'default init on RHEL/Ubuntu/most modern distros, unit files, parallelized boot, integrated logging (journald)'),
          kw('sysvinit', 'legacy init, sequential /etc/init.d scripts and runlevels, still found on older/embedded systems'),
          kw('OpenRC', 'lightweight init used by Alpine/Gentoo, dependency-based like systemd but far smaller/simpler'),
          kw('Container base image choice', 'Alpine for size, Debian-slim for glibc compatibility when musl breaks binaries'),
        ],
        [
          qaPair('Why would a team choose Alpine for a container image and then hit a weird bug Debian didn\'t have?', 'musl libc has subtly different behavior than glibc (DNS resolution, locale handling), causes hard-to-diagnose runtime differences in compiled binaries.'),
          qaPair('When do you actually still care about init system choice today?', "Mostly embedded/container-minimal systems (OpenRC/sysvinit) where systemd's overhead and dependencies aren't justified; everywhere else systemd has won."),
          qaPair('RHEL vs Fedora vs CentOS Stream — how do you explain the relationship?', 'Fedora is upstream/bleeding-edge, RHEL is the stabilized enterprise-supported downstream, CentOS Stream now sits as a rolling preview between Fedora and the next RHEL point release.'),
        ],
      ),
    ],
  }
}

function scriptingSubject() {
  return {
    id: uid('subj'),
    icon: '📜',
    name: 'Scripting',
    modules: [
      fullModule(
        'Bash Fundamentals',
        [
          kw('$var vs ${var}', 'braces required for disambiguation (${var}_suffix) and array/parameter expansion'),
          kw('Quoting', 'double quotes allow expansion, single quotes are literal, unquoted variables word-split and glob'),
          kw('$(cmd) vs backticks', 'command substitution; $() nests cleanly, backticks need escaping to nest'),
          kw('$?', 'exit status of last command, 0 = success, checked immediately before it\'s clobbered'),
          kw('[ ] vs [[ ]]', '[[ is bash builtin, supports && / || / regex =~, no word-splitting surprises'),
          kw('test', 'same as [ ], POSIX-portable, no pattern matching'),
          kw('Arrays', 'arr=(a b c), ${arr[@]} all elements, ${#arr[@]} length, ${arr[@]:1:2} slice'),
          kw('$@ vs $*', '"$@" preserves each arg as separate word, "$*" joins into one string with IFS'),
          kw('Exit codes', '0-255, non-zero conventionally means failure, 126/127 mean permission/not-found'),
          kw('Parameter expansion', '${var:-default}, ${var:=default}, ${var#pattern} strip prefix, ${var%pattern} strip suffix'),
        ],
        [
          qaPair('Why does `if [ $x == "foo" ]` blow up when $x is unset?', 'Unquoted empty expansion collapses the token count so `[` sees only two args.'),
          qaPair('$(cmd) or backticks in new scripts?', "Always $(), backticks can't nest and mangle escaping in anything non-trivial."),
          qaPair('How do you capture both exit code and output of a command?', 'Assign output first with `out=$(cmd)`, then read `$?` immediately, don\'t run anything in between.'),
          qaPair('[[ ]] or [ ] in a script shebanged #!/bin/sh?', '[ ], since [[ is a bash/ksh extension and sh may be dash.'),
          qaPair('Why did `for i in $(ls *.txt)` break on a file named "my file.txt"?', 'Unquoted word-splitting on IFS whitespace, use a glob loop `for f in *.txt` instead.'),
        ],
      ),
      fullModule(
        'Bash Scripting Patterns',
        [
          kw('set -euo pipefail', 'exit on error, exit on unset var, propagate failure through pipes'),
          kw("trap 'cmd' EXIT", 'runs cleanup (temp files, locks) on any exit path including errors'),
          kw('Functions', 'local scopes vars, return via $? (status only) or stdout capture, not return values'),
          kw('getopts', 'POSIX flag parsing loop, handles -a, -b value, no long-option support'),
          kw('Here-doc', "<<EOF ... EOF, quote delimiter (<<'EOF') to suppress variable expansion"),
          kw('Here-string', '<<<"$var", feeds a variable as stdin without a subshell'),
          kw('trap ... ERR', 'fires on any command failure when combined with set -e, useful for stack-trace style debugging'),
          kw('${BASH_SOURCE[0]}', 'reliable path to the script itself, unlike $0 under sourcing'),
          kw('Error handling', 'cmd || { echo "failed"; exit 1; }, explicit over relying solely on set -e quirks'),
          kw('Idempotency', "check-before-act ([ -f lock ] || touch lock) so re-runs don't double-apply"),
        ],
        [
          qaPair("Why doesn't set -e catch a failing command inside an if condition?", 'Commands in conditionals are explicitly exempt so the check itself doesn\'t abort the script.'),
          qaPair('Pipeline `cmd1 | cmd2` exits 0 even though cmd1 failed — why?', 'Without pipefail the exit status is only that of the last command in the pipe.'),
          qaPair('How do you guarantee a temp dir is removed even if the script is killed with Ctrl-C?', '`trap \'rm -rf "$tmp"\' EXIT INT TERM` set right after creating it.'),
          qaPair('getopts vs manual `while [[ $1 == -* ]]` parsing?', "getopts for short flags in portable scripts, manual parsing (or a real language) once you need --long-opts."),
          qaPair('A function\'s "return value" needs to be a string, how?', '`echo` the result and capture with `$(myfunc)`, `return` only carries a 0-255 exit code.'),
        ],
      ),
      fullModule(
        'Python for DevOps',
        [
          kw('subprocess.run()', 'captures stdout/stderr/returncode, check=True raises on non-zero, replaces os.system'),
          kw('os.system()', 'legacy, shell-injection prone, no output capture, avoid in new code'),
          kw('shell=True', 'invokes a shell for the command string, injection risk if args come from user input'),
          kw('argparse', 'stdlib CLI parser, subcommands via add_subparsers, auto-generates --help'),
          kw('boto3', 'AWS SDK, session/client/resource layers, credentials resolved via chain (env, profile, IAM role)'),
          kw('azure-identity + SDK clients', 'DefaultAzureCredential chains env/managed-identity/CLI auth similarly to boto3'),
          kw('venv', 'stdlib virtual environment, isolates deps per project, avoids polluting system Python'),
          kw('Context managers (with)', 'guarantees cleanup (__exit__) for files, locks, boto3 sessions even on exception'),
          kw('Pathlib', 'Path objects over string paths, / operator for joining, cross-platform'),
          kw('Retry/backoff', 'botocore.config.Config(retries={"max_attempts":...}) or tenacity for transient API/network errors'),
        ],
        [
          qaPair('Why ban os.system in production automation?', 'No return-code granularity and it\'s a straight shell-injection vector if any input is interpolated.'),
          qaPair('subprocess.run(cmd) vs subprocess.run(cmd, shell=True)?', "Pass a list without shell=True whenever possible so args aren't reinterpreted by a shell."),
          qaPair('How does boto3 find credentials in a Lambda vs EC2 vs local dev?', 'Same resolution chain — env vars, shared config file, then instance/container/Lambda role metadata, first match wins.'),
          qaPair("venv or a full container for a deploy script's dependencies?", "venv for a repo-local dev tool, container when the script itself needs to run identically across CI and prod hosts."),
          qaPair('Why wrap a boto3 paginator loop in a context manager or try/finally?', "So a mid-loop throttling exception doesn't leak open file handles or leave partial state."),
        ],
      ),
      fullModule(
        'PowerShell Fundamentals',
        [
          kw('Verb-Noun', 'cmdlet naming convention (Get-Process, Set-Item), Get-Verb lists approved verbs'),
          kw('Pipeline', 'passes live .NET objects between cmdlets, not text, so no parsing of tabular output'),
          kw('$_ / $PSItem', 'current pipeline object inside ForEach-Object or Where-Object script blocks'),
          kw('ForEach-Object vs foreach', 'pipeline cmdlet (streams, low memory) vs language keyword (loads full collection first)'),
          kw('Select-Object -Property', 'projects/reshapes object properties, -ExpandProperty unwraps to raw value'),
          kw('try/catch/finally', 'requires terminating errors; use -ErrorAction Stop to force non-terminating cmdlets to throw'),
          kw('$ErrorActionPreference', 'global default for error handling, Stop makes catch blocks actually fire'),
          kw('Modules', 'Import-Module, Get-Command -Module, PSGallery (Install-Module) for third-party cmdlets'),
          kw('[CmdletBinding()]', 'turns a function into an "advanced function" with common params (-Verbose, -ErrorAction)'),
          kw('Splatting', '@params hashtable expanded into a cmdlet call, avoids unreadable long parameter lines'),
        ],
        [
          qaPair("Why does a try/catch around Remove-Item on a locked file never hit the catch block?", 'Most cmdlet errors are non-terminating by default, so add -ErrorAction Stop or catch does nothing.'),
          qaPair("What's PowerShell's real advantage over bash for pipeline scripts?", 'Objects retain type and properties through the pipeline, so you filter/sort on real fields instead of regexing text columns.'),
          qaPair('ForEach-Object or foreach() for a 2-million-row CSV?', 'ForEach-Object streams one object at a time, foreach() materializes the whole collection into memory first.'),
          qaPair('How do you make a script portable between Windows PowerShell 5.1 and PowerShell 7?', 'Avoid Windows-only cmdlets/assemblies, test under pwsh, and gate version-specific code with $PSVersionTable.PSVersion.'),
          qaPair('Best practice for a function taking 8 parameters across teams?', '[CmdletBinding()] with named params plus splatting at call sites so diffs stay readable.'),
        ],
      ),
      fullModule(
        'Important Commands/Snippets',
        [
          kw('Safe bash header', "#!/usr/bin/env bash + set -euo pipefail + IFS=$'\\n\\t', standard defensive script preamble"),
          kw('find + xargs (null-delimited)', 'find . -name "*.log" -mtime +7 -print0 | xargs -0 rm -f, safe against spaces/newlines in filenames'),
          kw('awk field extraction', 'awk -F, \'{print $2}\' file.csv, -F sets delimiter, $0 is whole line'),
          kw('Python JSON one-liner', 'python3 -c "import sys,json; print(json.load(sys.stdin)[\'key\'])", extract a field from stdin without jq'),
          kw('jq -r', "jq -r '.items[].name' file.json, dedicated JSON query tool, -r strips quotes for raw shell-usable output"),
          kw('PowerShell prune-by-age', 'Get-ChildItem -Recurse -File | Where-Object LastWriteTime -lt (Get-Date).AddDays(-7) | Remove-Item'),
          kw('ConvertFrom-Json / ConvertTo-Json -Depth 10', "PowerShell's native JSON parse/serialize, -Depth avoids silent truncation of nested objects"),
          kw('grep -RIn "TODO" --include="*.py" .', 'recursive text search scoped to a file type, -I skips binaries'),
          kw('sed -i.bak', "sed -i.bak 's/foo/bar/g' file, in-place edit with backup suffix, portable between GNU/BSD sed when suffix is given"),
          kw('Remote script execution', "ssh user@host 'bash -s' < script.sh, run a local script remotely without copying it to disk first"),
        ],
        [],
      ),
    ],
  }
}

function cicdScmSubject() {
  return {
    id: uid('subj'),
    icon: '🔁',
    name: 'CI/CD & SCM',
    modules: [
      fullModule(
        'Source Control Strategies',
        [
          kw('Trunk-based development', 'short-lived branches (<1 day), merge to main constantly, feature flags hide incomplete work'),
          kw('GitFlow', 'develop/release/hotfix/feature branches, heavyweight, fits scheduled releases not continuous delivery'),
          kw('Feature branching', 'one branch per feature, PR-gated merge, risk of long-lived drift and merge hell'),
          kw('Monorepo', 'single repo, atomic cross-service commits, needs strong tooling (Bazel/Nx) to scale CI'),
          kw('Polyrepo', 'per-service repos, clean ownership boundaries, versioning/coordination overhead across repos'),
          kw('GitOps', 'Git as single source of truth for desired state, reconciler applies diff, full audit trail via commits'),
          kw('Rebase vs merge', 'rebase for linear history on shared branches, merge commit to preserve context of integration'),
          kw('Branch protection rules', 'required reviews, status checks, signed commits enforced before merge'),
          kw('Semantic commit messages', 'conventional commits drive automated changelog and version bump'),
        ],
        [
          qaPair("Trunk-based with a team that can't finish features in a day?", 'Feature flags — merge unfinished code dark, toggle at runtime.'),
          qaPair('When would you still choose GitFlow in 2026?', 'Regulated, scheduled-release shops needing parallel release/hotfix branches, e.g. embedded firmware.'),
          qaPair("Monorepo's biggest CI pain?", 'Naive pipelines rebuild everything — you need affected-graph builds (Nx/Bazel) or CI time explodes.'),
          qaPair('Why GitOps over a CD tool pushing to clusters?', "Pull-based reconciliation means compromised CI can't directly mutate prod, and drift self-heals."),
          qaPair('Rebasing a shared feature branch mid-review — good or bad?', "Bad, force-push rewrites reviewers' base and silently drops their comments' context."),
        ],
      ),
      fullModule(
        'CI Pipeline Design',
        [
          kw('Pipeline-as-code', 'pipeline definition versioned alongside app code, reviewed via PR'),
          kw('Build stages', 'lint → unit test → build → integration test → package, fail fast ordering'),
          kw('Dependency caching', 'key by lockfile hash, restore before install step to cut minutes off builds'),
          kw('Matrix builds', 'cross product of OS/version/arch run in parallel, one job per cell'),
          kw('Parallelization', 'split test suites by timing data, shard across runners to cut wall-clock time'),
          kw('Fail-fast', 'cancel remaining matrix/parallel jobs on first failure to save compute'),
          kw('Artifact passing between stages', 'build once, reuse binary across test/deploy stages, never rebuild'),
          kw('Ephemeral build agents', 'fresh container/VM per run, no state leakage between builds'),
          kw('Flaky test quarantine', 'auto-retry with tagging, alert if retry-pass rate crosses threshold'),
        ],
        [
          qaPair('45-minute pipeline, how do you get it under 10?', 'Profile stage timings first, then cache deps, parallel-shard tests, and parallelize independent stages — in that order.'),
          qaPair('Cache poisoning bit you how?', 'Stale cache key reused a vulnerable transitive dep for weeks until we hashed the lockfile into the key.'),
          qaPair('Build once vs rebuild per stage?', 'Build once, promote the same artifact — rebuilding risks a different binary reaching prod than what was tested.'),
          qaPair('Matrix build cost blew up, fix?', "Trim matrix to real support targets and fail-fast so one failing cell doesn't run the rest to completion."),
        ],
      ),
      fullModule(
        'CD & Release Strategies',
        [
          kw('Blue-green', 'two full environments, instant traffic cutover, fast rollback by flipping router'),
          kw('Canary release', 'small traffic percentage to new version, promote on healthy metrics, abort on regression'),
          kw('Rolling deployment', 'incremental pod/instance replacement, no extra environment cost, slower rollback'),
          kw('Feature flags', 'decouple deploy from release, kill switch for bad logic without a redeploy'),
          kw('Progressive delivery', 'automated canary analysis (metrics-driven promotion/rollback), e.g. Argo Rollouts/Flagger'),
          kw('Rollback strategy', 'must be as automated and tested as forward deploy, not an afterthought'),
          kw('Deployment vs release', 'deploying ships code dark, releasing exposes it to users via flag/routing'),
          kw('Shadow traffic / dark launch', "mirror prod traffic to new version without serving its response"),
          kw('Health checks / readiness gates', 'automated promotion blocked until SLO/error-budget checks pass'),
        ],
        [
          qaPair('Canary vs blue-green, which for a stateful DB-migrating release?', 'Neither cleanly — use expand/contract schema migration regardless of deploy strategy.'),
          qaPair("Canary caught what a smoke test didn't?", 'Elevated p99 latency at 5% traffic from a cold cache, invisible in a single smoke request.'),
          qaPair('Feature flag debt — how do you keep it from rotting?', 'Expiry date on every flag ticket, dashboard flags stale flags, and hard block new deploys past N stale ones.'),
          qaPair('Rolling deployment rollback taking too long?', "Rolling rollback replays the same slow pod-by-pod cycle — that's why we keep blue-green for critical-path services."),
        ],
      ),
      fullModule(
        'Artifact Management',
        [
          kw('Semantic versioning', 'MAJOR.MINOR.PATCH, breaking/feature/fix contract with consumers'),
          kw('Artifact registry', 'Artifactory/Nexus/ECR/GAR, single source of truth for built binaries/images'),
          kw('Immutable artifacts', 'tag once, never overwrite, rebuild produces a new version not a re-push'),
          kw('Promotion pipeline', 'same artifact moves dev→stage→prod, only metadata/tag changes, never rebuilt'),
          kw('Digest pinning', 'deploy by image sha256, not mutable tag like latest or stable'),
          kw('Retention policy', 'GC old artifacts by age/count, keep prod-referenced ones pinned'),
          kw('SBOM', 'software bill of materials generated at build, attached to artifact for audit/vuln scanning'),
          kw('Provenance metadata', 'build attestation (who/what/when built it) travels with the artifact'),
          kw('Artifact signing', 'cosign/Notary sign at build, verify signature before deploy admission'),
        ],
        [
          qaPair('latest tag caused what incident?', 'Rollback redeployed latest, which had already moved forward, so we "rolled back" to the bad version.'),
          qaPair('How do you guarantee stage-tested binary is what hits prod?', 'Promote by digest through the registry, never rebuild between environments.'),
          qaPair('SemVer major bump internal service, who cares?', 'Every downstream consumer pinned to that API contract — bump signals a required client-side change.'),
          qaPair('Artifact registry got compromised, blast radius?', 'Contained by signature verification at deploy admission — unsigned or wrong-key images get rejected regardless of registry state.'),
        ],
      ),
      fullModule(
        'Pipeline Security',
        [
          kw('Secrets manager integration', 'Vault/AWS Secrets Manager/Azure Key Vault injected at runtime, never in env files'),
          kw('OIDC federation', 'short-lived cloud creds via workload identity, no long-lived static keys in CI'),
          kw('Least-privilege pipeline identity', 'scoped per-pipeline service account, not a shared god-token'),
          kw('SLSA framework', 'provenance levels for build integrity, from basic tracking to hermetic isolated builds'),
          kw('Signed commits', 'GPG/SSH-signed commits, verified at branch protection to prove author identity'),
          kw('Artifact signing/verification', 'cosign sign/verify, admission controller blocks unsigned images'),
          kw('Supply chain attack surface', 'compromised dependency/build step/registry, any link can inject malicious code'),
          kw('Dependency pinning + lockfiles', 'exact versions/hashes prevent silent malicious upstream updates'),
          kw('Ephemeral runner isolation', 'no persistent self-hosted runner reused across untrusted PR builds'),
        ],
        [
          qaPair('Static cloud keys in CI env vars, what\'s the fix?', 'OIDC federation for short-lived tokens scoped to that one workflow run.'),
          qaPair('SolarWinds-style build-server compromise, what stops it here?', 'SLSA provenance plus signed artifacts so a tampered build fails verification at deploy.'),
          qaPair('Self-hosted runner risk on public repo PRs?', 'Untrusted fork PR code runs on your runner — never reuse persistent self-hosted runners for public repo workflows.'),
          qaPair('Secret leaked in build logs, root cause?', "Tool echoed env vars on error — mask patterns aren't enough, secrets should never be plain env vars in the first place."),
          qaPair('Least-privilege pipeline identity, real example?', "Deploy job's service account can only push to its own ECR repo, not read other teams' secrets or infra state."),
        ],
      ),
      fullModule(
        'GitHub Actions',
        [
          kw('Workflow', 'YAML in .github/workflows, triggered by push/PR/schedule/dispatch events'),
          kw('Jobs and steps', 'jobs run in parallel by default, steps within a job run sequentially on same runner'),
          kw('Hosted vs self-hosted runners', 'GitHub-hosted for standard needs, self-hosted for custom hardware/network/licensing'),
          kw('Reusable workflows', 'workflow_call, shared pipeline logic versioned centrally, called with inputs/secrets'),
          kw('Composite actions', 'bundle multiple steps into one reusable action, lighter than a full reusable workflow'),
          kw('Environments', 'protection rules, required reviewers, environment-scoped secrets for deploy gating'),
          kw('Matrix strategy', 'strategy.matrix fans out jobs across OS/version combos'),
          kw('OIDC to cloud', 'permissions: id-token: write, federate to AWS/Azure/GCP without static secrets'),
          kw('Concurrency groups', 'cancel-in-progress to stop redundant runs on rapid pushes'),
        ],
        [
          qaPair('Duplicated pipeline logic across 20 repos, fix?', 'Centralize in one reusable workflow via workflow_call, repos just pass inputs/secrets.'),
          qaPair('Self-hosted runner vs GitHub-hosted for compliance workload?', 'Self-hosted, when we need it inside our VPC with no data leaving our network.'),
          qaPair('Secrets accidentally exposed to a forked PR workflow?', 'pull_request_target with checkout of untrusted code — classic mistake, use pull_request instead for fork builds.'),
          qaPair('Deploy job needs manual approval before prod?', 'GitHub Environments with required reviewers gate the job until approved.'),
        ],
      ),
      fullModule(
        'Jenkins',
        [
          kw('Jenkinsfile', 'pipeline-as-code, Declarative or Scripted Groovy syntax, checked into repo'),
          kw('Agents/executors', 'agent label routes stage to matching node, executor slots bound concurrency per node'),
          kw('Plugin ecosystem', 'huge but a maintenance/security liability, pin versions, audit regularly'),
          kw('Shared libraries', 'Groovy library in separate repo, @Library import, DRY across many Jenkinsfiles'),
          kw('Blue Ocean', 'visual pipeline UI, largely unmaintained/deprecated now, most shops back on classic UI'),
          kw('Multibranch pipeline', 'auto-discovers branches/PRs, creates a job per branch matching Jenkinsfile'),
          kw('Pipeline stages/steps', 'stage blocks for visualization, steps for actual execution'),
          kw('Credentials binding', 'Jenkins credential store, injected via withCredentials, masked in console log'),
          kw('Controller/agent architecture', 'controller schedules only, actual builds run on agents to isolate load'),
        ],
        [
          qaPair('Jenkins controller crashed under load, root cause?', 'Builds were running directly on controller instead of agents — starved scheduling threads.'),
          qaPair('Shared library versioning bit you how?', 'Unpinned @Library picked up a breaking change mid-release, pin to a tag not a branch.'),
          qaPair('Plugin update broke half the pipelines?', 'Classic Jenkins pain — now we pin plugin versions and test upgrades in a staging controller first.'),
          qaPair('Why migrate off Jenkins for a greenfield project?', 'Maintenance burden of plugins/controller ops vs. managed YAML-native platforms with less operational overhead.'),
        ],
      ),
      fullModule(
        'Azure DevOps',
        [
          kw('YAML pipelines', 'pipeline-as-code in repo, replaced classic UI-based pipelines'),
          kw('Service connections', 'scoped credentials to external services (Azure, ACR, K8s), least-privilege per connection'),
          kw('Environments', 'deployment target with approval gates, history, and resource tracking'),
          kw('Approvals and checks', 'pre-deployment manual approval, branch control, or business-hours gate'),
          kw('Templates', 'reusable YAML steps/jobs/stages, parameterized and versioned across pipelines'),
          kw('Multi-stage pipelines', 'build → test → deploy stages in one YAML, stage dependencies control flow'),
          kw('Variable groups', 'shared config/secrets linked to Key Vault, scoped per pipeline or environment'),
          kw('Azure Boards/Repos/Artifacts integration', 'work item linking to commits/PRs/builds for full traceability'),
          kw('Self-hosted agent pools', 'custom agents for licensing/network-restricted build requirements'),
        ],
        [
          qaPair('Secret sprawl across 30 pipelines, fix?', 'Variable groups linked to Key Vault, one source of truth, rotate in one place.'),
          qaPair('Prod deploy needs change-manager sign-off?', 'Environment approval gate, deploy stage blocks until approved in Azure DevOps.'),
          qaPair('Pipeline YAML duplicated across repos?', "Extract to a template repo, reference via resources.repositories, parameterize the differences."),
          qaPair('Service connection over-permissioned, blast radius?', "Scoped connection to one resource group only — a compromised pipeline can't touch the whole subscription."),
        ],
      ),
      fullModule(
        'ArgoCD/GitOps',
        [
          kw('Declarative sync', 'desired state in Git, ArgoCD continuously reconciles cluster to match'),
          kw('App of Apps', 'root Argo Application manages child Applications, bootstraps entire platform from one entry point'),
          kw('Drift detection', 'OutOfSync status when live state diverges, auto-heal reverts unauthorized manual changes'),
          kw('Sync waves', 'argocd.argoproj.io/sync-wave annotation orders resource application (CRDs before workloads)'),
          kw('Sync hooks', 'PreSync/Sync/PostSync jobs, e.g. DB migration before app rollout'),
          kw('ApplicationSet', 'templated Application generation across clusters/repos/environments'),
          kw('Self-heal', 'auto re-apply Git state on drift, must be paired with change freeze during incidents'),
          kw('Health checks', "Argo's resource health status (Progressing/Degraded) drives sync status beyond just \"applied\""),
          kw('Sync policy', 'automated vs manual sync, prune flag controls deletion of removed resources'),
        ],
        [
          qaPair('Self-heal fought us during an incident, why?', "Someone kubectl-patched a live fix and Argo silently reverted it — should've paused auto-sync first."),
          qaPair('App of Apps failure mode?', "Root app misconfig cascades to every child app at once — treat the root repo with prod-level review rigor."),
          qaPair('Sync waves solved what problem?', "CRD-before-controller ordering that plain manifest apply couldn't guarantee."),
          qaPair('Drift detected but sync not auto-triggering?', 'Automated sync policy wasn\'t enabled — detection and remediation are separate toggles.'),
        ],
      ),
      fullModule(
        'Important Commands',
        [
          kw('git rebase -i HEAD~n', 'interactive rebase to squash/reorder/edit last n commits before pushing'),
          kw('git cherry-pick <sha>', 'apply a specific commit onto current branch, common for hotfix backports'),
          kw('git bisect start/good/bad', 'binary search commit history to isolate the commit that introduced a regression'),
          kw('git reflog', "recover \"lost\" commits after a bad reset/rebase, local ref history safety net"),
          kw('gh pr create / gh pr checkout', 'GitHub CLI to open and pull down PRs without leaving terminal'),
          kw('gh run watch / gh run view --log-failed', 'tail and debug failing Actions workflow runs from CLI'),
          kw('argocd app sync <app> --prune', 'force sync an Argo Application and prune orphaned resources'),
          kw('argocd app diff <app>', 'show live-vs-desired manifest diff before syncing'),
          kw('kubectl logs -f --previous', "tail logs from a crashed container's last run for pipeline/deploy debugging"),
          kw('docker system prune -af', 'reclaim disk on a build agent choked by stale layers/images'),
        ],
        [],
      ),
      fullModule(
        'CI/CD Alternatives',
        [
          kw('GitLab CI', 'single-application SCM+CI+CD, .gitlab-ci.yml, built-in container registry and Auto DevOps'),
          kw('CircleCI', 'fast orbs ecosystem, strong caching/parallelism, popular for OSS and startups pre-platform-team'),
          kw('Flux CD', 'GitOps operator, lighter-weight than Argo, no built-in UI, strong Helm/Kustomize-native support'),
          kw('Tekton', 'Kubernetes-native CI building blocks (Tasks/Pipelines as CRDs), foundation other platforms build on'),
          kw('Progressive delivery add-ons', 'Flagger pairs with Flux, Argo Rollouts pairs with ArgoCD, for canary automation'),
          kw('Pipeline portability', "Tekton's CRD model avoids vendor lock-in vs proprietary YAML dialects"),
          kw('Multi-tenancy model', 'GitLab/CircleCI centralize control plane, Flux/Tekton run in-cluster per team'),
        ],
        [
          qaPair('When would you pick GitLab CI over GitHub Actions?', 'Already on GitLab for SCM, want one platform instead of stitching SCM plus a separate CI tool.'),
          qaPair('Flux vs ArgoCD, real deciding factor?', "Argo's UI and App-of-Apps win for platform teams managing many tenants visually; Flux wins for minimal footprint and pure Kubernetes-native ops."),
          qaPair('Why build on Tekton instead of Jenkins for a new platform team?', 'Cloud-native, Kubernetes-scaled executors and no controller single point of failure, at the cost of a steeper CRD learning curve.'),
        ],
      ),
    ],
  }
}

function devSecOpsSubject() {
  return {
    id: uid('subj'),
    icon: '🔐',
    name: 'DevSecOps',
    modules: [
      fullModule(
        'DevSecOps Principles',
        [
          kw('Shift-left', 'move security checks to design/code phase, not post-deploy'),
          kw('Security as Code', 'policies, scans, guardrails versioned and reviewed like app code'),
          kw('Everyone owns security', 'devs, ops, security embedded in same pipeline, not a gate at the end'),
          kw('Threat modeling', 'STRIDE (Spoofing, Tampering, Repudiation, Info disclosure, DoS, Elevation)'),
          kw('Paved road', 'golden pipeline templates so secure defaults require no extra dev effort'),
          kw('Security champions', 'embedded team members who triage findings without needing central AppSec'),
          kw('Blast radius', 'design assuming a component will be breached, limit lateral movement'),
          kw('Compliance as code', 'OPA/InSpec turning audit checklists into automated CI checks'),
        ],
        [
          qaPair('How do you get devs to actually own security instead of ignoring it?', 'Bake checks into the PR pipeline with fast, actionable feedback, not a quarterly audit.'),
          qaPair('When do you threat model?', 'At design review for new services, before the first line of infra code is written.'),
          qaPair("Biggest shift-left failure you've seen?", 'Teams bolt on 20 scanners with no triage owner, alerts get ignored, worse than no scanning.'),
          qaPair('How do you measure DevSecOps maturity?', 'Mean time to remediate findings, not just number of scans run.'),
        ],
      ),
      fullModule(
        'SAST',
        [
          kw('SonarQube', 'quality gate + SAST, tracks code smells, duplication, and security hotspots'),
          kw('Semgrep', 'fast, rule-based pattern matching, easy custom rules per org'),
          kw('Static analysis', 'parses AST/control flow without executing code, finds pattern-level bugs'),
          kw('False positive tuning', 'suppress rules via baseline/inline ignore, avoid alert fatigue'),
          kw('Quality gate', 'merge blocked if new code fails coverage/vuln threshold'),
          kw('Security hotspot', 'needs human review, not an auto-confirmed vulnerability'),
          kw('Taint analysis', 'tracks untrusted input from source to dangerous sink'),
          kw('Rule severity tiers', 'block on critical/high, warn-only on low to keep pipeline usable'),
          kw('SARIF', 'standard output format for surfacing findings in GitHub/GitLab code scanning UI'),
        ],
        [
          qaPair('SAST tool flags hundreds of findings on legacy code, what do you do?', 'Baseline existing debt, gate only new code, fix backlog on a separate track.'),
          qaPair('When do you block merges on SAST vs just warn?', 'Block on critical/injection-class findings, warn on style/hotspots to keep velocity.'),
          qaPair('SonarQube vs Semgrep, when do you use which?', 'Semgrep for fast custom org-specific rules, SonarQube for broad quality+security gate with dashboards.'),
          qaPair('How do you cut SAST false positives without weakening security?', 'Tune rules per language/framework and require sign-off to suppress, not silent ignore.'),
        ],
      ),
      fullModule(
        'SCA',
        [
          kw('Snyk', 'dependency + container + IaC scanning with fix PRs'),
          kw('Dependabot', 'GitHub-native, auto-opens PRs for vulnerable dependency bumps'),
          kw('Transitive dependencies', 'vuln in a dependency-of-a-dependency, often invisible in manifest'),
          kw('SBOM', 'CycloneDX/SPDX, full inventory of components for audit and incident response'),
          kw('License compliance', 'flag GPL/AGPL copyleft pulled in transitively into proprietary code'),
          kw('CVSS score', 'severity ranking used to prioritize which CVEs actually block a release'),
          kw('Lockfile pinning', 'package-lock/poetry.lock ensures reproducible, scannable dependency tree'),
          kw('Reachability analysis', 'is the vulnerable function path actually called, cuts noise'),
        ],
        [
          qaPair("A critical CVE hits a transitive dependency you don't control, what's your move?", 'Force-resolve/override the version in the lockfile, or vendor a patched fork if upstream is slow.'),
          qaPair('How do you stop SCA noise from being ignored?', 'Reachability-based prioritization so teams only see exploitable-path CVEs first.'),
          qaPair('Snyk vs Dependabot, why run both?', 'Dependabot for cheap native PR automation, Snyk for deeper reachability and license policy.'),
          qaPair('How do you catch license risk before legal does?', 'SCA license policy gate in CI failing the build on disallowed copyleft licenses.'),
        ],
      ),
      fullModule(
        'DAST',
        [
          kw('OWASP ZAP', 'open-source black-box scanner, active/passive scan modes'),
          kw('Black-box scanning', 'attacks running app externally, no source code knowledge needed'),
          kw('Authenticated scan', 'session token/script injection so scanner crawls behind login'),
          kw('Baseline scan', 'fast passive-only scan suited for every PR/CI run'),
          kw('Full active scan', 'exploits payloads (SQLi, XSS), slower, usually nightly or pre-release'),
          kw('Spidering/crawling', 'scanner needs to discover app routes before it can attack them'),
          kw('CI integration challenge', 'flaky ephemeral environments, scan duration vs pipeline SLA'),
          kw('False negative risk', 'DAST misses logic flaws and anything behind unusual auth flows'),
        ],
        [
          qaPair('Why run DAST if you already have SAST?', "DAST catches runtime/config issues like missing headers or auth bypass that source-level analysis can't see."),
          qaPair('How do you handle auth-gated apps in ZAP?', "Script the login flow or inject a session token via ZAP's authentication context before crawling."),
          qaPair('DAST scans take 40 minutes, killing your CI SLA, what do you do?', 'Run ZAP baseline passive scan per PR, move full active scan to a nightly pipeline against staging.'),
          qaPair('Biggest DAST pitfall?', 'Treating a clean scan as "secure" when it never even authenticated properly and crawled two pages.'),
        ],
      ),
      fullModule(
        'Container Scanning',
        [
          kw('Trivy', 'fast, all-in-one scanner for OS packages, app deps, IaC, and secrets in one binary'),
          kw('Grype', "Anchore's scanner, strong SBOM (Syft) integration"),
          kw('Base image hygiene', 'minimal/distroless images reduce attack surface and CVE count'),
          kw('Scan-on-push', 'registry-native scanning (ECR/Harbor) catches drift after build'),
          kw('Scan-in-CI', 'shift-left, fail build before image ever reaches registry'),
          kw('CVE severity threshold', 'fail build only on Critical/High to avoid endless noise'),
          kw('Image layer caching', 'stale cached base layers reintroduce patched CVEs silently'),
          kw('Distroless', 'no shell/package manager, shrinks exploitable surface post-compromise'),
        ],
        [
          qaPair('Scan-on-push vs scan-in-CI, which do you rely on?', 'Both — CI gate stops bad images shipping, registry scan catches new CVEs in images already deployed.'),
          qaPair('Trivy vs Grype, how do you choose?', 'Trivy for one binary covering OS+deps+IaC+secrets, Grype when already standardized on Syft SBOMs.'),
          qaPair('Build passes scan today, fails tomorrow with no code change, why?', 'New CVE published against an unchanged base image layer, scanners are time-dependent not just commit-dependent.'),
          qaPair('How do you cut container CVE count long-term?', 'Move to minimal/distroless base images and rebuild on a fixed cadence, not just react to alerts.'),
        ],
      ),
      fullModule(
        'IaC Scanning',
        [
          kw('Checkov', 'Bridgecrew/Prisma scanner, broad policy coverage across Terraform/CFN/K8s/Helm'),
          kw('tfsec', "Terraform-specific, fast, now merged into Trivy's IaC engine"),
          kw('Policy as code', 'Rego/OPA or built-in rule packs codify security baselines'),
          kw('Misconfiguration', 'open security groups, public S3 buckets, unencrypted volumes caught pre-apply'),
          kw('Pre-apply gate', 'scan runs in PR/plan stage, before terraform apply touches real infra'),
          kw('Custom policy', "org-specific Rego rules for things generic scanners don't cover"),
          kw('Drift detection', 'scanning live state vs code catches manual console changes'),
          kw('Suppression comments', 'inline exceptions with required justification/ticket reference'),
        ],
        [
          qaPair('Where in the pipeline does IaC scanning run?', 'On terraform plan output in the PR, before apply, so misconfigs never reach real infra.'),
          qaPair('Checkov vs tfsec?', "tfsec for fast Terraform-only checks, Checkov for broader multi-framework policy coverage; tfsec's engine is now inside Trivy anyway."),
          qaPair('Dev suppresses a Checkov finding to unblock a deploy, how do you prevent abuse?', 'Require a linked ticket/justification in the suppression comment and review it in the PR.'),
          qaPair('How do you catch infra changed outside Terraform entirely?', 'Periodic drift detection comparing live state to code, not just PR-time scanning.'),
        ],
      ),
      fullModule(
        'Kubernetes Security',
        [
          kw('Kube-bench', 'CIS Kubernetes Benchmark automated checks against control plane/nodes'),
          kw('Falco', 'eBPF/syscall-based runtime threat detection, alerts on anomalous container behavior'),
          kw('OPA/Gatekeeper', 'general-purpose policy engine, admission control via Rego'),
          kw('Kyverno', 'Kubernetes-native policy engine, YAML-based, no new language to learn'),
          kw('Pod Security Standards', 'restricted/baseline/privileged, replaced deprecated PSPs'),
          kw('Admission controller', 'webhook that blocks non-compliant manifests at apply time'),
          kw('RBAC least privilege', 'scoped roles/bindings, avoid cluster-admin sprawl'),
          kw('NetworkPolicy', 'default-deny + explicit allow for pod-to-pod traffic segmentation'),
        ],
        [
          qaPair('OPA/Gatekeeper vs Kyverno, which do you pick?', "Kyverno for teams that don't want to learn Rego, OPA when you need one policy engine across K8s and non-K8s systems."),
          qaPair('Kube-bench vs Falco, are they redundant?', 'No — kube-bench is static config compliance, Falco is runtime anomaly detection, you need both.'),
          qaPair('How do you stop privileged pods from ever being scheduled?', 'Admission control with Pod Security Standards set to restricted, enforced not just audited.'),
          qaPair('Falco fires 500 alerts a day, what now?', 'Tune rules to your baseline workload behavior and route only high-confidence rules to paging.'),
        ],
      ),
      fullModule(
        'Secrets Management',
        [
          kw('HashiCorp Vault', 'dynamic secrets, leasing/revocation, centralized secret engine'),
          kw('Sealed Secrets', 'Bitnami controller, encrypts secrets safely for GitOps storage'),
          kw('Secret rotation', 'short-lived credentials, automatic rotation reduces blast radius of leaks'),
          kw('git history leakage', 'secrets committed once remain in history forever unless history rewritten'),
          kw('git-secrets/gitleaks', 'pre-commit and CI scanning to catch secrets before push'),
          kw('Dynamic secrets', 'Vault issues per-lease DB/cloud creds, no long-lived static credential'),
          kw('KMS envelope encryption', 'encrypt data key with a master key held in cloud KMS/HSM'),
          kw('External Secrets Operator', 'syncs Vault/AWS Secrets Manager into K8s secrets natively'),
        ],
        [
          qaPair("A secret got committed to git six months ago, what's the fix?", 'Rotate the credential immediately, then rewrite history/BFG only as cleanup, rotation is what actually matters.'),
          qaPair('Vault vs Sealed Secrets, when do you use which?', 'Vault for dynamic, centrally-audited secrets; Sealed Secrets for simple GitOps-friendly static secrets in a repo.'),
          qaPair('How do you enforce no plaintext secrets in git?', 'gitleaks as a pre-commit hook and a CI gate, both, since devs skip local hooks.'),
          qaPair('Why prefer dynamic over static secrets?', 'Short-lived leases mean a leaked credential expires before it\'s useful to an attacker.'),
        ],
      ),
      fullModule(
        'OWASP Top 10',
        [
          kw('Broken Access Control', 'most common category, missing authorization checks on objects/endpoints'),
          kw('Cryptographic Failures', 'weak/missing encryption of sensitive data at rest or in transit'),
          kw('Injection', 'SQLi/NoSQLi/command injection from unsanitized untrusted input'),
          kw('Insecure Design', 'missing threat modeling, flaw baked into architecture not just code'),
          kw('Security Misconfiguration', 'default creds, verbose errors, unnecessary features enabled'),
          kw('Vulnerable Components', 'using libraries with known CVEs, ties directly into SCA'),
          kw('SSRF', 'server-side request forgery, app fetches attacker-controlled internal URL'),
          kw('Identification/Auth Failures', 'weak session handling, credential stuffing exposure'),
          kw('Software/Data Integrity Failures', 'unsigned CI/CD artifacts, insecure deserialization'),
        ],
        [
          qaPair('Which OWASP category do you see most in real audits?', 'Broken Access Control, almost always an IDOR where object ownership is never checked.'),
          qaPair('How do you actually prevent SSRF, not just detect it?', "Allowlist outbound destinations and block metadata IP ranges at the network layer, don't rely on input validation alone."),
          qaPair('Injection is 20 years old, why does it still happen?', 'ORMs and parameterized queries got adopted everywhere except the one raw query someone wrote for "performance."'),
          qaPair('How does OWASP Top 10 map to your CI tooling?', 'SAST/DAST for injection and access control, SCA for vulnerable components, IaC scanning for misconfiguration.'),
        ],
      ),
      fullModule(
        'Important Tools',
        [
          kw('SonarQube', 'code quality and SAST platform with merge-blocking quality gates'),
          kw('Semgrep', 'lightweight, rule-based static analysis with fast custom rule authoring'),
          kw('Snyk', 'dependency, container, and IaC vulnerability scanning with automated fix PRs'),
          kw('Trivy', 'all-in-one scanner for containers, filesystems, IaC, and secrets'),
          kw('Checkov', 'policy-as-code scanner for Terraform, CloudFormation, and Kubernetes manifests'),
          kw('Falco', 'eBPF-based runtime security and anomaly detection for containers/Kubernetes'),
          kw('Vault', "HashiCorp's centralized secrets management with dynamic secrets and leasing"),
          kw('OWASP ZAP', 'open-source DAST tool for black-box web application scanning'),
        ],
        [],
      ),
      fullModule(
        'DevSecOps Alternatives',
        [
          kw('Build vs buy', 'assemble best-of-breed OSS (Trivy+Checkov+Semgrep) vs single vendor platform'),
          kw('GitHub Advanced Security', 'native SAST/secret scanning/dependency review, tightly integrated but GitHub-locked'),
          kw('All-in-one platforms', 'Wiz, Snyk, Prisma Cloud unify CSPM/CWPP/SCA under one pane of glass'),
          kw('Best-of-breed OSS stack', 'cheaper licensing, more integration/maintenance burden on the platform team'),
          kw('Vendor lock-in', 'proprietary policy language/dashboards raise switching cost later'),
          kw('Total cost of ownership', 'OSS "free" tools cost engineering time to glue and maintain'),
          kw('Signal consolidation', 'unified platforms dedupe findings across scan types, reducing alert fatigue'),
          kw('Procurement velocity', 'buying a platform is faster than building an internal security pipeline org-wide'),
        ],
        [
          qaPair('When do you recommend buying an all-in-one platform like Wiz over open-source?', 'When the org lacks a platform team to maintain glue code, buy time-to-value beats OSS savings.'),
          qaPair('What\'s the hidden cost of an OSS-only DevSecOps stack?', "Engineering hours spent on integration, upgrades, and dedup that a vendor platform gives you for free."),
          qaPair('GitHub Advanced Security vs a best-of-breed stack?', "GHAS wins on frictionless integration if you're all-in on GitHub; best-of-breed wins on depth and multi-VCS flexibility."),
        ],
      ),
    ],
  }
}

function platformEngineeringSubject() {
  return {
    id: uid('subj'),
    icon: '🛠️',
    name: 'Platform Engineering',
    modules: [
      fullModule(
        'Internal Developer Platforms',
        [
          kw('IDP', 'curated layer of self-service tooling, APIs, and golden paths that abstracts infra complexity from app teams'),
          kw('Platform as a product', 'platform team treats app devs as customers, ships roadmaps, gathers feedback, measures adoption'),
          kw('Cognitive load reduction', 'IDP hides intrinsic complexity (K8s, networking, IAM) so devs focus on domain logic'),
          kw('Self-service infrastructure', 'devs provision envs/DBs/pipelines via portal or API without filing tickets to ops'),
          kw('Thinnest viable platform (TVP)', 'start with minimum abstraction covering top use cases, grow based on real demand'),
          kw('Platform team topology', 'sits alongside stream-aligned teams per Team Topologies, reduces cross-team dependencies'),
          kw('Adoption curve risk', "IDP fails if devs bypass it because it's slower or less flexible than doing it themselves"),
          kw('Internal customers/SLAs', 'platform team owns uptime, support, and roadmap for the platform like an external vendor'),
          kw('Day-2 operations', 'IDP must cover ongoing lifecycle (upgrades, patching, decommission), not just initial provisioning'),
        ],
        [
          qaPair('How do you know an IDP is succeeding versus just existing?', 'Track voluntary adoption and ticket deflection, not mandate compliance.'),
          qaPair('Biggest reason IDP initiatives fail at scale?', 'Building for imagined needs instead of the top three actual pain points teams complain about.'),
          qaPair('How do you fund a platform team internally?', 'Treat it as a product with a budget tied to measurable dev-time saved, not a cost center.'),
          qaPair('What\'s the first thing you build for a new IDP?', 'A golden path for the most common service type, not a general-purpose abstraction.'),
          qaPair('How do you handle teams who resist using the platform?', 'Interview them for the gap, since resistance usually signals a missing capability, not stubbornness.'),
        ],
      ),
      fullModule(
        'Golden Paths & Self-Service',
        [
          kw('Golden path', 'opinionated, supported default route to production; not the only route, but the easiest one'),
          kw('Paved road vs mandate', 'guardrail approach offers the good path without blocking alternate ones; mandate forces it'),
          kw('Service scaffolding', 'CLI/portal generates repo, CI pipeline, IaC, and boilerplate from a template in minutes'),
          kw('Guardrails vs gates', 'guardrails let you proceed with automated checks; gates block progress pending manual approval'),
          kw('Template sprawl', 'unmaintained scaffolding templates drift from best practice and become a liability over time'),
          kw('Escape hatches', 'golden path must allow controlled deviation for edge cases without forking the whole workflow'),
          kw('Paved-road ownership', 'platform team versions and patches templates centrally so fixes propagate to all consumers'),
          kw('Time-to-first-commit', 'golden path success metric: time from repo creation to first deployed change'),
          kw('Opinionation gradient', 'thin templates (repo + CI only) vs thick templates (full app skeleton with libs baked in)'),
        ],
        [
          qaPair('When do guardrails beat hard gates?', 'When the risk is reversible, since gates should be reserved for blast-radius events like prod data or security.'),
          qaPair("How do you stop ten teams from hand-rolling ten different CI pipelines?", 'Ship one scaffolded pipeline as the default and make deviation require a documented reason.'),
          qaPair('How do you keep golden paths from rotting?', 'Version them like a product with owners, changelogs, and a deprecation policy, not a one-time script.'),
          qaPair("What's the danger of over-opinionated scaffolding?", "Teams fork it on day one because the escape hatch doesn't exist, and now you maintain two paths."),
          qaPair('How do you roll out a breaking template change across 200 services?', 'Automated PR bots plus a sunset window, never a flag day.'),
        ],
      ),
      fullModule(
        'Backstage',
        [
          kw('Software catalog', 'central YAML-defined (catalog-info.yaml) registry of services, APIs, resources, and ownership'),
          kw('Entity model', 'Component, API, Resource, System, Domain, and Group/User kinds linked via relations'),
          kw('TechDocs', 'docs-as-code plugin rendering MkDocs from each repo directly into the catalog UI'),
          kw('Scaffolder', 'template engine (skeleton + actions) that generates new repos and registers them in the catalog'),
          kw('Plugin ecosystem', 'frontend plugins (React) plus backend plugins extend Backstage for CI status, cost, on-call, etc.'),
          kw('Software templates (template.yaml)', 'parameterized scaffolder definitions with input forms and post-generation actions'),
          kw('Catalog ingestion', 'static file, GitHub discovery processor, or custom entity providers populate the catalog'),
          kw('Backstage backend system', 'plugin-based Node backend with its own auth, database, and permission framework'),
          kw('Ownership annotations', 'spec.owner and links tie each entity to a team for accountability and search'),
        ],
        [
          qaPair('Why do Backstage rollouts stall after the initial catalog import?', 'Nobody owns keeping catalog-info.yaml accurate, so it goes stale within a quarter.'),
          qaPair('How do you get teams to actually maintain their catalog entries?', 'Wire ownership data into something they already need, like on-call routing or cost attribution.'),
          qaPair('When would you build a custom plugin instead of using an off-the-shelf one?', "When the org's process (e.g., custom deploy approval) isn't modeled by any community plugin's data shape."),
          qaPair("What's the hidden cost of Backstage versus a SaaS IDP?", 'You inherit ongoing backend upgrades, plugin compatibility, and hosting, which is a real platform-team headcount cost.'),
          qaPair('How do you scale the scaffolder across hundreds of templates?', 'Treat templates as a monorepo with CI-tested skeletons, not ad hoc copy-pasted YAML.'),
        ],
      ),
      fullModule(
        'Platform APIs & Abstraction Layers',
        [
          kw('Crossplane', 'control-plane framework turning cloud resources into Kubernetes CRDs via providers'),
          kw('Composite Resource Definition (XRD)', "Crossplane's schema for a custom platform API exposed to app teams"),
          kw('Composition', 'maps an XRD to concrete managed resources (e.g., one XR becomes RDS + IAM + security group)'),
          kw('Operator pattern', 'controller watches CRD spec, reconciles cluster/cloud state to match desired state continuously'),
          kw('Control loop reconciliation', 'level-triggered, idempotent convergence, not event-driven one-shot execution'),
          kw('Abstraction leakage', 'underlying provider quirks (AWS eventual consistency, quota errors) surface through the API anyway'),
          kw('Claim vs composite resource', 'namespaced Claim requested by devs, cluster-scoped XR managed by platform team'),
          kw('Platform API versioning', 'CRD schema changes need conversion webhooks or v1alpha1→v1 migration strategy'),
          kw('Drift detection', "reconciler corrects manual out-of-band changes, which can fight infra teams' break-glass edits"),
        ],
        [
          qaPair('Why choose Crossplane over Terraform for a platform API?', 'You want a live control loop and native Kubernetes RBAC/GitOps integration, not just declarative apply-time provisioning.'),
          qaPair("What's the classic abstraction-leak failure mode?", 'An IAM propagation delay from the cloud provider surfaces as a flaky, unexplained error in the platform API consumers see.'),
          qaPair('How do you version a platform API without breaking every consumer?', 'Conversion webhooks plus a long deprecation window, exactly like core Kubernetes API versioning.'),
          qaPair('When does the operator pattern become an operational liability?', 'When you have hundreds of custom controllers and no shared observability for reconcile errors across them.'),
          qaPair('How do you handle a break-glass manual fix fighting the reconciler?', 'Pause reconciliation explicitly via annotation instead of letting ops and the controller fight silently.'),
        ],
      ),
      fullModule(
        'Developer Experience Metrics',
        [
          kw('DORA metrics', 'deployment frequency, lead time for changes, change failure rate, MTTR; the four key delivery metrics'),
          kw('Lead time for changes', 'commit-to-production time; platform bottlenecks (manual approval, slow CI) dominate this'),
          kw('SPACE framework', 'satisfaction, performance, activity, communication, efficiency; broader than DORA alone'),
          kw('Developer satisfaction surveys', 'periodic qualitative NPS/eNPS-style pulse on tooling friction, complements hard metrics'),
          kw('Time-to-first-deploy (new hire)', 'days from laptop setup to first production change; proxy for onboarding/platform quality'),
          kw('Perceived vs actual productivity', "devs' self-reported friction often diverges from what telemetry shows, both matter"),
          kw('Vanity metrics trap', 'commit count or PR count rewards busywork, not outcomes; avoid as platform KPIs'),
          kw('Toil measurement', 'percentage of eng time spent on manual, repetitive ops work the platform should automate away'),
          kw('Golden signal for platforms', 'ticket volume to platform team as inverse proxy for self-service effectiveness'),
        ],
        [
          qaPair('Which DORA metric moves first when a platform investment pays off?', 'Lead time for changes, since it directly reflects removed manual gates and faster pipelines.'),
          qaPair('How do you avoid gaming DORA metrics?', 'Pair them with change failure rate and MTTR so speed can\'t be optimized at the expense of stability.'),
          qaPair('Why track time-to-first-deploy for new hires?', "It's the fastest signal of platform quality since new hires have no workarounds or tribal knowledge to compensate."),
          qaPair('How do you weigh a developer survey saying "CI is slow" against dashboards saying it isn\'t?', "Trust the survey as a leading indicator, since perceived friction predicts attrition before metrics catch up."),
          qaPair("What's the one metric you'd cut if forced to pick fewer KPIs?", 'Deployment frequency alone, since it\'s the most easily gamed by splitting trivial commits.'),
        ],
      ),
    ],
  }
}

function systemDesignSubject() {
  return {
    id: uid('subj'),
    icon: '🏗️',
    name: 'System Design',
    modules: [
      fullModule(
        'Scalability Fundamentals',
        [
          kw('Vertical scaling', 'bigger box, simpler but hits hardware ceiling and single point of failure'),
          kw('Horizontal scaling', 'more boxes, requires statelessness and coordination overhead'),
          kw('Stateless service design', 'no session/local state on the instance, any node serves any request'),
          kw('Session affinity as anti-pattern', 'sticky sessions reintroduce state, defeats elastic scaling'),
          kw('Shared-nothing architecture', "nodes don't share memory/disk, scale by adding units not by growing one"),
          kw('Back-of-envelope estimation', 'QPS, storage, bandwidth math to size systems before building'),
          kw("Little's Law", 'concurrency = throughput x latency, used to size thread/connection pools'),
          kw("Amdahl's Law", 'speedup capped by the serial fraction of the workload'),
          kw('Read/write ratio', 'determines whether to optimize for caching vs write throughput'),
          kw('Vertical-then-horizontal migration', 'teams scale up first for speed, refactor to stateless once it caps out'),
        ],
        [
          qaPair('When would you still choose vertical scaling in 2026?', 'For latency-sensitive stateful systems like single-writer databases where coordination cost exceeds hardware cost.'),
          qaPair('How do you retrofit statelessness onto a legacy sticky-session app?', 'Externalize session to Redis and cut over gradually behind a feature flag, per-endpoint.'),
          qaPair('Walk me through estimating QPS for 50M DAU.', 'Assume 10 actions/day, divide by 86400 seconds, multiply by 3-5x for peak-to-average skew.'),
          qaPair("Why does adding servers sometimes not improve throughput?", "Amdahl's Law — if 30% of the work is serialized on a shared resource, that caps your speedup regardless of node count."),
          qaPair("What's the first thing you check when horizontal scaling isn't helping?", 'Whether the bottleneck moved to a shared stateful dependency like a database or lock service.'),
        ],
      ),
      fullModule(
        'Load Balancing',
        [
          kw('L4 load balancing', 'routes on IP/TCP/UDP, fast, no payload visibility'),
          kw('L7 load balancing', 'routes on HTTP headers/path/cookies, enables content-based routing'),
          kw('Round robin', 'even distribution, ignores backend load or capacity differences'),
          kw('Least connections', 'routes to fewest active connections, better for uneven request durations'),
          kw('Consistent hashing', 'minimizes remapping when nodes added/removed, key for cache/shard routing'),
          kw('Health checks', 'active (probe) vs passive (observe failures), determine pool membership'),
          kw('Sticky sessions', 'pins client to backend, breaks even distribution and complicates failover'),
          kw('Connection draining', 'in-flight requests finish before a node is removed from rotation'),
          kw('Global server load balancing (GSLB)', 'DNS or anycast routing across regions'),
          kw('Load balancer as SPOF', 'must be deployed redundantly (active-active LB pairs or anycast)'),
        ],
        [
          qaPair('L4 or L7 for a microservices mesh?', 'L7, because you need path-based routing and header inspection for canary and auth.'),
          qaPair('Why does round robin hurt you with long-lived connections?', 'One slow client can hog a backend while round robin keeps sending it equal new load, causing imbalance.'),
          qaPair('How does consistent hashing help when you scale a cache cluster?', 'Only ~1/N of keys remap on a node change, avoiding a full cache stampede.'),
          qaPair('Active or passive health checks for a high-QPS service?', 'Passive, to avoid probe overhead at scale, backed by a low-frequency active check for slow-starting nodes.'),
          qaPair('Why avoid sticky sessions in an autoscaled fleet?', 'They defeat even load distribution and cause hot spots right when you scale out to relieve load.'),
        ],
      ),
      fullModule(
        'Caching Strategies',
        [
          kw('Cache-aside (lazy loading)', 'app checks cache, loads from DB on miss, populates cache'),
          kw('Write-through', 'write goes to cache and DB synchronously, consistent but higher write latency'),
          kw('Write-behind (write-back)', 'write to cache, async flush to DB, risk of data loss on crash'),
          kw('Cache invalidation', 'TTL, explicit delete, or version tagging to avoid staleness'),
          kw('Thundering herd', 'mass cache miss (expiry or cold start) causes DB request storm'),
          kw('Request coalescing', 'single in-flight fetch per key, other requesters wait on that result'),
          kw('Jittered TTL', 'randomize expiry to prevent synchronized mass expiration'),
          kw('CDN edge caching', 'cache static/semi-static content near users, reduces origin load and latency'),
          kw('Cache stampede protection', 'locks, probabilistic early expiration, or stale-while-revalidate'),
          kw('Negative caching', 'cache "not found" results to avoid repeated DB lookups for missing keys'),
        ],
        [
          qaPair('Cache-aside or write-through for a read-heavy product catalog?', "Cache-aside, since writes are rare and you don't want write latency coupled to cache availability."),
          qaPair('What\'s your real risk with write-behind caching?', 'Data loss on cache node crash before flush, so only use it for tolerant, recoverable data.'),
          qaPair('How do you prevent thundering herd on a hot key expiry?', 'Request coalescing plus jittered TTLs so expirations don\'t cluster.'),
          qaPair('Why use stale-while-revalidate instead of hard invalidation?', 'It serves slightly stale data instantly while refreshing in the background, avoiding a latency spike.'),
          qaPair('When does CDN edge caching actively hurt you?', 'When content is personalized or highly dynamic, you get cache fragmentation or serve wrong-user data if keyed incorrectly.'),
        ],
      ),
      fullModule(
        'CAP Theorem & Consistency Models',
        [
          kw('CAP theorem', 'under a network partition, choose consistency or availability, not both'),
          kw('Partition tolerance', 'non-negotiable in distributed systems, the real choice is C vs A during P'),
          kw('Strong consistency', 'every read sees latest write, requires coordination (consensus/locking)'),
          kw('Eventual consistency', 'replicas converge over time, allows stale reads for availability/latency'),
          kw('Quorum reads/writes', 'W + R > N guarantees overlap, tunable consistency per operation'),
          kw('PACELC', 'extends CAP: even without partition (E), tradeoff latency vs consistency'),
          kw('Read-your-writes consistency', 'session guarantee weaker than strong, stronger than eventual'),
          kw('Causal consistency', 'preserves cause-effect ordering without full linearizability cost'),
          kw('Linearizability', 'strongest single-object consistency, appears as one atomic timeline'),
          kw('Vector clocks', 'track causality across replicas to detect concurrent conflicting writes'),
        ],
        [
          qaPair('Is CAP theorem actually a practical design constraint or academic?', "Practical — it just applies only during partitions, PACELC is what governs your everyday latency/consistency tradeoff."),
          qaPair('Would you choose AP or CP for a payments ledger?', 'CP, because a stale balance causing double-spend is worse than temporary unavailability.'),
          qaPair('How do you get strong-ish consistency without full linearizability cost?', 'Quorum with W+R>N tuned per operation, sacrificing some latency only where correctness matters.'),
          qaPair('Why do most \'highly available\' systems still choose CP for metadata but AP for data?', 'Metadata corruption cascades everywhere, while stale data objects are locally recoverable.'),
          qaPair('What\'s the real-world cost PACELC captures that CAP misses?', 'The latency-consistency tradeoff you pay on every request, not just during rare partitions.'),
        ],
      ),
      fullModule(
        'Database Sharding & Replication',
        [
          kw('Range-based sharding', 'simple, risks hot spots on sequential keys (timestamps, autoincrement)'),
          kw('Hash-based sharding', 'even distribution, but range queries become scatter-gather'),
          kw('Directory-based sharding', 'lookup service maps key to shard, flexible but adds a dependency'),
          kw('Leader-follower replication', 'single writer, multiple readers, simple but leader is a bottleneck/SPOF'),
          kw('Multi-leader replication', 'write availability across regions, conflict resolution required'),
          kw('Replication lag', 'follower reads can be stale, breaks read-your-writes without care'),
          kw('Semi-synchronous replication', 'leader waits for at least one follower ack, balances durability/latency'),
          kw('Resharding', 'splitting/merging shards under live traffic, needs dual-write or online migration tooling'),
          kw('Shard key selection', 'determines hot-spotting, join locality, and future resharding pain'),
          kw('Consistent hashing for shard placement', 'reduces data movement when adding/removing shard nodes'),
        ],
        [
          qaPair('Range or hash sharding for a time-series events table?', 'Hash on a composite key like device_id, not timestamp, to avoid all writes hitting the newest range shard.'),
          qaPair('How do you handle a read-after-write requirement with async replicas?', "Route that user's immediate reads to the leader or a replica proven caught up, then fall back to any replica."),
          qaPair('What\'s the hardest part of resharding in production?', "Live data migration with dual-writes and a cutover that doesn't lose or duplicate in-flight writes."),
          qaPair('Leader-follower or multi-leader for a globally distributed app?', 'Multi-leader only if you can tolerate and resolve write conflicts, otherwise single-leader per region with async cross-region replication.'),
          qaPair('Why is shard key choice the single highest-leverage decision in sharding?', 'A bad key causes hot spots and unsplittable shards that no amount of infra fixes later without a full migration.'),
        ],
      ),
      fullModule(
        'Message Queues & Event-Driven Architecture',
        [
          kw('Kafka', 'log-based, high throughput, consumer offsets, replay capability, partition-ordered'),
          kw('RabbitMQ', 'broker-based, flexible routing (exchanges), per-message ack, better for complex routing'),
          kw('SQS', 'managed, simple, at-least-once, visibility timeout, no strict ordering (unless FIFO)'),
          kw('At-least-once delivery', 'default safe mode, requires idempotent consumers to avoid duplicate effects'),
          kw('Exactly-once semantics', 'achieved via idempotency keys + dedup, not true exactly-once at the transport'),
          kw('Idempotent consumers', 'dedupe by message ID/business key so retries are safe'),
          kw('Backpressure', 'consumer signals producer/broker to slow down to avoid overload or unbounded queueing'),
          kw('Dead-letter queue', 'captures poison messages after retry exhaustion for isolation and inspection'),
          kw('Consumer lag', 'gap between produced and consumed offset, key health metric for Kafka pipelines'),
          kw('Outbox pattern', 'write DB change and event atomically via local table, avoids dual-write inconsistency'),
        ],
        [
          qaPair('Kafka or SQS for an event pipeline needing replay?', 'Kafka, because SQS deletes messages on ack and has no log retention for replay/reprocessing.'),
          qaPair("How do you actually get 'exactly-once' in practice?", "You don't at the transport layer, you get at-least-once delivery plus an idempotent consumer keyed on a dedup ID."),
          qaPair('What\'s the danger of ignoring consumer lag?', 'Silent backlog growth until a lag spike causes stale processing or storage exhaustion on the broker.'),
          qaPair('Why use the outbox pattern instead of publishing directly after a DB commit?', 'It avoids the dual-write problem where the DB commits but the publish fails or vice versa.'),
          qaPair('RabbitMQ or Kafka for complex fan-out routing rules?', "RabbitMQ, its exchange/binding model handles conditional routing far more naturally than Kafka's partition model."),
        ],
      ),
      fullModule(
        'Rate Limiting & Circuit Breakers',
        [
          kw('Token bucket', 'allows bursts up to bucket size, refills at fixed rate, most common API limiter'),
          kw('Sliding window', 'smooths burst edge issues of fixed windows, more accurate, more state to track'),
          kw('Fixed window counter', 'cheap but allows 2x burst at window boundary'),
          kw('Circuit breaker states', 'closed (normal), open (failing fast), half-open (probing recovery)'),
          kw('Failure threshold', 'error rate/count that trips breaker from closed to open'),
          kw('Bulkheading', "isolate resource pools (threads/connections) per dependency so one failure doesn't sink all"),
          kw('Graceful degradation', 'serve reduced functionality (cached/default data) instead of hard failure'),
          kw('Backoff with jitter', 'exponential retry delay randomized to avoid synchronized retry storms'),
          kw('Load shedding', 'proactively drop low-priority requests before the system tips over'),
          kw('Timeout budgets', 'per-hop deadline allocation across a call chain to prevent cascading latency'),
        ],
        [
          qaPair('Token bucket or sliding window for a public API gateway?', "Token bucket, it's cheap and the burst tolerance is actually desirable for legitimate client patterns."),
          qaPair('Why does a circuit breaker need a half-open state instead of just closing after a timeout?', 'Half-open lets you probe with limited traffic first, avoiding slamming a still-recovering service.'),
          qaPair('How does bulkheading prevent cascading failure?', "It caps the blast radius by isolating thread/connection pools so one slow dependency can't exhaust resources needed by others."),
          qaPair('What\'s wrong with naive exponential backoff at scale?', 'Without jitter, thousands of clients retry in synchronized waves and re-trigger the outage.'),
          qaPair('When do you choose load shedding over just scaling up?', 'When the spike is a transient overload or attack, scaling reacts too slowly, shedding buys immediate stability.'),
        ],
      ),
      fullModule(
        'HA & Disaster Recovery Design',
        [
          kw('RTO (Recovery Time Objective)', 'max acceptable downtime before service must be restored'),
          kw('RPO (Recovery Point Objective)', 'max acceptable data loss window, drives replication frequency'),
          kw('Active-active', 'all regions serve live traffic, best RTO/RPO, hardest conflict/consistency problem'),
          kw('Active-passive', 'standby region idles until failover, simpler, slower cutover, cheaper'),
          kw('Multi-region failover', 'DNS/anycast/traffic-manager based redirect, must handle DNS TTL and data sync lag'),
          kw('Split-brain', 'both regions think they\'re primary during partition, needs fencing/quorum to prevent'),
          kw('Chaos engineering', 'inject real failures (region kill, latency, packet loss) to validate DR assumptions'),
          kw('Game days', 'scheduled full failover drills to verify runbooks actually work under pressure'),
          kw('Backup vs replica', "backups protect against corruption/deletion, replicas protect against downtime, not interchangeable"),
          kw('Blast radius containment', "bulkhead regions/cells so a single failure doesn't take down global capacity"),
        ],
        [
          qaPair('How do you actually choose between active-active and active-passive?', 'Compute the cost of idle standby capacity against the business cost of your RTO target, active-active only wins if downtime cost dominates.'),
          qaPair('Why do backups not satisfy your RPO if replication also fails silently?', "Because RPO is about data loss at failure time, and a stale or corrupted backup means your real RPO is however old that last good backup is."),
          qaPair('What causes most real-world DR failures despite passing runbooks?', 'The runbook was never tested under actual failure conditions, so hidden dependencies or stale credentials surface only during a real incident.'),
          qaPair('How do you prevent split-brain in an active-active multi-region setup?', 'Use a quorum-based fencing mechanism so only the partition with majority can accept writes, the minority self-demotes.'),
          qaPair('Why run chaos experiments in production instead of staging?', "Staging never has production's real traffic patterns, data volume, or dependency graph, so it can't validate the assumptions that actually matter."),
        ],
      ),
    ],
  }
}

function defaultData() {
  return {
    subjects: [
      linuxSubject(),
      dockerSubject(),
      kubernetesSubject(),
      helmSubject(),
      terraformSubject(),
      serviceMeshSubject(),
      observabilitySubject(),
      azureSubject(),
      azureSecuritySubject(),
      cicdScmSubject(),
      aiDevOpsToolsSubject(),
      devSecOpsSubject(),
      scriptingSubject(),
      systemDesignSubject(),
      azureSolutionsArchitectSubject(),
      platformEngineeringSubject(),
      sreSubject(),
    ],
  }
}

// Marks each subject with the first module title from its current fully-authored
// content, so load() can detect and replace stale/placeholder module lists saved
// before that subject's content existed.
const SUBJECT_CONTENT_MIGRATIONS = [
  { name: 'Docker', marker: 'Docker Architecture', factory: dockerSubject },
  { name: 'Kubernetes', marker: 'Cluster Architecture', factory: kubernetesSubject },
  { name: 'Helm', marker: 'Helm Architecture', factory: helmSubject },
  { name: 'Terraform & Terragrunt', marker: 'IaC Concepts', factory: terraformSubject },
  { name: 'Service Mesh', marker: 'Service Mesh Architecture', factory: serviceMeshSubject },
  { name: 'Observability', marker: 'Observability Pillars', factory: observabilitySubject },
  { name: 'Azure', marker: 'Load Balancing & Traffic', factory: azureSubject },
  { name: 'Azure Security', marker: 'Identity & Access', factory: azureSecuritySubject },
  { name: 'CI/CD & SCM', marker: 'Source Control Strategies', factory: cicdScmSubject },
  { name: 'AI DevOps Tools', marker: 'Coding Assistants', factory: aiDevOpsToolsSubject },
  { name: 'DevSecOps', marker: 'DevSecOps Principles', factory: devSecOpsSubject },
  { name: 'Scripting', marker: 'Bash Fundamentals', factory: scriptingSubject },
  { name: 'System Design', marker: 'Scalability Fundamentals', factory: systemDesignSubject },
  { name: 'Azure Solutions Architect', marker: 'Design Identity, Governance & Monitoring', factory: azureSolutionsArchitectSubject },
  { name: 'Platform Engineering', marker: 'Internal Developer Platforms', factory: platformEngineeringSubject },
  { name: 'SRE', marker: 'SLI/SLO/SLA Fundamentals', factory: sreSubject },
  { name: 'Linux', marker: 'Linux Architecture', factory: linuxSubject },
]

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

  // Open the first subject by default once data is available and nothing is selected.
  useEffect(() => {
    if (data && !selectedId && data.subjects.length) {
      const first = data.subjects[0]
      setSelectedId(first.id)
      setSidebarExpanded((e) => ({ ...e, [first.id]: true }))
    }
  }, [data, selectedId])

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
    // (or before a subject's content was authored/rewritten) still carry the old
    // placeholder/legacy module list — swap in the current content once per subject.
    for (const mig of SUBJECT_CONTENT_MIGRATIONS) {
      const idx = loaded.subjects.findIndex((s) => s.name === mig.name)
      if (idx !== -1 && !loaded.subjects[idx].modules.some((m) => m.title === mig.marker)) {
        loaded.subjects[idx] = { ...loaded.subjects[idx], modules: mig.factory().modules }
        needsPersist = true
      }
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
    setSidebarExpanded((e) => ({ ...e, [id]: !e[id] }))
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
