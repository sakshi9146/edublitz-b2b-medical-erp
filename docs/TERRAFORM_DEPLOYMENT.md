# Terraform Infrastructure Deployment Guide

Provision all AWS infrastructure using modular Terraform.

---

## Prerequisites

| Tool        | Version  | Install                              |
|-------------|----------|--------------------------------------|
| Terraform   | >= 1.5.0 | [terraform.io/downloads](https://developer.hashicorp.com/terraform/downloads) |
| AWS CLI     | >= 2.x   | `brew install awscli`                |

### Required AWS Permissions
The IAM user/role running Terraform needs:
- EKS full access
- EC2 (VPC, subnets, security groups)
- ECR full access
- S3 full access
- CloudFront full access
- Route53 full access
- IAM (for EKS roles)

---

## Step 1 — Bootstrap Remote State (One-time)

```bash
AWS_REGION="us-east-1"
ENV="dev"   # or "prod"

# Create S3 bucket for Terraform state
aws s3 mb s3://med-erp-terraform-state-${ENV} --region $AWS_REGION

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket med-erp-terraform-state-${ENV} \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket med-erp-terraform-state-${ENV} \
  --server-side-encryption-configuration '{
    "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]
  }'

# DynamoDB table for state locking
aws dynamodb create-table \
  --table-name med-erp-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $AWS_REGION
```

---

## Step 2 — Configure Variables

```bash
cd terraform/env/dev

# Copy the example file
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars:
# aws_region          = "us-east-1"
# domain_name         = "yourdomain.com"
# acm_certificate_arn = "arn:aws:acm:us-east-1:..."   # Must be in us-east-1 for CloudFront
# developer_ip_cidr   = "YOUR_PUBLIC_IP/32"
# alb_dns_name        = ""    # Leave empty first time
```

**Get ACM Certificate:**
```bash
# Request a certificate (DNS validation)
aws acm request-certificate \
  --domain-name "*.med-erp.yourdomain.com" \
  --validation-method DNS \
  --region us-east-1

# Complete DNS validation in Route53, then copy the ARN
```

---

## Step 3 — Initialize

```bash
terraform init
```

Expected output:
```
Initializing the backend...
Successfully configured the backend "s3"!
Initializing provider plugins...
Terraform has been successfully initialized!
```

---

## Step 4 — Plan

```bash
terraform plan -var-file=terraform.tfvars -out=tfplan
```

Review the plan carefully. Confirm:
- VPC with 3 public + 3 private subnets
- EKS cluster with managed node group
- ECR repositories (user-service, product-service, order-service)
- S3 bucket + CloudFront distribution
- Route53 records

---

## Step 5 — Apply

```bash
terraform apply tfplan
```

This takes **15–25 minutes** (EKS cluster creation is the bottleneck).

---

## Step 6 — Configure kubectl

```bash
aws eks update-kubeconfig \
  --region us-east-1 \
  --name med-erp-dev-eks

kubectl get nodes
```

---

## Step 7 — Update ALB DNS Name

After deploying Kubernetes Ingress (see KUBERNETES_DEPLOYMENT.md):
```bash
# Get ALB DNS name
kubectl get ingress -n med-erp

# Update terraform.tfvars
# alb_dns_name = "k8s-mederp-xxxxxxxx.us-east-1.elb.amazonaws.com"

# Re-apply to create Route53 CNAME
terraform apply -var-file=terraform.tfvars
```

---

## Module Outputs

```bash
terraform output
# Shows:
# vpc_id, cluster_name, ecr_urls, cloudfront_domain, etc.
```

---

## Destroy (Cleanup)

```bash
# DANGER: This removes all AWS resources
terraform destroy -var-file=terraform.tfvars

# First, delete Kubernetes resources to release ALB
kubectl delete -f k8s/ingress/
kubectl delete -f k8s/  # other resources
```

---

## State Management

```bash
# List resources
terraform state list

# Show a specific resource
terraform state show module.eks.aws_eks_cluster.main

# Import existing resource
terraform import module.vpc.aws_vpc.main vpc-xxxxxxxxxx

# Remove resource from state (no destroy)
terraform state rm module.ecr.aws_ecr_repository.services["user-service"]
```

---

## Prod Deployment

```bash
cd terraform/env/prod
cp terraform.tfvars.example terraform.tfvars
# Edit for production values

terraform init
terraform plan -var-file=terraform.tfvars -out=tfplan
# ← Manual review required before apply
terraform apply tfplan
```
