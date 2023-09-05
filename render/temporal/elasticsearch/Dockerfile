# The official Elasticsearch Docker image
FROM docker.elastic.co/elasticsearch/elasticsearch:7.16.2

# Copy our config file over
COPY --chown=1000:0 render/temporal/elasticsearch/elasticsearch.yml /usr/share/elasticsearch/config/elasticsearch.yml

# Allow Elasticsearch to create `elasticsearch.keystore`
# to circumvent https://github.com/elastic/ansible-elasticsearch/issues/430
RUN chmod g+ws /usr/share/elasticsearch/config

USER 1000:0
