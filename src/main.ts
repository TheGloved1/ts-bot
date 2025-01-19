import { dirname, importx } from "@discordx/importer";
import { ActivityType, Events, IntentsBitField, Partials } from "discord.js";
import { Client } from "discordx";
import { config } from "./utils/index.js";
import { QueueManager, Node } from "@discordx/music";
import { musicPlayerManager } from "./core/manager.js";

export const bot = new Client({
  // To use only guild commands
  // botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],

  // Discord intents
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
  ],

  partials: [Partials.Message, Partials.User, Partials.Channel, Partials.GuildMember, Partials.Reaction],

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

bot.on(Events.GuildAvailable, async () => {
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

async function run() {
  // The following syntax should be used in the ECMAScript environment
  await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);

  // Log in with your bot token
  await bot.login(config.TOKEN);
}

void run();
