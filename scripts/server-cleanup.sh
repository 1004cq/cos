#!/usr/bin/env bash
# 生产机磁盘清理（部署后定期执行，避免 Docker 构建占满盘）
set -euo pipefail

echo "== 清理前 =="
df -h /
docker system df 2>/dev/null || true

echo "== Docker 构建缓存与悬空镜像 =="
docker builder prune -af 2>/dev/null || true
docker image prune -af 2>/dev/null || true
docker container prune -f 2>/dev/null || true

echo "== 系统包缓存 =="
sudo apt-get clean 2>/dev/null || true
sudo journalctl --vacuum-time=7d 2>/dev/null || true

echo "== 清理后 =="
df -h /
docker system df 2>/dev/null || true

echo "完成。"
