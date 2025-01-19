import {
  Content,
  GenerateContentResult,
  GenerateContentStreamResult,
  GenerationConfig,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  SafetySetting,
} from "@google/generative-ai";
import { ChannelType, Collection, Message, ThreadAutoArchiveDuration, User } from "discord.js";
import fs, { readFileSync, writeFileSync } from "fs";
import { config } from "../utils/config.js";
import { autoDelete } from "../utils/autoDelete.js";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "discordx";

/**
 * The path to the current directory.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiKey = config.GEMINI_KEY;
if (!apiKey) {
  throw new Error("Gemini API key is required!");
}

const genAI = new GoogleGenerativeAI(apiKey);

const filePath = path.join(__dirname, "../../embeddings.json");

/**
 * Writes embeddings to a file.
 * @param embeddings - The embeddings to write to the file.
 */
function writeEmbeddingsToFile(embeddings: number[]): void {
  /**
   * Fetches embeddings from a file.
   * @returns The embeddings read from the file.
   */
  function fetchEmbeddingsFromFile(): number[] {
    try {
      const data = readFileSync(filePath, "utf8");
      const embeddings = JSON.parse(data);
      console.log("Embeddings successfully fetched from file.");
      return embeddings;
    } catch (error) {
      console.error("Error fetching embeddings from file:", error);
      return [];
    }
  }
  try {
    // Fetch existing embeddings
    let existingEmbeddings: number[] = fetchEmbeddingsFromFile();

    // Update embeddings (this example just appends new embeddings)
    existingEmbeddings = [...existingEmbeddings, ...embeddings];

    // Write updated embeddings back to the file
    const data = JSON.stringify(existingEmbeddings, null, 2);
    writeFileSync(filePath, data, "utf8");
    console.log("Embeddings successfully updated in file.");
  } catch (error) {
    console.error("Error updating embeddings in file:", error);
  }
}

/**
 * Checks if the given message is from a channel with the given name.
 *
 * Only works for channels of type {@link ChannelType.GuildText} and {@link ChannelType.PublicThread}.
 *
 * @param {Message} message - The message to check.
 * @param {string} channelName - The name of the channel to check against.
 * @returns {boolean} True if the channel matches, false otherwise.
 */
export function messageInNamedChannel(message: Message, channelName: string): boolean {
  if (message.channel.type === ChannelType.GuildText || message.channel.type === ChannelType.PublicThread) {
    return message.channel.name === channelName;
  }
  return false;
}

/**
 * The path to the directory where log files are stored.
 */
const logDir = path.join(__dirname, "../../logs"); // Create a 'logs' directory

/**
 * The path to the log file for conversations.
 */
const convoLogFile = path.join(logDir, "conversations.log");

// Ensure the log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true }); // Create the directory if it doesn't exist
}

/**
 * Logs a message to the file at `convoLogFile`.
 *
 * @param message the message to log
 */
function logMessage(message: string): void {
  const logEntry = `${message}\n`;

  fs.appendFile(convoLogFile, logEntry, (err) => {
    if (err) {
      console.error("Failed to write to log file:", err);
    }
  });
}

/**
 * Returns the system prompt.
 *
 * @returns the system prompt
 */
export function getSystemPrompt() {
  const systemPrompt = fs.readFileSync("system_prompt.txt", "utf8").trim();
  if (!systemPrompt) {
    throw new Error("system_prompt.txt is required");
  }
  return systemPrompt;
}

export const generationConfig: GenerationConfig = {
  temperature: 1.4,
  topP: 0.95,
  topK: 40, // 64 for STABLE, 40 for STABLE_8B
  maxOutputTokens: 8192 / 2,
  responseMimeType: "text/plain",
};

export const safetySettings: SafetySetting[] = [
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

/**
 * The role of the user or model.
 */
export enum Role {
  User = "user",
  Model = "model",
}

/**
 * The type of content.
 */
export type ContentType = Content[];

/**
 * The last message.
 */
let lastMessage: Message | undefined;

/**
 * Toggles the permissions of the bot in a text channel.
 *
 * @param msg The message that triggered the command.
 * @param enabled Whether to enable or disable the permissions.
 * @returns A promise that resolves when the permissions have been toggled.
 */
async function toggleChannelPermissions(msg: Message, enabled: boolean): Promise<void> {
  const channel = msg.channel;
  if (channel.type !== ChannelType.GuildText) return;
  await channel.permissionOverwrites.edit(msg.author, {
    SendMessages: enabled,
  });
}

/**
 * Fetches the data of an attachment.
 *
 * @param url The URL of the attachment.
 * @returns A promise that resolves to the data of the attachment.
 */
async function fetchAttachmentData(url: string) {
  const attachmentData = await fetch(url).then((res) => res.arrayBuffer());
  return Buffer.from(attachmentData).toString("base64");
}

/**
 * Returns the attachments of a message.
 *
 * @param msg The message to get the attachments from.
 * @returns The attachments of the message, or null if there are no attachments.
 */
async function getAttachments(msg: Message): Promise<{ inlineData: { data: string; mimeType: string } } | null> {
  const attachment = msg.attachments.first();

  // Check for attachments
  if (attachment) {
    const url = attachment.url;
    const mimeType = attachment.contentType;
    if (!mimeType) return null;
    const data = await fetchAttachmentData(url);

    return {
      inlineData: {
        data: data,
        mimeType: mimeType,
      },
    };
  }

  // Check for GIF link or video URL
  const containsGifLink = /https?:\/\/.*\.gif/.test(msg.content);
  const videoUrl = msg.embeds[0]?.video?.url;

  if (containsGifLink || videoUrl) {
    const url = (containsGifLink ? msg.content.match(/https?:\/\/.*\.gif/)?.[0] : videoUrl) ?? false;
    const mimeType = videoUrl ? "video/mp4" : "image/gif";
    if (!url) return null;
    const data = await fetchAttachmentData(url);
    if (!data) return null;

    return {
      inlineData: {
        data: data,
        mimeType: mimeType,
      },
    };
  }

  return null;
}

/**
 * Returns the content of a message.
 *
 * @param msg The message to get the content from.
 * @param replacer The function to use to replace the content.
 * @returns The content of the message.
 */
async function getMessageContent(msg: Message<boolean>, replacer: (text: string) => string = (text) => text) {
  const client = msg.client;
  const attachmentData = await getAttachments(msg);

  return {
    role: msg.author.id === client.user.id ? Role.Model : Role.User,
    parts: [
      {
        text: msg.author.id === client.user.id ? replacer(msg.content) : `${msg.author.username} (${msg.author.id}): ${replacer(msg.content)}`,
      },
      ...(attachmentData ? [attachmentData] : []),
    ],
  };
}

/**
 * The model to use.
 */
enum GenaiModel {
  EXPERIMENTAL = "gemini-2.0-flash-exp",
  STABLE = "gemini-1.5-flash",
  STABLE_8B = "gemini-1.5-flash-8b",
}

/**
 * The current model.
 */
let genaiModel: GenaiModel = GenaiModel.STABLE_8B;

/**
 * Type definition for AI generation parameters.
 *
 * @property client - The manager client instance.
 * @property message - The message to process.
 * @property checkLastMessage - Optional flag to check if the last message is the same as the current message.
 * @property createThread - Optional flag to determine if a thread should be created for the response.
 * @property fetchLimit - Optional limit for the number of messages to fetch.
 * @property streaming - Optional flag to determine if the response should be streamed.
 */
type aiGenerateType = {
  bot: Client;
  message: Message;
  checkLastMessage?: boolean;
  createThread?: boolean;
  fetchLimit?: number;
  streaming?: boolean;
};

/**
 * Function to generate a response from the AI.
 *
 * @param client The client instance.
 * @param message The message to generate a response from.
 * @param checkLastMessage Whether to check if the last message is the same as the current message.
 * @param createThread Whether to create a thread for the response.
 * @param fetchLimit The maximum number of messages to fetch.
 * @param streaming Whether to stream the response.
 */
export async function aiGenerate({
  bot,
  message,
  checkLastMessage = true,
  createThread = false,
  fetchLimit = 25,
  streaming = false,
}: aiGenerateType) {
  let responseChannel = message.channel;
  if (createThread && message.channel.type == ChannelType.GuildText && !responseChannel.isThread()) {
    const threadName = `${message.author.username}-${message.createdTimestamp.toString()}`;
    responseChannel = await message.channel.threads.create({
      startMessage: message,
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Thread started by ${message.author.username}`,
      type: ChannelType.PrivateThread,
    });
    if (checkLastMessage) {
      lastMessage = message;
    }
  } else {
    if (checkLastMessage) {
      lastMessage = (await message.channel.messages.fetch({ limit: 1 })).first();
    }
  }

  let channel = responseChannel;

  if (!responseChannel.isThread() || !responseChannel.isTextBased()) {
    channel = responseChannel;
  }

  await toggleChannelPermissions(message, false);

  function notLastMessageCheck(message: Message) {
    if (!checkLastMessage) return true;
    return lastMessage?.id != message.id;
  }

  console.log(`Loading system prompt...`);
  const systemInstruction = getSystemPrompt();
  console.log(`System prompt loaded: ${systemInstruction}`);

  const fetchedMessages: Collection<string, Message<boolean>> = await channel.messages.fetch({
    limit: fetchLimit,
  });

  const orderedMessages: Collection<string, Message<boolean>> = fetchedMessages.filter(
    (msg) => msg.content.trim() !== "" && !msg.reactions.cache.findKey((r) => r.emoji.name === "❌")
  );

  const filteredMessages = new Collection<string, Message<boolean>>();
  filteredMessages.set(message.id, message);
  orderedMessages.forEach((msg) => {
    filteredMessages.set(msg.id, msg);
  });

  console.log(`Fetched ${orderedMessages.size} messages`);

  const mentionRegex = /<@!?(\d+)>|<@&(\d+)>|<@(\d+)>/g;
  const userIds = new Set<string>();

  filteredMessages.forEach((msg) => {
    const mentions = msg.content.match(mentionRegex);
    if (mentions) {
      mentions.forEach((mention) => {
        const userId = mention.replace(/[<@!&>]/g, ""); // Extract the numeric ID
        userIds.add(userId);
      });
    }
  });

  const users: User[] = await Promise.all(Array.from(userIds).map((userId) => bot.users.fetch(userId)));
  const userMap: Map<string, string> = new Map(users.map((user) => [user.id, user.username]));

  /**
   * Replace mentions in a message with a format that GenAI can understand.
   *
   * Replaces `<@!{userId}>` and `<@{userId}>` with `@{username}`.
   * If the user is not found in the user map, the original mention is kept.
   *
   * @param content The message content to replace mentions in.
   * @returns The modified content with mentions replaced.
   */
  function msgReplaceRegex(content: string) {
    return content.replace(mentionRegex, (match) => {
      const userId = match.replace(/[<@!&>]/g, ""); // Extract the numeric ID
      const username = userMap.get(userId) || match; // Replace with username or keep original mention
      return `@${username}`;
    });
  }

  logMessage(`${message.author.username}: ` + msgReplaceRegex(message.content));

  const conversations: ContentType = await Promise.all(filteredMessages.map(async (msg) => await getMessageContent(msg, msgReplaceRegex)).reverse());

  if (conversations.length > 1 && conversations.length < fetchLimit && responseChannel.isThread()) {
    const msg = await responseChannel.fetchStarterMessage();
    conversations.unshift({
      role: Role.User,
      parts: [
        {
          text: `${message.author.username} (${message.author.id}): ` + msgReplaceRegex(msg!.content),
        },
      ],
    });
  }

  conversations.pop();

  let sentMessage: Message | undefined;

  try {
    const model = genAI.getGenerativeModel({
      model: genaiModel,
      systemInstruction,
      generationConfig,
      safetySettings,
    });

    console.log(`Starting chat with conversation: ${JSON.stringify(conversations, null, 1)}`);

    const chat = model.startChat({
      history: conversations,
    });

    const userAiMessage = `${message.author.username} (${message.author.id}): ${msgReplaceRegex(message.content)}`;

    if (notLastMessageCheck(message)) {
      return;
    }

    async function getResult(aiMessage: string, msg: Message) {
      const attachments = await getAttachments(msg);
      if (attachments) {
        return [attachments, aiMessage];
      } else {
        return aiMessage;
      }
    }

    let result: GenerateContentStreamResult | GenerateContentResult;
    if (streaming) {
      result = await chat.sendMessageStream(await getResult(userAiMessage, message));

      if (!channel.isSendable()) return;

      sentMessage = await channel.send("Waiting for chunks...");
      let messageContent: string = "";
      for await (const chunk of result.stream) {
        if (notLastMessageCheck(message)) {
          sentMessage?.delete();
          return;
        }

        messageContent = messageContent + chunk.text();
        if (messageContent.length > 1250) {
          logMessage(`${bot.user!.username}: ${msgReplaceRegex(messageContent)}`);
          sentMessage = await channel.send(chunk.text());
          messageContent = chunk.text();
        }
        if (chunk.text().trim().length >= 1) {
          await sentMessage.edit(messageContent);
        }
      }
      logMessage(`${bot.user!.username}: ${msgReplaceRegex(messageContent)}`);
    } else {
      result = await chat.sendMessage(await getResult(userAiMessage, message));

      const aiResponse = result.response.text().trim();
      logMessage(`${bot.user!.username}: ${aiResponse}`);
      const maxChunkSize = 1500;
      if (aiResponse.length > maxChunkSize) {
        const chunks = aiResponse.match(new RegExp(".{1," + maxChunkSize + "}", "g"));
        if (chunks) {
          if (notLastMessageCheck(message)) {
            return;
          }
          for (const chunk of chunks) {
            if (channel.type == ChannelType.GuildText) {
              sentMessage = await channel.send(chunk);
            } else if (channel.type == ChannelType.PublicThread) {
              sentMessage = await channel.send(chunk);
            }
          }
        }
      } else {
        if (notLastMessageCheck(message)) {
          return;
        }
        if (channel.type == ChannelType.GuildText) {
          sentMessage = await channel.send(aiResponse);
        } else if (channel.type == ChannelType.PublicThread) {
          sentMessage = await channel.send(aiResponse);
        }
      }
    }

    console.log("GenaiMessage", "Current conversation: " + JSON.stringify(conversations, null, 1));
  } catch (error) {
    console.error("Error generating response: ", error);
    if (sentMessage?.deletable) await sentMessage.delete();
    await message.reply("Sorry, I couldn't process your request. Let me try again...").then(autoDelete);
    await autoDelete(message);
  } finally {
    await toggleChannelPermissions(message, true);
  }
}

export const history: ContentType = [
  {
    role: Role.User,
    parts: [{ text: "gluvz: Who are you?" }],
  },
  {
    role: Role.Model,
    parts: [
      {
        text: "I'm GlovedBot, created by 'gluvz' using the power of a large language model trained by Google.",
      },
    ],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: Your stupid" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: no u" }],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: Hi" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: Sup" }],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: I'm sad" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: L, cry about it." }],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: Who am I?" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: Your my creator, father." }],
  },
  {
    role: Role.User,
    parts: [{ text: "Bob: Hello?" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: Go away, Bob." }],
  },
  {
    role: Role.User,
    parts: [{ text: "Bob: How about... No." }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: Damn, worth a try tho" }],
  },
  {
    role: Role.User,
    parts: [{ text: "catcake3047: Mommy?\nCatCake3047: Daddy?" }],
  },
  {
    role: Role.Model,
    parts: [
      {
        text: "GlovedBot: thats... a lil fuckin cringe bud, just saying. Also, how's your mom doin? *grins*",
      },
    ],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: damn" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: Damn what, Huh?" }],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: Damn" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: Damn what?" }],
  },
  {
    role: Role.User,
    parts: [{ text: "gluvz: Damn" }],
  },
  {
    role: Role.Model,
    parts: [{ text: "GlovedBot: What the hell you tryna say?" }],
  },
];
