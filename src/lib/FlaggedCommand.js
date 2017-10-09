const { SelfbotCommand } = require.main.exports

class FlaggedCommand extends SelfbotCommand {
  /**
   * @param {KlasaClient} client The Klasa Client
   * @param {string} dir The path to the core or user command pieces folder
   * @param {Array} file The path from the pieces folder to the command file
   * @param {Object} [options = {}] Optional Command settings
   */
  constructor (client, dir, file, options = {}) {
    super(client, dir, file, options)

    /**
     * The number of flags this command has
     * @type {int}
     */
    this.flagCount = Object.keys(options.flags).length
  }

  async run (...args) {
    let flagArgs = []
    if (args.length < 1) return this.flaggedRun()
    if (this.usageDelim === ' ') {
      // for (let i = 0; i < this.flagCount; i++) {
      //   if (args[0] && args[0].startsWith('-')) {
      //
      //   }
      // }
      while (args.length > 0) {
        const firstArg = args[0]
        if (!(typeof firstArg === 'string' && firstArg.startsWith('-'))) break
        flagArgs.push(args.shift())
      }
    } else if (typeof args[0] === 'string' && args[0].startsWith('-')) {
      flagArgs = args[0].split(' ')
    }
    args[0]
  }

  async flaggedRun () {
    throw new Error("You're supposed to extend this class.")
  }
}

module.exports = FlaggedCommand
