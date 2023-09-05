FROM temporalio/auto-setup:1.14.3

COPY render/temporal/server/dynamicconfig.yaml /etc/temporal/dynamicconfig.yaml
COPY render/temporal/server/config_template.yaml /etc/temporal/config/config_template.yaml
COPY render/temporal/server/auto-setup/auto-setup-override.sh /etc/temporal/auto-setup.sh
COPY render/temporal/server/.bashrc /home/temporal/.bashrc
# FIXME delete
USER root
RUN apk update && apk add netcat-openbsd
EXPOSE 8000
CMD ["nc", "-l", "-p", "8000"]
ENTRYPOINT ["nc", "-l", "-p", "8000"]

# FIXME uncomment
# CMD ["autosetup"]
# ENTRYPOINT ["bash", "-c", "PUBLIC_FRONTEND_ADDRESS=$TEMPORAL_FRONTEND_HOST:7233 /etc/temporal/entrypoint.sh"]