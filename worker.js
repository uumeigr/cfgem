import htmlContent from './index.html';

// Configuration
// const ACCESS_PASSWORD = 'env is not passed through yet'; 

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. BACKEND ROUTE: Handle API requests from the frontend chat interface
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatProxy(request, env);
    }

    // 2. FRONTEND ROUTE: Serve the cleanly separated html dashboard file
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Fallback for unmatched routes
    return new Response("Not Found", { status: 404 });
  }
};

/**
 * Secures and proxies the request to Google AI Studio Gemini API
 */
async function handleChatProxy(request, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server Configuration Error: GEMINI_API_KEY is missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await request.json();
    const { password, messages, model } = body;

    if (!password || password !== env.ACCESS_PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Bad Request: Missing messages array." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const selectedModel = model || "gemini-2.5-flash";
    const googleApiUrl = `https://googleapis.com{selectedModel}:streamGenerateContent?key=${apiKey}`;

    const googlePayload = {
      contents: messages.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }))
    };

    const googleResponse = await fetch(googleApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(googlePayload)
    });

    const { readable, writable } = new TransformStream();
    googleResponse.body.pipeTo(writable);

    return new Response(readable, {
      status: googleResponse.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal Server Error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
