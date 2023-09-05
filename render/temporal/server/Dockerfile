FROM temporalio/server:1.14.3

COPY render/temporal/server/dynamicconfig.yaml /etc/temporal/dynamicconfig.yaml
COPY render/temporal/server/config_template.yaml /etc/temporal/config/config_template.yaml
COPY render/temporal/server/.bashrc /home/temporal/.bashrc

ENTRYPOINT ["bash", "-c", "PUBLIC_FRONTEND_ADDRESS=$TEMPORAL_FRONTEND_HOST:7233 /etc/temporal/entrypoint.sh"]
