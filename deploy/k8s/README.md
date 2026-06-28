# Hearth on Kubernetes (Phase 2)

Production deployment of the Hearth control plane, plus the GPU-node setup that
the in-cluster `KubernetesProvider` (`HEARTH_PROVIDER=kubernetes`) drives.

## Topology

```
Ingress ──> control-plane (Deployment)  ── serves client + API + WS
                  │  (KubernetesProvider, via the in-cluster API)
                  ▼
          per-workspace Deployments  ── one per machine, PVC-backed home
                  │  (scale 0↔1 = sleep/wake; resources = tier)
                  ▼
          GPU nodes (labeled hearth.io/gpu=<type>, nvidia.com/gpu)
```

## Apply

```bash
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml            # lets the control plane manage workspace Deployments
kubectl apply -f control-plane.yaml   # the Hearth server/client
kubectl apply -f ingress.yaml
```

Set a real workspace image and secrets:

```bash
kubectl -n hearth set env deploy/hearth-control-plane \
  HEARTH_PROVIDER=kubernetes \
  HEARTH_WORKSPACE_IMAGE=<your-registry>/hearth-workspace:latest \
  HEARTH_REQUIRE_AUTH=true
kubectl -n hearth create secret generic hearth-secrets \
  --from-literal=HEARTH_PASSWORD=... \
  --from-literal=HEARTH_JWT_SECRET=... \
  --from-literal=STRIPE_SECRET_KEY=sk_test_...
```

## GPU nodes

Add a GPU node pool, install the NVIDIA device plugin, and label nodes so the
provider can target them:

```bash
kubectl label node <gpu-node> hearth.io/gpu=a10g
```

`gpu-pod-template.yaml` shows the shape of a GPU-attached workspace (what the
provider patches a Deployment into).
