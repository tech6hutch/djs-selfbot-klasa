const { SelfbotCommand } = require.main.exports
const { util,
  Gateway, Language } = require('klasa') // eslint-disable-line no-unused-vars
const { Collection,
  Message, Guild } = require('discord.js') // eslint-disable-line no-unused-vars

module.exports = class Tag extends SelfbotCommand {
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
   * @param {SettingResolver} resolver The setting resolver thingy
   * @param {string} tag The tag name, I think?
   * @returns {Promise<string>}
   */
  async validate (resolver, tag) {
    return String(tag)
  }

  /**
   * @returns {Promise}
   */
  async init () {
    if (!this.client.settings.tags) await this.client.settings.add('tags', this.validate, this.schema)
    /**
     * @type {Gateway}
     */
    this.db = this.client.settings.tags
  }

  /**
   * @param {Message} msg The command message
   * @param {string[]} args The args passed to the command
   * @returns {Promise<Message>}
   */
  async run (msg, [action, tagname, ...contents]) {
    contents = contents[0] ? contents.join(' ') : null
    console.log({action, tagname, contents})
    if (!action) {
      if (tagname) {
        if (contents) action = 'edit'
        else action = 'get'
      } else {
        // If the first word is over 100 chars, then Klasa will parse it as `contents`.
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
   * @param {string} tagname The tag name
   * @param {{returnTag: boolean}} options Options
   * @returns {boolean|{id: string, contents: string}}
   */
  exists (tagname, {returnTag} = {returnTag: false}) {
    const existingTag = this.db.getEntry(tagname)
    // @todo Simplify this, once I make sure this bug has been fixed
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
   * @param {Language} lang The language object
   * @param {string} tagname The tag name
   * @returns {Promise<string>}
   */
  async getRun (lang, tagname) {
    const tag = this.exists(tagname, {returnTag: true})
    if (tag) return tag.contents
    return lang.get('COMMAND_TAG_DOESNT_EXIST', tagname)
  }

  /**
   * @param {Language} lang The language object
   * @param {string} tagname The tag name
   * @param {string} contents The contents of the new tag
   * @returns {Promise<string>}
   */
  async addRun (lang, tagname, contents) {
    if (this.exists(tagname)) return lang.get('COMMAND_TAG_ALREADY_EXISTS', tagname)
    if (!contents) return lang.get('COMMAND_TAG_CONTENT_REQUIRED')

    await this.db.createEntry(tagname, { contents })
    return lang.get('COMMAND_TAG_ADDED', tagname)
  }

  /**
   * @param {Language} lang The language object
   * @param {string} tagname The tag name
   * @param {string} contents The new contents of the tag
   * @param {Guild} guild The guild the message was sent in, if any
   * @returns {Promise<string>}
   */
  async editRun (lang, tagname, contents, guild) {
    if (!this.exists(tagname)) return lang.get('COMMAND_TAG_DOESNT_EXIST', tagname)
    if (!contents) return lang.get('COMMAND_TAG_CONTENT_REQUIRED')

    await this.db.updateOne(tagname, 'contents', contents, guild)
    return lang.get('COMMAND_TAG_EDITED', tagname)
  }

  /**
   * @param {Language} lang The language object
   * @param {string} tagname The tag name
   * @returns {Promise<string>}
   */
  async delRun (lang, tagname) {
    if (!this.exists(tagname)) return lang.get('COMMAND_TAG_DOESNT_EXIST', tagname)

    await this.db.deleteEntry(tagname)
    return lang.get('COMMAND_TAG_DELETED', tagname)
  }

  /**
   * @param {Language} lang The language object
   * @returns {Promise<string>}
   */
  async listRun (lang) {
    const nestedTags = Tag.parseAndSortDottedTags(this.db.cache.getKeys('tags'))
    // ;
    //   .map(tagname => tagname.split('.'))
    //   .sort((a, b) => {
    //     const len = Math.max(aArray.length, bArray.length)
    //     for (let i = 0; i < len; i++) {

    //     }
    //     return aArray.length === bArray.length
    //       ? a.localeCompare(b)
    //       : a.split('.').length - b.split('.').length
    //   })
    //   .join('\n')
    const tagStr = require('util').inspect(nestedTags)
    if (tagStr) return lang.get('COMMAND_TAG_LIST', util.codeBlock('', tagStr))
    return lang.get('COMMAND_TAG_NO_TAGS')
  }

  /**
   * Given a dotted array, parse it, generating a new collection with all the dotted tags parsed
   * @param {Array<string>} rawArray The array of tag names
   * @returns {Collection<string, (string|Collection<string, *>)>}
   */
  static parseAndSortDottedTags (rawArray) {
    const coll = new Collection([
      ['_root', []],
    ])
    for (const dottedTag of rawArray) {
      if (dottedTag.indexOf('.') === -1) coll.get('_root').push(dottedTag)
      const path = dottedTag.split('.')
      let tempPath = coll
      for (let i = 0; i < path.length - 1; i++) {
        tempPath.sort()
        if (typeof tempPath.get(path[i]) === 'undefined') tempPath.set(path[i], new Collection())
        tempPath = tempPath.get(path[i])
      }
      tempPath.set(path[path.length - 2], path[path.length - 1])
      tempPath.sort()
    }
    coll.get('_root').sort()
    return coll
  }
}
