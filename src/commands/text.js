const { SelfbotCommand, SelfbotUtil: { sequence } } = require.main.exports

module.exports = class extends SelfbotCommand {
  constructor (...args) {
    super(...args, {
      aliases: ['.', '..', '`'],
      description: 'Does various parsing and correction of message text.',
      usage: '<text:str>',
    })
  }

  /**
   * @returns {Promise}
   */
  async init () {
    /**
     * @type {DiscordCollection}
     */
    this.patterns = new this.client.methods.Collection([
      [/\bI"m\b/g, "I'm"],
      [/\blpl\b/g, 'lol'],
    ])
    /**
     * @param {string} str
     * @param {string} replacement
     * @param {RegExp} pattern
     */
    this.reduceReplaceString = (str, replacement, pattern) => str.replace(pattern, replacement)
  }

  /**
   * Make spelling/grammar/etc. corrections on a string
   * @param {string} str
   */
  correctString (str) {
    return this.patterns.reduce(this.reduceReplaceString, str)
  }

  /**
   * @param {DiscordMessage} msg
   * @param {string[]} args
   * @returns {Promise<DiscordMessage>}
   */
  async run (msg, [text]) {
    /**
     * @todo Do eval(` + text + `) replacement and compose functions
     * Use ツ
     */
    return msg.edit(sequence(this.correctString(text)))
  }
}
