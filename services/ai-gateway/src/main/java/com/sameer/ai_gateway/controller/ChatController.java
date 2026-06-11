package com.sameer.ai_gateway.controller;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

@RestController
@RequestMapping("/api/ai")
public class ChatController {

    private final ChatClient chatClient;

    @Value("${spring.ai.tavily.api-key:}")
    private String tavilyApiKey;

    public ChatController(ChatClient.Builder builder) {
        this.chatClient = builder
            .defaultSystem("You are Nuh 1.0, an AI assistant created by Sameer Shaik, company N.S. Keep replies short. Plain text only.")
            .build();
    }

    private boolean needsSearch(String msg) {
        String m = msg.toLowerCase();
        return m.contains("news") || m.contains("today") || m.contains("latest") ||
               m.contains("current") || m.contains("weather") || m.contains("price") ||
               m.contains("score") || m.contains("2026") || m.contains("live") ||
               m.contains("who won") || m.contains("stock") || m.contains("cricket") || m.contains("ipl") || m.contains("match") || m.contains("score") || m.contains("election") || m.contains("rupee") || m.contains("sensex");
    }

    private String searchTavily(String query) {
        try {
            String body = "{\"api_key\":\"" + tavilyApiKey + "\","
                + "\"query\":\"" + query.replace("\"", "'") + "\","
                + "\"max_results\":3,\"include_answer\":true}";
            String response = RestClient.create().post()
                .uri("https://api.tavily.com/search")
                .header("Content-Type", "application/json")
                .body(body)
                .retrieve()
                .body(String.class);
            // Extract answer field using simple string parsing
            if (response != null && response.contains("\"answer\"")) {
                int start = response.indexOf("\"answer\":\"") + 10;
                int end = response.indexOf("\"", start);
                if (start > 10 && end > start) {
                    return response.substring(start, end);
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    @GetMapping("/chat")
    public String chat(@RequestParam String message) {
        if (!tavilyApiKey.isEmpty() && needsSearch(message)) {
            String result = searchTavily(message);
            if (result != null && !result.isEmpty()) {
                return result;
            }
        }
        return chatClient.prompt().user(message).call().content();
    }
}
