const { SelfbotCommand } = require.main.exports
const { util } = require('klasa')

module.exports = class extends SelfbotCommand {
  constructor (...args) {
    super(...args, {
      aliases: ['tags'],
      description: 'Show or modify tags.',
      usage: '[add|edit|del|get|list] [tagname:str{2,100}] [contents:str{2,2000}] [...]',
      usageDelim: ' ',
      extendedHelp: `-add tagname This is your new tag contents
-edit tagname This is new new edited contents
-del tagname
-get tagname
-list

\`action\` may be omitted for "edit", "get", and "list".`,
      subHelps: {
        add: {
          description: 'Add a new tag',
          usage: '<tagname:str{2,100}> <contents:str{2,2000}> [...]',
          extendedHelp: `Example:
(prefix)tag add tagname This is your new tag contents`,
        },
        edit: {
          description: 'Edit a tag',
          usage: '<tagname:str{2,100}> <contents:str{2,2000}> [...]',
          extendedHelp: `Examples:
(prefix)tag edit tagname This is new new edited contents
(prefix)tag tagname This is new new edited contents`,
        },
        del: {
          description: 'Delete a tag',
          usage: '<tagname:str{2,100}>',
          extendedHelp: `Example:
(prefix)tag del tagname`,
        },
        get: {
          description: 'Display a tag',
          usage: '<tagname:str{2,100}>',
          extendedHelp: `Examples:
(prefix)tag get tagname
(prefix)tag tagname`,
        },
        list: {
          description: 'List all tags',
          usage: '',
          extendedHelp: `Examples:
(prefix)tag list
(prefix)tags`,
        },
      },
    })

    /**
     * @type {Object}
     */
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
    if (!this.client.settings.tags) await this.client.settings.add('tags', this.validate, this.schema)
    /**
     * @type {SettingGateway}
     */
    this.sg = this.client.settings.tags
  }

  /**
   * @param {DiscordMessage} msg
   * @param {string[]} args
   * @returns {Promise<DiscordMessage>}
   */
  async run (msg, [action, tagname, ...contents]) {
    contents = contents[0] ? contents.join(' ') : null
    console.log({action, tagname, contents})
    if (!action) {
      if (tagname) {
        if (contents) action = 'edit'
        else action = 'get'
      } else {
        // If the first word is over 100 chars, then Klasa will probably parse it as `contents`.
        // Hence, having neither `action` nor `tagname`, but having `contents`.
        // "nani the fuck deska" - Evie, 2017
        if (contents) return msg.channel.send('nani the fuck deska', {code: true})
        else action = 'list'
      }
    }
    return msg.channel.send(await this[`${action}Run`](msg.language,
      tagname, contents, msg.guild))
  }

  /**
   * @param {string} tagname
   * @param {{returnTag: boolean}} options
   * @returns {boolean|{id: string, contents: string}}
   */
  exists (tagname, {returnTag} = {returnTag: false}) {
    const existingTag = this.get(tagname)
    // There seems to be a bug where defaults can sometimes include an 'id'
    const exists = 'id' in existingTag && existingTag.id === tagname
    if ('id' in existingTag && existingTag.id !== tagname) {
      // Debugging
      console.log(`For nonexistant tagname ${tagname}, the \`get\`ed existingTag has an 'id' attribute:`,
        existingTag)
    }
    if (returnTag && exists) return existingTag
    return exists
  }

  /**
   * @param {Language} lang
   * @param {string} tagname
   * @returns {Promise<string>}
   */
  async getRun (lang, tagname) {
    const tag = this.exists(tagname, {returnTag: true})
    if (tag) return tag.contents
    return lang.get('COMMAND_TAG_DOESNT_EXIST', tagname)
  }

  /**
   * @param {Language} lang
   * @param {string} tagname
   * @param {string} contents
   * @param {DiscordGuild} guild
   * @returns {Promise<string>}
   */
  async addRun (lang, tagname, contents, guild) {
    if (this.exists(tagname)) return lang.get('COMMAND_TAG_ALREADY_EXISTS', tagname)

    await this.edit(tagname, contents, guild)
    return lang.get('COMMAND_TAG_ADDED', tagname)
  }

  /**
   * @param {Language} lang
   * @param {string} tagname
   * @param {string} contents
   * @param {DiscordGuild} guild
   * @returns {Promise<string>}
   */
  async editRun (lang, tagname, contents, guild) {
    if (!this.exists(tagname)) return lang.get('COMMAND_TAG_DOESNT_EXIST', tagname)

    await this.edit(tagname, contents, guild)
    return lang.get('COMMAND_TAG_EDITED', tagname)
  }

  /**
   * @param {Language} lang
   * @param {string} tagname
   * @returns {Promise<string>}
   */
  async delRun (lang, tagname) {
    if (!this.exists(tagname)) return lang.get('COMMAND_TAG_DOESNT_EXIST', tagname)

    await this.del(tagname)
    return lang.get('COMMAND_TAG_DELETED', tagname)
  }

  /**
   * @param {Language} lang
   * @returns {Promise<string>}
   */
  async listRun (lang) {
    const tags = this.getAll()
    console.log(tags)
    const tagStr = tags.map((v, k) => k).join(', ')
    if (tagStr) return lang.get('COMMAND_TAG_LIST', util.codeBlock('', tagStr))
    return lang.get('COMMAND_TAG_NO_TAGS')
  }

  /**
   * Get a tag
   * @param {string} tagname
   * @returns {Object}
   */
  get (tagname) {
    tagname = tagname.toLowerCase()
    return this.sg.get(tagname)
  }

  /**
   * Get all tags
   * @returns {DiscordCollection}
   */
  getAll () {
    return this.sg.getAll()
  }

  /**
   * Add a tag
   * @param {string} tagname
   * @param {string} contents
   * @param {DiscordGuild} guild
   * @returns {Promise<Object>}
   */
  async add (tagname, contents, guild) {
    tagname = tagname.toLowerCase()
    await this.sg.create(tagname)
    return this.sg.update(tagname, {contents}, guild)
  }

  /**
   * Edit a tag
   * @param {string} tagname
   * @param {string} contents
   * @param {DiscordGuild} guild
   * @returns {Promise<Object>}
   */
  async edit (tagname, contents, guild) {
    tagname = tagname.toLowerCase()
    return this.sg.update(tagname, {contents}, guild)
  }

  /**
   * Delete a tag
   * @param {string} tagname
   * @returns {Promise<void>}
   */
  async del (tagname) {
    tagname = tagname.toLowerCase()
    return this.sg.destroy(tagname)
  }
}
