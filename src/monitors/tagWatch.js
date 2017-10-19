// const { util: ツ } = require.main.exports
const { Monitor, util: { regExpEsc } } = require('klasa')

module.exports = class extends Monitor {
  constructor (...args) {
    super(...args, {
      ignoreSelf: false,
    })
  }

  /**
   * @param {DiscordMessage} msg
   */
  run (msg) {
    const tagsDB = this.client.settings.tags
    const regex = tagsDB.cache.getKeys('tags')
      .sort((a, b) => a.length === b.length ? a.localeCompare(b) : b.length - a.length)
      .map(t => {
        const r = new RegExp(`^${regExpEsc(t)}\\b`, 'i')
        r.tagname = t
        return r
      })
      .find(t => t.test(msg.content))
    if (!regex) return
    const tagContents = tagsDB.getEntry(regex.tagname).contents
    if (!tagContents) return console.error(`Tag ${regex.tagname} has no contents`)
    msg.edit(msg.content.replace(regex, tagContents))
  }
}
