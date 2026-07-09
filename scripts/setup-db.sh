#!/bin/bash
# إنشاء قواعد بيانات PostgreSQL للتطوير والاختبار
set -e
sudo -u postgres psql -c "CREATE USER ykms WITH PASSWORD 'ykms' CREATEDB;" || true
sudo -u postgres psql -c "CREATE DATABASE ykms OWNER ykms;" || true
sudo -u postgres psql -c "CREATE DATABASE ykms_test OWNER ykms;" || true
echo "Databases ready: ykms, ykms_test"
