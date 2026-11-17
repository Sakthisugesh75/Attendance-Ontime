# Deploy to AWS (Lightsail)

One small AWS Lightsail server in Mumbai runs everything: MySQL, the app, and Caddy for https
(free certificate, renewed automatically). About **US$12 a month** for the 2 GB plan, plus about
US$1 a month for automatic snapshots. Allow about an hour the first time.

**Before you start**

- Change the `admin` password in the current app (account menu → Change password). The server
  is on the internet; a default password is the easiest way in.
- A domain or subdomain for staff to open, for example `attendance.yourcompany.com`, and access
  to its DNS settings. No domain yet? Step 4 has a temporary option.
- Do the move in an evening. From the moment you export the data until staff use the new
  address, don't enter anything in the old app; it would not be copied across.

---

## 1. Create the server

1. Sign in at <https://lightsail.aws.amazon.com> → **Create instance**.
2. Region: **Mumbai (ap-south-1)**.
3. Platform **Linux/Unix** → **OS Only** → **Ubuntu 24.04 LTS**.
4. Plan: **2 GB RAM** (the app's build needs it; 1 GB is too small).
5. Name it `attendance` → **Create instance**.

## 2. Give it a fixed address

**Networking** tab → **Create static IP** → attach it to `attendance`. Note the IP, e.g. `13.233.10.20`.

## 3. Open https

Instance → **Networking** → **IPv4 Firewall** → **Add rule** → **HTTPS** (443). SSH (22) and
HTTP (80) are already there. HTTP is needed once for the certificate; Caddy then sends everyone to https.

## 4. Point your domain at it

At your domain's DNS (GoDaddy, Hostinger, Cloudflare, Route 53…): add an **A record**,
name `attendance`, value = the static IP. It can take a few minutes to work.

*No domain yet?* Use `13-233-10-20.sslip.io` (your IP with dashes) as the domain in step 7. It
works for testing, but switch to your own domain before staff install the app: a new address
means reinstalling.

## 5. Prepare the server (once)

Instance → **Connect using SSH** (opens a terminal in the browser). Paste:

```bash
# Swap space, so the 2 GB server can build the app
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Close the SSH window and open it again (so Docker works without `sudo`).

## 6. Make and upload the files (on this PC)

In `Attendance-Ontime` (the project folder):

```bash
npm run bundle      # → Attendance-private\exports\attendance-deploy.tgz   (the code)
npm run export-db   # → Attendance-private\exports\attendance-db-<date>.sql + attendance-storage.tgz (your data, Linux-ready)
```

In the browser SSH window: **⋮ (top right) → Upload file**, and upload all three files.
They land in the home folder.

## 7. Unpack and fill in the settings

```bash
mkdir -p ~/attendance && tar -xzf ~/attendance-deploy.tgz -C ~/attendance && cd ~/attendance
tar -xzf ~/attendance-storage.tgz -C ~/attendance
cp deploy/aws/env.example .env
# Random secrets for the database, sign-in and scheduled jobs
for k in MYSQL_ROOT_PASSWORD AUTH_SECRET CRON_SECRET; do sed -i "s|^$k=\"\"|$k=\"$(openssl rand -hex 24)\"|" .env; done
nano .env
```

In `nano`, set `DOMAIN` and `APP_URL` to your address (and the SMTP lines if you have email
details). Save with **Ctrl+O, Enter**, exit with **Ctrl+X**.

## 8. Start the database and load your data

```bash
docker compose -f docker-compose.aws.yml up -d db
until docker compose -f docker-compose.aws.yml ps db | grep -q healthy; do sleep 3; done
docker compose -f docker-compose.aws.yml exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" attendance_next' < ~/attendance-db-*.sql
```

## 9. Start everything

```bash
docker compose -f docker-compose.aws.yml up -d --build
docker compose -f docker-compose.aws.yml logs -f app
```

The first build takes 5–10 minutes. Wait for **Ready**, then press **Ctrl+C**
(the app keeps running). Open `https://your-domain` and sign in.

## 10. Scheduled jobs and nightly backups

```bash
bash deploy/aws/install-cron.sh   # 4 daily jobs + backup at 3:00 AM IST
bash deploy/aws/backup.sh         # run one backup now to check it works
```

Backups go to `~/attendance/backups` and are kept for 30 days. Also turn on Lightsail's own:
instance → **Snapshots** → **Automatic snapshots** → on.

## 11. Finish

- Delete the uploaded data files from the server: `rm ~/attendance-db-*.sql ~/attendance-storage.tgz`
- And from this PC: `Attendance-private\exports\attendance-db-*.sql` and `attendance-storage.tgz`.
- Stop the app on this PC, so nobody keeps using the old copy.
- Staff: open the new address on their phone → sign in → **Install app** (account menu) or
  **Share → Add to Home Screen** on iPhone.

---

## Updating the app later

On this PC: `npm run bundle`, upload `attendance-deploy.tgz` as in step 6, then on the server:

```bash
tar -xzf ~/attendance-deploy.tgz -C ~/attendance && cd ~/attendance
docker compose -f docker-compose.aws.yml up -d --build
```

Database changes are applied automatically when the app starts. Settings in `.env`, the data and
the uploads are kept.

## If something goes wrong

| Symptom | Check |
|---|---|
| Browser says the site isn't secure / can't connect | The A record must point at the static IP and port 443 must be open. `docker compose -f docker-compose.aws.yml logs caddy` |
| Build stops with "Killed" | Swap from step 5: `free -h` should show 2 GB swap |
| App doesn't start | `docker compose -f docker-compose.aws.yml logs app` |
| Restore a backup | `gunzip -c backups/db-….sql.gz \| docker compose -f docker-compose.aws.yml exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" attendance_next'` |
