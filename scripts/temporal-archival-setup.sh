#!/bin/bash

# Script to manage Temporal archival setup

set -e

echo "=== Temporal Archival Setup Script ==="

# Check if temporal CLI is available
check_temporal_cli() {
    if ! command -v tctl &> /dev/null; then
        echo "tctl command not found. Please install Temporal CLI tools."
        echo "You can run this inside the admin-cli container:"
        echo "docker-compose exec admin-cli bash"
        exit 1
    fi
}

# Create or update namespace with archival
setup_namespace_archival() {
    local namespace=${1:-default}
    
    echo "Setting up archival for namespace: $namespace"
    
    # Check if namespace exists
    if tctl --namespace $namespace namespace describe &> /dev/null; then
        echo "Namespace $namespace exists, updating archival settings..."
        tctl --namespace $namespace namespace update \
            --history-archival-state enabled \
            --history-archival-uri "s3://temporal-archival/history" \
            --visibility-archival-state enabled \
            --visibility-archival-uri "s3://temporal-archival/visibility"
    else
        echo "Creating namespace $namespace with archival enabled..."
        tctl --namespace $namespace namespace register \
            --history-archival-state enabled \
            --history-archival-uri "s3://temporal-archival/history" \
            --visibility-archival-state enabled \
            --visibility-archival-uri "s3://temporal-archival/visibility"
    fi
    
    echo "Archival setup complete for namespace: $namespace"
}

# Verify archival configuration
verify_archival() {
    local namespace=${1:-default}
    
    echo "Verifying archival configuration for namespace: $namespace"
    tctl --namespace $namespace namespace describe | grep -i archival
}

# List archived workflows
list_archived_workflows() {
    local namespace=${1:-default}
    
    echo "Listing archived workflows in namespace: $namespace"
    tctl --namespace $namespace workflow list --archived
}

# Check MinIO bucket
check_minio_bucket() {
    echo "Checking MinIO bucket for archived data..."
    
    # You can access MinIO console at http://localhost:9011
    # Username: admin
    # Password: password
    
    docker exec -it $(docker ps -qf "name=blob-storage") sh -c "ls -la /data/temporal-archival/" 2>/dev/null || echo "No archived data yet"
}

# Main menu
show_menu() {
    echo ""
    echo "Choose an option:"
    echo "1) Setup archival for default namespace"
    echo "2) Setup archival for custom namespace"
    echo "3) Verify archival configuration"
    echo "4) List archived workflows"
    echo "5) Check MinIO bucket"
    echo "6) Exit"
    read -p "Enter choice [1-6]: " choice
    
    case $choice in
        1)
            setup_namespace_archival default
            ;;
        2)
            read -p "Enter namespace name: " ns
            setup_namespace_archival $ns
            ;;
        3)
            read -p "Enter namespace name (default: default): " ns
            verify_archival ${ns:-default}
            ;;
        4)
            read -p "Enter namespace name (default: default): " ns
            list_archived_workflows ${ns:-default}
            ;;
        5)
            check_minio_bucket
            ;;
        6)
            exit 0
            ;;
        *)
            echo "Invalid choice"
            ;;
    esac
}

# Run in Docker if not already
if [ -z "$IN_DOCKER" ]; then
    echo "This script should be run inside the admin-cli container."
    echo "Run: docker-compose run --rm admin-cli bash /dittofeed/scripts/temporal-archival-setup.sh"
    echo ""
    echo "Or you can access MinIO console directly at:"
    echo "URL: http://localhost:9011"
    echo "Username: admin"
    echo "Password: password"
    exit 0
fi

# Main loop
while true; do
    show_menu
done
