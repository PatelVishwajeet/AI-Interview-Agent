import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const askAi = async (messages) => {
  try {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is empty.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Handle system message by prepending to first user message
    let systemPrompt = "";
    const filteredMessages = messages.filter(msg => {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
        return false;
      }
      return true;
    });

    // If there's a system prompt, prepend it to the first user message
    if (systemPrompt && filteredMessages.length > 0 && filteredMessages[0].role === 'user') {
      filteredMessages[0].content = systemPrompt + "\n\n" + filteredMessages[0].content;
    }

    // Convert messages to Gemini format
    const history = filteredMessages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const prompt = lastMessage.content;

    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text || !text.trim()) {
      throw new Error("AI returned empty response.");
    }

    return text;
  } catch (error) {
    console.error("Gemini Error:", error.message);
    throw new Error("Gemini API Error");
  }
};