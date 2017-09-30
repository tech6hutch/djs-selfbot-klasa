const { Command } = require('klasa')

class SelfbotCommand extends Command {
  /**
   * @param {KlasaClient} client The Klasa Client
   * @param {string} dir The path to the core or user command pieces folder
   * @param {Array} file The path from the pieces folder to the command file
   * @param {Object} [options = {}] Optional Command settings
   */
  constructor (client, dir, file, options = {}) {
    super(client, dir, file, options)

    /**
     * The sub helps for the command
     * @type {Object}
     */
    this.subHelps = {}
    if (options.subHelps) {
      Object.entries(options.subHelps).forEach(([argname, arghelp]) => {
        this.subHelps[argname] = {
          name: arghelp.name || argname,
          description: arghelp.description || '',
          usageString: arghelp.usage || '',
          extendedHelp: arghelp.extendedHelp || 'No extended help available.',
        }
      })
    }
  }
}

module.exports = SelfbotCommand
