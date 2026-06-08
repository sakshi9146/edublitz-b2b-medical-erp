# Terraform

AWS modules: VPC, EKS, ECR, S3 + CloudFront, Route53.

## Layout

```
terraform/
├── modules/
│   ├── vpc/
│   ├── eks/
│   ├── ecr/
│   ├── s3-cloudfront/
│   └── route53/
└── env/
    ├── dev/
    └── prod/
```

## Remote state (once per account/region)

```bash
aws s3 mb s3://med-erp-terraform-state-dev --region us-east-1
aws s3api put-bucket-versioning --bucket med-erp-terraform-state-dev --versioning-configuration Status=Enabled
aws dynamodb create-table \
  --table-name med-erp-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

## Deploy dev

```bash
cd terraform/env/dev
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — file is gitignored; never commit secrets
terraform init
terraform plan -out=tfplan && terraform apply tfplan
```

## kubectl

```bash
aws eks update-kubeconfig --region us-east-1 --name <cluster-from-output>
kubectl get nodes
```

More: [docs/TERRAFORM_DEPLOYMENT.md](../docs/TERRAFORM_DEPLOYMENT.md).
