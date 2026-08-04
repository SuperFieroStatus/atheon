# Deploying Atheon free on a Google Cloud "Always Free" VM

Google Cloud's Always Free tier includes **one `e2-micro` VM forever**, and unlike Oracle's
free ARM, it's **actually available** — no capacity lottery. It's x86, so Atheon runs there
completely unchanged, and Google's firewall is a simple checkbox (no `iptables` fiddling).

**You'll need:** a Google account (with a billing account/card for verification — Always Free
resources aren't charged within limits), and a hostname (a free `*.duckdns.org` works).

---

## 1. Create the VM

1. Go to **console.cloud.google.com**, sign in, and create/accept a **project**.
2. Search for and open **Compute Engine** → **VM instances**. If prompted, **Enable** the
   Compute Engine API (takes a minute).
3. Click **Create instance** and set:
   - **Name:** `atheon`
   - **Region:** **`us-central1`** (Iowa) — *must* be one of `us-west1`, `us-central1`, or
     `us-east1` for the instance to be free. **Zone:** any (e.g. `us-central1-a`).
   - **Machine configuration:** series **E2** → machine type **`e2-micro`** (2 vCPU shared, 1 GB).
     This exact type is the free one.
   - **Boot disk:** click **Change** → **Ubuntu** → **Ubuntu 22.04 LTS (x86/amd64)**,
     disk type **Standard persistent disk**, size **30 GB** (the free limit; 10 GB is plenty too).
   - **Firewall:** tick **Allow HTTP traffic** and **Allow HTTPS traffic**. ✅ (That's the whole
     firewall — no per-VM config needed.)
4. Click **Create**. When it's up, copy the **External IP**.

> **Keep the IP stable (optional but nice):** the external IP is *ephemeral* by default and can
> change if you ever **stop** the VM. To pin it: **VPC network → IP addresses →** find the VM's
> external IP → **Reserve**. A reserved IP is free while it's attached to a running instance.

## 2. Point a hostname at it

HTTPS needs a hostname. Free option — **DuckDNS**:
1. **duckdns.org** → sign in → create a subdomain (e.g. `atheon-pilot`).
2. Set its IP to the VM's **External IP** → Update.
3. Your hostname is `atheon-pilot.duckdns.org`.

*(Own a domain? Add an **A record** to the External IP instead.)*

## 3. SSH in and run the setup

Easiest: on the VM instances list, click the **SSH** button next to `atheon` — it opens a
browser terminal (no keys to manage). In that terminal:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/SuperFieroStatus/atheon.git && cd atheon
sudo bash deploy/setup.sh atheon-pilot.duckdns.org      # <-- your hostname from Step 2
```

> **Private repo?** `git clone` will ask for credentials. Easiest for a pilot: on GitHub,
> **Settings → change visibility → Public** (nothing sensitive is committed). Or use a
> read-only token: `git clone https://<TOKEN>@github.com/SuperFieroStatus/atheon.git`.

The script installs Node 24 + Caddy, adds swap, builds the app, generates a strong
`JWT_SECRET`, runs Atheon as a service, and gets an HTTPS certificate automatically.

When it finishes, open **https://atheon-pilot.duckdns.org** and share it with your team.

---

## Everyday operations

```bash
sudo systemctl status atheon        # is it running?
sudo journalctl -u atheon -f        # live app logs
sudo systemctl status caddy         # proxy + TLS
```

**Update to the latest code**
```bash
cd ~/atheon && git pull
sudo bash deploy/setup.sh atheon-pilot.duckdns.org   # rebuilds + restarts
```

**Back up the database** (a single file at `/var/lib/atheon/atheon.db`)
```bash
cp /var/lib/atheon/atheon.db ~/atheon-backup-$(date +%F).db
```

## Notes & troubleshooting

- **Cost:** the `e2-micro` + 30 GB standard disk are Always Free. The only thing that could
  incur a small charge is **network egress beyond 1 GB/month** (~$0.12/GB after that). A small
  internal pilot won't come close.
- **Site won't load / no HTTPS:** confirm the **Allow HTTP/HTTPS** boxes were ticked (Step 1),
  and that your hostname resolves to the VM IP (`ping atheon-pilot.duckdns.org`). Caddy needs
  ports 80+443 reachable to issue the certificate. Check `sudo journalctl -u caddy -f`.
- **Logs in but immediately logs out:** you're on plain `http://` — the login cookie is
  HTTPS-only. Use `https://…`.
