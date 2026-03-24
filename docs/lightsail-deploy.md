# Lightsail deployment for `/dasarang-class`

This app is not a static-only site. Production requires the Node/Express server in [server.ts](/C:/dev/gemini_class_room/server.ts), because the Google Sheets sync APIs must stay live.

Current target host:
- Server: `15.164.105.38`
- OS: Ubuntu 22.04
- Existing services to preserve: `dasarang-center`, `pulsebot`, `pulsebot-ui`
- Public entry for this app: `http://15.164.105.38/dasarang-class`

Data stores stay unchanged:
- Source of truth: Firebase Firestore
- Student mirror for Gemini analysis: Google Sheets

## 1. Prepare the server

Install Node 22 system-wide and keep Nginx/systemd:

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

After the upgrade, immediately verify:

```bash
sudo systemctl restart dasarang-center
sudo systemctl status dasarang-center --no-pager
```

## 2. Deploy the app files

```bash
sudo mkdir -p /opt/gemini-class-room
sudo chown -R ubuntu:ubuntu /opt/gemini-class-room
git clone https://github.com/Ssong0515/gemini_class_room.git /opt/gemini-class-room/current
cd /opt/gemini-class-room/current
npm ci
```

For updates:

```bash
cd /opt/gemini-class-room/current
git pull origin main
npm ci
```

## 3. Create the production `.env`

Copy the template and fill the required values:

```bash
cd /opt/gemini-class-room/current
cp .env.example .env
chmod 600 .env
```

Required values:
- `GEMINI_API_KEY`
- `APP_URL=http://15.164.105.38/dasarang-class`
- `APP_BASE_PATH=/dasarang-class`
- `PORT=3100`
- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

## 4. Build and test the app directly

```bash
cd /opt/gemini-class-room/current
npm run build
npm run start
```

In another shell:

```bash
curl http://127.0.0.1:3100/dasarang-class/api/health
```

Expected response:

```json
{"status":"ok"}
```

Stop the foreground process after the health check.

## 5. Register the systemd service

Use [deploy/systemd/gemini-class-room.service](/C:/dev/gemini_class_room/deploy/systemd/gemini-class-room.service):

```bash
cd /opt/gemini-class-room/current
sudo cp deploy/systemd/gemini-class-room.service /etc/systemd/system/gemini-class-room.service
sudo systemctl daemon-reload
sudo systemctl enable gemini-class-room
sudo systemctl restart gemini-class-room
sudo systemctl status gemini-class-room --no-pager
```

Log check:

```bash
journalctl -u gemini-class-room -n 100 --no-pager
```

## 6. Add the Nginx route under `dasarang-center`

Do not replace the whole `dasarang-center` server block. Only add the location snippet from [deploy/nginx/gemini-class-room.conf](/C:/dev/gemini_class_room/deploy/nginx/gemini-class-room.conf) inside the existing `server {}` block for `dasarang-center`.

Back up the current site config first:

```bash
sudo cp /etc/nginx/sites-available/dasarang-center /etc/nginx/sites-available/dasarang-center.bak
```

Then edit `/etc/nginx/sites-available/dasarang-center` and paste the snippet near the other `location` blocks.

After that:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Verify the final route

Check:

```bash
curl -I http://15.164.105.38/dasarang-class
curl http://15.164.105.38/dasarang-class/api/health
```

Then verify in the browser:
- `http://15.164.105.38/dasarang-class` loads
- direct refresh works
- admin login works
- student updates still write to Firestore
- Google Sheets sync still succeeds

## 8. Post-deploy checks

Confirm these are still healthy:

```bash
sudo systemctl status dasarang-center --no-pager
sudo systemctl status pulsebot-ui --no-pager
sudo systemctl status pulsebot --no-pager
sudo systemctl status gemini-class-room --no-pager
```

Also confirm the active listeners:

```bash
sudo ss -ltnp
```

Expected shape:
- `dasarang-center` still on `*:3000` via Nginx
- `pulsebot-ui` still on its existing port
- `gemini-class-room` on `*:3100`
