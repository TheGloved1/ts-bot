/*
 * -------------------------------------------------------------------------------------------------------
 * Copyright (c) Vijay Meena <vijayymmeena@gmail.com> (https://github.com/vijayymmeena). All rights reserved.
 * Licensed under the Apache License. See License.txt in the project root for license information.
 * -------------------------------------------------------------------------------------------------------
 */

import type { AutocompleteInteraction, CacheType, CommandInteraction } from "discord.js";
import { ApplicationCommandOptionType, EmbedBuilder } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { Video, YouTube } from "youtube-sr";

import { type MyTrack } from "../core/index.js";
import { musicPlayerManager } from "../core/manager.js";
import { fromMS } from "../utils/index.js";

@Discord()
export class Command {
  @Slash({ description: "play" })
  async play(
    @SlashOption({
      description: "query",
      name: "query",
      required: true,
      type: ApplicationCommandOptionType.String,
      async autocomplete(interaction: AutocompleteInteraction<CacheType>, _) {
        let videos: Video[] = [];
        const query = interaction.options.getString("query") ?? false;
        if (!query || query.trim() === "" || query.length < 3) {
          await interaction.respond([]);
          return;
        }
        try {
          videos = await YouTube.search(query, {
            limit: 10,
            type: "video",
          });
        } catch (error) {
          return;
        }
        const autocomplete = videos.map((video) => ({
          name: video.title ?? "NaN",
          value: video.url,
        }));
        if (!videos.length) {
          await interaction.respond([{ name: "No results", value: "" }]);
        }
        await interaction.respond(autocomplete);
      },
    })
    query: string,
    interaction: CommandInteraction
  ): Promise<void> {
    const cmd = await musicPlayerManager.parseCommand(interaction);
    if (!cmd) {
      return;
    }

    clearTimeout(cmd.autoDeleteTimer);
    const { queue, member } = cmd;

    const videos = await YouTube.search(query, {
      limit: 5,
      type: "video",
    });

    const video = await YouTube.searchOne(query).catch(() => null);
    if (!video) {
      await interaction.followUp({
        content: "There has been no matches for your search",
      });
      return;
    }

    const track: MyTrack = {
      duration: video.duration,
      thumbnail: video.thumbnail?.url,
      title: video.title ?? "NaN",
      url: video.url,
      user: member.user,
    };

    queue.addTrack(track);

    const description = `Queued ${track.title} (${fromMS(track.duration)}) track`;
    const embed = new EmbedBuilder();
    embed.setTitle("Queued");
    embed.setDescription(description);

    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }

    await interaction.followUp({ embeds: [embed] });

    if (!queue.isPlaying) {
      queue.playNext();
    }

    queue.startControlUpdate();
  }
}
