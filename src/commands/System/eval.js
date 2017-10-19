const assert = require('assert')
const now = require('performance-now')
const { MessageAttachment } = require('discord.js')
const { Command, util: { sleep } } = require('klasa')
const { inspect } = require('util')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, {
      aliases: ['ev'],
      permLevel: 10,
      description: 'Evaluates arbitrary JavaScript. Reserved for bot owner.',
      usage: '<expression:str>',
      extendedHelp: `Flags:

-d, --delete
        delete the command message

--depth=DEPTH
        the number of times to recurse while formatting the result; default 0

-l, --log
        send the result to the console instead of Discord; cannot be combined with -s (overridden by -o)

-p, --no-await
        don't await the result if it's a promise

-o, --output-to=[WHERE]
        output the result to WHERE; WHERE can be 'channel' (default), 'log' (-l), 'upload', or 'none' / '' (-s); if provided, -l and -s are ignored

-s, --silent
        eval the code without showing the result; cannot be combined with -l (overridden by -o)

-w, --wait=TIME
        time in milliseconds to await promises; default is 10000`,
    })

    this.defaults = {
      // The depth to inspect the evaled output to, if it's not a string
      depth: 0,
      // How long to wait for promises to resolve
      wait: 10000,
    }

    // this.getTypeStr shouldn't recurse more than once, but just in case
    this.typeRecursionLimit = 2
    // The number of lines before the output is considered overly long
    this.tooManyLines = 7
    // The approx. number of chars per line in a codeblock on Android, on a Google Pixel XL
    this.mobileCharsPerLine = 34

    // How the evaled result is outputted
    this.outputTo = {
      channel: (msg, topLine, evaled) => msg.send(`\`${topLine}\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(evaled))}`),
      log: (msg, topLine, evaled) => this.client.emit('log', `${topLine}\n${evaled}`),
      upload: (msg, topLine, evaled) => msg.channel.send(`\`${topLine}\``, new MessageAttachment(Buffer.from(`// ${topLine}\n${evaled}`), 'eval.js')),
      none: async () => null,
    }
  }

  async run (msg, [argStr]) {
    const [ givenFlags, code ] = this.parseArgs(argStr)

    const flags = {
      delete: Boolean(givenFlags.delete || givenFlags.d),
      depth: parseInt(givenFlags.depth || this.defaults.depth, 10),
      noAwait: Boolean(givenFlags['no-await'] || givenFlags.p),
      outputTo: [ givenFlags['output-to'], givenFlags.o ].find(f => f in this.outputTo) ||
        (givenFlags.log || givenFlags.l ? 'log' : '') ||
        (givenFlags.silent || givenFlags.s ? 'none' : '') ||
        'channel',
      wait: parseInt(givenFlags.wait || givenFlags.w || this.defaults.wait, 10),
    }

    if (flags.delete) msg.delete()

    try {
      const [evaled, topLine] = await this.handleEval(flags, code, /* for the eval: */ msg)

      if (flags.outputTo === 'log') return this.outputTo.log(msg, topLine, evaled)
      if (flags.outputTo === 'upload') return this.outputTo.upload(msg, topLine, evaled)

      if (this.isTooLong(evaled, topLine)) {
        return this.sendTooLongQuery(msg, topLine, evaled,
          'Output is too long. Log it to console instead? Or `truncate` it or `upload` it as a file?',
          { yes: 'log' })
      }

      const is = this.isKindaLong(evaled)
      if (is.kindaLong) {
        return this.sendTooLongQuery(msg, topLine, evaled,
          is.becauseOfWrapping
            ? `The output is long (${is.lineCount} lines, plus wrapping on small screens). Send it anyway? Or \`truncate\` it and send it, or \`log\` it to console, or \`upload\` it as a file.`
            : `The output is long (${is.lineCount} lines). Send it anyway? Or \`truncate\` it and send it, or \`log\` it to console, or \`upload\` it as a file.`,
          { yes: 'channel' })
      }

      return this.outputTo.channel(msg, topLine, evaled)
    } catch (error) {
      if (flags.silent) return
      if (error && error.stack) this.client.emit('error', error.stack)
      if (flags.log) return
      return msg.send(`\`ERROR\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(error))}`)
    }
  }

  parseArgs (argStr) {
    const flagRegex = /^(--?)([a-z-]+)(=[a-z\d]*)?$/
    const args = String(argStr).split(' ')
    const codeIndex = args.findIndex((arg, i) => !flagRegex.test(arg) || arg === '--code')
    const argFlags = args.slice(0, codeIndex)
    const givenFlags = {}
    for (let argIndex = 0; argIndex < argFlags.length; argIndex++) {
      const [ , hyphen, flagName, value ] = flagRegex.exec(argFlags[argIndex])
      if (hyphen === '-') {
        for (let i = 0; i < flagName.length; i++) givenFlags[flagName[i]] = value ? value.slice(1) : true
      } else if (hyphen === '--') givenFlags[flagName] = value ? value.slice(1) : true
      else assert(false, 'Something has gone horribly wrong if this runs')
    }

    return [
      givenFlags,
      args.slice(args[codeIndex] === '--code' && codeIndex + 1 < args.length
        ? codeIndex + 1
        : codeIndex).join(' '),
    ]
  }

  /**
   * Eval the code and get info on the type of the result.
   * @param {Ojbect} flags The flags the command was called with.
   * @param {string} code The code obvs.
   * @param {DiscordMessage} msg The message, so it's available to the eval.
   * @returns {Array<string>}
   */
  async handleEval (flags, code, /* for the eval: */ msg) {
    const start = now()
    const evaledOriginal = eval(code) // eslint-disable-line no-eval
    const syncEnd = now()
    const evaledTimeout = this.timeoutPromise(evaledOriginal, flags.wait)
    // Awaiting a non-promise returns the non-promise
    let evaledValue = flags.noAwait ? evaledOriginal : await evaledTimeout
    const asyncEnd = now()

    const evaledIsThenable = this.isThenable(evaledOriginal)

    // We're doing this checking here so it's not counted in the performance-now timeing
    // And if the promise timed out, just show the promise
    if (!evaledIsThenable || evaledValue instanceof TimeoutError) evaledValue = evaledOriginal

    const time = evaledIsThenable && !flags.noAwait
      ? `⏱${this.getNiceDuration(syncEnd - start)}<${this.getNiceDuration(asyncEnd - syncEnd)}>`
      : `⏱${this.getNiceDuration(syncEnd - start)}`

    if (flags.outputTo === 'none') return [evaledValue]

    const topLine = `${await this.getTypeStr(
      flags,
      evaledOriginal,
      evaledIsThenable ? evaledTimeout : null
    )} ${time}`

    if (typeof evaledValue !== 'string') evaledValue = inspect(evaledValue, { depth: flags.depth })

    return [evaledValue, topLine]
  }

  /**
   * Checks if the output will be more than 2,000 characters.
   * @param {string} evaled The evaled output (as a string).
   * @param {string} topLine The line with the type and time info.
   * @returns {boolean}
   */
  isTooLong (evaled, topLine) {
    // 1988 is 2000 - 12 (the chars that are added, "`...`\n```js\n...```")
    return evaled.length > 1988 - topLine.length
  }

  /**
   * Checks if the output will be...kinda long.
   * @param {string} evaled The evaled output (as a string).
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
   * Get the type string of the evaled result.
   * @param {Object} flags The flags the command was called with.
   * @param {*} value The value to get the type string for.
   * @param {?Promise} [awaitedPromise] The promise that was already `await`ed earlier. This also acts
   *  as a surrogate, so that if the original promise was wrapped in a timeout promise, the original
   *  promise can be examined, while the already-awaited surrogate is awaited.
   * @param {number} [i=0] Just an iteration count to prevent infinite loops.
   * @returns {string}
   */
  async getTypeStr (flags, value, awaitedPromise = null, i = 0) {
    if (value instanceof TimeoutError) return '?'

    const { basicType, type } = this.getComplexType(value)
    if (basicType === 'object') {
      if (this.isThenable(value)) {
        return i <= this.typeRecursionLimit && !flags.noAwait
          // But we're gonna await the already-awaited promise, for efficiency
          ? `${type}<${await this.getTypeStr(flags, await awaitedPromise, null, i + 1)}>`
          : `${type}<?>`
      }
      if (Array.isArray(value)) return `${type}${this.getArrayType(value)}`
      if (value instanceof Map) return `${type}${this.getMapType(value)}`
      if (value instanceof Set) return `${type}${this.getSetType(value)}`
      return `${type}${this.getObjectType(value)}`
    }
    if (basicType === 'function') return `${type}${this.getFunctionType(value)}`
    return type
  }

  /**
   * Get the type of value. A better version of the `typeof` operator, basically.
   * @param {*} value The object or primitive whose type is to be returned.
   * @returns {string}
   */
  getType (value) {
    if (value == null) return String(value)
    return typeof value
  }
  /**
   * Get the class (constructor) name of value.
   * @param {*} value The object whose class name is to be returned.
   * @returns {string}
   */
  getClass (value) {
    return value && value.constructor && value.constructor.name
      ? value.constructor.name
      : {}.toString.call(value).match(/\[object (\w+)\]/)[1]
  }
  /**
   * Get the type info for value.
   * @param {*} value The object or primitive whose complex type is to be returned.
   * @returns {{basicType: string, type: string}}
   */
  getComplexType (value) {
    const basicType = this.getType(value)
    if (basicType === 'object' || basicType === 'function') return { basicType, type: this.getClass(value) }
    return { basicType, type: basicType }
  }

  /**
   * Get the arity of fn.
   * @param {Function} fn The function whose arity is to be returned.
   * @returns {string}
   */
  getFunctionType (fn) {
    return `(${fn.length}-arity)`
  }
  /**
   * Get the type of array's elements.
   * @param {Array} array The array whose element type is to be returned.
   * @param {number} [i=0] Just an iteration count to prevent infinite loops.
   * @returns {string}
   */
  getArrayType (array, i = 0) {
    return `<${this._getObjType(array, i)}>`
  }
  /**
   * Get the type of obj's elements.
   * @param {Object} obj The object whose element type is to be returned.
   * @param {number} [i=0] Just an iteration count to prevent infinite loops.
   * @returns {string}
   */
  getObjectType (obj, i = 0) {
    const type = this._getObjType(Object.values(obj), i)
    return type.length > 0 ? `<${this.getComplexType('').type}, ${type}>` : '<>'
  }
  /**
   * Get the type of map's values.
   * @param {Map} map The map whose value type is to be returned.
   * @param {number} [i=0] Just an iteration count to prevent infinite loops.
   * @returns {string}
   */
  getMapType (map, i = 0) {
    const keyType = this._getObjType(Array.from(map.keys()), i)
    const valueType = this._getObjType(Array.from(map.values()), i)
    return valueType.length > 0 ? `<${keyType}, ${valueType}>` : '<>'
  }
  /**
   * Get the type of set's values.
   * @param {Set} set The set whose value type is to be returned.
   * @param {number} [i=0] Just an iteration count to prevent infinite loops.
   * @returns {string}
   */
  getSetType (set, i = 0) {
    return `<${this._getObjType(Array.from(set.values()), i)}>`
  }
  /**
   * Get the type of values's elements.
   * @param {Array} values The array whose element type is to be returned.
   * @param {number} i Just an iteration count to prevent infinite loops.
   * @returns {string}
   */
  _getObjType (values, i) {
    if (!Array.isArray(values)) throw new TypeError("You're using this function wrong; `values` must be an array")
    if (typeof i !== 'number') throw new TypeError('`i` is missing')
    // Collections have useful methods, which work on Sets.
    const Coll = this.client.methods.Collection.prototype

    const objTypes = new Set(values.map(v => this.getComplexType(v).type))
    const nonNullTypes = new Set()
    const nullTypes = new Set()
    for (const type of objTypes.values()) {
      if (['null', 'undefined'].includes(type)) nullTypes.add(type)
      else nonNullTypes.add(type)
    }

    if (nonNullTypes.size > 1) return '*'
    if (nonNullTypes.size === 1) {
      const type = Coll.first.call(nonNullTypes)
      const value = values.find(v => v != null)
      const nestedType = this.getComplexType(value)
      let nestedTypeStr = ''
      if (i < this.typeRecursionLimit) {
        if (nestedType.basicType === 'object') {
          if (Array.isArray(value)) nestedTypeStr = this.getArrayType(value, i + 1)
          if (value instanceof Map) nestedTypeStr = this.getMapType(value, i + 1)
          if (value instanceof Set) nestedTypeStr = this.getSetType(value, i + 1)
          else nestedTypeStr = this.getObjectType(value, i + 1)
        } else if (nestedType.basicType === 'function') nestedTypeStr = this.getFunctionType(value)
      }
      if (nullTypes.size > 0) return `?${type}${nestedTypeStr}`
      return `${type}${nestedTypeStr}`
    }

    // No types besides, possibly, "null" and "undefined"
    if (nullTypes.size > 1) return 'null|undefined'
    if (nullTypes.size === 1) return Coll.first.call(nullTypes)

    // No types at all, i.e. no elements at all
    return ''
  }

  /**
   * Present time duration in a nice way.
   * @param {number} time A duration in milliseconds.
   * @returns {string}
   */
  getNiceDuration (time) {
    if (time >= 1000) return `${(time / 1000).toFixed(2)}s`
    if (time >= 1) return `${time.toFixed(2)}ms`
    return `${(time * 1000).toFixed(2)}μs`
  }

  /**
   * Ask the user what to do, when the output is too long to send to a Discord channel.
   * @param {DiscordMessage} cmdMsg The command message.
   * @param {string} topLine The line with the type and time.
   * @param {string} evaled The evaled value (as a string).
   * @param {string} question The question to ask the user.
   * @param {{yes: string}} options Options for the query.
   * @returns {?Promise<DiscordMessage>}
   */
  async sendTooLongQuery (cmdMsg, topLine, evaled, question, options) {
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
        return this.outputTo[options.yes](queryMsg, topLine, evaled)
      } else if (text.startsWith('l')) { // log to console
        return this.outputTo.log(queryMsg, topLine, evaled)
      } else if (text.startsWith('u')) { // upload as a file attachment and send to channel
        return this.outputTo.upload(queryMsg, topLine, evaled)
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
        return this.outputTo.channel(queryMsg, topLine, evaledLines.join('\n'))
      }
    } catch (error) {
      queryMsg.delete()
    }
  }

  /**
   * Determines whether the passed value is an Array.
   * @param {*} value The value to be checked.
   * @returns {boolean}
   */
  isThenable (value) {
    return value && typeof value.then === 'function'
  }

  /**
   * Wrap a promise in a promise that will timeout in a certain amount of time.
   * 
   * Whichever promise (the inputted one or the timeout one) resolves first will have its value be
   * the resolved value of the returned promise.
   * @param {Promise} promise The promise to wrap.
   * @param {number} timeout How long the new promise should wait before timing out.
   * @returns {Promise}
   */
  timeoutPromise (promise, timeout) {
    return Promise.race([promise, sleep(timeout, new TimeoutError('Promise timed out'))])
  }
}

class TimeoutError extends Error {}
