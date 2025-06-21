FROM --platform=arm64 public.ecr.aws/aws-observability/aws-otel-collector:v0.40.0
COPY ./otel-config.yaml /etc/otel-config.yaml
CMD ["--config=/etc/otel-config.yaml"]