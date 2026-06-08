# Jenkins CI/CD Setup Guide

## Prerequisites

- Jenkins 2 LTS, agents with **JDK 17**, **Maven**, **Docker**, **AWS CLI v2**, **kubectl** (backend); **Node + npm + AWS CLI** (frontend); **Terraform** (infra).
- Plugins: **Pipeline**, **Git**, **AWS Credentials**, **JUnit**.

---

## 1. Add credentials in Jenkins (one place)

**Manage Jenkins → Credentials → System → Global credentials (or a folder) → Add Credentials.**

Use these **exact credential IDs** so the Jenkinsfiles resolve them without extra variables:

| Credential ID | Kind | What to enter |
|---------------|------|----------------|
| **`aws-credentials`** | **AWS Credentials** (Access key + secret) | IAM user/role for ECR, S3, CloudFront, Terraform |
| **`docker-registry`** | **Username with password** | Docker Hub user + [access token](https://hub.docker.com/settings/security) (or service account for your private registry). Used before `docker build` so base images can pull under auth/rate limits. |
| **`kubeconfig`** | **Secret file** | Valid `kubeconfig` YAML for the EKS cluster (same context you use locally for deploy). |

**Frontend only:** no extra credential type. Optionally set **`CLOUDFRONT_DISTRIBUTION_ID`** under **Manage Jenkins → System → Global properties → Environment variables** (plain string); if unset, the pipeline skips invalidation.

---

## 2. Optional global / job environment

**Manage Jenkins → System → Global properties → Environment variables** (or per-job “Environment”):

| Name | Example | Used by |
|------|---------|---------|
| `DOMAIN_NAME` | `yourdomain.com` | Frontend `VITE_*` API host |
| `S3_BUCKET_NAME` | `med-erp-frontend-prod` | Frontend deploy |
| `AWS_REGION` | `us-east-1` | AWS CLI default region |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E123…` | CloudFront invalidation (frontend `main` only) |

The pipelines do **not** read `AWS_ACCOUNT_ID` or `EKS_CLUSTER` from env: the backend derives the ECR registry with `aws sts get-caller-identity` and uses your uploaded **`kubeconfig`**.

---

## 3. Create multibranch / pipeline jobs (from SCM)

| Job | Script path |
|-----|----------------|
| Backend | `jenkins/Jenkinsfile.backend` |
| Frontend | `jenkins/Jenkinsfile.frontend` |
| Infrastructure | `jenkins/Jenkinsfile.infra` |

Infra job: parameters `ENVIRONMENT` (`dev` / `prod`) and `ACTION` (`plan` / `apply`).

---

## 4. What each pipeline does

- **Backend:** `mvn clean verify` × 3 services; on **`main`:** `docker login` (registry cred) → ECR login (AWS) → build/push → `kubectl set image` + rollout.
- **Frontend:** `npm ci` / lint / build; on **`main`:** `aws s3 sync` + optional CloudFront invalidation.
- **Infra:** `terraform init` / validate / plan; **Apply** after manual **Approve**.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Unknown credential ID | IDs must be exactly `aws-credentials`, `docker-registry`, `kubeconfig`. |
| `docker login` fails | Rotate Docker Hub token; user must match **docker-registry** credential. |
| ECR push denied | IAM from **aws-credentials** needs ECR push rights on `med-erp/*` repos. |
| `kubectl` fails | Refresh **kubeconfig** file credential; context must reach the cluster. |

---

## RBAC

Bind a **least-privilege** `Role` to the Jenkins deploy identity; avoid `cluster-admin` in production.
