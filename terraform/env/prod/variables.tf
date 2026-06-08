variable "aws_region"          { type = string; default = "us-east-1" }
variable "domain_name"         { type = string }
variable "acm_certificate_arn" { type = string }
variable "alb_dns_name"        { type = string; default = "" }
