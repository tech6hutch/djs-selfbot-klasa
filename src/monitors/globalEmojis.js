const { Monitor } = require('klasa')

module.exports = class extends Monitor {
  constructor (...args) {
    super(...args, {
      ignoreSelf: false,
    })

    this.emojiNameRegex = /:[a-z\d]+:/gi
  }

  init () {
    this.refresh()
  }

  /**
   * @param {DiscordMessage} msg
   */
  run (msg) {
    if (msg.author.id !== this.client.user.id) return
    const matches = msg.content.match(this.emojiNameRegex)
    if (matches && matches.length > 0) {
      let found = false
      let urls = []
      for (let i = 0, len = matches.length; i < len; i++) {
        const url = this.findEmojiURL(matches[i].replace(/^:|:$/g, ''))
        if (!url) continue
        found = true
        urls.push(url)
      }
      if (found) {
        msg.channel.sendFiles(urls).catch(e => {
          msg.react('❌')
          console.error(e)
        })
      } else msg.react('❌')
    }
  }

  /**
   * @param {string} name - Emoji name
   */
  findEmojiURL (name) {
    for (let i = 0, len = this.emojisByGuild.length; i < len; i++) {
      for (const [, emoji] of this.emojisByGuild[i]) {
        if (emoji.name === name) return emoji.url
      }
    }
    return null
  }

  refresh () {
    this.emojisByGuild = this.client.guilds
      .sort((a, b) => a.position - b.position)
      .map(g => g.emojis)
  }
}
