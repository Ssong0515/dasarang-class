# Lightsail deployment for `/dasarang-class`

This app is not a static-only site. Production requires the Node/Express server in `server.ts`, because the Google Sheets sync APIs and Gemini translation API must stay live.

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
sudo mkdir -p /opt/dasarang-class
sudo chown -R ubuntu:ubuntu /opt/dasarang-class
git clone https://github.com/Ssong0515/dasarang-class.git /opt/dasarang-class/current
cd /opt/dasarang-class/current
npm ci
```

For updates:

```bash
cd /opt/dasarang-class/current
git pull origin main
npm ci
```

## 3. Create the production `.env`

Copy the template and fill the required values:

```bash
cd /opt/dasarang-class/current
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
cd /opt/dasarang-class/current
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

Use `deploy/systemd/dasarang-class.service`:

```bash
cd /opt/dasarang-class/current
sudo cp deploy/systemd/dasarang-class.service /etc/systemd/system/dasarang-class.service
sudo systemctl daemon-reload
sudo systemctl enable dasarang-class
sudo systemctl restart dasarang-class
sudo systemctl status dasarang-class --no-pager
```

Log check:

```bash
journalctl -u dasarang-class -n 100 --no-pager
```

## 6. Add the Nginx route under `dasarang-center`

Do not replace the whole `dasarang-center` server block. Only add the location snippet from `deploy/nginx/dasarang-class.conf` inside the existing `server {}` block for `dasarang-center`.

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
- Gemini translation works
- student updates still write to Firestore
- Google Sheets sync still succeeds

## 8. Post-deploy checks

Confirm these are still healthy:

```bash
sudo systemctl status dasarang-center --no-pager
sudo systemctl status pulsebot-ui --no-pager
sudo systemctl status pulsebot --no-pager
sudo systemctl status dasarang-class --no-pager
```

Also confirm the active listeners:

```bash
sudo ss -ltnp
```

Expected shape:
- `dasarang-center` still on `*:3000` via Nginx
- `pulsebot-ui` still on its existing port
- `dasarang-class` on `*:3100`

## 9. GitHub Actions auto deploy

Set this repository configuration before relying on push-based deploys:

- Secret: `LIGHTSAIL_SSH_KEY`
- Variables:
  - `LIGHTSAIL_HOST=15.164.105.38`
  - `LIGHTSAIL_USER=ubuntu`
  - `DEPLOY_PATH=/opt/dasarang-class/current`
  - `SYSTEMD_SERVICE=dasarang-class`

The workflow in `.github/workflows/deploy-lightsail.yml` will:

1. Build and type-check on GitHub Actions
2. SSH into Lightsail
3. Reset the deployed checkout to `origin/main`
4. Run `npm ci` and `npm run build`
5. Restart `dasarang-class`
6. Verify `http://127.0.0.1:3100/dasarang-class/api/health`
