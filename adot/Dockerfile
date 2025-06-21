FROM --platform=arm64 public.ecr.aws/aws-observability/aws-otel-collector:v0.40.0
COPY ./otel-config.yaml /etc/otel-config.yaml

EXPOSE 4317 4318
CMD ["--config=/etc/otel-config.yaml"]