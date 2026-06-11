
echo "🚀 Starting Ollama..."
gnome-terminal -- bash -c "ollama serve; exec bash"

sleep 5

echo "🚀 Starting Spring AI Gateway..."
gnome-terminal -- bash -c "cd ~/Desktop/sameer-ai-platform/services/ai-gateway && mvn spring-boot:run; exec bash"

sleep 10

echo "🚀 Starting WhatsApp Bot..."
gnome-terminal -- bash -c "cd ~/Desktop/sameer-ai-platform/services/whatsapp-bot && node bot.js; exec bash"

echo "✅ All services started."