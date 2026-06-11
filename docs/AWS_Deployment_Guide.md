# Sameer AI Platform — AWS VPS Deployment Guide

## Architecture on AWS
```
Internet
    ↓
AWS EC2 (Ubuntu 22.04)
    ↓
Nginx (Reverse Proxy — Port 80/443)
    ↓
├── Node.js WhatsApp Service  (Port 3000)
├── Spring AI Gateway         (Port 8080)
└── Ollama LLM Server         (Port 11434)
```

---

## STEP 1 — Launch EC2 Instance on AWS

### Go to AWS Console
- Open: https://console.aws.amazon.com
- Go to: EC2 → Launch Instance

### Instance Settings
```
Name:           sameer-ai-platform
OS:             Ubuntu Server 22.04 LTS
Instance Type:  t3.medium  (2 vCPU, 4GB RAM — minimum for Ollama)
Storage:        20 GB (gp3)
Key Pair:       Create new → sameer-key → Download .pem
```

> ⚠️ t3.micro (free tier) is NOT enough for Ollama. Use t3.medium or higher.

### Security Group — Open These Ports
```
Type        Port    Source
SSH         22      My IP
HTTP        80      0.0.0.0/0
HTTPS       443     0.0.0.0/0
Custom TCP  8080    My IP only   (Spring AI)
Custom TCP  3000    My IP only   (WhatsApp service)
```

### Launch the instance. Note your Public IP.

---

## STEP 2 — Connect to Your EC2

### Fix key permissions (run once on your PC)
```bash
chmod 400 ~/Downloads/sameer-key.pem
```

### SSH into server
```bash
ssh -i ~/Downloads/sameer-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

---

## STEP 3 — Update Server & Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Java 21 (for Spring Boot)
sudo apt install -y openjdk-21-jdk

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Maven (for Spring Boot build)
sudo apt install -y maven

# Install Nginx
sudo apt install -y nginx

# Install Git
sudo apt install -y git

# Verify installations
java -version
node -v
npm -v
mvn -v
nginx -v
```

---

## STEP 4 — Install Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull your model (qwen2.5:1.5b is small and fast)
ollama pull qwen2.5:1.5b

# Test it works
ollama run qwen2.5:1.5b "say hello"
```

### Make Ollama Run as a Service (auto-start on reboot)
```bash
sudo tee /etc/systemd/system/ollama.service << 'EOF'
[Unit]
Description=Ollama AI Server
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3
Environment=HOME=/home/ubuntu

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama

# Check status
sudo systemctl status ollama
```

---

## STEP 5 — Upload Your Project to EC2

### Option A — Using Git (Recommended)
```bash
# On your EC2 server
cd ~
git clone https://github.com/YOUR_USERNAME/sameer-ai-platform.git
cd sameer-ai-platform
```

### Option B — Using SCP (upload from your PC)
```bash
# Run this on YOUR PC, not the server
scp -i ~/Downloads/sameer-key.pem -r ~/Desktop/sameer-ai-platform ubuntu@YOUR_EC2_IP:~/
```

---

## STEP 6 — Deploy WhatsApp Service

```bash
cd ~/sameer-ai-platform/services/whatsapp-service

# Install dependencies
npm install

# Test run first
node bot.js
# Scan QR code with WhatsApp
# Press CTRL+C after successful scan (auth is saved)
```

### Make WhatsApp Service Auto-Start
```bash
sudo tee /etc/systemd/system/whatsapp-bot.service << 'EOF'
[Unit]
Description=SameerBot WhatsApp Service
After=network.target ollama.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/sameer-ai-platform/services/whatsapp-service
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable whatsapp-bot
sudo systemctl start whatsapp-bot
```

---

## STEP 7 — Deploy Spring AI Gateway

```bash
cd ~/sameer-ai-platform/services/ai-gateway

# Build the Spring Boot project
mvn clean package -DskipTests

# Test run
java -jar target/ai-gateway-0.0.1-SNAPSHOT.jar
# Press CTRL+C after confirming it starts
```

### Make Spring AI Auto-Start
```bash
sudo tee /etc/systemd/system/ai-gateway.service << 'EOF'
[Unit]
Description=Sameer Spring AI Gateway
After=network.target ollama.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/sameer-ai-platform/services/ai-gateway
ExecStart=/usr/bin/java -jar target/ai-gateway-0.0.1-SNAPSHOT.jar
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-gateway
sudo systemctl start ai-gateway
```

---

## STEP 8 — Configure Nginx Reverse Proxy

```bash
sudo tee /etc/nginx/sites-available/sameer-ai << 'EOF'
server {
    listen 80;
    server_name YOUR_EC2_PUBLIC_IP;

    # Spring AI Gateway
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    # Health check page
    location / {
        return 200 'SameerBot AI Platform is running!';
        add_header Content-Type text/plain;
    }
}
EOF

# Enable the config
sudo ln -s /etc/nginx/sites-available/sameer-ai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## STEP 9 — Test Everything

```bash
# Check all services are running
sudo systemctl status ollama
sudo systemctl status ai-gateway
sudo systemctl status whatsapp-bot
sudo systemctl status nginx

# Test Ollama directly
curl http://localhost:11434/api/tags

# Test Spring AI Gateway
curl "http://localhost:8080/api/ai/chat?message=hello"

# Test via Nginx (public)
curl "http://YOUR_EC2_PUBLIC_IP/api/ai/chat?message=hello"
```

---

## STEP 10 — View Logs

```bash
# WhatsApp bot logs
sudo journalctl -u whatsapp-bot -f

# Spring AI logs
sudo journalctl -u ai-gateway -f

# Ollama logs
sudo journalctl -u ollama -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## STEP 11 — Re-Scan QR Code After Deployment

WhatsApp auth needs to be done manually once on the server:

```bash
# Stop the auto-service temporarily
sudo systemctl stop whatsapp-bot

# Run manually to scan QR
cd ~/sameer-ai-platform/services/whatsapp-service
node bot.js

# Scan QR code with your phone
# Wait for "Connected" message
# Press CTRL+C

# Start service again — it will use saved auth
sudo systemctl start whatsapp-bot
```

---

## Useful Commands Reference

```bash
# Restart all services
sudo systemctl restart ollama ai-gateway whatsapp-bot nginx

# Stop all services
sudo systemctl stop ollama ai-gateway whatsapp-bot

# Check all service statuses at once
sudo systemctl status ollama ai-gateway whatsapp-bot nginx

# Check disk usage
df -h

# Check RAM usage
free -h

# Check CPU usage
top

# Check which ports are listening
sudo ss -tlnp
```

---

## Update Your Bot After Code Changes

```bash
# Pull latest code
cd ~/sameer-ai-platform
git pull

# Restart WhatsApp service
sudo systemctl restart whatsapp-bot

# If Spring AI changed — rebuild first
cd services/ai-gateway
mvn clean package -DskipTests
sudo systemctl restart ai-gateway
```

---

## Monthly Cost Estimate (AWS)

```
t3.medium EC2:    ~$30/month
20 GB storage:    ~$2/month
Data transfer:    ~$1/month
─────────────────────────────
Total:            ~$33/month
```

> 💡 Use Lightsail instead for ~$12/month with 2GB RAM (enough for qwen2.5:1.5b).

---

## Troubleshooting

**Bot not connecting to Spring AI:**
- Check Spring AI is running: `sudo systemctl status ai-gateway`
- Check port: `curl http://localhost:8080/api/ai/chat?message=test`

**Ollama out of memory:**
- Use a smaller model: `ollama pull tinyllama`
- Change model in `application.yml`

**QR code not showing:**
- Delete auth folder: `rm -rf auth/`
- Rerun `node bot.js` manually

**EC2 out of disk:**
- Check: `df -h`
- Clear Maven cache: `rm -rf ~/.m2/repository`
