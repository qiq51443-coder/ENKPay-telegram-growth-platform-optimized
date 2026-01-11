#!/bin/bash

# Database Backup Script

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "=== Database Backup ==="
echo "Creating backup: $BACKUP_FILE"

# Create backup
docker-compose exec -T postgres pg_dump -U telegram telegram_growth > $BACKUP_FILE

if [ $? -eq 0 ]; then
    # Compress backup
    gzip $BACKUP_FILE
    echo "✓ Backup created successfully: ${BACKUP_FILE}.gz"
    
    # Keep only last 7 days of backups
    find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
    echo "✓ Old backups cleaned up"
else
    echo "✗ Backup failed"
    exit 1
fi
