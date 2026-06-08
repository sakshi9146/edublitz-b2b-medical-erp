# Kubernetes

Namespace: **`med-erp`**. Run from repo root so paths resolve.

## Apply order

```bash
# 1. Namespace first (required — avoids "namespace not found" on secrets/workloads)
kubectl apply -f k8s/namespace/

kubectl apply -f k8s/configmaps/
# 2. Secrets only after namespace exists — see docs/KUBERNETES_DEPLOYMENT.md
#    kubectl create secret generic app-secrets -n med-erp ...
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/hpa/

# After AWS Load Balancer Controller is installed (EKS):
# IngressClass alb + Ingress — see k8s/ingress/
kubectl apply -f k8s/ingress/
```

## Status

```bash
kubectl get pods,svc,ingress -n med-erp
kubectl get ingressclass
```

## Images

Replace `YOUR_ECR_REGISTRY` in deployments with your ECR URL, e.g.  
`123456789012.dkr.ecr.us-east-1.amazonaws.com`

Details: [docs/KUBERNETES_DEPLOYMENT.md](../docs/KUBERNETES_DEPLOYMENT.md).
