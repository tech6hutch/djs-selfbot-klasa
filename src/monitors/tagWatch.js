const { Monitor } = require('klasa')

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
    let [ tagname, ...restOfMsg ] = msg.content.split(' ')
    tagname = tagname.trim().toLowerCase()
    restOfMsg = restOfMsg.join(' ')
    const tags = this.client.commands.get('tag').getAll()
    if (tags.has(tagname)) {
      const tag = tags.get(tagname)
      if (!tag.contents) return console.warn('detected usage of empty tag:', tag)
      msg.edit(`${tag.contents} ${restOfMsg}`)
    }
  }
}
