import { ChannelType, Events } from "discord.js";
import { ArgsOf, Client, Discord, On } from "discordx";
import { aiGenerate } from "../utils";

@Discord()
export class Event {
  @On({ event: Events.MessageCreate })
  async messageCreate([message]: ArgsOf<Events.MessageCreate>, bot: Client) {
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

    await bot.executeCommand(message);
  }
}
