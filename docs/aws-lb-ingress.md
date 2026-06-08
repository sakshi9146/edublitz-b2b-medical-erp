# AWS Load Balancer Controller Installation on EKS

## Cluster Details

| Parameter      | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Cluster Name   | medpharm-cluster                                                          |
| Region         | ap-southeast-2                                                            |
| AWS Account ID | 344807217216                                                              |
| IAM Role       | AmazonEKSLoadBalancerControllerRole1                                      |
| OIDC Provider  | oidc.eks.ap-southeast-2.amazonaws.com/id/238D7150432AC9BA9325B113C10F5FE2 |

---

# Step 1 — Configure kubectl Access

Run:

```bash
aws eks update-kubeconfig \
  --region ap-southeast-2 \
  --name medpharm-cluster
```

Verify cluster access:

```bash
kubectl get nodes
```

Expected:

* Worker nodes should be visible.

---

# Step 2 — Install Required Tools

Install:

* AWS CLI
* kubectl
* Helm

Verify:

```bash
kubectl version --client
helm version
aws --version
```

---

# Step 3 — Create IAM OIDC Provider

## AWS Console Steps

1. Open EKS Console
2. Select Cluster: `medpharm-cluster`
3. Open `Overview`
4. Copy OIDC issuer URL

OIDC URL:

```text
https://oidc.eks.ap-southeast-2.amazonaws.com/id/AE50ABFA426F6BE267BC7073E88F78F9
```

## Create Identity Provider

1. Open IAM Console
2. Go to `Identity Providers`
3. Click `Add Provider`

Configuration:

| Setting       | Value                                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| Provider Type | OpenID Connect                                                                    |
| Provider URL  | https://oidc.eks.ap-southeast-2.amazonaws.com/id/AE50ABFA426F6BE267BC7073E88F78F9 |
| Audience      | sts.amazonaws.com                                                                 |

Click `Create Provider`.

---

# Step 4 — Download IAM Policy

Run:

```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.14.1/docs/install/iam_policy.json
```

---

# Step 5 — Create IAM Policy

Run:

```bash
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

---

# Step 6 — Create IAM Role

## AWS Console Steps

1. Open IAM Console
2. Go to `Roles`
3. Click `Create Role`

### Trusted Entity

| Setting             | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Trusted Entity Type | Web Identity                                                              |
| Identity Provider   | oidc.eks.ap-southeast-2.amazonaws.com/id/238D7150432AC9BA9325B113C10F5FE2 |
| Audience            | sts.amazonaws.com                                                         |

### Attach Permission Policy

Select:

```text
AWSLoadBalancerControllerIAMPolicy
ElasticLoadBalancingFullAccess
AmazonEKSLoadBalancingPolicy
```

### Role Name

```text
AmazonEKSLoadBalancerControllerRole1
```

Click `Create Role`.

---

# Step 7 — Update Trust Relationship

Open role:

```text
AmazonEKSLoadBalancerControllerRole1
```

Go to:

* Trust Relationships
* Edit Trust Policy

Replace policy with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::344807217216:oidc-provider/oidc.eks.ap-southeast-2.amazonaws.com/id/238D7150432AC9BA9325B113C10F5FE2"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.ap-southeast-2.amazonaws.com/id/238D7150432AC9BA9325B113C10F5FE2:aud": "sts.amazonaws.com",
          "oidc.eks.ap-southeast-2.amazonaws.com/id/238D7150432AC9BA9325B113C10F5FE2:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }
  ]
}
```

Click `Update Policy`.

---

# Step 8 — Create Kubernetes Service Account

Create file:

```text
aws-load-balancer-controller-service-account.yaml
```

Content:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: aws-load-balancer-controller
  namespace: kube-system
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::344807217216:role/AmazonEKSLoadBalancerControllerRole1
```

Apply:

```bash
kubectl apply -f aws-load-balancer-controller-service-account.yaml
```

Verify:

```bash
kubectl get sa -n kube-system
```

Expected:

* `aws-load-balancer-controller` service account should exist.

---

# Step 9 — Get VPC ID

Run:

```bash
aws eks describe-cluster \
  --name medpharm-cluster \
  --region ap-southeast-2 \
  --query "cluster.resourcesVpcConfig.vpcId" \
  --output text
```

Example Output:

```text
vpc-0cdd2742dbe9d8c20
```

Copy the VPC ID.

---

# Step 10 — Install Helm Repository

Add Helm repo:

```bash
helm repo add eks https://aws.github.io/eks-charts
```

Update Helm repo:

```bash
helm repo update
```

---

# Step 11 — Install AWS Load Balancer Controller

Replace `<VPC_ID>` with actual VPC ID.

Run:

```bash
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=medpharm-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-southeast-2 \
  --set vpcId=<VPC_ID>
```

Example:

```bash
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=medpharm-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-southeast-2 \
  --set vpcId=vpc-0abc123456789
```

---

# Step 12 — Verify Installation

Check deployment:

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
```

Expected:

```text
2/2 READY
```

Check pods:

```bash
kubectl get pods -n kube-system
```

Expected:

* aws-load-balancer-controller pods should be running.

---

# Step 13 — Tag Subnets

## Public Subnets

Add tag:

| Key                    | Value |
| ---------------------- | ----- |
| kubernetes.io/role/elb | 1     |

## Private Subnets

Add tag:

| Key                             | Value |
| ------------------------------- | ----- |
| kubernetes.io/role/internal-elb | 1     |

## Cluster Tag (All Subnets)

| Key                                    | Value  |
| -------------------------------------- | ------ |
| kubernetes.io/cluster/medpharm-cluster | shared |

## AWS Console Steps

1. Open VPC Console
2. Go to `Subnets`
3. Select subnet
4. Open `Tags`
5. Click `Manage Tags`
6. Add required tags

Important:

* Without subnet tags, ALB creation fails.

---

# Step 14 — Deploy Test Application

Create deployment:

```bash
kubectl create deployment demo --image=nginx
```

Expose service:

```bash
kubectl expose deployment demo --port=80 --type=NodePort
```

---

# Step 15 — Create Ingress

Create file:

```text
ingress.yaml
```

Content:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: demo
            port:
              number: 80
```

Apply ingress:

```bash
kubectl apply -f ingress.yaml
```

---

# Step 16 — Verify ALB Creation

Check ingress:

```bash
kubectl get ingress
```

Expected:

* ALB DNS should appear after a few minutes.

Also verify in AWS Console:

* EC2
* Load Balancers

You should see:

* Application Load Balancer
* Target Group
* Listener Rules

---

# Troubleshooting

## Check Controller Logs

```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

## Describe Ingress

```bash
kubectl describe ingress demo-ingress
```

## Common Failure Causes

| Issue                     | Cause                            |
| ------------------------- | -------------------------------- |
| ALB not created           | Missing subnet tags              |
| AccessDenied              | Wrong IAM trust relationship     |
| Controller CrashLoop      | Wrong service account annotation |
| No targets healthy        | Security group issue             |
| Helm install fails        | Service account missing          |
| Target registration fails | Worker node SG issue             |

---

# Production Recommendations

* Use ACM certificates for HTTPS
* Attach WAF to public ALBs
* Use internal ALB for private APIs
* Restrict security groups aggressively
* Use separate ingress for internal and public traffic
* Enable access logs
* Use external-dns for Route53 automation

---

# Useful Commands

## List Ingress

```bash
kubectl get ingress
```

## List Services

```bash
kubectl get svc
```

## List Pods

```bash
kubectl get pods -A
```

## Restart Controller

```bash
kubectl rollout restart deployment aws-load-balancer-controller -n kube-system
```

## Delete Test Resources

```bash
kubectl delete ingress demo-ingress
kubectl delete svc demo
kubectl delete deployment demo
```
