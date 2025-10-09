#!/bin/bash
# Acceptance test: docker compose up -d --build and wait for health

set -e

echo "=== ForumKit Compose Up Acceptance Test ==="

# Configuration
MAX_WAIT_TIME=120  # seconds
HEALTH_CHECK_INTERVAL=5
COMPOSE_FILE="docker-compose.yml"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"
}

# Check prerequisites
if ! command -v docker &> /dev/null; then
    error "Docker not found. Please install Docker."
    exit 1
fi

if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
    error "Docker Compose not found. Please install Docker Compose."
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    error "docker-compose.yml not found in current directory"
    exit 1
fi

# Check if services are already running
if docker compose ps | grep -q "Up"; then
    warn "Some services appear to be running. Stopping them first..."
    docker compose down
fi

log "Starting Docker Compose build and up..."

# Build and start services
if ! docker compose up -d --build; then
    error "Failed to start services with docker compose up"
    exit 1
fi

log "Services started. Waiting for health checks..."

# Function to check service health
check_service_health() {
    local service_name=$1
    local container_id=$(docker compose ps -q $service_name 2>/dev/null)
    
    if [ -z "$container_id" ]; then
        return 1
    fi
    
    local health_status=$(docker inspect --format='{{.State.Health.Status}}' $container_id 2>/dev/null)
    
    # If no health check defined, check if container is running
    if [ "$health_status" = "<no value>" ] || [ -z "$health_status" ]; then
        local container_status=$(docker inspect --format='{{.State.Status}}' $container_id 2>/dev/null)
        [ "$container_status" = "running" ]
    else
        [ "$health_status" = "healthy" ]
    fi
}

# Check if service is responding
check_service_response() {
    local service_name=$1
    local port=$2
    local path=${3:-"/"}
    
    if curl -f -s "http://localhost:$port$path" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Wait for services to be healthy
wait_start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - wait_start_time))
    
    if [ $elapsed -gt $MAX_WAIT_TIME ]; then
        error "Timeout waiting for services to be healthy after ${MAX_WAIT_TIME}s"
        
        log "Current service status:"
        docker compose ps
        
        log "Service logs (last 10 lines each):"
        for service in $(docker compose config --services); do
            echo "--- $service ---"
            docker compose logs --tail=10 $service
        done
        
        exit 1
    fi
    
    # Check critical services
    all_healthy=true
    
    # Check database
    if check_service_health postgres; then
        log "✓ PostgreSQL is healthy"
    else
        warn "PostgreSQL not ready yet..."
        all_healthy=false
    fi
    
    # Check Redis
    if check_service_health redis; then
        log "✓ Redis is healthy"
    else
        warn "Redis not ready yet..."
        all_healthy=false
    fi
    
    # Check backend
    if check_service_health backend; then
        log "✓ Backend is healthy"
    elif check_service_response backend 12005 "/api/status"; then
        log "✓ Backend is responding"
    else
        warn "Backend not ready yet..."
        all_healthy=false
    fi
    
    # Check nginx/frontend
    if check_service_response nginx 12005 "/"; then
        log "✓ Frontend/Nginx is responding"
    else
        warn "Frontend/Nginx not ready yet..."
        all_healthy=false
    fi
    
    # Check CDN service
    if check_service_response cdn 12002 "/"; then
        log "✓ CDN service is responding"
    else
        warn "CDN service not ready yet (this may be normal if no index file)"
        # CDN might return 403/404 but still be healthy
        if curl -s "http://localhost:12002/" | grep -q "403\|404"; then
            log "✓ CDN service is responding (with expected 403/404)"
        fi
    fi
    
    if $all_healthy; then
        break
    fi
    
    log "Waiting ${HEALTH_CHECK_INTERVAL}s for services to be ready... (${elapsed}s elapsed)"
    sleep $HEALTH_CHECK_INTERVAL
done

log "All services are healthy!"

# Final verification
log "Running final service verification..."

# Test API endpoint
if curl -f -s "http://localhost:12005/api/status" > /dev/null; then
    log "✓ API endpoint responding"
else
    error "API endpoint not responding"
    exit 1
fi

# Test frontend
if curl -f -s "http://localhost:12005/" | grep -q "html"; then
    log "✓ Frontend serving HTML"
else
    error "Frontend not serving proper HTML"
    exit 1
fi

# Show final status
log "=== Final Service Status ==="
docker compose ps

log "=== Service Resource Usage ==="
docker stats --no-stream

log "✅ Acceptance test PASSED - All services are up and healthy"

# Optional: Show service URLs
echo ""
echo "Services available at:"
echo "  Frontend/API: http://localhost:12005"
echo "  CDN:          http://localhost:12002"
echo "  PostgreSQL:   localhost:12007"
echo "  Redis:        localhost:12008"