# Deploy Soosky UV Sun Tanning API to an Ubuntu VPS

This guide deploys the API with Docker Compose, Nginx, and HTTPS. The container is bound to `127.0.0.1:3003`, so only Nginx is reachable from the Internet.

## Prerequisites

- Ubuntu VPS with Docker Engine and Docker Compose plugin installed. Follow the current [official Docker Engine installation guide](https://docs.docker.com/engine/install/ubuntu/) if Docker is not available.
- A domain or subdomain pointing to the VPS public IP, for example `uv-api.example.com`.
- Port `80` and `443` open in the VPS firewall/security group.
- API keys for OpenWeatherMap One Call 4.0 and Gemini. A reachable MongoDB URI is optional for health status, but recommended.

## 1. Prepare the server

Connect to the server and install Nginx, Certbot, and Git:

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Confirm Docker Compose is available:

```bash
docker compose version
```

## 2. Upload the project

Choose a deployment directory and clone the repository:

```bash
sudo mkdir -p /opt/soosky/soosky-uv-sun-tanning
sudo chown -R "$USER":"$USER" /opt/soosky
git clone <YOUR_REPOSITORY_URL> /opt/soosky/soosky-uv-sun-tanning
cd /opt/soosky/soosky-uv-sun-tanning
```

If the source repository is private, use a deploy key or upload the project with `rsync` instead of putting a personal access token in the clone URL.

## 3. Configure secrets

Create the production environment file. Do not commit this file.

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Set at least the following values:

```dotenv
HOST_PORT=3003
MEM_LIMIT=400m
NODE_MAX_OLD_SPACE_MB=320
HTTP_TRUST_PROXY=1

MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/soosky_uv_sun_tanning?retryWrites=true&w=majority
OPENWEATHERMAP_API_KEY=replace_with_openweathermap_one_call_key
GEMINI_API_KEY=replace_with_gemini_key
GEMINI_MODEL=gemini-3.1-flash-lite
MAX_IMAGE_MB=8
```

Notes:

- For a 512 MB VPS, use `MEM_LIMIT=320m` and `NODE_MAX_OLD_SPACE_MB=192`.
- `HOST_PORT=3003` is only a local VPS port. Do not open it in the firewall.
- If MongoDB Atlas is used, allow the VPS public IP in Atlas Network Access.
- Special characters in MongoDB username/password must be URL encoded.

## 4. Build and start the API

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api
curl -i http://127.0.0.1:3003/health
```

The health request must return HTTP `200` before configuring Nginx.

## 5. Configure Nginx reverse proxy

Create `/etc/nginx/sites-available/soosky-uv-sun-tanning`:

```bash
sudo nano /etc/nginx/sites-available/soosky-uv-sun-tanning
```

Paste this configuration and replace `uv-api.example.com` with the real domain:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name uv-api.example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Enable it and verify the Nginx configuration:

```bash
sudo ln -s /etc/nginx/sites-available/soosky-uv-sun-tanning /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
curl -i http://uv-api.example.com/health
```

If the server hosts multiple APIs, each API must use a different Nginx `server_name` and local `HOST_PORT`.

## 6. Enable HTTPS

After DNS resolves to the VPS, request a Let's Encrypt certificate:

```bash
sudo certbot --nginx -d uv-api.example.com
sudo certbot renew --dry-run
```

Certbot updates the Nginx site to redirect HTTP to HTTPS. Verify the public API:

```bash
curl -i https://uv-api.example.com/health
curl -i 'https://uv-api.example.com/api/v1/uv-index?lat=10.7769&lon=106.7009'
```

## Update deployment

Run these commands from `/opt/soosky/soosky-uv-sun-tanning`:

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api
curl -i https://uv-api.example.com/health
```

To view live logs:

```bash
docker compose logs -f api
```

## Rollback

Find a known-good commit, deploy it, then rebuild:

```bash
git log --oneline -10
git checkout <KNOWN_GOOD_COMMIT>
docker compose up -d --build
curl -i http://127.0.0.1:3003/health
```

After rollback, create a branch before making further changes:

```bash
git switch -c rollback/<date>
```

## Operational checks

```bash
# API container state and health
docker compose ps

# Container resource usage
docker stats soosky-uv-sun-tanning

# Local port must listen only on loopback
sudo ss -ltnp | grep :3003

# Nginx errors
sudo tail -n 100 /var/log/nginx/error.log

# Disk availability
df -h
```

Never expose `.env`, `GEMINI_API_KEY`, `OPENWEATHERMAP_API_KEY`, or `MONGO_URI` in Postman collections, logs, source control, or Nginx configuration.
