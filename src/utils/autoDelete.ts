import { InteractionResponse, Message } from "discord.js";

/**
 * Automatically deletes a message or an interaction response after a certain amount of time.
 * @param {Message | InteractionResponse} msg The message or interaction response to delete.
 * @param {boolean} [long] If true, the message is deleted after 2 minutes. Otherwise, it is deleted after 15 seconds.
 */
export default async function autoDelete(msg: Message | InteractionResponse, long?: boolean) {
  const time = long ? 120 : 15;

  setTimeout(() => {
    msg.delete().catch(() => null);
  }, time * 1000);
}
