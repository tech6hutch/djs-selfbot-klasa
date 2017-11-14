// const assert = require('assert')
const { inspect } = require('util')
const { MessageAttachment,
  Message } = require('discord.js') // eslint-disable-line no-unused-vars
const { Stopwatch,
  Language } = require('klasa') // eslint-disable-line no-unused-vars
const { SelfbotCommand, util } = require.main.exports

module.exports = class Eval extends SelfbotCommand {
  constructor (...args) {
    super(...args, {
      aliases: ['ev'],
      permLevel: 10,
      description: 'Evaluates arbitrary JavaScript. Reserved for bot owner.',
      usage: '<expression:str>',
      extendedHelp: `Args:

You can specify if \`expression\` is \`sync\` (default) or \`async\` (to enable use of the \`await\` keyword from within the expression).
E.g.: \`(prefix)eval async const m = await msg.send('text'); m.content\`
The \`async\` arg implicitly wraps \`expression\` in \`(async () => { ... })()\`.

Flags:

--code[=MODE]
        if provided, marks the end of flag arguments (useful if \`expression\`, e.g., starts with a negative number); MODE can be 'sync' (default) or 'async'; if the latter, \`expression\` is wrapped in an async function, to provide use of the \`await\` keyword (NOT IMPLEMENTED YET)
        as implied above, '--code=' is optional before MODE

-d, --delete
        delete the command message

--inspect=DEPTH
        the number of times to recur while formatting the result; default 0

-l, --log
        alias of --output-to=log; cannot be combined with -s

-p, --no-await
        don't await the result if it's a promise

-o, --output-to=[WHERE]
        output the result to WHERE; WHERE can be 'channel' (default), 'log' (-l), 'upload', or 'none' / '' (-s); if provided, the aliases are ignored

-s, --silent
        alias of --output-to=none; cannot be combined with -l

-w, --wait=TIME
        time in milliseconds to await promises; default is 10000`,
    })

    this.defaults = {
      // The depth to inspect the evaled output to
      depth: 0,
      // How long to wait for promises to resolve
      wait: 10000,
    }

    // The number of lines before the output is considered overly long
    this.tooManyLines = 7
    // The approx. number of chars per line in a codeblock on Android, on a Google Pixel XL
    this.mobileCharsPerLine = 34

    // How the evaled result is outputted
    this.outputTo = {
      /**
       * @param {Message} msg The command message
       * @param {string} evaled The evaled output (as a string).
       * @param {string} topLine The line with the type and time info.
       * @returns {Promise<Message>}
       */
      channel: (msg, evaled, topLine) => msg.send(`\`${topLine}\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(evaled))}`),
      /**
       * @param {Message} msg The command message
       * @param {string} evaled The evaled output (as a string).
       * @param {string} topLine The line with the type and time info.
       * @returns {Promise<boolean>}
       */
      log: async (msg, evaled, topLine) => this.client.emit('log', `${topLine}\n${evaled}`),
      /**
       * @param {Message} msg The command message
       * @param {string} evaled The evaled output (as a string).
       * @param {string} topLine The line with the type and time info.
       * @returns {Promise<Message>}
       */
      upload: (msg, evaled, topLine) => msg.channel.send(`\`${topLine}\``, new MessageAttachment(Buffer.from(`// ${topLine}\n${evaled}`), 'eval.js')),
      /**
       * @returns {Promise<null>}
       */
      none: async () => null,
    }
  }

  /**
   * @typedef Flags
   * @property {boolean} delete
   * @property {number} inspectionDepth
   * @property {boolean} isAsync
   * @property {boolean} noAwait
   * @property {string} outputTo
   * @property {number} wait
   */

  /**
   * Run the eval command
   * @param {Message} msg The command message
   * @param {Array<string>} args The args passed to the command
   * @returns {?Promise<Message>}
   */
  async run (msg, [argStr]) {
    const { flags, code } = await this.parseArgs(msg.language, argStr)

    if (flags.delete) msg.delete()

    try {
      const { evaled, topLine } = await this.eval(flags, code, /* for the eval: */ msg)

      if (flags.outputTo === 'log') return this.outputTo.log(msg, evaled, topLine)
      if (flags.outputTo === 'upload') return this.outputTo.upload(msg, evaled, topLine)

      if (this.isTooLong(evaled, topLine)) {
        return this.sendTooLongQuery(msg, evaled, topLine,
          'Output is too long. Log it to console instead? Or `truncate` it or `upload` it as a file?',
          { yes: 'log' })
      }

      const is = this.isKindaLong(evaled)
      if (is.kindaLong) {
        return this.sendTooLongQuery(msg, evaled, topLine,
          is.becauseOfWrapping
            ? `The output is long (${is.lineCount} lines, plus wrapping on small screens). Send it anyway? Or \`truncate\` it and send it, or \`log\` it to console, or \`upload\` it as a file.`
            : `The output is long (${is.lineCount} lines). Send it anyway? Or \`truncate\` it and send it, or \`log\` it to console, or \`upload\` it as a file.`,
          { yes: 'channel' })
      }

      return this.outputTo.channel(msg, evaled, topLine)
    } catch (error) {
      if (flags.outputTo === 'none') return null
      if (error && error.stack) this.client.emit('error', error.stack)
      if (flags.outputTo === 'log') return null
      return msg.send(`\`ERROR\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(error))}`)
    }
  }

  /**
   * Parse the command arguments
   * @param {Language} lang The language object
   * @param {string} argStr The arguments passed to the command
   * @returns {{flags: Flags, code: string}}
   */
  async parseArgs (lang, argStr) {
    const flagsAndArgs = this.parseFlags(argStr.split(' '), 'code')
    const flags = await this.validateFlags(lang, flagsAndArgs.flags, {
      code: { possibilities: [true, 'sync', 'async'] },
    }).then(flags => ({
      delete: Boolean(flags.delete || flags.d),
      inspectionDepth: parseInt(flags.inspect || this.defaults.depth, 10),
      isAsync: flags.code === 'async',
      noAwait: Boolean(flags['no-await'] || flags.p),
      outputTo: [flags['output-to'], flags.o].find(f => f in this.outputTo) ||
        (flags.log || flags.l ? 'log' : '') ||
        (flags.silent || flags.s ? 'none' : '') ||
        'channel',
      wait: parseInt(flags.wait || flags.w || this.defaults.wait, 10),
    }))

    return {
      flags,
      code: flagsAndArgs.args.join(' '),
    }
  }

  /**
   * Parse the flag arguments
   * @param {Array<string>} args All arguments, including flags
   * @param {string} [lastFlag] If provided, all flag parsing will stop at this flag (inclusive)
   * @returns {{flags: Object<string, (true|string)>, args: Array<string>}}
   */
  parseFlags (args, lastFlag) {
    const flagRE = /^(--?)([^=]+)(=.*)?$/i

    let argsStartIndex = args
      .findIndex(lastFlag ? arg => arg[0] !== '-' || arg === lastFlag : arg => arg[0] !== '-')
    if (lastFlag && args[argsStartIndex] === lastFlag) argsStartIndex++

    const flagArgs = args.splice(0, argsStartIndex)
    const flags = {}
    for (let i = 0; i < flagArgs.length; i++) {
      const [ , hyphen, flagName, value ] = flagRE
        .exec(flagArgs[i])
        .map(res => res ? res.toLowerCase() : res)
      if (hyphen === '-') {
        for (let i = 0; i < flagName.length; i++) flags[flagName[i]] = value ? value.slice(1) : true
      } else {
        flags[flagName] = value ? value.slice(1) : true
      }
    }

    return { flags, args }
  }

  /**
   * @typedef FlagType
   * @property {string} [requiresOption=no] "no", "never", or "always"
   * @property {Array} [possibilities]
   */

  /**
   * Validate the flag arguments
   * @param {Language} lang The language object
   * @param {Object<string, (true|string)>} flags The flags
   * @param {Object<string, FlagType>} flagTypes Types to check against the flags
   * @param {Function} [addlValidator] Additional validation, if needed
   * @returns {Promise<Object<string, string>>}
   */
  async validateFlags (lang, flags, flagTypes, addlValidator = () => true) {
    for (const flag in flagTypes) {
      if (!flagTypes.hasOwnProperty(flag)) continue
      const { requiresOption = false, possibilities } = flagTypes[flag]
      const flagValue = flags[flag]
      /**
       * Depending on what was provided to the flag, flagValue can be:
       * flag not provided : undefined
       *                -f : true
       *            --flag : true
       *           --flag= : ""
       *      --flag=thing : "thing"
       */
      if (flagValue !== undefined) {
        if (requiresOption && flagValue === true) {
          throw this.client.methods.util.codeBlock('JSON',
            lang.get('COMMANDMESSAGE_FLAG_MISSING_OPTIONALS', flag, possibilities.filter(poss => poss !== true).join(', ')))
        }
        if (possibilities && possibilities.indexOf(flagValue) === -1) {
          throw this.client.methods.util.codeBlock('JSON',
            lang.get('COMMANDMESSAGE_FLAG_NOMATCH', flag, possibilities.filter(poss => poss !== true).join(', ')))
        }
      }
      await addlValidator(flag, flagValue, lang)
    }

    return flags
  }

  /**
   * Eval the code and get info on the type of the result
   * @todo Maybe add no. of duration digits as a flag
   * @param {Flags} flags The flags the command was called with
   * @param {string} code The code obvs
   * @param {Message} msg The message, so it's available to the eval
   * @returns {{evaled: string, topLine: string}}
   */
  async eval (flags, code, /* for the eval: */ msg) {
    const stopwatchSync = new Stopwatch()
    const evaledOriginal = eval(code) // eslint-disable-line no-eval
    stopwatchSync.stop()

    const stopwatchAsync = new Stopwatch()
    const evaledTimeout = util.timeoutPromise(evaledOriginal, flags.wait)
    // Awaiting a non-promise returns the non-promise
    let evaledValue = flags.noAwait ? evaledOriginal : await evaledTimeout
    stopwatchAsync.stop()

    const evaledIsThenable = util.isThenable(evaledOriginal)

    // We're doing this checking here so it's not counted in the stopwatch timing
    // And if the promise timed out, just show the promise
    if (!evaledIsThenable || evaledValue instanceof util.TimeoutError) evaledValue = evaledOriginal

    const timeStr = evaledIsThenable && !flags.noAwait
      ? `⏱${stopwatchSync}<${stopwatchAsync}>`
      : `⏱${stopwatchSync}`

    if (flags.outputTo === 'none') return { evaled: evaledValue }

    const topLine = `${await util.getJSDocString(evaledOriginal, {
      depth: flags.inspectionDepth + 1,
      wait: flags.noAwait ? 0 : flags.wait,
      surrogatePromise: evaledIsThenable ? evaledTimeout : null,
    })} ${timeStr}`

    /** @todo Add more logic for string conversion / inspection, depending on type; see <#261102185759244289> */
    if (typeof evaledValue !== 'string') evaledValue = inspect(evaledValue, { depth: flags.inspectionDepth })

    return { evaled: evaledValue, topLine }
  }

  /**
   * Checks if the output will be more than 2,000 characters
   * @param {string} evaled The evaled output (as a string)
   * @param {string} topLine The line with the type and time info
   * @returns {boolean}
   */
  isTooLong (evaled, topLine) {
    // 1988 is 2000 - 12 (the chars that are added, "`...`\n```js\n...```")
    return evaled.length > 1988 - topLine.length
  }

  /**
   * Checks if the output will be...kinda long
   * @param {string} evaled The evaled output (as a string)
   * @returns {{lineCount: number, kindaLong: boolean, becauseOfWrapping: boolean}}
   */
  isKindaLong (evaled) {
    const lines = String(evaled).split('\n')
    const lineCount = lines.length

    if (lineCount < this.tooManyLines) {
      // It's not long in line-length alone, but what if we take line wrapping into account on small screens?
      const lineCountWithWrapping = lines.reduce(
        // The line length is divided by this.mobileCharsPerLine, rounded up, to see about how many lines
        // it will be on mobile screens.
        (count, line) => count + Math.ceil(line.length / this.mobileCharsPerLine),
        // We have to start with a `count` of 0 for the function to work.
        0
      )
      return {
        lineCount: lineCountWithWrapping,
        kindaLong: lineCountWithWrapping >= this.tooManyLines,
        becauseOfWrapping: true,
      }
    }

    return {
      lineCount,
      kindaLong: lineCount >= this.tooManyLines,
      becauseOfWrapping: false,
    }
  }

  /**
   * Ask the user what to do, when the output is too long to send to a Discord channel
   * @param {Message} cmdMsg The command message
   * @param {string} evaled The evaled value (as a string)
   * @param {string} topLine The line with the type and time
   * @param {string} question The question to ask the user
   * @param {{yes: string}} options Options for the query
   * @returns {?Promise<Message>}
   */
  async sendTooLongQuery (cmdMsg, evaled, topLine, question, options) {
    const queryMsg = await cmdMsg.channel.send(`${question} (10s til auto-cancel)`)
    try {
      const collected = await cmdMsg.channel.awaitMessages(
        m => m.author.id === cmdMsg.author.id,
        { max: 1, time: 10000, errors: ['time'] }
      )
      const m = collected.first()
      queryMsg.delete()
      m.delete()

      const text = m.content.toLowerCase()
      if (text.startsWith('y')) { // whatever the yes option says to do
        return this.outputTo[options.yes](queryMsg, evaled, topLine)
      } else if (text.startsWith('l')) { // log to console
        return this.outputTo.log(queryMsg, evaled, topLine)
      } else if (text.startsWith('u')) { // upload as a file attachment and send to channel
        return this.outputTo.upload(queryMsg, evaled, topLine)
      } else if (text.startsWith('t')) { // truncate and send to channel
        // Truncate the evaled output, both its # of lines and each line's length
        const evaledLines = evaled.split('\n')
        const newLength = this.tooManyLines - 1
        const lastIndex = newLength - 1
        for (let i = 0; i < evaledLines.length; i++) {
          const line = evaledLines[i]
          if (i >= newLength) delete evaledLines[i]
          else if (i === lastIndex) evaledLines[i] = '...'
          else if (line.length > this.mobileCharsPerLine) evaledLines[i] = `${line.substr(0, this.mobileCharsPerLine - 3)}...`
        }
        return this.outputTo.channel(queryMsg, evaledLines.join('\n'), topLine)
      }
    } catch (error) {
      queryMsg.delete()
    }
    return null
  }
}
