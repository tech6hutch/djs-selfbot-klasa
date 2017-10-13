const { Monitor } = require('klasa')

/*
 * NOTE: Please don't use this as a replacement for Nitro. This is mostly meant to bridge the gap now
 * that most global emojis are gone. I can't imagine Discord would be happy if a lot of people used
 * this to dodge paying for Nitro. Support the people who made and maintain the service that you use.
 *
 * Besides, this only provides (a hacky version of) "global" emojis, not the other benefits that Nitro has.
 */

module.exports = class extends Monitor {
  constructor (...args) {
    super(...args, {
      ignoreSelf: false,
    })

    /**
     * Used to find the emojis used in a message
     */
    this.emojiNames = /:[a-z\d_]+:/gi
    /**
     * Used to trim the colons off the start and end of an emoji name
     */
    this.emojiColons = /^:|:$/g
  }

  init () {
    this.refresh()
  }

  /**
   * @param {DiscordMessage} msg
   */
  async run (msg) {
    // Only for me (very important!)
    if (msg.author.id !== this.client.user.id) return

    // Get the emojis I tried to use, if any
    const msgEmojis = msg.content.match(this.emojiNames)
    if (msgEmojis && msgEmojis.length > 0) {
      // Emojis I can already use
      const usableEmojiNames = msg.guild
        ? msg.guild.emojis
          .map(e => e.name)
          .concat(this.globalEmojiNames)
        : this.globalEmojiNames
      let emojiExists = false
      let urls = []
      for (let i = 0, len = msgEmojis.length; i < len; i++) {
        const emojiName = msgEmojis[i].replace(this.emojiColons, '')
        const emoji = this.sortedEmojis.find('name', emojiName)
        if (emoji) emojiExists = true
        // If I can use this emoji, why upload it? ¯\_(ツ)_/¯
        if (usableEmojiNames.includes(emojiName)) continue
        if (emoji && emoji.url) urls.push(emoji.url)
      }

      if (emojiExists) {
        // Remove the ❌ reaction, if there already is one
        const reaction = msg.reactions.get('❌')
        if (reaction && reaction.me) await reaction.remove()
        // Emojis that I can use are excluded, hence why emojiExists but urls.length may be 0
        if (urls.length === 0) return
        msg.channel.sendFiles(urls).catch(e => {
          msg.react('❌')
          this.client.emit('error', e)
        })
      } else msg.react('❌') // couldn't find emoji
    }
  }

  /**
   * Sort and cache all guilds' emojis, and the names of the emojis that are global for me
   */
  refresh () {
    const sortedEmojis = this.client.guilds
      .array() // for efficiency; Collection#sort converts to array and back to Collection
      .sort((a, b) => a.position - b.position) // this is Array#sort
      .map(g => g.emojis)
    /*
     * We could use .reduce to call Collection#concat in a loop, but passing all the emoji collections
     * (except the first) at once (to .concat on the first one) is both simpler and more efficient,
     * since Collection#concat makes a new Collection on each call.
     */
    this.sortedEmojis = sortedEmojis
      .shift()
      .concat(...sortedEmojis)

    // Emojis we should (should!) be able to access globally
    this.globalEmojiNames = this.client.user.premium || this.client.user.bot
      // If you have Nitro or you're a bot, all emojis are global for you
      ? this.sortedEmojis
        .map(e => e.name)
      // Otherwise, only the "managed" emojis (e.g., managed by GameWisp) are global for you (except for the
      // colon-less Twitch emojis, which can't be used unless you're a subscriber, so we'll assume I'm not)
      : this.client.emojis
        .filter(e => e.managed && e.requiresColons)
        .map(e => e.name)
  }
}
