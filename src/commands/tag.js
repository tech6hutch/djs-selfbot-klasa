const { Command } = require('klasa')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, {
      aliases: ['tags'],
      description: 'Show or modify tags.',
      usage: '[add|edit|del|get|list] [tagname:str{2,100}] [contents:str{2,2000}] [...]',
      usageDelim: ' ',
      extendedHelp: `-add newTagName This is your new tag contents
-edit existingtagName This is new new edited contents
-del tagName
-list`,
    })

    this.schema = {
      contents: {
        type: 'String',
        default: null,
        array: false,
        min: 2,
        max: 2000,
      },
    }
  }

  /**
   * @param {SettingResolver} resolver
   * @param {string} tag
   * @returns {Promise<string>}
   */
  async validate (resolver, tag) {
    console.log('this value:', this)
    return String(tag)
  }

  /**
   * @returns {Promise}
   */
  async init () {
    if (!this.client.settings.tags) return this.client.settings.add('tags', this.validate, this.schema)
  }

  /**
   * @param {DiscordMessage} msg
   * @param {string[]} args
   * @returns {Promise<DiscordMessage>}
   */
  async run (msg, [action, tagname, ...contents]) {
    contents = contents[0] ? contents.join(' ') : null
    if (!action) {
      if (tagname) {
        if (contents) action = 'update'
        else action = 'get'
      } else {
        // If the first word is over 100 chars, then Klasa will probably parse it as `contents`.
        // Hence, having neither `action` nor `tagname`, but having `contents`.
        // "nani the fuck deska" - Evie, 2017
        if (contents) return msg.channel.send('nani the fuck deska', {code: true})
        else action = 'list'
      }
    }
    return msg.channel.send(await this[action](tagname, contents, msg.guild))
  }

  /**
   * @param {string} tagname
   * @param {{returnTag: boolean}} options
   * @returns {boolean|{id: string, contents: string}}
   */
  exists (tagname, {returnTag} = {returnTag: false}) {
    const existingTag = this.client.settings.tags.get(tagname)
    console.log('Existing tag, if any:', existingTag)
    // There seems to be a bug where defaults can sometimes include an 'id'
    const exists = 'id' in existingTag && existingTag.id === tagname
    if (returnTag && exists) return existingTag
    return exists
  }

  /**
   * @param {string} tagname
   * @returns {Promise<string>}
   */
  async get (tagname) {
    const tag = this.exists(tagname, {returnTag: true})
    if (tag) return tag.contents
    return `Tag \`${tagname}\` doesn't exist`
  }

  /**
   * @param {string} tagname
   * @param {string} contents
   * @param {DiscordGuild} guild
   * @returns {Promise<string>}
   */
  async add (tagname, contents, guild) {
    const sg = this.client.settings.tags

    if (this.exists(tagname)) return `Tag \`${tagname}\` already exists`

    await sg.create(tagname)
    console.log(await sg.update(tagname, {contents}, guild))
    return `Added tag \`${tagname}\``
  }

  /**
   * @param {string} tagname
   * @param {string} contents
   * @param {DiscordGuild} guild
   * @returns {Promise<string>}
   */
  async edit (tagname, contents, guild) {
    const sg = this.client.settings.tags

    if (!this.exists(tagname)) return `Tag \`${tagname}\` doesn't exist`

    console.log(await sg.update(tagname, {contents}, guild))
    return `Updated tag \`${tagname}\``
  }

  /**
   * @param {string} tagname
   * @returns {Promise<string>}
   */
  async del (tagname) {
    const sg = this.client.settings.tags

    if (!this.exists(tagname)) return `Tag \`${tagname}\` doesn't exist`

    console.log(await sg.destroy(tagname))
    return `Deleted tag \`${tagname}\``
  }

  /**
   * @returns {Promise<string>}
   */
  async list () {
    console.log(this.client.settings.tags.getAll())
    return [
      '```',
      this.client.settings.tags.getAll().map((v, k) => k).join(', '),
      '```',
    ]
  }
}
