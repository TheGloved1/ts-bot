import { ActivityType, Events } from "discord.js";
import { ArgsOf, Client, Discord, On } from "discordx";

@Discord()
export class Event {
  @On({ event: Events.GuildAvailable })
  async guildAvailable(_: ArgsOf<Events.GuildAvailable>, bot: Client) {
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
  }
}
