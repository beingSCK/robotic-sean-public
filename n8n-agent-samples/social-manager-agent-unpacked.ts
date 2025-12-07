/**
 * "Jackie" Social Manager Agent - Unpacked from n8n Workflow
 * 
 * Original: EG "Social Manager" Agent, using Telegram
 * This is what the visual workflow would look like as traditional code.
 * 
 * WORKFLOW GRAPH (from n8n connections):
 * 
 *   [Telegram Trigger]
 *          │
 *          ▼
 *   [Voice or Text] ─── extract message.text
 *          │
 *          ▼
 *        [If] ─────────── is text empty?
 *        /   \
 *      yes    no
 *      /       \
 *     ▼         \
 * [Get Voice]    \
 *     │           \
 *     ▼            \
 * [Transcribe]      \
 *     │              │
 *     └──────┬───────┘
 *            ▼
 *   [Jackie AI Agent] ◄─── tools: Gmail, Calendar, Tasks
 *            │              memory: WindowBuffer
 *            │              llm: OpenRouter
 *            ▼
 *      [Telegram Send]
 */

import { TelegramBot, Message } from 'node-telegram-bot-api';
import { google, calendar_v3, gmail_v1, tasks_v1 } from 'googleapis';
import OpenAI from 'openai';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION (from n8n node parameters)
// ═══════════════════════════════════════════════════════════════════════════

interface Config {
  telegram: { botToken: string };
  openRouter: { apiKey: string };
  openAI: { apiKey: string };
  google: {
    calendarId: string;
    tasksListId: string;
    oauth: any;
  };
}

const config = {
  telegram: {
    // webhookId: "322dce18-f93e-4f86-b9b1-3305519b7834"
    listenFor: ["message"],
  },
  gmail: {
    filters: {
      labelIds: ["INBOX"],
      readStatus: "unread",
      limit: 20,
    }
  },
  calendar: {
    calendarId: "<insert email here>",  // from node parameter
    fields: "items(summary, start(dateTime))",
  },
  googleTasks: {
    taskListId: "MTY1MTc5NzMxMzA5NDc5MTQ5NzQ6MDow",
  },
  agent: {
    name: "Jackie",
    systemPrompt: `You are a helpful personal assistant called Jackie. 

Today's date is ${new Date().toISOString().split('T')[0]}.

Guidelines:
- When summarizing emails, include Sender, Message date, subject, and brief summary of email.
- if the user did not specify a date in the request assume they are asking for today
- When answering questions about calendar events, filter out events that don't apply to the question. For example, the question is about events for today, only reply with events for today. Don't mention future events if it's more than 1 week away
- When creating calendar entry, the attendee email is optional`,
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY STORE (n8n: "Window Buffer Memory" node)
// ═══════════════════════════════════════════════════════════════════════════

// Session key: message.from.id (per-user conversation history)
const conversationMemory = new Map<string, Message[]>();

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

function getSessionKey(telegramUserId: string): string {
  return telegramUserId;  // n8n expression: $('Listen for incoming events').first().json.message.from.id
}

function getConversationHistory(sessionKey: string): Message[] {
  return conversationMemory.get(sessionKey) || [];
}

function appendToHistory(sessionKey: string, role: 'user' | 'assistant', content: string) {
  const history = getConversationHistory(sessionKey);
  history.push({ role, content });
  // Window buffer - keeps last N messages (typical default: 5-10 exchanges)
  if (history.length > 20) history.shift();
  conversationMemory.set(sessionKey, history);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOLS (n8n: nodes connected via "ai_tool" connections to the Agent)
// ═══════════════════════════════════════════════════════════════════════════

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<any>;
}

/**
 * Tool: Get Emails (n8n: "Get Email" node - gmailTool)
 * 
 * The $fromAI() expressions in n8n let the LLM fill in parameters dynamically.
 * This becomes function parameters that the agent can call.
 */
async function getEmails(params: {
  Received_After: string,   // $fromAI('Received_After')
  Received_Before: string,  // $fromAI('Received_Before')
}, gmail: gmail_v1.Gmail): Promise<any[]> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    labelIds: config.gmail.filters.labelIds,
    q: `is:unread after:${params.Received_After} before:${params.Received_Before}`,
    maxResults: config.gmail.filters.limit,
  });
  
  return response.data.messages || [];
}

/**
 * Tool: Send Email (n8n: "Send Email" node - gmailTool)
 */
async function sendEmail(params: {
  To: string,       // $fromAI('To')
  Subject: string,  // $fromAI('Subject')
  Message: string,  // $fromAI('Message', 'Please format this nicely in html')
}, gmail: gmail_v1.Gmail): Promise<{ success: boolean }> {
  const email = [
    `To: ${params.To}`,
    `Subject: ${params.Subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    params.Message,
  ].join('\n');
  
  const encodedEmail = Buffer.from(email).toString('base64url');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedEmail },
  });
  
  return { success: true };
}

/**
 * Tool: Get Calendar Events (n8n: "Google Calendar" node - googleCalendarTool)
 */
async function getCalendarEvents(params: {
  After: string,   // $fromAI('After') - timeMin
  Before: string,  // $fromAI('Before') - timeMax
}, calendar: calendar_v3.Calendar): Promise<any[]> {
  const response = await calendar.events.list({
    calendarId: config.calendar.calendarId,
    timeMin: params.After,
    timeMax: params.Before,
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  // n8n field filter: items(summary, start(dateTime))
  return (response.data.items || []).map(event => ({
    summary: event.summary,
    start: event.start?.dateTime,
  }));
}

/**
 * Tool: Create Task (n8n: "Create a task in Google Tasks" node)
 */
async function createTask(params: {
  Title: string,  // $fromAI('Title')
}, tasks: tasks_v1.Tasks): Promise<{ taskId: string }> {
  const response = await tasks.tasks.insert({
    tasklist: config.googleTasks.taskListId,
    requestBody: {
      title: params.Title,
    },
  });
  
  return { taskId: response.data.id! };
}

/**
 * Tool: Get Tasks (n8n: "Get many tasks in Google Tasks" node)
 */
async function getTasks(tasks: tasks_v1.Tasks): Promise<any[]> {
  const response = await tasks.tasks.list({
    tasklist: config.googleTasks.taskListId,
  });
  
  return response.data.items || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// AI AGENT (n8n: "Jackie, AI Assistant" node - @n8n/n8n-nodes-langchain.agent)
// ═══════════════════════════════════════════════════════════════════════════

function createAgentTools(
  gmail: gmail_v1.Gmail,
  calendar: calendar_v3.Calendar,
  tasks: tasks_v1.Tasks
): ToolDefinition[] {
  return [
    {
      name: "getEmails",
      description: "Get unread emails from inbox within a date range",
      parameters: {
        type: 'object',
        properties: {
          Received_After: { type: "string", description: "ISO date string" },
          Received_Before: { type: "string", description: "ISO date string" },
        },
      },
      execute: (params) => getEmails(params, gmail),
    },
    {
      name: "sendEmail",
      description: "Send an email",
      parameters: {
        type: 'object',
        properties: {
          To: { type: "string" },
          Subject: { type: "string" },
          Message: { type: "string", description: "Please format this nicely in html" },
        },
        required: ['To', 'Subject', 'Message'],
      },
      execute: (params) => sendEmail(params, gmail),
    },
    {
      name: "getCalendarEvents",
      description: "Get calendar events within a date range",
      parameters: {
        type: 'object',
        properties: {
          After: { type: "string" },
          Before: { type: "string" },
        },
      },
      execute: (params) => getCalendarEvents(params, calendar),
    },
    {
      name: "createTask",
      description: "Create a task in Google Tasks",
      parameters: {
        type: 'object',
        properties: {
          Title: { type: "string" },
        },
        required: ['Title'],
      },
      execute: (params) => createTask(params, tasks),
    },
    {
      name: "getTasks",
      description: "Get all tasks from Google Tasks",
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: () => getTasks(tasks),
    },
  ];
}

async function runAgent(
  userMessage: string,
  conversationHistory: Message[],
  tools: ToolDefinition[],
  openRouter: OpenAI,
): Promise<string> {
  // This is what n8n's langchain agent node does under the hood:
  // 1. Build messages array with system prompt + history + user message
  // 2. Loop: call LLM → if tool_call, execute tool → append result → repeat
  // 3. Return final text response
  
  const messages: any[] = [
    { role: 'system', content: config.agent.systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];
  
  const openAITools = tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // THE AGENTIC LOOP - This is the heart of every AI agent
  // ═══════════════════════════════════════════════════════════════════════════
  while (true) {
    const response = await openRouter.chat.completions.create({
      model: 'openai/gpt-4o',
      messages,
      tools: openAITools,
      tool_choice: 'auto',
    });
    
    const choice = response.choices[0];
    messages.push(choice.message);
    
    // If the model wants to call a tool
    if (choice.message.tool_calls?.length) {
      for (const toolCall of choice.message.tool_calls) {
        const tool = tools.find(t => t.name === toolCall.function.name);
        if (tool) {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await tool.execute(args);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }
      continue;  // Loop back to let LLM process tool results
    }
    
    // No more tool calls - return the final response
    return choice.message.content || '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE TRANSCRIPTION (n8n: "Transcribe a recording" - OpenAI Whisper)
// ═══════════════════════════════════════════════════════════════════════════

async function transcribeVoice(audioBuffer: Buffer, openai: OpenAI): Promise<string> {
  const file = new File([audioBuffer], 'voice.ogg', { type: 'audio/ogg' });
  
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });
  
  return transcription.text;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WORKFLOW (the actual flow connecting all nodes)
// ═══════════════════════════════════════════════════════════════════════════

interface TelegramUpdate {
  message: {
    from: { id: number };
    chat: { id: number };
    text?: string;
    voice?: { file_id: string };
  };
}

/**
 * This is the "unpacked" version of the entire n8n workflow.
 * Each section maps to a node in the visual editor.
 */
async function handleTelegramMessage(
  msg: TelegramUpdate['message'],
  bot: TelegramBot,
  tools: ToolDefinition[],
  openRouter: OpenAI,
  openai: OpenAI
) {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;
  
  // ───────────────────────────────────────────────────────────────────────────
  // NODE: "Voice or Text" (Set node)
  // Extracts the text field, defaulting to empty string
  // n8n expression: {{ $json?.message?.text || "" }}
  // ───────────────────────────────────────────────────────────────────────────
  let text: string = msg.text || "";
  
  // ───────────────────────────────────────────────────────────────────────────
  // NODE: "If" (conditional branch)
  // Condition: is message.text empty? (detects voice messages)
  // ───────────────────────────────────────────────────────────────────────────
  const isVoiceMessage = text === "" && msg.voice;
  
  if (isVoiceMessage) {
    // TRUE BRANCH: Voice message path
    
    // ─────────────────────────────────────────────────────────────────────────
    // NODE: "Get Voice File" (telegram node - getFile operation)
    // Downloads the voice message file from Telegram
    // ─────────────────────────────────────────────────────────────────────────
    const fileLink = await bot.getFileLink(msg.voice!.file_id);
    const response = await fetch(fileLink);
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    // ─────────────────────────────────────────────────────────────────────────
    // NODE: "Transcribe a recording" (openAi node - audio.transcribe)
    // Uses Whisper to convert speech to text
    // ─────────────────────────────────────────────────────────────────────────
    text = await transcribeVoice(audioBuffer, openai);
  }
  // FALSE BRANCH: Text message - `text` already contains the message
  
  // ───────────────────────────────────────────────────────────────────────────
  // NODE: "Window Buffer Memory" (memoryBufferWindow)
  // Retrieves conversation history for this user
  // Session key: telegram user ID
  // ───────────────────────────────────────────────────────────────────────────
  const sessionKey = getSessionKey(userId);
  const history = getConversationHistory(sessionKey);
  
  // ───────────────────────────────────────────────────────────────────────────
  // NODE: "Jackie, AI Assistant 👩🏻‍🏫" (langchain agent)
  // The core agent that orchestrates tools based on user input
  // 
  // Connections to this node:
  //   - ai_languageModel ← OpenRouter
  //   - ai_memory ← Window Buffer Memory  
  //   - ai_tool ← Get Email, Send Email, Google Calendar, 
  //               Create Task, Get Tasks
  //   - main ← (user text from either voice transcription or direct text)
  // ───────────────────────────────────────────────────────────────────────────
  const agentResponse = await runAgent(text, history, tools, openRouter);
  
  // Update conversation memory
  appendToHistory(sessionKey, 'user', text);
  appendToHistory(sessionKey, 'assistant', agentResponse);
  
  // ───────────────────────────────────────────────────────────────────────────
  // NODE: "Telegram" (telegram node - sendMessage)
  // Sends the agent's response back to the user
  // n8n expression for chatId: $('Listen for incoming events').first().json.message.from.id
  // n8n expression for text: $json.output
  // parse_mode: Markdown
  // ───────────────────────────────────────────────────────────────────────────
  await bot.sendMessage(chatId, agentResponse, {
    parse_mode: 'Markdown',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRYPOINT (n8n webhook server equivalent)
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  // In n8n, the telegramTrigger node sets up a webhook.
  // The equivalent in traditional code:
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const openRouter = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  
  // Google API clients
  const auth = null; // Would be OAuth2 client
  const gmail = google.gmail({ version: 'v1', auth });
  const calendar = google.calendar({ version: 'v3', auth });
  const tasks = google.tasks({ version: 'v1', auth });
  
  const agentTools = createAgentTools(gmail, calendar, tasks);
  
  // ───────────────────────────────────────────────────────────────────────────
  // NODE: "Listen for incoming events" (telegramTrigger)
  // This is the webhook entry point - n8n listens for Telegram updates
  // ───────────────────────────────────────────────────────────────────────────
  bot.on('message', (msg) => {
    handleTelegramMessage(msg as any, bot, agentTools, openRouter, openai);
  });
  
  console.log('🤖 Jackie is listening for Telegram messages...');
}

main().catch(console.error);

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW VISUALIZATION (ASCII art of the n8n flow)
// ═══════════════════════════════════════════════════════════════════════════

/*
┌─────────────────────────────────────────────────────────────────────────────┐
│                           n8n WORKFLOW STRUCTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

                                    TRIGGER
                                       │
                    ┌──────────────────┴──────────────────┐
                    │     "Listen for incoming events"    │
                    │         (Telegram Trigger)          │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │          "Voice or Text"            │
                    │     (Extract text from message)     │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │               "If"                   │
                    │     (Is message.text empty?)        │
                    └───────────┬───────────┬─────────────┘
                                │           │
                    ┌───────────┘           └───────────┐
                    │ TRUE (voice)          FALSE (text)│
                    ▼                                   │
        ┌───────────────────────┐                       │
        │   "Get Voice File"    │                       │
        │ (Download from Telegram)                      │
        └───────────┬───────────┘                       │
                    │                                   │
        ┌───────────┴───────────┐                       │
        │"Transcribe a recording"│                      │
        │   (OpenAI Whisper)    │                       │
        └───────────┬───────────┘                       │
                    │                                   │
                    └───────────────┬───────────────────┘
                                    │
                    ┌───────────────┴───────────────────┐
                    │    "Jackie, AI Assistant 👩🏻‍🏫"      │
                    │      (LangChain Agent Node)       │
                    │                                   │
                    │  ┌─────────────────────────────┐  │
                    │  │      ATTACHED COMPONENTS    │  │
                    │  ├─────────────────────────────┤  │
                    │  │ 🧠 LLM: OpenRouter          │  │
                    │  │ 💾 Memory: Window Buffer    │  │
                    │  │                             │  │
                    │  │ 🔧 TOOLS:                   │  │
                    │  │   • Google Calendar (get)   │  │
                    │  │   • Gmail (get emails)      │  │
                    │  │   • Gmail (send email)      │  │
                    │  │   • Google Tasks (create)   │  │
                    │  │   • Google Tasks (get all)  │  │
                    │  └─────────────────────────────┘  │
                    └───────────────┬───────────────────┘
                                    │
                    ┌───────────────┴───────────────────┐
                    │           "Telegram"              │
                    │     (Send response to user)       │
                    └───────────────────────────────────┘
*/
