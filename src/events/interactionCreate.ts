import { Events } from "discord.js";
import { ArgsOf, Client, Discord, On } from "discordx";

@Discord()
export class Event {
  @On({ event: Events.InteractionCreate })
  async interactionCreate([interaction]: ArgsOf<Events.InteractionCreate>, bot: Client) {
    bot.executeInteraction(interaction);
  }
}
