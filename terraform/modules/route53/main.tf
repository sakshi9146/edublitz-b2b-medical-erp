################################################################################
# Route53 Module — DNS records for frontend (CloudFront) and API (ALB)
################################################################################

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

# Frontend (CloudFront)
resource "aws_route53_record" "frontend" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.frontend_subdomain
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = "Z2FDTNDATAQYW2"  # CloudFront hosted zone ID (fixed)
    evaluate_target_health = false
  }
}

# API (ALB Ingress)
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.api_subdomain
  type    = "CNAME"
  ttl     = 300
  records = [var.alb_dns_name]
}
