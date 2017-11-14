const typesYargs = require('@types/yargs') // eslint-disable-line no-unused-vars
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
     * Whether to preserve duplicate spaces in the post-flags args
     * @type {boolean}
     */
    this.preserveNonFlagSpaces = options.preserveNonFlagSpaces || false
  }

  /**
   * @param {string|Array<string>} argStrOrArray To pass to yargs
   * @returns {Promise<typesYargs>}
   */
  async parseArgs (argStrOrArray) {
    const flags = require('yargs')
      .exitProcess(false) // don't wanna exit the process lul
      .parse(argStrOrArray)

    // Set the script name to this command's name
    flags.$0 = this.name

    if (this.preserveNonFlagSpaces && flags['--'] && flags['--'].length > 0) {
      if (typeof argStrOrArray === 'string') argStrOrArray = argStrOrArray.split(' ')
      // If not found, slice from Infinity instead of -1 + 1 = falsey 0.
      const argsArray = argStrOrArray.slice((argStrOrArray.indexOf('--') + 1) || Infinity)
      flags['--'] = argsArray.join(' ')
    }

    return flags
  }
}

module.exports = FlaggedCommand
