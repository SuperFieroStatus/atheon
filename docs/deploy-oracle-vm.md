# Deploying Atheon free on an Oracle Cloud "Always Free" VM

This runs Atheon **exactly as built** (Node + SQLite, nothing rewritten) on a small
server that is **free forever**, always-on (no cold starts), with automatic HTTPS.

**What you'll do (~20–30 min, mostly waiting):**
1. Create a free Oracle Cloud VM.
2. Open the firewall for web traffic.
3. Point a hostname at the VM.
4. SSH in and run one setup script.

You'll need: the Oracle account, and a hostname (a free `*.duckdns.org` works great).

---

## 1. Create the free VM

1. Sign up at **cloud.oracle.com** (Oracle asks for a card to verify identity —
   **Always Free** resources are never charged; you can leave the account on the free plan).
2. Console → **Compute → Instances → Create instance**.
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** click *Change shape* → **Always Free eligible** →
     `VM.Standard.E2.1.Micro` (AMD, 1 GB RAM). *(The ARM `A1.Flex` shape is also free and
     beefier, but is often "out of capacity" — the AMD micro is plenty for a pilot and more reliably available.)*
   - **SSH keys:** let it generate a key pair and **download the private key** (you'll need it to log in).
   - Make sure it gets a **public IPv4 address** (default).
3. Create it, then note the instance's **Public IP address**.

## 2. Open the firewall (two places)

Oracle blocks web ports by default in **two** layers — open both:

**a) Cloud security list**
Console → your VM → **Virtual Cloud Network** → **Security Lists** → default list →
**Add Ingress Rules**, twice:
- Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**
- Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**

**b) The VM's own firewall** (run after you SSH in, Step 4):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Point a hostname at the VM

HTTPS needs a hostname (not a bare IP). Free option — **DuckDNS**:
1. Go to **duckdns.org**, sign in, create a subdomain (e.g. `atheon-pilot`).
2. Set its IP to your VM's **Public IP** and Update.
3. Your hostname is now `atheon-pilot.duckdns.org`.

*(If you own a domain, just add an **A record** pointing to the VM's public IP instead.)*

## 4. SSH in and run the setup

From your computer (using the key you downloaded):
```bash
ssh -i /path/to/your-key.key ubuntu@YOUR_VM_PUBLIC_IP
```

On the VM:
```bash
# open the host firewall (from Step 2b)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# get the code
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/superfierostatus/atheon.git
cd atheon

# build + install everything (Node 24, Caddy, systemd service, HTTPS)
sudo bash deploy/setup.sh atheon-pilot.duckdns.org      # <-- your hostname from Step 3
```

> **Private repo?** The `atheon` repo is private, so `git clone` will prompt for
> credentials. Easiest for a pilot: on GitHub, **Settings → change visibility → Public**
> (nothing sensitive is committed — no secrets, no data). Prefer to keep it private? Use a
> fine-grained read-only token: `git clone https://<TOKEN>@github.com/superfierostatus/atheon.git`.

The script installs Node 24 + Caddy, builds the React app, generates a strong
`JWT_SECRET`, starts Atheon as a service, and gets an HTTPS certificate automatically.

When it finishes, open **https://atheon-pilot.duckdns.org** — you'll get the sign-up screen.
Share that URL with your pilot team.

---

## Everyday operations

**Logs / status**
```bash
sudo systemctl status atheon        # is it running?
sudo journalctl -u atheon -f        # live app logs
sudo systemctl status caddy         # proxy + TLS
```

**Update to the latest code**
```bash
cd ~/atheon
git pull
sudo bash deploy/setup.sh atheon-pilot.duckdns.org   # rebuilds + restarts
```

**Back up the database** (it's a single file)
```bash
cp /var/lib/atheon/atheon.db ~/atheon-backup-$(date +%F).db
```
Copy that off the box periodically (or add a cron job). For off-site backups you could
reuse the same Backblaze B2 bucket the FSM project uses.

## How it fits together

- **Atheon** runs as the `atheon` systemd service (auto-restarts, starts on boot),
  listening on `127.0.0.1:4000`, serving both the API and the built React app.
- **SQLite** database lives at `/var/lib/atheon/atheon.db` (set via `DATA_DIR`).
- **Caddy** sits in front on ports 80/443, terminates HTTPS (auto Let's Encrypt cert for
  your hostname), and reverse-proxies to the app. This is what makes the secure login
  cookie work.
- Config/secrets live in `/etc/atheon.env` (not in git).

## Troubleshooting

- **Site won't load / no HTTPS:** re-check both firewall layers (Step 2) and that DNS for
  your hostname resolves to the VM IP (`ping atheon-pilot.duckdns.org`). Caddy needs ports
  80 + 443 reachable from the internet to issue the certificate. See `sudo journalctl -u caddy -f`.
- **Can log in but it immediately logs out:** that means it's being served over plain HTTP.
  The login cookie is HTTPS-only — make sure you're visiting `https://…`, not `http://…`.
- **`node:sqlite` error on boot:** the VM must have Node ≥ 24 (`node -v`). The setup script
  installs it; if you installed Node another way, remove it and re-run the script.
